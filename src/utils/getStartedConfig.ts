import { t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { openLivebooksCloudSignIn } from './livebooksCloud';
import { livebooksCloudQbdExportUrl } from './livebooksCloudUrls';
import { getFormRoute, openSettings, routeTo } from './ui';
import { GetStartedConfigItem } from './types';

export function getGetStartedConfig(): GetStartedConfigItem[] {
  /* eslint-disable @typescript-eslint/no-misused-promises */
  return [
    {
      label: t`Organisation`,
      items: [
        {
          key: 'General',
          label: t`General`,
          icon: 'general',
          description: t`Set up your company information, email, country and fiscal year`,
          fieldname: 'companySetup',
          action: () => openSettings(ModelNameEnum.AccountingSettings),
        },
        {
          key: 'Import Lists',
          label: t`Import Lists (CSV)`,
          icon: 'common-entries',
          description: t`Import accounts, customers, vendors, items, and other lists from a CSV file`,
          action: () => routeTo('/import-lists'),
        },
        {
          key: 'Print',
          label: t`Print`,
          icon: 'invoice',
          description: t`Customize your invoices by adding a logo and address details`,
          fieldname: 'printSetup',
          action: () => openSettings(ModelNameEnum.PrintSettings),
        },
      ],
    },
    {
      label: t`Accounts`,
      items: [
        {
          key: 'Review Accounts',
          label: t`Review Accounts`,
          icon: 'review-ac',
          description: t`Review your chart of accounts, add any account or tax heads as needed`,
          action: () => routeTo('/chart-of-accounts'),
          fieldname: 'chartOfAccountsReviewed',
        },
        {
          key: 'Opening Balances',
          label: t`Opening Balances`,
          icon: 'opening-ac',
          fieldname: 'openingBalanceChecked',
          description: t`Set up your opening balances before performing any accounting entries`,
          action: async () => {
            const doc = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
              entryType: 'Opening Entry',
            });
            await routeTo(getFormRoute(ModelNameEnum.JournalEntry, doc.name!));
          },
        },
        {
          key: 'Add Taxes',
          label: t`Add Taxes`,
          icon: 'percentage',
          fieldname: 'taxesAdded',
          description: t`Set up your tax templates for your sales or purchase transactions`,
          action: () => routeTo('/list/Tax'),
        },
      ],
    },
    {
      label: t`Receivable`,
      items: [
        {
          key: 'Add Sales Items',
          label: t`Add Items`,
          icon: 'item',
          description: t`Add products or services that you sell to your customers`,
          action: () =>
            routeTo({
              path: `/list/Item/${t`Sales Items`}`,
              query: {
                filters: JSON.stringify({ for: 'Sales' }),
              },
            }),
          fieldname: 'salesItemCreated',
        },
        {
          key: 'Add Customers',
          label: t`Add Customers`,
          icon: 'customer',
          description: t`Add a few customers to create your first sales invoice`,
          action: () =>
            routeTo({
              path: `/list/Party/${t`Customers`}`,
              query: {
                filters: JSON.stringify({ role: 'Customer' }),
              },
            }),
          fieldname: 'customerCreated',
        },
        {
          key: 'Create Sales Invoice',
          label: t`Create Sales Invoice`,
          icon: 'sales-invoice',
          description: t`Create your first sales invoice for the created customer`,
          action: () => routeTo('/list/SalesInvoice'),
          fieldname: 'invoiceCreated',
        },
      ],
    },
    {
      label: t`Payable`,
      items: [
        {
          key: 'Add Purchase Items',
          label: t`Add Items`,
          icon: 'item',
          description: t`Add products or services that you buy from your suppliers`,
          action: () =>
            routeTo({
              path: `/list/Item/${t`Purchase Items`}`,
              query: {
                filters: JSON.stringify({ for: 'Purchases' }),
              },
            }),
          fieldname: 'purchaseItemCreated',
        },
        {
          key: 'Add Suppliers',
          label: t`Add Suppliers`,
          icon: 'supplier',
          description: t`Add a few suppliers to create your first purchase invoice`,
          action: () =>
            routeTo({
              path: `/list/Party/${t`Suppliers`}`,
              query: { filters: JSON.stringify({ role: 'Supplier' }) },
            }),
          fieldname: 'supplierCreated',
        },
        {
          key: 'Create Purchase Invoice',
          label: t`Create Purchase Invoice`,
          icon: 'purchase-invoice',
          description: t`Create your first purchase invoice from the created supplier`,
          action: () => routeTo('/list/PurchaseInvoice'),
          fieldname: 'billCreated',
        },
      ],
    },
    {
      label: t`Cloud`,
      optional: true,
      items: [
        {
          key: 'CloudSignIn',
          label: t`Sign in to LiveBooks Cloud`,
          icon: 'cloud',
          description: t`Books stay on this computer. Cloud is for when your operations need backup, sync, and collaboration.`,
          actionLabel: t`Sign in`,
          viewLabel: t`Open`,
          completedKey: 'cloudSignedIn',
          action: () => {
            void openLivebooksCloudSignIn();
          },
        },
        {
          key: 'ExportQBD',
          label: t`Export QuickBooks Desktop`,
          icon: 'common-entries',
          description: t`Export your QuickBooks Desktop company file from Cloud.`,
          actionLabel: t`Open`,
          action: () => {
            ipc.openLink(livebooksCloudQbdExportUrl());
          },
        },
        {
          key: 'CloudBankFeeds',
          label: t`Connect bank feeds`,
          icon: 'opening-ac',
          description: t`Import transactions from your bank. Manual feeds work offline.`,
          actionLabel: t`Open`,
          action: () => routeTo('/bank-feeds'),
        },
      ],
    },
  ];
}
