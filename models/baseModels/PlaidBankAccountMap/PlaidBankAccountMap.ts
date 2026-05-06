import { Doc } from 'fyo/model/doc';
import { ListViewSettings } from 'fyo/model/types';

export class PlaidBankAccountMap extends Doc {
  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'plaidItemId',
        'plaidAccountId',
        'plaidDisplayLabel',
        'chartAccount',
      ],
    };
  }
}
