import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import type { ProgressCallback } from './indexer';
import { sourceBookStore } from './store';

/**
 * Compact Flo's Clothes QBD extract used as default demo seed.
 * Indexed into the `{company}.sourcebooks/` sidecar — never the live ledger.
 * Looks like an older QuickBooks Desktop company they migrated from.
 */

export const DEMO_QBD_COMPANY_NAME = "Flo's Clothes (QuickBooks)";
export const DEMO_QBD_EXPORTED_AT = '2024-12-31T18:00:00Z';

const xa = {};

function listRef(listId: string, fullName: string) {
  return { xml_attributes: xa, list_id: listId, full_name: fullName };
}

function amountReport(opts: {
  title: string;
  subtitle: string;
  rows: { name: string; debit?: string; credit?: string }[];
}) {
  const dataRows = opts.rows.map((row) => {
    const cols: Record<string, unknown>[] = [
      { xml_attributes: { colID: '1', value: row.name } },
    ];
    if (row.debit) {
      cols.push({ xml_attributes: { colID: '2', value: row.debit } });
    }
    if (row.credit) {
      cols.push({ xml_attributes: { colID: '3', value: row.credit } });
    }
    return {
      xml_attributes: xa,
      row_data: { xml_attributes: { rowType: 'account', value: row.name } },
      col_data: cols,
    };
  });
  return {
    xml_attributes: xa,
    report_title: opts.title,
    report_subtitle: opts.subtitle,
    report_basis: 'Accrual',
    col_desc: [
      {
        xml_attributes: { colID: '1', dataType: 'STRTYPE' },
        col_title: { xml_attributes: { titleRow: '1' } },
      },
      {
        xml_attributes: { colID: '2', dataType: 'AMTTYPE' },
        col_title: { xml_attributes: { titleRow: '1', value: 'Debit' } },
      },
      {
        xml_attributes: { colID: '3', dataType: 'AMTTYPE' },
        col_title: { xml_attributes: { titleRow: '1', value: 'Credit' } },
      },
    ],
    report_data: {
      xml_attributes: xa,
      data_row: dataRows,
      total_row: {
        xml_attributes: xa,
        col_data: [
          { xml_attributes: { colID: '1', value: 'TOTAL' } },
          { xml_attributes: { colID: '2', value: '12500.00' } },
          { xml_attributes: { colID: '3', value: '12500.00' } },
        ],
      },
    },
  };
}

const customers = [
  {
    xml_attributes: xa,
    list_id: 'CUST-ROY',
    name: 'Roy Rolston',
    full_name: 'Roy Rolston',
    company_name: 'Roy Rolston',
    phone: '+1 512-555-2099',
    email: 'roy-rolston@partiesunited.co',
  },
  {
    xml_attributes: xa,
    list_id: 'CUST-ALO',
    name: 'Aloysius Albuquerque',
    full_name: 'Aloysius Albuquerque',
    phone: '+1 512-555-3053',
    email: 'aloysius.albuquerque-418@gmail.com',
  },
  {
    xml_attributes: xa,
    list_id: 'CUST-AUSTIN',
    name: 'Austin Boutique',
    full_name: 'Austin Boutique',
    company_name: 'Austin Boutique LLC',
    phone: '+1 512-555-4401',
    email: 'ap@austinboutique.example',
  },
  {
    xml_attributes: xa,
    list_id: 'CUST-AUSTIN-JOB',
    name: 'Wholesale',
    full_name: 'Austin Boutique:Wholesale',
    parent_ref: listRef('CUST-AUSTIN', 'Austin Boutique'),
    sublevel: '1',
  },
  {
    xml_attributes: xa,
    list_id: 'CUST-HILL',
    name: 'Hill Country Bridal',
    full_name: 'Hill Country Bridal',
    company_name: 'Hill Country Bridal',
    phone: '+1 512-555-8810',
    email: 'orders@hillcountrybridal.example',
  },
];

const vendors = [
  {
    xml_attributes: xa,
    list_id: 'VEND-JANKY',
    name: 'Janky Office Spaces',
    full_name: 'Janky Office Spaces',
    company_name: 'Janky Office Spaces',
    phone: '+1 512-555-2768',
  },
  {
    xml_attributes: xa,
    list_id: 'VEND-OVER',
    name: 'The Overclothes Company',
    full_name: 'The Overclothes Company',
    phone: '+1 512-555-3246',
  },
  {
    xml_attributes: xa,
    list_id: 'VEND-THREAD',
    name: 'Lone Star Thread',
    full_name: 'Lone Star Thread',
    company_name: 'Lone Star Thread Co.',
    phone: '+1 512-555-6702',
    email: 'billing@lonestarthread.example',
  },
];

const accounts = [
  {
    xml_attributes: xa,
    list_id: 'ACC-CHK',
    name: 'Checking',
    full_name: 'Checking',
    account_type: 'Bank',
  },
  {
    xml_attributes: xa,
    list_id: 'ACC-AR',
    name: 'Accounts Receivable',
    full_name: 'Accounts Receivable',
    account_type: 'AccountsReceivable',
  },
  {
    xml_attributes: xa,
    list_id: 'ACC-SALES',
    name: 'Sales',
    full_name: 'Sales',
    account_type: 'Income',
  },
  {
    xml_attributes: xa,
    list_id: 'ACC-RENT',
    name: 'Office Rent',
    full_name: 'Office Rent',
    account_type: 'Expense',
  },
  {
    xml_attributes: xa,
    list_id: 'ACC-INV',
    name: 'Inventory Asset',
    full_name: 'Inventory Asset',
    account_type: 'OtherCurrentAsset',
  },
  {
    xml_attributes: xa,
    list_id: 'ACC-AP',
    name: 'Accounts Payable',
    full_name: 'Accounts Payable',
    account_type: 'AccountsPayable',
  },
];

const inventoryItems = [
  {
    xml_attributes: xa,
    list_id: 'ITEM-JEANS',
    name: '611 Jeans - PCH',
    full_name: '611 Jeans - PCH',
    sales_and_purchase: { xml_attributes: xa, sales_price: '54.20' },
  },
  {
    xml_attributes: xa,
    list_id: 'ITEM-CLOTH',
    name: 'Cool Cloth',
    full_name: 'Cool Cloth',
    sales_and_purchase: { xml_attributes: xa, sales_price: '48.19' },
  },
];

const serviceItems = [
  {
    xml_attributes: xa,
    list_id: 'ITEM-DRY',
    name: 'Dry-Cleaning',
    full_name: 'Dry-Cleaning',
    sales_or_purchase: { xml_attributes: xa, price: '0.83' },
  },
];

const invoices = [
  {
    xml_attributes: xa,
    txn_id: 'TXN-INV-1001',
    ref_number: '1001',
    txn_date: '2024-03-15',
    subtotal: '542.00',
    memo: 'Spring wholesale — peach 611s',
    customer_ref: listRef('CUST-AUSTIN', 'Austin Boutique'),
    invoice_line_ret: {
      xml_attributes: xa,
      txn_line_id: 'L-1001-1',
      item_ref: listRef('ITEM-JEANS', '611 Jeans - PCH'),
      quantity: '10',
      rate: '54.20',
      amount: '542.00',
    },
    linked_txn: {
      xml_attributes: xa,
      txn_id: 'TXN-PAY-1001',
      txn_type: 'ReceivePayment',
    },
  },
  {
    xml_attributes: xa,
    txn_id: 'TXN-INV-1002',
    ref_number: '1002',
    txn_date: '2024-06-02',
    subtotal: '250.00',
    memo: 'March services',
    customer_ref: listRef('CUST-ROY', 'Roy Rolston'),
    invoice_line_ret: {
      xml_attributes: xa,
      txn_line_id: 'L-1002-1',
      item_ref: listRef('ITEM-DRY', 'Dry-Cleaning'),
      quantity: '1',
      rate: '250.00',
      amount: '250.00',
    },
  },
  {
    xml_attributes: xa,
    txn_id: 'TXN-INV-1003',
    ref_number: '1003',
    txn_date: '2024-09-18',
    subtotal: '964.80',
    memo: 'Fall order — cloth + jeans',
    customer_ref: listRef('CUST-HILL', 'Hill Country Bridal'),
    invoice_line_ret: [
      {
        xml_attributes: xa,
        txn_line_id: 'L-1003-1',
        item_ref: listRef('ITEM-CLOTH', 'Cool Cloth'),
        quantity: '8',
        rate: '48.19',
        amount: '385.52',
      },
      {
        xml_attributes: xa,
        txn_line_id: 'L-1003-2',
        item_ref: listRef('ITEM-JEANS', '611 Jeans - PCH'),
        quantity: '10',
        rate: '54.20',
        amount: '542.00',
      },
    ],
  },
];

const receivePayments = [
  {
    xml_attributes: xa,
    txn_id: 'TXN-PAY-1001',
    ref_number: 'DEP-4412',
    txn_date: '2024-03-22',
    total_amount: '542.00',
    customer_ref: listRef('CUST-AUSTIN', 'Austin Boutique'),
    applied_to_txn_ret: [
      { xml_attributes: xa, txn_id: 'TXN-INV-1001', txn_type: 'Invoice' },
    ],
  },
  {
    xml_attributes: xa,
    txn_id: 'TXN-PAY-1002',
    ref_number: 'CHK-8891',
    txn_date: '2024-06-20',
    total_amount: '250.00',
    customer_ref: listRef('CUST-ROY', 'Roy Rolston'),
    applied_to_txn_ret: {
      xml_attributes: xa,
      txn_id: 'TXN-INV-1002',
      txn_type: 'Invoice',
    },
  },
];

const deposits = [
  {
    xml_attributes: xa,
    txn_id: 'TXN-DEP-1',
    txn_date: '2024-03-23',
    deposit_total: '542.00',
    deposit_to_account_ref: listRef('ACC-CHK', 'Checking'),
    deposit_line_ret: {
      xml_attributes: xa,
      payment_txn_id: 'TXN-PAY-1001',
      payment_txn_type: 'ReceivePayment',
      amount: '542.00',
    },
  },
];

const bills = [
  {
    xml_attributes: xa,
    txn_id: 'TXN-BILL-RENT',
    ref_number: 'RENT-SEP',
    txn_date: '2024-09-01',
    amount_due: '1800.00',
    memo: 'September rent',
    vendor_ref: listRef('VEND-JANKY', 'Janky Office Spaces'),
    expense_line_ret: {
      xml_attributes: xa,
      account_ref: listRef('ACC-RENT', 'Office Rent'),
      amount: '1800.00',
    },
  },
  {
    xml_attributes: xa,
    txn_id: 'TXN-BILL-THREAD',
    ref_number: 'LST-441',
    txn_date: '2024-08-12',
    amount_due: '320.00',
    memo: 'Thread and findings',
    vendor_ref: listRef('VEND-THREAD', 'Lone Star Thread'),
  },
];

const billPayments = [
  {
    xml_attributes: xa,
    txn_id: 'TXN-BILLPAY-1',
    ref_number: '1842',
    txn_date: '2024-09-05',
    amount: '1800.00',
    payee_entity_ref: listRef('VEND-JANKY', 'Janky Office Spaces'),
    bank_account_ref: listRef('ACC-CHK', 'Checking'),
    applied_to_txn_ret: {
      xml_attributes: xa,
      txn_id: 'TXN-BILL-RENT',
      txn_type: 'Bill',
    },
  },
];

const estimates = [
  {
    xml_attributes: xa,
    txn_id: 'TXN-EST-77',
    ref_number: 'EST-77',
    txn_date: '2024-10-04',
    subtotal: '1084.00',
    memo: 'Holiday wholesale quote',
    customer_ref: listRef('CUST-AUSTIN', 'Austin Boutique'),
    estimate_line_ret: {
      xml_attributes: xa,
      item_ref: listRef('ITEM-JEANS', '611 Jeans - PCH'),
      quantity: '20',
      rate: '54.20',
      amount: '1084.00',
    },
  },
];

const journalEntries = [
  {
    xml_attributes: xa,
    txn_id: 'TXN-JE-OPEN',
    ref_number: 'OPEN-1',
    txn_date: '2024-01-01',
    memo: 'Opening balance — Checking',
    journal_debit_line: {
      xml_attributes: xa,
      account_ref: listRef('ACC-CHK', 'Checking'),
      amount: '5000.00',
    },
    journal_credit_line: {
      xml_attributes: xa,
      account_ref: listRef('ACC-SALES', 'Sales'),
      amount: '5000.00',
    },
  },
];

const checks = [
  {
    xml_attributes: xa,
    txn_id: 'TXN-CHK-1998',
    ref_number: '1998',
    txn_date: '2024-07-14',
    amount: '67.50',
    memo: 'Office supplies',
    payee_entity_ref: listRef('VEND-OVER', 'The Overclothes Company'),
    account_ref: listRef('ACC-CHK', 'Checking'),
  },
];

const entityFiles: Record<string, unknown[]> = {
  customer: customers,
  vendor: vendors,
  account: accounts,
  item_inventory: inventoryItems,
  item_service: serviceItems,
  invoice: invoices,
  receive_payment: receivePayments,
  deposit: deposits,
  bill: bills,
  bill_payment_check: billPayments,
  estimate: estimates,
  journal_entry: journalEntries,
  check: checks,
};

const entityCounts = Object.fromEntries(
  Object.entries(entityFiles).map(([type, rows]) => [
    type,
    { count: rows.length, partial: false },
  ])
);

const totalRecords = Object.values(entityFiles).reduce(
  (n, rows) => n + rows.length,
  0
);

const manifest = {
  company_name: DEMO_QBD_COMPANY_NAME,
  exported_at: DEMO_QBD_EXPORTED_AT,
  total_records: totalRecords,
  entities: entityCounts,
  reconciliation: { transactions: { expected: 8, extracted: 8 } },
  not_extractable: ['Payroll detail is not exposed by the QBD SDK'],
};

const trialBalance = amountReport({
  title: 'Trial Balance',
  subtitle: 'As of December 31, 2024',
  rows: [
    { name: 'Checking', debit: '8420.00' },
    { name: 'Accounts Receivable', debit: '964.80' },
    { name: 'Inventory Asset', debit: '3115.20' },
    { name: 'Accounts Payable', credit: '320.00' },
    { name: 'Sales', credit: '12186.00' },
    { name: 'Office Rent', debit: '21600.00' },
  ],
});

const profitAndLoss = amountReport({
  title: 'Profit & Loss',
  subtitle: 'January through December 2024',
  rows: [
    { name: 'Sales', credit: '12186.00' },
    { name: 'Office Rent', debit: '21600.00' },
    { name: 'Cost of Goods Sold', debit: '4102.00' },
  ],
});

/** Write a Cloud-layout QBD archive ZIP (manifest + entities/ + snapshots). */
export function writeDemoQbdArchiveZip(zipPath: string): void {
  const zip = new AdmZip();
  const add = (name: string, value: unknown) =>
    zip.addFile(name, Buffer.from(JSON.stringify(value), 'utf8'));

  add('manifest.json', manifest);
  for (const [entityType, rows] of Object.entries(entityFiles)) {
    add(`entities/${entityType}.json`, rows);
  }
  add('report_snapshots/trial_balance.json', trialBalance);
  add('report_snapshots/profit_and_loss.json', profitAndLoss);
  add('reconciliation/transactions.json', {
    transaction_query: { expected: 8, extracted: 8 },
  });
  zip.writeZip(zipPath);
}

/**
 * Attach the demo QBD archive sidecar next to an on-disk company file.
 * No-op for in-memory test databases.
 */
export async function attachDemoQbdArchive(
  booksDbPath: string,
  onProgress?: ProgressCallback
) {
  if (!booksDbPath || booksDbPath === ':memory:') {
    return { attached: false as const };
  }
  const paths = sourceBookStore.paths(booksDbPath);
  await fs.ensureDir(paths.sidecar);
  const stagingZip = `${paths.zip}.staging`;
  writeDemoQbdArchiveZip(stagingZip);
  return await sourceBookStore.attachZip({
    booksDbPath,
    zipSource: stagingZip,
    meta: {
      origin: 'local',
      companyName: DEMO_QBD_COMPANY_NAME,
      exportedAt: DEMO_QBD_EXPORTED_AT,
    },
    onProgress,
  });
}
