import { t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { isClassicTheme } from './qbdFamiliarity';
import { getFormRoute, openSettings, routeTo } from './ui';
import { GetStartedConfigItem } from './types';

export const GET_STARTED_SECTION_OPEN_KEY =
  'livebooks-get-started-section-open';

/** Connect Bank Feeds (Accounts, last row): sign in first, then open Online. */
export function connectBankFeedsActionLabel(signedIn: boolean): string {
  return signedIn ? t`Open` : t`Sign into Cloud`;
}

export function readGetStartedSectionOpen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GET_STARTED_SECTION_OPEN_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean') {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function writeGetStartedSectionOpen(openByKey: Record<string, boolean>) {
  try {
    localStorage.setItem(
      GET_STARTED_SECTION_OPEN_KEY,
      JSON.stringify(openByKey)
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function defaultSectionOpen(
  section: { key: string; optional?: boolean },
  isComplete: boolean,
  saved: Record<string, boolean>
): boolean {
  if (Object.prototype.hasOwnProperty.call(saved, section.key)) {
    return saved[section.key];
  }
  if (section.optional) {
    return false;
  }
  return !isComplete;
}

export function getGetStartedConfig(): GetStartedConfigItem[] {
  /* eslint-disable @typescript-eslint/no-misused-promises */
  return [
    {
      key: 'company',
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
          description: t`Migrate your company file to LiveBooks and search the archive history and accounts.`,
          actionLabel: t`Open`,
          action: () => routeTo('/source-books'),
        },
      ],
    },
    {
      key: 'accounts',
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
      key: 'customersVendors',
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
      key: 'misc',
      label: t`Misc`,
      optional: true,
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
