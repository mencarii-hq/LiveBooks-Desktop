import { Fyo, t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { Action, ListViewSettings } from 'fyo/model/types';

export class BankStatement extends Doc {
  bankAccount?: string;

  static getActions(fyo: Fyo): Action[] {
    void fyo;
    return [
      {
        label: t`Reconcile`,
        type: 'primary',
        action: async (doc, router) => {
          const account = String(
            (doc as BankStatement).bankAccount ?? ''
          ).trim();
          if (!account) {
            return;
          }
          await router.push({
            path: `/bank-reconcile/${encodeURIComponent(account)}`,
          });
        },
      },
    ];
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        'bankAccount',
        'fromDate',
        'toDate',
        'status',
        'source',
      ],
    };
  }
}
