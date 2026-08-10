import { t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { DocValue } from 'fyo/core/types';
import {
  DefaultMap,
  FiltersMap,
  FormulaMap,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { DateTime } from 'luxon';
import { Money } from 'pesa';
import { PaymentSplit } from '../PaymentSplit/PaymentSplit';
import { QueryFilter } from 'utils/db/types';
import { isUuidDocId } from 'utils/ids';

export type MemorizedFrequency =
  | 'Daily'
  | 'Weekly'
  | 'Monthly'
  | 'Quarterly'
  | 'Annual';

function toISODate(value: DocValue): string {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate() ?? '';
  }
  return String(value ?? '').slice(0, 10);
}

export class MemorizedTransaction extends Doc {
  title?: string;
  party?: string;
  paymentType?: 'Pay' | 'Receive';
  fromAccount?: string;
  toAccount?: string;
  amount?: Money;
  memo?: string;
  frequency?: MemorizedFrequency;
  nextDueDate?: string | Date;
  remindDaysBefore?: number;
  paymentMethod?: string;
  splits?: PaymentSplit[];

  static defaults: DefaultMap = {
    // Soonest schedule is tomorrow (date-only; no same-day run).
    nextDueDate: () => DateTime.now().plus({ days: 1 }).toISODate()!,
  };

  // Backfill required title for rows created before the field existed.
  // Never copy a Party.id (UUID) into title — Link fields store ids, not labels.
  formulas: FormulaMap = {
    title: {
      formula: async () => {
        if (this.title && !isUuidDocId(String(this.title))) {
          return;
        }
        const party = String(this.party ?? '');
        if (!party) {
          return;
        }
        if (!isUuidDocId(party)) {
          return party;
        }
        try {
          const rows = (await this.fyo.db.getAllRaw('Party', {
            filters: { name: party },
            fields: ['partyName'],
          })) as { partyName?: string }[];
          const label = String(rows[0]?.partyName ?? '').trim();
          if (label && !isUuidDocId(label)) {
            return label;
          }
        } catch {
          /* best-effort backfill */
        }
      },
      dependsOn: ['party'],
    },
  };

  async validate() {
    await super.validate();
    this.validateSplits();
  }

  /**
   * Mirror Payment.validateSplits so templates fail at save — not later on
   * Run Now / due posting when createRegisterPayment rejects a single line.
   */
  validateSplits() {
    const splits = this.splits ?? [];
    if (splits.length === 0) {
      return;
    }

    if (splits.length < 2) {
      throw new ValidationError(
        t`A split payment needs at least two split lines.`
      );
    }

    let total = this.fyo.pesa(0);
    let grossTotal = this.fyo.pesa(0);
    for (const split of splits) {
      if (!split.account) {
        throw new ValidationError(t`Each split line needs a category account.`);
      }

      if (!split.amount || split.amount.isZero()) {
        throw new ValidationError(t`Each split line needs a nonzero amount.`);
      }

      total = total.add(split.amount);
      if (!split.amount.isNegative()) {
        grossTotal = grossTotal.add(split.amount);
      }
    }

    if (grossTotal.lte(0)) {
      throw new ValidationError(
        t`Split lines need at least one positive amount.`
      );
    }

    const amount = this.amount as Money;
    if (!total.eq(amount)) {
      throw new ValidationError(
        t`Split total ${this.fyo.format(
          total,
          'Currency'
        )} must equal the payment amount ${this.fyo.format(
          amount,
          'Currency'
        )}.`
      );
    }
  }

  validations: ValidationMap = {
    fromAccount: (value: DocValue) => {
      if (value && this.toAccount && value === this.toAccount) {
        throw new ValidationError(
          t`From Account and To Account cannot be the same.`
        );
      }
    },
    toAccount: (value: DocValue) => {
      if (value && this.fromAccount && value === this.fromAccount) {
        throw new ValidationError(
          t`From Account and To Account cannot be the same.`
        );
      }
    },
    nextDueDate: async (value: DocValue) => {
      if (value == null || value === '') {
        return;
      }

      const dueISO = toISODate(value);
      const tomorrowISO = DateTime.now().plus({ days: 1 }).toISODate()!;
      if (dueISO >= tomorrowISO) {
        return;
      }

      // Allow saving amount/memo edits on templates that are already due,
      // as long as nextDueDate itself was not changed to today/past.
      if (!this.notInserted && this.name) {
        const rows = await this.fyo.db.getAllRaw(this.schemaName, {
          filters: { name: this.name },
          fields: ['nextDueDate'],
        });
        const persisted = toISODate(
          (rows as { nextDueDate?: string }[])[0]?.nextDueDate
        );
        if (persisted && persisted === dueISO) {
          return;
        }
        // Allow schedule advance after Run Now / Create even if still due
        // (e.g. Daily from yesterday → today).
        if (persisted && dueISO > persisted) {
          return;
        }
      }

      throw new ValidationError(
        t`Next Due Date must be at least tomorrow (same-day scheduling is not allowed).`
      );
    },
  };

  static filters: FiltersMap = {
    party: (doc: Doc) => {
      const paymentType = (doc as MemorizedTransaction).paymentType;
      if (paymentType === 'Pay') {
        return {
          role: ['in', ['Supplier', 'Both', 'Employee', 'Contractor']],
        } as QueryFilter;
      }

      if (paymentType === 'Receive') {
        return { role: ['in', ['Customer', 'Both']] } as QueryFilter;
      }

      return {};
    },
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'title',
        'party',
        'paymentType',
        'amount',
        'frequency',
        'nextDueDate',
        'memo',
      ],
    };
  }
}
