/**
 * QBD entity types as exported by livebooks-cloud
 * (`app/models/qbd_export_file.rb` ENTITY_TYPES). ZIP entries are named
 * `{entity_type}.json` (singular); merged ActiveStorage blobs are plural.
 * Keep in sync with Cloud, but tolerate unknown types at index time.
 */
export const QBD_ENTITY_TYPES = [
  'account',
  'customer',
  'vendor',
  'invoice',
  'bill',
  'journal_entry',
  'receive_payment',
  'sales_receipt',
  'credit_memo',
  'bill_payment_check',
  'bill_payment_credit_card',
  'item_service',
  'item_inventory',
  'item_non_inventory',
  'item_other_charge',
  'item_subtotal',
  'item_group',
  'item_discount',
  'item_payment',
  'item_sales_tax',
  'item_sales_tax_group',
  'purchase_order',
  'estimate',
  'deposit',
  'employee',
  'payroll_item_wage',
  'payroll_item_non_wage',
  'credit_card_charge',
  'credit_card_credit',
  'check',
  'transfer',
  'time_tracking',
  'sales_order',
  'vendor_credit',
  'item_receipt',
  'inventory_adjustment',
  'build_assembly',
  'qb_class',
  'standard_terms',
  'date_driven_terms',
  'payment_method',
  'sales_rep',
  'ship_method',
  'price_level',
  'customer_type',
  'vendor_type',
  'currency',
  'item_inventory_assembly',
  'item_fixed_asset',
  'sales_tax_code',
  'unit_of_measure_set',
  'other_name',
  'job_type',
  'customer_msg',
  'billing_rate',
  'data_ext_def',
  'lead',
  'workers_comp_code',
  'account_tax_line_info',
  'company',
  'host',
  'preferences',
  'company_activity',
  'payroll_last_period',
  'list_deleted',
  'txn_deleted',
  'inventory_site',
  'item_sites',
  'template',
  'todo',
  'vehicle',
  'category_account_mapping',
  'ar_refund_credit_card',
  'charge',
  'vehicle_mileage',
  'transfer_inventory',
  'sales_tax_payment_check',
  'sales_tax_return',
  'sales_tax_return_line',
  'sales_tax_payable',
  'payroll_transaction',
] as const;

const entityTypeSet = new Set<string>(QBD_ENTITY_TYPES);

/**
 * Map a ZIP entry basename (minus `.json`) to a known entity type.
 * Accepts singular (`invoice`) and Rails-pluralized (`invoices`) names;
 * unknown names are returned as-is so nothing in the ZIP is dropped.
 */
export function resolveEntityType(basename: string): string {
  const name = basename.toLowerCase();
  if (entityTypeSet.has(name)) {
    return name;
  }

  // Rails `pluralize` inverses for the shapes that occur in ENTITY_TYPES.
  const candidates: string[] = [];
  if (name.endsWith('ies')) {
    candidates.push(`${name.slice(0, -3)}y`); // companies -> company
  }
  if (name.endsWith('es')) {
    candidates.push(name.slice(0, -2)); // batches -> batch
  }
  if (name.endsWith('s')) {
    candidates.push(name.slice(0, -1)); // invoices -> invoice
  }
  for (const c of candidates) {
    if (entityTypeSet.has(c)) {
      return c;
    }
  }
  return name;
}

/** Entity types eligible for copy into the live book. Lists only, never txns. */
export const COPYABLE_ENTITY_TYPES = [
  'customer',
  'vendor',
  'account',
  'item_service',
  'item_inventory',
  'item_non_inventory',
  'item_other_charge',
] as const;

export function isCopyableEntityType(entityType: string): boolean {
  return (COPYABLE_ENTITY_TYPES as readonly string[]).includes(entityType);
}

/** Entity types with a polished dedicated viewer; everything else uses the generic one. */
export const VIEWER_ENTITY_TYPES = [
  'customer',
  'vendor',
  'item_service',
  'item_inventory',
  'item_non_inventory',
  'item_other_charge',
  'account',
  'invoice',
  'bill',
  'receive_payment',
  'deposit',
  'credit_memo',
  'sales_receipt',
  'journal_entry',
] as const;

/** Human label for an entity type ("receive_payment" -> "Receive Payment"). */
export function entityTypeLabel(entityType: string): string {
  const special: Record<string, string> = {
    qb_class: 'Class',
    customer_msg: 'Customer Message',
    ar_refund_credit_card: 'AR Refund Credit Card',
  };
  if (special[entityType]) {
    return special[entityType];
  }
  return entityType
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
