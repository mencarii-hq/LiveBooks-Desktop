import { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';

/**
 * Doc types that can be bulk-imported via Import Wizard (must stay in sync with ImportWizard UI).
 */
export function getImportableSchemaNames(fyo: Fyo): ModelNameEnum[] {
  const importables: ModelNameEnum[] = [
    ModelNameEnum.SalesInvoice,
    ModelNameEnum.PurchaseInvoice,
    ModelNameEnum.Payment,
    ModelNameEnum.Party,
    ModelNameEnum.Item,
    ModelNameEnum.JournalEntry,
    ModelNameEnum.Tax,
    ModelNameEnum.Account,
    ModelNameEnum.Address,
    ModelNameEnum.NumberSeries,
  ];

  if (fyo.doc.singles.AccountingSettings?.enableInventory) {
    importables.push(
      ModelNameEnum.StockMovement,
      ModelNameEnum.Shipment,
      ModelNameEnum.PurchaseReceipt,
      ModelNameEnum.Location
    );
  }

  return importables;
}

export function isImportableSchemaName(
  fyo: Fyo,
  name: string
): name is ModelNameEnum {
  return getImportableSchemaNames(fyo).includes(name as ModelNameEnum);
}
