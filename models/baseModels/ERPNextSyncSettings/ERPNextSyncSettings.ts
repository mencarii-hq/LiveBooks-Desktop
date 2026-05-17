import { Doc } from 'fyo/model/doc';
import { HiddenMap } from 'fyo/model/types';

/**
 * Dormant single — schema/tables kept for existing .books files and Frappe Books
 * handoff. ERPNext sync was removed from LiveBooks; this doc is not wired to UI.
 */
export class ERPNextSyncSettings extends Doc {
  deviceID?: string;
  instanceName?: string;
  baseURL?: string;
  authToken?: string;
  integrationAppVersion?: string;
  isEnabled?: boolean;
  initialSyncData?: boolean;

  dataSyncInterval?: string;
  syncDataFromServer?: boolean;
  syncDataToServer?: boolean;

  registerInstance?: string;
  syncSettings?: string;
  syncDataToERPNext?: string;
  fetchFromERPNextQueue?: string;
  clearSyncedDocsFromErpNextSyncQueue?: string;

  hidden: HiddenMap = {
    syncPriceList: () => {
      return !this.fyo.singles.AccountingSettings?.enablePriceList;
    },
    priceListSyncType: () => {
      return !this.fyo.singles.AccountingSettings?.enablePriceList;
    },
    syncSerialNumber: () => {
      return !this.fyo.singles.InventorySettings?.enableSerialNumber;
    },
    serialNumberSyncType: () => {
      return !this.fyo.singles.InventorySettings?.enableSerialNumber;
    },
    syncBatch: () => {
      return !this.fyo.singles.InventorySettings?.enableBatches;
    },
    batchSyncType: () => {
      return !this.fyo.singles.InventorySettings?.enableBatches;
    },
    syncDataFromServer: () => true,
    syncDataToServer: () => true,
  };
}
