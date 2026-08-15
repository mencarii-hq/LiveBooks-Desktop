import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { getBooksDbPath } from 'src/utils/sourcebooks';
import type { QueryFilter } from 'utils/db/types';
import { isCopyableEntityType } from 'utils/sourcebooks/entityTypes';
import type { SourceBookRecordDetail } from 'utils/sourcebooks/types';

/**
 * Whitelist copy of archive masters into the live book:
 * Customer / Vendor -> Party, Item -> Item, Account -> Account. Only these —
 * archive transactions are never posted, and no A/R balances, inventory
 * quantities, or payroll data are copied. Copies are stamped with
 * `sourceId` (QBD ListID) + `sourceArchiveId` and are idempotent.
 */

export type CopyToLiveResult =
  | { ok: true; schemaName: string; name: string; alreadyExisted: boolean }
  | { ok: false; error: string };

function str(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return '';
}

function refFullName(data: Record<string, unknown>, key: string): string {
  const ref = data[key];
  if (typeof ref === 'object' && ref !== null && !Array.isArray(ref)) {
    return str(ref as Record<string, unknown>, 'full_name', 'name');
  }
  return '';
}

/** QBD AccountType -> LiveBooks rootType. */
const ROOT_TYPE_MAP: Record<string, string> = {
  Bank: 'Asset',
  AccountsReceivable: 'Asset',
  OtherCurrentAsset: 'Asset',
  FixedAsset: 'Asset',
  OtherAsset: 'Asset',
  AccountsPayable: 'Liability',
  CreditCard: 'Liability',
  OtherCurrentLiability: 'Liability',
  LongTermLiability: 'Liability',
  Equity: 'Equity',
  Income: 'Income',
  OtherIncome: 'Income',
  Expense: 'Expense',
  OtherExpense: 'Expense',
  CostOfGoodsSold: 'Expense',
};

/** QBD AccountType -> LiveBooks accountType, where a clean equivalent exists. */
const ACCOUNT_TYPE_MAP: Record<string, string> = {
  Bank: 'Bank',
  AccountsReceivable: 'Receivable',
  AccountsPayable: 'Payable',
  FixedAsset: 'Fixed Asset',
  CostOfGoodsSold: 'Cost of Goods Sold',
};

async function findExistingBySourceId(
  schemaName: string,
  sourceId: string
): Promise<string | null> {
  const rows = (await fyo.db.getAll(schemaName, {
    fields: ['name'],
    filters: { sourceId },
  })) as { name: string }[];
  return rows[0]?.name ?? null;
}

async function findRootAccount(rootType: string): Promise<string | null> {
  const rows = (await fyo.db.getAll('Account', {
    fields: ['name', 'parentAccount'],
    filters: { rootType, isGroup: true },
  })) as { name: string; parentAccount: string | null }[];
  const root = rows.find((r) => !r.parentAccount) ?? rows[0];
  return root?.name ?? null;
}

async function findLiveAccountByName(
  accountName: string,
  rootType?: string
): Promise<string | null> {
  if (!accountName) {
    return null;
  }
  const filters: QueryFilter = { name: accountName };
  if (rootType) {
    filters.rootType = rootType;
  }
  const rows = (await fyo.db.getAll('Account', {
    fields: ['name'],
    filters,
  })) as { name: string }[];
  return rows[0]?.name ?? null;
}

async function firstLeafAccount(rootType: string): Promise<string | null> {
  const rows = (await fyo.db.getAll('Account', {
    fields: ['name'],
    filters: { rootType, isGroup: false },
  })) as { name: string }[];
  return rows[0]?.name ?? null;
}

/** QBD hierarchical names are 'Parent:Child'; live rows use the leaf name. */
function leafName(fullName: string): string {
  const parts = fullName.split(':');
  return parts[parts.length - 1].trim() || fullName;
}

function buildPartyData(
  detail: SourceBookRecordDetail,
  role: 'Customer' | 'Supplier'
): Record<string, unknown> {
  const data = detail.data;
  const name = str(data, 'full_name', 'name', 'company_name');
  return {
    name,
    partyName: name,
    role,
    email: str(data, 'email'),
    phone: str(data, 'phone'),
  };
}

async function buildItemData(
  detail: SourceBookRecordDetail
): Promise<Record<string, unknown>> {
  const data = detail.data;
  const salesOrPurchase =
    typeof data.sales_or_purchase === 'object' && data.sales_or_purchase
      ? (data.sales_or_purchase as Record<string, unknown>)
      : {};

  const name = leafName(str(data, 'full_name', 'name'));
  const rateStr =
    str(data, 'sales_price') || str(salesOrPurchase, 'price', 'price_percent');
  const rate = Number(rateStr);

  const incomeName = leafName(
    refFullName(data, 'income_account_ref') ||
      refFullName(salesOrPurchase, 'account_ref')
  );
  const expenseName = leafName(
    refFullName(data, 'expense_account_ref') ||
      refFullName(data, 'cogs_account_ref')
  );

  const incomeAccount =
    (await findLiveAccountByName(incomeName, 'Income')) ??
    (await firstLeafAccount('Income'));
  const expenseAccount =
    (await findLiveAccountByName(expenseName, 'Expense')) ??
    (await firstLeafAccount('Expense'));

  if (!incomeAccount || !expenseAccount) {
    throw new Error(
      t`Set up at least one income and one expense account before copying items`
    );
  }

  // No inventory quantities are copied — only the item master.
  return {
    name,
    itemName: name,
    for: 'Both',
    rate: Number.isFinite(rate) ? rate : 0,
    description: str(data, 'sales_desc') || str(salesOrPurchase, 'desc'),
    incomeAccount,
    expenseAccount,
  };
}

async function buildAccountData(
  detail: SourceBookRecordDetail
): Promise<Record<string, unknown>> {
  const data = detail.data;
  const qbdType = str(data, 'account_type');
  const rootType = ROOT_TYPE_MAP[qbdType];
  if (!rootType) {
    throw new Error(
      t`Cannot map QBD account type "${qbdType}" to a LiveBooks account type`
    );
  }

  const fullName = str(data, 'full_name', 'name');
  const name = leafName(fullName);

  // Attach under the live parent when one with the same (leaf) name exists,
  // matched within the same root type; otherwise under the root group.
  const parentFullName = fullName.includes(':')
    ? leafName(fullName.slice(0, fullName.lastIndexOf(':')))
    : '';
  const parentAccount =
    (parentFullName
      ? await findLiveAccountByName(parentFullName, rootType)
      : null) ?? (await findRootAccount(rootType));
  if (!parentAccount) {
    throw new Error(t`No ${rootType} account group exists in this book yet`);
  }

  const result: Record<string, unknown> = {
    name,
    accountName: name,
    rootType,
    parentAccount,
    isGroup: false,
  };
  const accountType = ACCOUNT_TYPE_MAP[qbdType];
  if (accountType) {
    result.accountType = accountType;
  }
  return result;
}

export async function copyArchiveRecordToLive(
  detail: SourceBookRecordDetail
): Promise<CopyToLiveResult> {
  const { record, data } = detail;
  const entityType = record.entityType;
  const qbId = record.qbId;

  if (!qbId) {
    return {
      ok: false,
      error: t`This record has no QBD id and cannot be copied`,
    };
  }
  if (!isCopyableEntityType(entityType)) {
    return {
      ok: false,
      error: t`Only customers, vendors, items, and accounts can be copied`,
    };
  }
  if (entityType === 'customer' && record.parentId) {
    return {
      ok: false,
      error: t`Jobs are not copied — copy the parent customer instead`,
    };
  }

  let schemaName: string;
  let docData: Record<string, unknown>;
  try {
    if (entityType === 'customer') {
      schemaName = 'Party';
      docData = buildPartyData(detail, 'Customer');
    } else if (entityType === 'vendor') {
      schemaName = 'Party';
      docData = buildPartyData(detail, 'Supplier');
    } else if (entityType === 'account') {
      schemaName = 'Account';
      docData = await buildAccountData(detail);
    } else {
      schemaName = 'Item';
      docData = await buildItemData(detail);
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const name = docData.name as string;
  if (!name) {
    return {
      ok: false,
      error: t`This record has no name and cannot be copied`,
    };
  }

  // Idempotent: same archive record never creates a second live row.
  const existing = await findExistingBySourceId(schemaName, qbId);
  if (existing) {
    return { ok: true, schemaName, name: existing, alreadyExisted: true };
  }
  if (await fyo.db.exists(schemaName, name)) {
    return {
      ok: false,
      error: t`A ${
        schemaName === 'Party' ? t`customer or vendor` : schemaName
      } named "${name}" already exists in your books`,
    };
  }

  const status = await import('src/utils/sourcebooks').then((m) =>
    m.getSourceBookStatus()
  );
  const archiveId = status.meta?.archiveId ?? '';

  const doc = fyo.doc.getNewDoc(schemaName, {
    ...docData,
    sourceId: qbId,
    sourceArchiveId: archiveId,
  });
  await doc.sync();

  await ipc.sourcebooks.markCopied(getBooksDbPath(), {
    qbId,
    archiveId,
    targetSchema: schemaName,
    targetName: doc.name as string,
    copiedAt: new Date().toISOString(),
  });

  // `data` intentionally unused beyond mapping: balances, quantities, and
  // payroll fields in the Ret JSON are never written to the live book.
  void data;
  return {
    ok: true,
    schemaName,
    name: doc.name as string,
    alreadyExisted: false,
  };
}
