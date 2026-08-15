import { t } from 'fyo';

/**
 * Field/line layouts for the polished read-only document viewers:
 * Customer, Vendor, Item (all item types), Account, Invoice, Bill,
 * ReceivePayment, Deposit, CreditMemo, SalesReceipt, JournalEntry.
 * Every other entity type falls back to the generic key-value viewer.
 *
 * Paths are dotted lookups into the Ret JSON (snake_case, as produced by
 * Cloud's qbXML parse); `*_ref` values display via full_name.
 */

export interface ViewerField {
  label: string;
  path: string;
  kind?: 'money' | 'text';
}

export interface ViewerLineColumn {
  label: string;
  path: string;
  kind?: 'money' | 'text';
  align?: 'right';
}

export interface ViewerLineSection {
  title: string;
  key: string;
  columns: ViewerLineColumn[];
}

export interface ViewerConfig {
  /** Fields shown in the header grid. */
  fields: ViewerField[];
  /** Address blocks (bill/ship/vendor address objects). */
  addresses?: { label: string; path: string }[];
  /** Line item table sections. */
  lines?: ViewerLineSection[];
  /** Bottom totals row. */
  totals?: ViewerField[];
}

function invoiceLikeLines(key: string): ViewerLineSection[] {
  return [
    {
      title: t`Line Items`,
      key,
      columns: [
        { label: t`Item`, path: 'item_ref' },
        { label: t`Description`, path: 'desc' },
        { label: t`Qty`, path: 'quantity', align: 'right' },
        { label: t`Rate`, path: 'rate', kind: 'money', align: 'right' },
        { label: t`Amount`, path: 'amount', kind: 'money', align: 'right' },
      ],
    },
  ];
}

const itemConfig: ViewerConfig = {
  fields: [
    { label: t`Name`, path: 'full_name' },
    { label: t`Description`, path: 'sales_desc' },
    { label: t`Description`, path: 'sales_or_purchase.desc' },
    { label: t`Price`, path: 'sales_price', kind: 'money' },
    { label: t`Price`, path: 'sales_or_purchase.price', kind: 'money' },
    { label: t`Cost`, path: 'purchase_cost', kind: 'money' },
    { label: t`Income Account`, path: 'income_account_ref' },
    { label: t`Income Account`, path: 'sales_or_purchase.account_ref' },
    { label: t`COGS Account`, path: 'cogs_account_ref' },
    { label: t`Asset Account`, path: 'asset_account_ref' },
    { label: t`Qty On Hand`, path: 'quantity_on_hand' },
    { label: t`Sales Tax Code`, path: 'sales_tax_code_ref' },
    { label: t`Unit of Measure`, path: 'unit_of_measure_set_ref' },
    { label: t`Active`, path: 'is_active' },
  ],
};

export const viewerConfigs: Record<string, ViewerConfig> = {
  customer: {
    fields: [
      { label: t`Name`, path: 'full_name' },
      { label: t`Company`, path: 'company_name' },
      { label: t`Contact`, path: 'contact' },
      { label: t`Phone`, path: 'phone' },
      { label: t`Alt. Phone`, path: 'alt_phone' },
      { label: t`Email`, path: 'email' },
      { label: t`Fax`, path: 'fax' },
      { label: t`Customer Type`, path: 'customer_type_ref' },
      { label: t`Terms`, path: 'terms_ref' },
      { label: t`Sales Rep`, path: 'sales_rep_ref' },
      { label: t`Job Status`, path: 'job_status' },
      { label: t`Balance`, path: 'balance', kind: 'money' },
      { label: t`Total Balance`, path: 'total_balance', kind: 'money' },
      { label: t`Active`, path: 'is_active' },
    ],
    addresses: [
      { label: t`Bill To`, path: 'bill_address' },
      { label: t`Ship To`, path: 'ship_address' },
    ],
  },
  vendor: {
    fields: [
      { label: t`Name`, path: 'name' },
      { label: t`Company`, path: 'company_name' },
      { label: t`Contact`, path: 'contact' },
      { label: t`Phone`, path: 'phone' },
      { label: t`Email`, path: 'email' },
      { label: t`Fax`, path: 'fax' },
      { label: t`Account Number`, path: 'account_number' },
      { label: t`Vendor Type`, path: 'vendor_type_ref' },
      { label: t`Terms`, path: 'terms_ref' },
      { label: t`1099 Eligible`, path: 'is_vendor_eligible_for1099' },
      { label: t`Balance`, path: 'balance', kind: 'money' },
      { label: t`Active`, path: 'is_active' },
    ],
    addresses: [{ label: t`Address`, path: 'vendor_address' }],
  },
  item_service: itemConfig,
  item_inventory: itemConfig,
  item_non_inventory: itemConfig,
  item_other_charge: itemConfig,
  account: {
    fields: [
      { label: t`Name`, path: 'full_name' },
      { label: t`Account Type`, path: 'account_type' },
      { label: t`Account Number`, path: 'account_number' },
      { label: t`Description`, path: 'desc' },
      { label: t`Bank Number`, path: 'bank_number' },
      { label: t`Special Type`, path: 'special_account_type' },
      { label: t`Balance`, path: 'balance', kind: 'money' },
      { label: t`Total Balance`, path: 'total_balance', kind: 'money' },
      { label: t`Active`, path: 'is_active' },
    ],
  },
  invoice: {
    fields: [
      { label: t`Customer`, path: 'customer_ref' },
      { label: t`Date`, path: 'txn_date' },
      { label: t`Invoice #`, path: 'ref_number' },
      { label: t`PO Number`, path: 'po_number' },
      { label: t`Terms`, path: 'terms_ref' },
      { label: t`Due Date`, path: 'due_date' },
      { label: t`Ship Date`, path: 'ship_date' },
      { label: t`Memo`, path: 'memo' },
      { label: t`Paid`, path: 'is_paid' },
    ],
    addresses: [
      { label: t`Bill To`, path: 'bill_address' },
      { label: t`Ship To`, path: 'ship_address' },
    ],
    lines: invoiceLikeLines('invoice_line_ret'),
    totals: [
      { label: t`Subtotal`, path: 'subtotal', kind: 'money' },
      { label: t`Sales Tax`, path: 'sales_tax_total', kind: 'money' },
      { label: t`Applied`, path: 'applied_amount', kind: 'money' },
      { label: t`Balance Remaining`, path: 'balance_remaining', kind: 'money' },
    ],
  },
  bill: {
    fields: [
      { label: t`Vendor`, path: 'vendor_ref' },
      { label: t`Date`, path: 'txn_date' },
      { label: t`Ref #`, path: 'ref_number' },
      { label: t`Terms`, path: 'terms_ref' },
      { label: t`Due Date`, path: 'due_date' },
      { label: t`Memo`, path: 'memo' },
      { label: t`Paid`, path: 'is_paid' },
    ],
    lines: [
      {
        title: t`Expenses`,
        key: 'expense_line_ret',
        columns: [
          { label: t`Account`, path: 'account_ref' },
          { label: t`Memo`, path: 'memo' },
          { label: t`Customer:Job`, path: 'customer_ref' },
          { label: t`Amount`, path: 'amount', kind: 'money', align: 'right' },
        ],
      },
      {
        title: t`Items`,
        key: 'item_line_ret',
        columns: [
          { label: t`Item`, path: 'item_ref' },
          { label: t`Description`, path: 'desc' },
          { label: t`Qty`, path: 'quantity', align: 'right' },
          { label: t`Cost`, path: 'cost', kind: 'money', align: 'right' },
          { label: t`Amount`, path: 'amount', kind: 'money', align: 'right' },
        ],
      },
    ],
    totals: [{ label: t`Amount Due`, path: 'amount_due', kind: 'money' }],
  },
  receive_payment: {
    fields: [
      { label: t`Customer`, path: 'customer_ref' },
      { label: t`Date`, path: 'txn_date' },
      { label: t`Ref #`, path: 'ref_number' },
      { label: t`Payment Method`, path: 'payment_method_ref' },
      { label: t`Deposit To`, path: 'deposit_to_account_ref' },
      { label: t`Memo`, path: 'memo' },
    ],
    lines: [
      {
        title: t`Applied To`,
        key: 'applied_to_txn_ret',
        columns: [
          { label: t`Txn Type`, path: 'txn_type' },
          { label: t`Date`, path: 'txn_date' },
          { label: t`Ref #`, path: 'ref_number' },
          {
            label: t`Balance`,
            path: 'balance_remaining',
            kind: 'money',
            align: 'right',
          },
          { label: t`Amount`, path: 'amount', kind: 'money', align: 'right' },
        ],
      },
    ],
    totals: [
      { label: t`Total`, path: 'total_amount', kind: 'money' },
      { label: t`Unused`, path: 'unused_payment', kind: 'money' },
    ],
  },
  deposit: {
    fields: [
      { label: t`Deposit To`, path: 'deposit_to_account_ref' },
      { label: t`Date`, path: 'txn_date' },
      { label: t`Memo`, path: 'memo' },
    ],
    lines: [
      {
        title: t`Deposit Lines`,
        key: 'deposit_line_ret',
        columns: [
          { label: t`Received From`, path: 'entity_ref' },
          { label: t`From Account`, path: 'account_ref' },
          { label: t`Check #`, path: 'check_number' },
          { label: t`Method`, path: 'payment_method_ref' },
          { label: t`Memo`, path: 'memo' },
          { label: t`Amount`, path: 'amount', kind: 'money', align: 'right' },
        ],
      },
    ],
    totals: [{ label: t`Deposit Total`, path: 'deposit_total', kind: 'money' }],
  },
  credit_memo: {
    fields: [
      { label: t`Customer`, path: 'customer_ref' },
      { label: t`Date`, path: 'txn_date' },
      { label: t`Credit Memo #`, path: 'ref_number' },
      { label: t`PO Number`, path: 'po_number' },
      { label: t`Memo`, path: 'memo' },
    ],
    addresses: [
      { label: t`Bill To`, path: 'bill_address' },
      { label: t`Ship To`, path: 'ship_address' },
    ],
    lines: invoiceLikeLines('credit_memo_line_ret'),
    totals: [
      { label: t`Subtotal`, path: 'subtotal', kind: 'money' },
      { label: t`Sales Tax`, path: 'sales_tax_total', kind: 'money' },
      { label: t`Total`, path: 'total_amount', kind: 'money' },
      { label: t`Credit Remaining`, path: 'credit_remaining', kind: 'money' },
    ],
  },
  sales_receipt: {
    fields: [
      { label: t`Customer`, path: 'customer_ref' },
      { label: t`Date`, path: 'txn_date' },
      { label: t`Sale #`, path: 'ref_number' },
      { label: t`Payment Method`, path: 'payment_method_ref' },
      { label: t`Deposit To`, path: 'deposit_to_account_ref' },
      { label: t`Memo`, path: 'memo' },
    ],
    addresses: [{ label: t`Bill To`, path: 'bill_address' }],
    lines: invoiceLikeLines('sales_receipt_line_ret'),
    totals: [
      { label: t`Subtotal`, path: 'subtotal', kind: 'money' },
      { label: t`Sales Tax`, path: 'sales_tax_total', kind: 'money' },
      { label: t`Total`, path: 'total_amount', kind: 'money' },
    ],
  },
  journal_entry: {
    fields: [
      { label: t`Date`, path: 'txn_date' },
      { label: t`Entry #`, path: 'ref_number' },
      { label: t`Adjustment`, path: 'is_adjustment' },
      { label: t`Memo`, path: 'memo' },
    ],
    lines: [
      {
        title: t`Debits`,
        key: 'journal_debit_line',
        columns: [
          { label: t`Account`, path: 'account_ref' },
          { label: t`Name`, path: 'entity_ref' },
          { label: t`Memo`, path: 'memo' },
          { label: t`Debit`, path: 'amount', kind: 'money', align: 'right' },
        ],
      },
      {
        title: t`Credits`,
        key: 'journal_credit_line',
        columns: [
          { label: t`Account`, path: 'account_ref' },
          { label: t`Name`, path: 'entity_ref' },
          { label: t`Memo`, path: 'memo' },
          { label: t`Credit`, path: 'amount', kind: 'money', align: 'right' },
        ],
      },
    ],
  },
};

export function getViewerConfig(entityType: string): ViewerConfig | null {
  return viewerConfigs[entityType] ?? null;
}
