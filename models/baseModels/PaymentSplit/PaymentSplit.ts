import { Doc } from 'fyo/model/doc';
import { FiltersMap } from 'fyo/model/types';
import { Money } from 'pesa';
import { AccountTypeEnum, NON_CATEGORY_ACCOUNT_TYPES } from '../Account/types';
import type { Payment } from '../Payment/Payment';

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
    // Align with BankRegisterWrite categoryField: bank money side may
    // categorize to CreditCard (pay the card); CC money side may categorize
    // to Bank/Cash (and never to another CreditCard).
    account: async (doc: Doc) => {
      const parent = doc.parentdoc as Payment | undefined;
      const paymentType = parent?.paymentType;
      const moneyAccountName =
        paymentType === 'Receive' ? parent?.paymentAccount : parent?.account;

      let moneyType: string | undefined;
      if (moneyAccountName && parent?.fyo) {
        try {
          const rows = (await parent.fyo.db.getAll('Account', {
            fields: ['accountType'],
            filters: { name: String(moneyAccountName) },
            limit: 1,
          })) as { accountType?: string }[];
          moneyType = rows[0]?.accountType;
        } catch {
          moneyType = undefined;
        }
      }

      if (moneyType === AccountTypeEnum.CreditCard) {
        return {
          isGroup: false,
          accountType: [
            'not in',
            [
              AccountTypeEnum.CreditCard,
              AccountTypeEnum.Receivable,
              AccountTypeEnum.Payable,
            ],
          ],
        };
      }

      if (
        moneyType === AccountTypeEnum.Bank ||
        moneyType === AccountTypeEnum.Cash
      ) {
        return {
          isGroup: false,
          accountType: [
            'not in',
            [
              AccountTypeEnum.Bank,
              AccountTypeEnum.Cash,
              AccountTypeEnum.Receivable,
              AccountTypeEnum.Payable,
            ],
          ],
        };
      }

      return {
        isGroup: false,
        accountType: ['not in', [...NON_CATEGORY_ACCOUNT_TYPES]],
      };
    },
  };
}
