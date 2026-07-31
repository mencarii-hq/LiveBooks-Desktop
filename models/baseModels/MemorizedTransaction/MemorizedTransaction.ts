import { Fyo, t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { DocValue } from 'fyo/core/types';
import {
  Action,
  DefaultMap,
  FormulaMap,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { DateTime } from 'luxon';
import { Money } from 'pesa';

export type MemorizedFrequency =
  | 'Daily'
  | 'Weekly'
  | 'Monthly'
  | 'Quarterly'
  | 'Annual';

function toISODate(value: DocValue): string {
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
  paymentMethod?: string;

  static defaults: DefaultMap = {
    // Soonest schedule is tomorrow (date-only; no same-day run).
    nextDueDate: () => DateTime.now().plus({ days: 1 }).toISODate()!,
  };

  // Backfill required title for rows created before the field existed.
  formulas: FormulaMap = {
    title: {
      formula: () => {
        if (!this.title) {
          return this.party;
        }
      },
      dependsOn: ['party'],
    },
  };

  validations: ValidationMap = {
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
      }

      throw new ValidationError(
        t`Next Due Date must be at least tomorrow (same-day scheduling is not allowed).`
      );
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

  static getActions(fyo: Fyo): Action[] {
    return [
      {
        label: fyo.t`Create next`,
        group: fyo.t`Create`,
        action: async (doc) => {
          const { createPaymentFromMemorized, advanceNextDueDate } =
            await import('src/utils/memorizedTransactions');
          const { showToast } = await import('src/utils/interactive');
          const { handleErrorWithDialog } = await import('src/errorHandling');
          const mt = doc as MemorizedTransaction;
          try {
            await createPaymentFromMemorized(fyo, mt);
            await advanceNextDueDate(mt);
            showToast({
              type: 'success',
              message: fyo.t`Created recurring payment`,
            });
          } catch (error) {
            await handleErrorWithDialog(error, mt, true, true);
          }
        },
      },
    ];
  }
}
