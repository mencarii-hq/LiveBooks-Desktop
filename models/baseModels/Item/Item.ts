import { Fyo } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import {
  Action,
  FiltersMap,
  FormulaMap,
  HiddenMap,
  ListViewSettings,
  ReadOnlyMap,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { Money } from 'pesa';
import { AccountRootTypeEnum, AccountTypeEnum } from '../Account/types';
import {
  salesIncomeAccountId,
  serviceIncomeAccountId,
} from 'utils/ids/coaAccountLookup';
import { generateDocId, isUuidDocId } from 'utils/ids';
import { ModelNameEnum } from 'models/types';
import { isUsCaCompany } from 'utils/regional';

interface UOMConversionItem {
  name: string;
  uom: string;
  conversionFactor: number;
}

export class Item extends Doc {
  itemName?: string;
  itemCode?: string;
  trackItem?: boolean;
  itemType?: 'Product' | 'Service';
  for?: 'Purchases' | 'Sales' | 'Both';
  hasBatch?: boolean;
  batchSeries?: string;
  itemGroup?: string;
  hsnCode?: number;
  hasSerialNumber?: boolean;
  serialNumberSeries?: string;
  datafromErp?: boolean;
  uomConversions: UOMConversionItem[] = [];

  formulas: FormulaMap = {
    incomeAccount: {
      formula: async () => {
        const accountId =
          this.itemType === 'Product'
            ? salesIncomeAccountId(this.fyo)
            : serviceIncomeAccountId(this.fyo);

        const accountExists = await this.fyo.db.exists('Account', accountId);
        return accountExists ? accountId : '';
      },
      dependsOn: ['itemType'],
    },
    expenseAccount: {
      formula: async () => {
        if (this.trackItem) {
          return this.fyo.singles.InventorySettings
            ?.stockReceivedButNotBilled as string;
        }

        const cogs = await this.fyo.db.getAllRaw('Account', {
          filters: {
            accountType: AccountTypeEnum['Cost of Goods Sold'],
          },
        });

        if (cogs.length === 0) {
          return '';
        } else {
          return cogs[0].name as string;
        }
      },
      dependsOn: ['itemType', 'trackItem'],
    },
    hsnCode: {
      formula: async () => {
        if (!this.itemGroup) {
          return '';
        }

        const itemGroupDoc = await this.fyo.doc.getDoc(
          'ItemGroup',
          this.itemGroup
        );
        return itemGroupDoc?.hsnCode as string;
      },
      dependsOn: ['itemGroup'],
    },
  };

  async beforeSync(): Promise<void> {
    await super.beforeSync();

    // Only assign/rewrite the PK on insert. Changing `name` on an already
    // inserted doc would update against a non-existent row (#updateOne uses
    // the current name as the WHERE key and does not rename the PK).
    if (!this.inserted) {
      if (this.name && !isUuidDocId(this.name)) {
        // Temp UI ids look like "New Item 01" — never promote those into
        // itemName (lists, invoices, and validation use that field).
        if (!this.fyo.doc.isTemporaryName(this.name, this.schema)) {
          this.itemName ??= this.name;
        }
        this.name = generateDocId();
      } else if (!this.name) {
        this.name = generateDocId();
      }
    }

    if (typeof this.itemName === 'string') {
      this.itemName = this.itemName.trim();
    }

    // Hard-block duplicate itemName (case-insensitive) on create/rename.
    // Existing books may already have case-insensitive duplicates; allow those
    // items to keep saving as long as itemName is unchanged.
    let persisted: { itemName?: string } | null = null;
    if (this.inserted && this.name) {
      persisted = (await this.fyo.db.get(ModelNameEnum.Item, this.name)) as {
        itemName?: string;
      } | null;
    }

    if (this.itemName) {
      const normalizedName = this.itemName.toLowerCase();
      const nameUnchanged =
        !!persisted?.itemName &&
        persisted.itemName.trim().toLowerCase() === normalizedName;

      if (!nameUnchanged) {
        const allItems = (await this.fyo.db.getAll(ModelNameEnum.Item, {
          fields: ['name', 'itemName'],
        })) as { name: string; itemName?: string }[];
        const duplicate = allItems.find(
          (i) =>
            i.name !== this.name &&
            i.itemName &&
            i.itemName.trim().toLowerCase() === normalizedName
        );
        if (duplicate) {
          throw new ValidationError(
            'Item name must be unique. Rename with a prefix or suffix to continue.'
          );
        }
      }
    }

    const latestByUom = new Map<string, UOMConversionItem>();

    this.uomConversions.forEach((item) => {
      if (item.conversionFactor > 0) {
        latestByUom.set(item.uom, item);
      }
    });

    this.uomConversions = Array.from(latestByUom.values());

    if (this.serialNumberSeries && this.hasSerialNumber) {
      const series = this.serialNumberSeries.trim();
      if (series && !series.endsWith('-')) {
        this.serialNumberSeries = series + '-';
      }
    }

    if (this.batchSeries && this.hasBatch) {
      const series = this.batchSeries.trim();
      if (series && !series.endsWith('-')) {
        this.batchSeries = series + '-';
      }
    }
  }

  async afterSync(): Promise<void> {
    await super.afterSync();

    if (this.hasSerialNumber && this.serialNumberSeries) {
      const seriesName = this.serialNumberSeries?.trim();

      if (!seriesName) {
        return;
      }

      const exists = await this.fyo.db.exists('SerialNumberSeries', seriesName);

      if (!exists) {
        await this.fyo.doc
          .getNewDoc('SerialNumberSeries', {
            name: seriesName,
            start: 1001,
            padZeros: 4,
            current: 1001,
          })
          .sync();
      }
    }

    if (this.hasBatch && this.batchSeries) {
      const seriesName = this.batchSeries?.trim();

      if (!seriesName) {
        return;
      }

      const exists = await this.fyo.db.exists('BatchSeries', seriesName);

      if (!exists) {
        await this.fyo.doc
          .getNewDoc('BatchSeries', {
            name: seriesName,
            start: 1001,
            padZeros: 4,
            current: 1001,
          })
          .sync();
      }
    }
  }

  static filters: FiltersMap = {
    incomeAccount: () => ({
      isGroup: false,
      rootType: AccountRootTypeEnum.Income,
    }),
    expenseAccount: (doc) => ({
      isGroup: false,
      rootType: doc.trackItem
        ? AccountRootTypeEnum.Liability
        : AccountRootTypeEnum.Expense,
    }),
  };

  validations: ValidationMap = {
    barcode: (value: DocValue) => {
      if (value && !(value as string).match(/^\d{12}$/)) {
        throw new ValidationError(
          this.fyo.t`Barcode must be exactly 12 digits.`
        );
      }
    },
    rate: (value: DocValue) => {
      if ((value as Money).isNegative()) {
        throw new ValidationError(this.fyo.t`Rate can't be negative.`);
      }
    },
    hsnCode: (value: DocValue) => {
      if (value && !(value as string).match(/^\d{4,8}$/)) {
        throw new ValidationError(this.fyo.t`Invalid HSN Code.`);
      }
    },
    serialNumberSeries: (value: DocValue) => {
      if (!value) {
        return;
      }

      const series = (value as string).trim();
      const invalidChars = /[/\=\?\&\%]/;

      if (invalidChars.test(series)) {
        throw new ValidationError(
          this.fyo
            .t`Serial Number Series cannot contain the following characters: /, ?, &, =, %`
        );
      }
    },
    batchSeries: (value: DocValue) => {
      if (!value) {
        return;
      }

      const series = (value as string).trim();
      const invalidChars = /[/\=\?\&\%]/;

      if (invalidChars.test(series)) {
        throw new ValidationError(
          this.fyo
            .t`Batch Series cannot contain the following characters: /, ?, &, =, %`
        );
      }
    },
  };

  static getActions(fyo: Fyo): Action[] {
    return [
      {
        group: fyo.t`Create`,
        label: isUsCaCompany(fyo) ? fyo.t`Invoice` : fyo.t`Sales Invoice`,
        condition: (doc) => !doc.notInserted && doc.for !== 'Purchases',
        action: async (doc, router) => {
          const invoice = fyo.doc.getNewDoc('SalesInvoice');
          await invoice.append('items', {
            item: doc.name as string,
            rate: doc.rate as Money,
            tax: doc.tax as string,
          });
          await router.push(`/edit/SalesInvoice/${invoice.name!}`);
        },
      },
      {
        group: fyo.t`Create`,
        label: isUsCaCompany(fyo) ? fyo.t`Bill` : fyo.t`Purchase Invoice`,
        condition: (doc) => !doc.notInserted && doc.for !== 'Sales',
        action: async (doc, router) => {
          const invoice = fyo.doc.getNewDoc('PurchaseInvoice');
          await invoice.append('items', {
            item: doc.name as string,
            rate: doc.rate as Money,
            tax: doc.tax as string,
          });
          await router.push(`/edit/PurchaseInvoice/${invoice.name!}`);
        },
      },
    ];
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['itemName', 'unit', 'tax', 'rate'],
    };
  }

  hidden: HiddenMap = {
    trackItem: () =>
      !this.fyo.singles.AccountingSettings?.enableInventory ||
      this.itemType !== 'Product' ||
      (this.inserted && !this.trackItem),
    barcode: () => !this.fyo.singles.InventorySettings?.enableBarcodes,
    hasBatch: () => !this.fyo.singles.InventorySettings?.enableBatches,
    hasSerialNumber: () =>
      !(
        this.fyo.singles.InventorySettings?.enableSerialNumber && this.trackItem
      ),
    serialNumberSeries: () => !this.hasSerialNumber,
    batchSeries: () => !this.hasBatch,
    uomConversions: () =>
      !this.fyo.singles.InventorySettings?.enableUomConversions,
    itemGroup: () => !this.fyo.singles.AccountingSettings?.enableitemGroup,
  };

  readOnly: ReadOnlyMap = {
    unit: () => this.inserted,
    itemType: () => this.inserted,
    trackItem: () => this.inserted,
    hasBatch: () => this.inserted,
    hasSerialNumber: () => this.inserted,
  };
}
