import { Doc } from 'fyo/model/doc';
import { FiltersMap } from 'fyo/model/types';
import { Money } from 'pesa';
import { NON_CATEGORY_ACCOUNT_TYPES } from '../Account/types';

export type PayrollDeductionType = 'Fixed' | 'Percent';

export class PayrollDeduction extends Doc {
  account?: string;
  deductionType?: PayrollDeductionType;
  /** Fixed: currency amount. Percent: percentage of gross (0–100). */
  amount?: Money;
  description?: string;

  static filters: FiltersMap = {
    account: () => ({
      isGroup: false,
      rootType: 'Liability',
      accountType: ['not in', [...NON_CATEGORY_ACCOUNT_TYPES]],
    }),
  };
}
