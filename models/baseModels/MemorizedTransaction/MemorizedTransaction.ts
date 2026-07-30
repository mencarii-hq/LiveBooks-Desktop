import { Fyo } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { Action, ListViewSettings } from 'fyo/model/types';
import { Money } from 'pesa';

export type MemorizedFrequency =
  | 'Daily'
  | 'Weekly'
  | 'Monthly'
  | 'Quarterly'
  | 'Annual';

export class MemorizedTransaction extends Doc {
  party?: string;
  paymentType?: 'Pay' | 'Receive';
  fromAccount?: string;
  toAccount?: string;
  amount?: Money;
  memo?: string;
  frequency?: MemorizedFrequency;
  nextDueDate?: string | Date;
  paymentMethod?: string;

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
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
