import { t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { isClassicTheme } from './qbdFamiliarity';
import { getFormRoute, openSettings, routeTo } from './ui';
import { GetStartedConfigItem } from './types';

/** Connect Bank Feeds (Accounts, last row): sign in first, then open Online. */
export function connectBankFeedsActionLabel(signedIn: boolean): string {
  return signedIn ? t`Open` : t`Sign into Cloud`;
}

export function getGetStartedConfig(): GetStartedConfigItem[] {
  /* eslint-disable @typescript-eslint/no-misused-promises */
  return [
    {
      label: isClassicTheme(fyo.singles.SystemSettings)
        ? t`Company`
        : t`Organization`,
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
          key: 'ExportQBD',
          label: t`Migrate Your QBD File`,
          icon: 'common-entries',
          description: t`Import customers, vendors, items, and accounts. Review and search past history here.`,
          actionLabel: t`Open`,
          action: () => routeTo('/source-books'),
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
          key: 'CloudBankFeeds',
          label: t`Connect Bank Feeds`,
          icon: 'opening-ac',
          description: t`Set up online banking to get feeds from your bank.`,
          actionLabel: t`Open`,
          action: () =>
            routeTo({ path: '/bank-feeds', query: { tab: 'online' } }),
        },
      ],
    },
    {
      label: t`Customers & Vendors`,
      items: [
        {
          key: 'Add Sales Items',
          label: t`Add Items`,
          icon: 'item',
          description: t`Add products or services that you sell or buy`,
          action: () => routeTo(`/list/Item/${t`Items`}`),
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
          key: 'Add Suppliers',
          label: t`Add Vendors`,
          icon: 'supplier',
          description: t`Add a few vendors to create your first bill`,
          action: () =>
            routeTo({
              path: `/list/Party/${t`Vendors`}`,
              query: { filters: JSON.stringify({ role: 'Supplier' }) },
            }),
          fieldname: 'supplierCreated',
        },
        {
          key: 'Create Sales Invoice',
          label: t`Create Sales Invoice`,
          icon: 'sales-invoice',
          description: t`Create your first sales invoice for the created customer`,
          action: () => routeTo('/list/SalesInvoice'),
          fieldname: 'invoiceCreated',
        },
        {
          key: 'Create Purchase Invoice',
          label: t`Enter Bills`,
          icon: 'purchase-invoice',
          description: t`Create your first bill from the created vendor`,
          action: () => routeTo('/list/PurchaseInvoice'),
          fieldname: 'billCreated',
        },
      ],
    },
    {
      label: t`Misc`,
      items: [
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
  ];
}
