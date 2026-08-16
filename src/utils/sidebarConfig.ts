import { t } from 'fyo';
import { routeFilters } from 'src/utils/filters';
import { isUsCaCompany } from 'utils/regional';
import { entityTypeLabel } from 'utils/sourcebooks/entityTypes';
import { fyo } from '../initFyo';
import { refreshSourceBookStatus } from './sourcebooks';
import { SidebarConfig, SidebarItem, SidebarRoot } from './types';
import {
  getMemorizedReportPath,
  listMemorizedReports,
} from './memorizedReports';
import {
  BANK_FEEDS_PATH,
  CHART_OF_ACCOUNTS_PATH,
  DASHBOARD_PATH,
  HOME_PATH,
  MAKE_DEPOSITS_PATH,
  RECONCILE_PATH,
  USE_REGISTER_PATH,
  WRITE_CHECKS_PATH,
  isModernTheme,
} from './qbdFamiliarity';

export async function getSidebarConfig(): Promise<SidebarConfig> {
  const sideBar = await getCompleteSidebar();
  return getFilteredSidebar(sideBar);
}

function getFilteredSidebar(sideBar: SidebarConfig): SidebarConfig {
  return sideBar.filter((root) => {
    root.items = root.items?.filter((item) => {
      if (item.hidden !== undefined) {
        return !item.hidden();
      }

      return true;
    });

    if (root.hidden !== undefined) {
      return !root.hidden();
    }

    return true;
  });
}

function getRegionalSidebar(): SidebarRoot[] {
  const hasGstin = !!fyo.singles?.AccountingSettings?.gstin;
  if (!hasGstin) {
    return [];
  }

  return [
    {
      label: t`GST`,
      name: 'gst',
      icon: 'gst',
      route: '/report/GSTR1',
      items: [
        {
          label: t`GSTR1`,
          name: 'gstr1',
          route: '/report/GSTR1',
        },
        {
          label: t`GSTR2`,
          name: 'gstr2',
          route: '/report/GSTR2',
        },
      ],
    },
  ];
}

function getInventorySidebar(): SidebarRoot[] {
  const hasInventory = !!fyo.singles.AccountingSettings?.enableInventory;
  if (!hasInventory) {
    return [];
  }

  return [
    {
      label: t`Inventory`,
      name: 'inventory',
      icon: 'inventory',
      iconSize: '18',
      route: '/list/StockMovement',
      items: [
        {
          label: t`Stock Movement`,
          name: 'stock-movement',
          route: '/list/StockMovement',
          schemaName: 'StockMovement',
        },
        {
          label: t`Shipment`,
          name: 'shipment',
          route: '/list/Shipment',
          schemaName: 'Shipment',
        },
        {
          label: t`Purchase Receipt`,
          name: 'purchase-receipt',
          route: '/list/PurchaseReceipt',
          schemaName: 'PurchaseReceipt',
        },
        {
          label: t`Stock Ledger`,
          name: 'stock-ledger',
          route: '/report/StockLedger',
        },
        {
          label: t`Stock Balance`,
          name: 'stock-balance',
          route: '/report/StockBalance',
        },
      ],
    },
  ];
}

function getPOSSidebar() {
  return {
    label: t`POS`,
    name: 'pos',
    route: '/pos',
    icon: 'pos',
    hidden: () => !fyo.singles.InventorySettings?.enablePointOfSale,
  };
}

function getReportSidebar(): SidebarRoot {
  return {
    label: t`Reports`,
    name: 'reports',
    icon: 'reports',
    route: '/report/GeneralLedger',
    items: [
      {
        label: t`General Ledger`,
        name: 'general-ledger',
        route: '/report/GeneralLedger',
      },
      {
        label: t`Profit And Loss`,
        name: 'profit-and-loss',
        route: '/report/ProfitAndLoss',
      },
      {
        label: t`Balance Sheet`,
        name: 'balance-sheet',
        route: '/report/BalanceSheet',
      },
      {
        label: t`Trial Balance`,
        name: 'trial-balance',
        route: '/report/TrialBalance',
      },
      {
        label: t`Sales by Customer`,
        name: 'sales-by-customer',
        route: '/report/SalesByCustomer',
      },
      {
        label: t`Receivable Aging`,
        name: 'accounts-receivable-aging',
        route: '/report/AccountsReceivableAging',
      },
      {
        label: t`Payable Aging`,
        name: 'accounts-payable-aging',
        route: '/report/AccountsPayableAging',
      },
    ],
  };
}

function reportClassFromRoute(route: string): string {
  const path = route.split('?')[0];
  const prefix = '/report/';
  if (!path.startsWith(prefix)) {
    return '';
  }
  return path.slice(prefix.length);
}

async function getReportSidebarWithMemorized(): Promise<SidebarRoot> {
  const sidebar = getReportSidebar();
  const memorized = await listMemorizedReports(fyo);
  if (!memorized.length) {
    return sidebar;
  }

  const byClass = new Map<string, typeof memorized>();
  for (const row of memorized) {
    const list = byClass.get(row.reportClassName) ?? [];
    list.push(row);
    byClass.set(row.reportClassName, list);
  }

  const items: SidebarItem[] = [];
  const nested = new Set<string>();
  for (const item of sidebar.items ?? []) {
    items.push(item);
    const className = reportClassFromRoute(item.route);
    const children = className ? byClass.get(className) : undefined;
    if (!children?.length) {
      continue;
    }

    for (const row of children) {
      items.push({
        label: row.name,
        name: `memorized-report-${row.name}`,
        route: getMemorizedReportPath(row),
        indent: true,
      });
      nested.add(row.name);
    }
  }

  for (const row of memorized) {
    if (nested.has(row.name)) {
      continue;
    }
    items.push({
      label: row.name,
      name: `memorized-report-${row.name}`,
      route: getMemorizedReportPath(row),
      indent: true,
    });
  }

  sidebar.items = items;
  return sidebar;
}

/**
 * QBD Archive (internal: Source book archive). Empty state routes to the
 * setup wizard; once an archive is attached the sidebar shows the archive
 * sections instead of the wizard.
 */
async function getSourceBooksSidebar(): Promise<SidebarRoot> {
  const root: SidebarRoot = {
    label: t`QBD Archive`,
    name: 'source-books',
    icon: 'history',
    route: '/source-books',
  };

  let attached = false;
  let snapshotNames: string[] = [];
  try {
    const status = await refreshSourceBookStatus();
    attached = status.attached;
    snapshotNames = status.snapshotNames ?? [];
  } catch {
    /* no open book yet — show the root only */
  }
  if (!attached) {
    return root;
  }

  const items: SidebarItem[] = [
    {
      label: t`Search & Overview`,
      name: 'source-books-overview',
      route: '/source-books',
    },
    {
      label: t`Customers`,
      name: 'source-books-customers',
      route: '/source-books/list/customer',
    },
    {
      label: t`Vendors`,
      name: 'source-books-vendors',
      route: '/source-books/list/vendor',
    },
    {
      label: t`Items`,
      name: 'source-books-items',
      route: '/source-books/list/item*',
    },
    {
      label: t`Accounts`,
      name: 'source-books-accounts',
      route: '/source-books/list/account',
    },
  ];
  for (const name of snapshotNames) {
    items.push({
      label: entityTypeLabel(name),
      name: `source-books-report-${name}`,
      route: `/source-books/report/${encodeURIComponent(name)}`,
      indent: true,
    });
  }

  root.items = items;
  return root;
}

async function getCompleteSidebar(): Promise<SidebarConfig> {
  if (isModernTheme(fyo.singles?.SystemSettings)) {
    return getModernSidebar();
  }
  return getClassicSidebar();
}

export async function getClassicSidebar(): Promise<SidebarConfig> {
  return [
    {
      label: t`Get Started`,
      name: 'get-started',
      route: '/get-started',
      icon: 'general',
      hidden: () => !!fyo.singles.SystemSettings?.hideGetStarted,
    },
    {
      label: t`Home`,
      name: 'home',
      route: HOME_PATH,
      icon: 'dashboard',
    },
    {
      label: t`Company`,
      name: 'company',
      icon: 'settings',
      route: CHART_OF_ACCOUNTS_PATH,
      items: [
        {
          label: t`Chart of Accounts`,
          name: 'chart-of-accounts',
          route: CHART_OF_ACCOUNTS_PATH,
        },
        {
          label: t`Memorized Transactions`,
          name: 'memorized-transactions',
          route: `/list/MemorizedTransaction/${t`Memorized Transaction List`}`,
          schemaName: 'MemorizedTransaction',
        },
        {
          label: t`Journal Entry`,
          name: 'journal-entry',
          route: '/list/JournalEntry',
          schemaName: 'JournalEntry',
        },
        {
          label: t`Customers & Vendors`,
          name: 'party',
          route: `/list/Party/${t`Name`}`,
          schemaName: 'Party',
          filters: { role: ['in', ['Customer', 'Supplier', 'Both']] },
        },
        {
          label: t`Items`,
          name: 'common-items',
          route: `/list/Item/${t`Items`}`,
          schemaName: 'Item',
          filters: { for: 'Both' },
        },
        {
          label: t`Price List`,
          name: 'price-list',
          route: '/list/PriceList',
          schemaName: 'PriceList',
          hidden: () => !fyo.singles.AccountingSettings?.enablePriceList,
        },
        {
          label: t`Tax Templates`,
          name: 'taxes',
          route: '/list/Tax',
          schemaName: 'Tax',
        },
        {
          label: t`Import Wizard`,
          name: 'import-wizard',
          route: '/import-wizard',
        },
        {
          label: t`Print Templates`,
          name: 'print-template',
          route: '/list/PrintTemplate',
          schemaName: 'PrintTemplate',
        },
        {
          label: t`Customize Form`,
          name: 'customize-form',
          route: `/list/CustomForm/${t`Customize Form`}`,
          hidden: () =>
            !fyo.singles.AccountingSettings?.enableFormCustomization,
        },
        {
          label: t`Dashboard`,
          name: 'dashboard',
          route: DASHBOARD_PATH,
        },
        {
          label: t`Settings`,
          name: 'settings',
          route: '/settings',
        },
      ] as SidebarItem[],
    },
    {
      label: t`Customers`,
      name: 'customers',
      icon: 'sales',
      route: `/list/SalesInvoice/${t`Create Invoices`}`,
      items: [
        {
          label: t`Create Invoices`,
          name: 'sales-invoices',
          route: `/list/SalesInvoice/${t`Create Invoices`}`,
          schemaName: 'SalesInvoice',
        },
        {
          label: t`Receive Payments`,
          name: 'payments',
          route: `/list/Payment/${t`Receive Payments`}`,
          schemaName: 'Payment',
          filters: routeFilters.SalesPayments,
        },
        {
          label: isUsCaCompany(fyo) ? t`Quotes` : t`Sales Quotes`,
          name: 'sales-quotes',
          route: '/list/SalesQuote',
          schemaName: 'SalesQuote',
        },
        {
          label: t`Customers`,
          name: 'customer-list',
          route: `/list/Party/${t`Customers`}`,
          schemaName: 'Party',
          filters: routeFilters.Customers,
        },
        {
          label: isUsCaCompany(fyo) ? t`Items` : t`Sales Items`,
          name: 'sales-items',
          route: `/list/Item/${
            isUsCaCompany(fyo) ? t`Items (Receivables)` : t`Sales Items`
          }`,
          schemaName: 'Item',
          filters: routeFilters.SalesItems,
        },
        {
          label: t`Loyalty Program`,
          name: 'loyalty-program',
          route: '/list/LoyaltyProgram',
          schemaName: 'LoyaltyProgram',
          hidden: () => !fyo.singles.AccountingSettings?.enableLoyaltyProgram,
        },
        {
          label: t`Lead`,
          name: 'lead',
          route: '/list/Lead',
          schemaName: 'Lead',
          hidden: () => !fyo.singles.AccountingSettings?.enableLead,
        },
        {
          label: t`Pricing Rule`,
          name: 'pricing-rule',
          route: '/list/PricingRule',
          schemaName: 'PricingRule',
          hidden: () => !fyo.singles.AccountingSettings?.enablePricingRule,
        },
        {
          label: t`Coupon Code`,
          name: 'coupon-code',
          route: `/list/CouponCode`,
          schemaName: 'CouponCode',
          hidden: () => !fyo.singles.AccountingSettings?.enableCouponCode,
        },
      ] as SidebarItem[],
    },
    {
      label: t`Vendors`,
      name: 'vendors',
      icon: 'purchase',
      route: `/list/PurchaseInvoice/${t`Enter Bills`}`,
      items: [
        {
          label: t`Enter Bills`,
          name: 'purchase-invoices',
          route: `/list/PurchaseInvoice/${t`Enter Bills`}`,
          schemaName: 'PurchaseInvoice',
        },
        {
          label: t`Pay Bills`,
          name: 'vendor-payments',
          route: `/list/Payment/${t`Pay Bills`}`,
          schemaName: 'Payment',
          filters: routeFilters.PurchasePayments,
        },
        {
          label: t`Vendors`,
          name: 'vendor-list',
          route: `/list/Party/${t`Vendors`}`,
          schemaName: 'Party',
          filters: routeFilters.Suppliers,
        },
        {
          label: isUsCaCompany(fyo) ? t`Items` : t`Purchase Items`,
          name: 'purchase-items',
          route: `/list/Item/${
            isUsCaCompany(fyo) ? t`Items (Payables)` : t`Purchase Items`
          }`,
          schemaName: 'Item',
          filters: routeFilters.PurchaseItems,
        },
      ] as SidebarItem[],
    },
    {
      label: t`Payroll Center`,
      name: 'employees',
      icon: 'people',
      route: '/pay-run',
      items: [
        {
          label: t`Employees`,
          name: 'employee-list',
          route: `/list/Party/${t`Employees`}`,
          schemaName: 'Party',
          filters: routeFilters.Employees,
        },
        {
          label: t`Pay Run`,
          name: 'pay-run',
          route: '/pay-run',
        },
      ],
    },
    {
      label: t`Banking`,
      name: 'banking',
      icon: 'opening-ac',
      route: WRITE_CHECKS_PATH,
      items: [
        {
          label: t`Write Checks`,
          name: 'write-checks',
          route: WRITE_CHECKS_PATH,
        },
        {
          label: t`Use Register`,
          name: 'use-register',
          route: USE_REGISTER_PATH,
        },
        {
          label: t`Make Deposits`,
          name: 'make-deposits',
          route: MAKE_DEPOSITS_PATH,
        },
        {
          label: t`Reconcile`,
          name: 'bank-reconcile-hub',
          route: RECONCILE_PATH,
        },
        {
          label: t`Bank Feeds`,
          name: 'bank-live-feeds',
          route: BANK_FEEDS_PATH,
        },
      ],
    },
    await getReportSidebarWithMemorized(),
    await getSourceBooksSidebar(),
    getInventorySidebar(),
    getPOSSidebar(),
    getRegionalSidebar(),
  ].flat();
}

export async function getModernSidebar(): Promise<SidebarConfig> {
  return [
    {
      label: t`Get Started`,
      name: 'get-started',
      route: '/get-started',
      icon: 'general',
      hidden: () => !!fyo.singles.SystemSettings?.hideGetStarted,
    },
    {
      label: t`Dashboard`,
      name: 'dashboard',
      route: DASHBOARD_PATH,
      icon: 'dashboard',
    },
    {
      label: t`Banking`,
      name: 'banking',
      icon: 'opening-ac',
      route: BANK_FEEDS_PATH,
      items: [
        {
          label: t`Write Entry`,
          name: 'write-entry',
          route: WRITE_CHECKS_PATH,
        },
        {
          label: t`Feeds`,
          name: 'bank-live-feeds',
          route: BANK_FEEDS_PATH,
        },
        {
          label: t`Check Register`,
          name: 'bank-register',
          route: USE_REGISTER_PATH,
        },
        {
          label: t`Reconcile`,
          name: 'bank-reconcile-hub',
          route: RECONCILE_PATH,
        },
      ],
    },
    {
      label: t`Payroll`,
      name: 'payroll',
      icon: 'people',
      route: '/pay-run',
      items: [
        {
          label: t`Employees`,
          name: 'employees',
          route: `/list/Party/${t`Employees`}`,
          schemaName: 'Party',
          filters: routeFilters.Employees,
        },
        {
          label: t`Pay Run`,
          name: 'pay-run',
          route: '/pay-run',
        },
      ],
    },
    {
      label: isUsCaCompany(fyo) ? t`Receivables` : t`Sales`,
      name: 'sales',
      icon: 'sales',
      route: '/list/SalesInvoice',
      items: [
        {
          label: isUsCaCompany(fyo) ? t`Quotes` : t`Sales Quotes`,
          name: 'sales-quotes',
          route: '/list/SalesQuote',
          schemaName: 'SalesQuote',
        },
        {
          label: isUsCaCompany(fyo) ? t`Invoices` : t`Sales Invoices`,
          name: 'sales-invoices',
          route: '/list/SalesInvoice',
          schemaName: 'SalesInvoice',
        },
        {
          label: isUsCaCompany(fyo) ? t`Payments` : t`Sales Payments`,
          name: 'payments',
          route: `/list/Payment/${
            isUsCaCompany(fyo) ? t`Payments (Receivables)` : t`Sales Payments`
          }`,
          schemaName: 'Payment',
          filters: routeFilters.SalesPayments,
        },
        {
          label: t`Customers`,
          name: 'customers',
          route: `/list/Party/${t`Customers`}`,
          schemaName: 'Party',
          filters: routeFilters.Customers,
        },
        {
          label: isUsCaCompany(fyo) ? t`Items` : t`Sales Items`,
          name: 'sales-items',
          route: `/list/Item/${
            isUsCaCompany(fyo) ? t`Items (Receivables)` : t`Sales Items`
          }`,
          schemaName: 'Item',
          filters: routeFilters.SalesItems,
        },
        {
          label: t`Loyalty Program`,
          name: 'loyalty-program',
          route: '/list/LoyaltyProgram',
          schemaName: 'LoyaltyProgram',
          hidden: () => !fyo.singles.AccountingSettings?.enableLoyaltyProgram,
        },
        {
          label: t`Lead`,
          name: 'lead',
          route: '/list/Lead',
          schemaName: 'Lead',
          hidden: () => !fyo.singles.AccountingSettings?.enableLead,
        },
        {
          label: t`Pricing Rule`,
          name: 'pricing-rule',
          route: '/list/PricingRule',
          schemaName: 'PricingRule',
          hidden: () => !fyo.singles.AccountingSettings?.enablePricingRule,
        },
        {
          label: t`Coupon Code`,
          name: 'coupon-code',
          route: `/list/CouponCode`,
          schemaName: 'CouponCode',
          hidden: () => !fyo.singles.AccountingSettings?.enableCouponCode,
        },
      ] as SidebarItem[],
    },
    {
      label: isUsCaCompany(fyo) ? t`Payables` : t`Purchases`,
      name: 'purchases',
      icon: 'purchase',
      route: '/list/PurchaseInvoice',
      items: [
        {
          label: isUsCaCompany(fyo) ? t`Bills` : t`Purchase Invoices`,
          name: 'purchase-invoices',
          route: '/list/PurchaseInvoice',
          schemaName: 'PurchaseInvoice',
        },
        {
          label: isUsCaCompany(fyo) ? t`Payments` : t`Purchase Payments`,
          name: 'payments',
          route: `/list/Payment/${
            isUsCaCompany(fyo) ? t`Payments (Payables)` : t`Purchase Payments`
          }`,
          schemaName: 'Payment',
          filters: routeFilters.PurchasePayments,
        },
        {
          label: t`Suppliers`,
          name: 'suppliers',
          route: `/list/Party/${t`Suppliers`}`,
          schemaName: 'Party',
          filters: routeFilters.Suppliers,
        },
        {
          label: isUsCaCompany(fyo) ? t`Items` : t`Purchase Items`,
          name: 'purchase-items',
          route: `/list/Item/${
            isUsCaCompany(fyo) ? t`Items (Payables)` : t`Purchase Items`
          }`,
          schemaName: 'Item',
          filters: routeFilters.PurchaseItems,
        },
      ] as SidebarItem[],
    },
    {
      label: t`Common`,
      name: 'common-entries',
      icon: 'common-entries',
      route: '/list/JournalEntry',
      items: [
        {
          label: t`Journal Entry`,
          name: 'journal-entry',
          route: '/list/JournalEntry',
          schemaName: 'JournalEntry',
        },
        {
          label: t`Customers & Suppliers`,
          name: 'party',
          route: '/list/Party',
          schemaName: 'Party',
          filters: { role: ['in', ['Customer', 'Supplier', 'Both']] },
        },
        {
          label: t`Items`,
          name: 'common-items',
          route: `/list/Item/${t`Items`}`,
          schemaName: 'Item',
          filters: { for: 'Both' },
        },
        {
          label: t`Price List`,
          name: 'price-list',
          route: '/list/PriceList',
          schemaName: 'PriceList',
          hidden: () => !fyo.singles.AccountingSettings?.enablePriceList,
        },
      ] as SidebarItem[],
    },
    await getReportSidebarWithMemorized(),
    await getSourceBooksSidebar(),
    getInventorySidebar(),
    getPOSSidebar(),
    getRegionalSidebar(),
    {
      label: t`Setup`,
      name: 'setup',
      icon: 'settings',
      route: CHART_OF_ACCOUNTS_PATH,
      items: [
        {
          label: t`Chart of Accounts`,
          name: 'chart-of-accounts',
          route: CHART_OF_ACCOUNTS_PATH,
        },
        {
          label: t`Tax Templates`,
          name: 'taxes',
          route: '/list/Tax',
          schemaName: 'Tax',
        },
        {
          label: t`Recurring Transactions`,
          name: 'memorized-transactions',
          route: '/list/MemorizedTransaction',
          schemaName: 'MemorizedTransaction',
        },
        {
          label: t`Import Wizard`,
          name: 'import-wizard',
          route: '/import-wizard',
        },
        {
          label: t`Print Templates`,
          name: 'print-template',
          route: '/list/PrintTemplate',
          schemaName: 'PrintTemplate',
        },
        {
          label: t`Customize Form`,
          name: 'customize-form',
          route: `/list/CustomForm/${t`Customize Form`}`,
          hidden: () =>
            !fyo.singles.AccountingSettings?.enableFormCustomization,
        },
        {
          label: t`Settings`,
          name: 'settings',
          route: '/settings',
        },
      ] as SidebarItem[],
    },
  ].flat();
}
