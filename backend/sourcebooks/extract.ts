/**
 * Normalize one QBD Ret record (parsed qbXML, snake_case keys, produced by
 * livebooks-cloud) into flat index fields plus link edges.
 *
 * The qbxml XML→JSON conversion has a single-vs-array quirk: one line item /
 * linked txn is an object, many are an array. `asArray` normalizes every
 * such access. Values are usually strings; amounts are parsed leniently.
 */

import { asArray } from 'utils/sourcebooks/values';

export { asArray };

export type RetRecord = Record<string, unknown>;

export interface ExtractedRecord {
  qbId?: string;
  idKind: 'list' | 'txn' | 'other';
  name?: string;
  refNumber?: string;
  txnDate?: string;
  amount?: number;
  memo?: string;
  parentId?: string;
  entityName?: string;
  links: ExtractedLink[];
}

export interface ExtractedLink {
  kind: 'linked_txn' | 'applied_to_txn' | 'ref' | 'parent';
  qbId: string;
  refField?: string;
  toTxnType?: string;
}

function isRecord(value: unknown): value is RetRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strField(rec: RetRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }
  return undefined;
}

function numField(rec: RetRecord, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value.replace(/,/g, ''));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function refName(rec: RetRecord, key: string): string | undefined {
  const ref = rec[key];
  if (!isRecord(ref)) {
    return undefined;
  }
  return strField(ref, 'full_name', 'name');
}

/** Amount candidates across Ret types (invoice subtotal, bill amount_due, …). */
const AMOUNT_KEYS = [
  'total_amount',
  'amount',
  'subtotal',
  'amount_due',
  'open_amount',
  'deposit_total',
  'total_credit',
  'credit_remaining',
  'balance_remaining',
  'balance',
  'total',
];

/** Refs that carry the "who" of a transaction, in priority order. */
const ENTITY_REF_KEYS = [
  'customer_ref',
  'vendor_ref',
  'entity_ref',
  'payee_entity_ref',
  'employee_ref',
  'other_name_ref',
  'account_ref',
  'deposit_to_account_ref',
  'bank_account_ref',
];

function extractLinks(rec: RetRecord): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  const push = (link: ExtractedLink) => {
    const key = `${link.kind}:${link.qbId}:${link.refField ?? ''}`;
    if (!link.qbId || seen.has(key)) {
      return;
    }
    seen.add(key);
    links.push(link);
  };

  const pushTxnLinks = (
    value: unknown,
    kind: 'linked_txn' | 'applied_to_txn'
  ) => {
    for (const linked of asArray(value)) {
      if (!isRecord(linked)) {
        continue;
      }
      const txnId = strField(linked, 'txn_id');
      if (txnId) {
        push({ kind, qbId: txnId, toTxnType: strField(linked, 'txn_type') });
      }
    }
  };

  for (const [key, value] of Object.entries(rec)) {
    if (key === 'linked_txn') {
      pushTxnLinks(value, 'linked_txn');
      continue;
    }
    if (key === 'applied_to_txn_ret') {
      pushTxnLinks(value, 'applied_to_txn');
      continue;
    }
    if (key === 'parent_ref' && isRecord(value)) {
      const parentId = strField(value, 'list_id');
      if (parentId) {
        push({ kind: 'parent', qbId: parentId, refField: key });
      }
      continue;
    }
    if (key.endsWith('_ref') && isRecord(value)) {
      const listId = strField(value, 'list_id');
      if (listId) {
        push({ kind: 'ref', qbId: listId, refField: key });
      }
      continue;
    }

    // Line groups: deposit lines carry payment_txn_id (deposit -> payment),
    // and lines may nest linked_txn / item refs.
    if (key.endsWith('_line_ret') || key.endsWith('_line_group_ret')) {
      for (const line of asArray(value)) {
        if (!isRecord(line)) {
          continue;
        }
        const paymentTxnId = strField(line, 'payment_txn_id');
        if (paymentTxnId) {
          push({
            kind: 'linked_txn',
            qbId: paymentTxnId,
            toTxnType: strField(line, 'payment_txn_type'),
          });
        }
        pushTxnLinks(line['linked_txn'], 'linked_txn');
      }
    }
  }

  return links;
}

export function extractRecord(raw: unknown): ExtractedRecord | null {
  if (!isRecord(raw)) {
    return null;
  }
  const rec = raw;

  const listId = strField(rec, 'list_id');
  const txnId = strField(rec, 'txn_id');
  const qbId = listId ?? txnId;
  const idKind: ExtractedRecord['idKind'] = listId
    ? 'list'
    : txnId
    ? 'txn'
    : 'other';

  let entityName: string | undefined;
  for (const key of ENTITY_REF_KEYS) {
    entityName = refName(rec, key);
    if (entityName) {
      break;
    }
  }

  const parentRef = rec['parent_ref'];
  const parentId = isRecord(parentRef)
    ? strField(parentRef, 'list_id')
    : undefined;

  return {
    qbId,
    idKind,
    name: strField(rec, 'full_name', 'name', 'company_name'),
    refNumber: strField(rec, 'ref_number'),
    txnDate: strField(rec, 'txn_date'),
    amount: numField(rec, ...AMOUNT_KEYS),
    memo: strField(rec, 'memo'),
    parentId,
    entityName,
    links: extractLinks(rec),
  };
}
