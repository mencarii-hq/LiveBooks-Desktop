import { Doc } from 'fyo/model/doc';
import { ListViewSettings } from 'fyo/model/types';

export class MemorizedReport extends Doc {
  reportClassName?: string;
  filtersJson?: string;

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'reportClassName'],
    };
  }
}
