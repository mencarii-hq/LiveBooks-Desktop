import { Doc } from 'fyo/model/doc';
import { FiltersMap } from 'fyo/model/types';
import { Money } from 'pesa';
import { NON_CATEGORY_ACCOUNT_TYPES } from '../Account/types';

/**
 * Child row splitting the category side of a register Payment (or a
 * MemorizedTransaction template) across multiple accounts. The bank side
 * stays a single leg for the full payment amount.
 */
export class PaymentSplit extends Doc {
  account?: string;
  amount?: Money;
  description?: string;

  static filters: FiltersMap = {
    // Same category filter as the Write Entry page: any non-bank,
    // non-party account can be a split category.
    account: () => ({
      isGroup: false,
      accountType: ['not in', [...NON_CATEGORY_ACCOUNT_TYPES]],
    }),
  };
}
