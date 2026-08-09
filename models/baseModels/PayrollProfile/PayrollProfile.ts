import { t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { FiltersMap, ListViewSettings } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { Money } from 'pesa';
import { ModelNameEnum } from 'models/types';
import { PayrollDeduction } from '../PayrollDeduction/PayrollDeduction';

export type PayrollPayType = 'Salary' | 'Hourly';

export class PayrollProfile extends Doc {
  party?: string;
  payType?: PayrollPayType;
  rate?: Money;
  expenseAccount?: string;
  deductions?: PayrollDeduction[];
  disabled?: boolean;

  async validate() {
    await super.validate();

    if (this.rate && this.rate.lte(0)) {
      throw new ValidationError(t`Pay rate must be greater than 0.`);
    }

    await this._validateUniqueParty();
    this._validateDeductions();
  }

  /** One payroll profile per employee, or a pay run would pay them twice. */
  async _validateUniqueParty() {
    if (!this.party) {
      return;
    }

    const others = (await this.fyo.db.getAll(ModelNameEnum.PayrollProfile, {
      fields: ['name'],
      filters: { party: this.party },
    })) as { name: string }[];
    const duplicate = others.find((p) => p.name !== this.name);
    if (duplicate) {
      throw new ValidationError(t`Pay setup for this employee already exists.`);
    }
  }

  _validateDeductions() {
    for (const row of this.deductions ?? []) {
      const amount = row.amount;
      if (!amount) {
        continue;
      }

      if (amount.isNegative()) {
        throw new ValidationError(t`Deduction amounts cannot be negative.`);
      }

      if (row.deductionType === 'Percent' && amount.gt(100)) {
        throw new ValidationError(
          t`Percent deductions must be between 0 and 100.`
        );
      }
    }
  }

  static filters: FiltersMap = {
    party: () => ({
      role: ['in', ['Employee', 'Contractor']],
    }),
    expenseAccount: () => ({
      isGroup: false,
      rootType: 'Expense',
    }),
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['party', 'payType', 'rate', 'expenseAccount', 'disabled'],
    };
  }
}
