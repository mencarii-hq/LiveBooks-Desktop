import { Fyo, t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { Action, ListViewSettings } from 'fyo/model/types';

export class BankStatement extends Doc {
  static getActions(fyo: Fyo): Action[] {
    void fyo;
    return [
      {
        label: t`Reconcile`,
        type: 'primary',
        action: async (doc, router) => {
          await router.push({
            path: `/bank-reconcile/${encodeURIComponent(doc.name!)}`,
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
