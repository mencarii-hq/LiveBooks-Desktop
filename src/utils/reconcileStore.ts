/**
 * SQLite-backed reconciliation persistence.
 *
 * Source of truth for closed/draft reconciles is the Reconciliation doc.
 * Lock / warn-and-allow keys off AccountingLedgerEntry.reconciled (not BankStatement.status).
 *
 * One-shot migration from the old localStorage MVP (lbReconcile.*) runs on first use.
 */

import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import { isCredit } from 'models/helpers';
import type { Doc } from 'fyo/model/doc';

export type ClosedReconcile = {
  name: string;
  toDate: string;
  endingBalance: number;
  beginningBalance: number;
  closedAt: string;
  ledgerEntryNames: string[];
};

export type ReconcileDraft = {
  name?: string;
  toDate?: string;
  endingBalance?: number | null;
  checked?: Record<string, boolean>;
};

const migratedKey = (instanceId: string) =>
  `lbReconcile.migrated.${instanceId || 'default'}`;
const closedKey = (account: string) => `lbReconcile.closed.${account}`;
const draftKey = (account: string) => `lbReconcile.draft.${account}`;

function asNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (v && typeof v === 'object' && 'float' in v) {
    const f = (v as { float?: unknown }).float;
    if (typeof f === 'number') {
      return f;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isoDateOnly(v: unknown): string {
  if (!v) {
    return '';
  }
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  return String(v).slice(0, 10);
}

function instanceId(): string {
  try {
    // Prefer the open company file path so each book migrates once.
    const path = String((fyo.db as { dbPath?: string }).dbPath ?? '');
    if (path) {
      return path;
    }
  } catch {
    // ignore
  }
  return 'default';
}

/** One-shot: import localStorage closed/draft into SQLite, then stop reading LS. */
export async function migrateLocalStorageReconcilesOnce(): Promise<void> {
  const key = migratedKey(instanceId());
  try {
    if (localStorage.getItem(key) === '1') {
      return;
    }
  } catch {
    return;
  }

  const accounts = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) {
        continue;
      }
      if (k.startsWith('lbReconcile.closed.')) {
        accounts.add(k.slice('lbReconcile.closed.'.length));
      } else if (k.startsWith('lbReconcile.draft.')) {
        accounts.add(k.slice('lbReconcile.draft.'.length));
      }
    }
  } catch {
    return;
  }

  for (const account of accounts) {
    try {
      await migrateAccountFromLocalStorage(account);
    } catch {
      // Best-effort per account; continue others.
    }
  }

  try {
    localStorage.setItem(key, '1');
  } catch {
    // ignore
  }
}

async function migrateAccountFromLocalStorage(account: string): Promise<void> {
  let closedList: Array<{
    toDate: string;
    endingBalance: number;
    beginningBalance: number;
    closedAt: string;
    ledgerEntryNames: string[];
  }> = [];
  try {
    const raw = localStorage.getItem(closedKey(account));
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        closedList = parsed.filter(
          (r): r is typeof closedList[number] =>
            !!r &&
            typeof r === 'object' &&
            typeof (r as { toDate?: unknown }).toDate === 'string' &&
            typeof (r as { endingBalance?: unknown }).endingBalance ===
              'number' &&
            typeof (r as { beginningBalance?: unknown }).beginningBalance ===
              'number' &&
            typeof (r as { closedAt?: unknown }).closedAt === 'string' &&
            Array.isArray(
              (r as { ledgerEntryNames?: unknown }).ledgerEntryNames
            )
        );
      }
    }
  } catch {
    closedList = [];
  }

  for (const c of closedList) {
    const existing = (await fyo.db.getAll(ModelNameEnum.Reconciliation, {
      fields: ['name'],
      filters: {
        bankAccount: account,
        statementDate: c.toDate,
        status: 'closed',
      },
      limit: 1,
    })) as { name: string }[];
    if (existing.length) {
      continue;
    }

    const lines: { ledgerEntry: string; cleared: boolean }[] = [];
    for (const aleName of c.ledgerEntryNames) {
      const ales = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
        fields: ['name'],
        filters: { name: aleName },
        limit: 1,
      })) as { name: string }[];
      if (!ales.length) {
        continue;
      }
      lines.push({ ledgerEntry: aleName, cleared: true });
      await fyo.db.update(ModelNameEnum.AccountingLedgerEntry, {
        name: aleName,
        reconciled: true,
        reconciledOn: c.closedAt,
        cleared: true,
      });
    }

    const doc = fyo.doc.getNewDoc(ModelNameEnum.Reconciliation, {
      bankAccount: account,
      statementDate: c.toDate,
      beginningBalance: c.beginningBalance,
      endingBalance: c.endingBalance,
      status: 'closed',
      closedAt: c.closedAt,
      lines,
    });
    await doc.sync();
  }

  try {
    const raw = localStorage.getItem(draftKey(account));
    if (!raw) {
      return;
    }
    const draft = JSON.parse(raw) as ReconcileDraft;
    const existingDraft = (await fyo.db.getAll(ModelNameEnum.Reconciliation, {
      fields: ['name'],
      filters: { bankAccount: account, status: 'draft' },
      limit: 1,
    })) as { name: string }[];
    if (existingDraft.length) {
      return;
    }
    const checkedNames = Object.keys(draft.checked ?? {}).filter(
      (k) => draft.checked![k]
    );
    const lines: { ledgerEntry: string; cleared: boolean }[] = [];
    for (const n of checkedNames) {
      lines.push({ ledgerEntry: n, cleared: true });
    }
    const doc = fyo.doc.getNewDoc(ModelNameEnum.Reconciliation, {
      bankAccount: account,
      statementDate: draft.toDate || new Date().toISOString().slice(0, 10),
      beginningBalance: 0,
      endingBalance:
        typeof draft.endingBalance === 'number' ? draft.endingBalance : 0,
      status: 'draft',
      lines,
    });
    await doc.sync();
  } catch {
    // ignore draft migrate errors
  }
}

export async function lastReconcileFor(
  account: string
): Promise<ClosedReconcile | null> {
  await migrateLocalStorageReconcilesOnce();
  const rows = (await fyo.db.getAll(ModelNameEnum.Reconciliation, {
    fields: [
      'name',
      'statementDate',
      'beginningBalance',
      'endingBalance',
      'closedAt',
    ],
    filters: { bankAccount: account, status: 'closed' },
    orderBy: 'statementDate',
    order: 'desc',
    limit: 1,
  })) as Array<Record<string, unknown>>;
  if (!rows.length) {
    return null;
  }
  const r = rows[0];
  const name = String(r.name ?? '');
  const doc = await fyo.doc.getDoc(ModelNameEnum.Reconciliation, name);
  const lineNames = ((doc.lines ?? []) as Array<{ ledgerEntry?: string }>)
    .map((l) => String(l.ledgerEntry ?? ''))
    .filter(Boolean);
  return {
    name,
    toDate: isoDateOnly(r.statementDate),
    beginningBalance: asNumber(r.beginningBalance),
    endingBalance: asNumber(r.endingBalance),
    closedAt: String(r.closedAt ?? ''),
    ledgerEntryNames: lineNames,
  };
}

export async function reconciledEntryNamesFor(
  account: string
): Promise<Set<string>> {
  await migrateLocalStorageReconcilesOnce();
  const out = new Set<string>();
  const ales = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
    fields: ['name'],
    filters: { account, reconciled: true, reverted: false },
  })) as { name: string }[];
  for (const a of ales) {
    out.add(a.name);
  }
  return out;
}

export async function readDraft(
  account: string
): Promise<ReconcileDraft | null> {
  await migrateLocalStorageReconcilesOnce();
  const rows = (await fyo.db.getAll(ModelNameEnum.Reconciliation, {
    fields: ['name', 'statementDate', 'endingBalance'],
    filters: { bankAccount: account, status: 'draft' },
    limit: 1,
  })) as Array<Record<string, unknown>>;
  if (!rows.length) {
    return null;
  }
  const name = String(rows[0].name ?? '');
  const doc = await fyo.doc.getDoc(ModelNameEnum.Reconciliation, name);
  const checked: Record<string, boolean> = {};
  for (const l of (doc.lines ?? []) as Array<{
    ledgerEntry?: string;
    cleared?: boolean;
  }>) {
    if (l.ledgerEntry && l.cleared) {
      checked[String(l.ledgerEntry)] = true;
    }
  }
  return {
    name,
    toDate: isoDateOnly(rows[0].statementDate) || undefined,
    endingBalance: asNumber(rows[0].endingBalance),
    checked,
  };
}

export async function writeDraft(
  account: string,
  draft: ReconcileDraft
): Promise<void> {
  await migrateLocalStorageReconcilesOnce();
  const existing = (await fyo.db.getAll(ModelNameEnum.Reconciliation, {
    fields: ['name'],
    filters: { bankAccount: account, status: 'draft' },
    limit: 1,
  })) as { name: string }[];

  const checkedNames = Object.keys(draft.checked ?? {}).filter(
    (k) => draft.checked![k]
  );
  const lines = checkedNames.map((ledgerEntry) => ({
    ledgerEntry,
    cleared: true,
  }));

  if (existing.length) {
    const doc = await fyo.doc.getDoc(
      ModelNameEnum.Reconciliation,
      existing[0].name
    );
    await doc.set('statementDate', draft.toDate || doc.statementDate);
    await doc.set(
      'endingBalance',
      draft.endingBalance == null ? 0 : draft.endingBalance
    );
    await doc.set('lines', lines);
    await doc.sync();
    return;
  }

  const beginning = (await lastReconcileFor(account))?.endingBalance ?? 0;
  const doc = fyo.doc.getNewDoc(ModelNameEnum.Reconciliation, {
    bankAccount: account,
    statementDate: draft.toDate || new Date().toISOString().slice(0, 10),
    beginningBalance: beginning,
    endingBalance: draft.endingBalance == null ? 0 : draft.endingBalance,
    status: 'draft',
    lines,
  });
  await doc.sync();
}

export async function clearDraft(account: string): Promise<void> {
  await migrateLocalStorageReconcilesOnce();
  const existing = (await fyo.db.getAll(ModelNameEnum.Reconciliation, {
    fields: ['name'],
    filters: { bankAccount: account, status: 'draft' },
  })) as { name: string }[];
  for (const row of existing) {
    const doc = await fyo.doc.getDoc(ModelNameEnum.Reconciliation, row.name);
    await doc.delete();
  }
}

export async function finishReconcile(opts: {
  account: string;
  toDate: string;
  beginningBalance: number;
  endingBalance: number;
  ledgerEntryNames: string[];
}): Promise<ClosedReconcile> {
  await migrateLocalStorageReconcilesOnce();
  const now = new Date().toISOString();
  const lines = opts.ledgerEntryNames.map((ledgerEntry) => ({
    ledgerEntry,
    cleared: true,
  }));

  // Prefer promoting an existing draft if present.
  const drafts = (await fyo.db.getAll(ModelNameEnum.Reconciliation, {
    fields: ['name'],
    filters: { bankAccount: opts.account, status: 'draft' },
    limit: 1,
  })) as { name: string }[];

  let doc: Doc;
  if (drafts.length) {
    doc = await fyo.doc.getDoc(ModelNameEnum.Reconciliation, drafts[0].name);
    await doc.set('statementDate', opts.toDate);
    await doc.set('beginningBalance', opts.beginningBalance);
    await doc.set('endingBalance', opts.endingBalance);
    await doc.set('lines', lines);
    await doc.set('status', 'closed');
    await doc.set('closedAt', now);
    await doc.sync();
  } else {
    doc = fyo.doc.getNewDoc(ModelNameEnum.Reconciliation, {
      bankAccount: opts.account,
      statementDate: opts.toDate,
      beginningBalance: opts.beginningBalance,
      endingBalance: opts.endingBalance,
      status: 'closed',
      closedAt: now,
      lines,
    });
    await doc.sync();
  }

  for (const aleName of opts.ledgerEntryNames) {
    await fyo.db.update(ModelNameEnum.AccountingLedgerEntry, {
      name: aleName,
      reconciled: true,
      reconciledOn: now,
      cleared: true,
    });
  }

  return {
    name: String(doc.name ?? ''),
    toDate: opts.toDate,
    beginningBalance: opts.beginningBalance,
    endingBalance: opts.endingBalance,
    closedAt: now,
    ledgerEntryNames: opts.ledgerEntryNames,
  };
}

/** Flip latest closed recon for account back to draft; clear ALE.reconciled on its lines. */
export async function reopenLatestReconciliation(
  account: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await migrateLocalStorageReconcilesOnce();
  const last = await lastReconcileFor(account);
  if (!last) {
    return { ok: false, error: 'No closed reconciliation to reopen.' };
  }
  const doc = await fyo.doc.getDoc(ModelNameEnum.Reconciliation, last.name);
  for (const aleName of last.ledgerEntryNames) {
    try {
      await fyo.db.update(ModelNameEnum.AccountingLedgerEntry, {
        name: aleName,
        reconciled: false,
        reconciledOn: null,
      });
    } catch {
      // ALE may have been deleted
    }
  }
  await doc.set('status', 'draft');
  await doc.set('closedAt', null);
  await doc.sync();
  return { ok: true };
}

export async function draftInProgress(account: string): Promise<boolean> {
  const d = await readDraft(account);
  if (!d) {
    return false;
  }
  return !!(
    d.toDate ||
    (typeof d.endingBalance === 'number' && d.endingBalance !== 0) ||
    (d.checked && Object.values(d.checked).some(Boolean))
  );
}

/**
 * Beginning-balance discrepancy: last closed endingBalance vs
 * beginningBalance + sum(signed live reconciled ALEs from that recon's lines).
 */
export async function hasBeginningBalanceDiscrepancy(
  account: string
): Promise<boolean> {
  const last = await lastReconcileFor(account);
  if (!last) {
    return false;
  }

  const accRows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['rootType'],
    filters: { name: account },
    limit: 1,
  })) as { rootType?: string }[];
  const rootType = accRows[0]?.rootType;
  const liability =
    !!rootType && isCredit(rootType as Parameters<typeof isCredit>[0]);

  let signedSum = 0;
  for (const aleName of last.ledgerEntryNames) {
    const rows = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
      fields: ['name', 'debit', 'credit', 'reconciled', 'reverted'],
      filters: { name: aleName },
      limit: 1,
    })) as Array<Record<string, unknown>>;
    if (!rows.length) {
      return true;
    }
    const r = rows[0];
    if (r.reverted || !r.reconciled) {
      return true;
    }
    const debit = asNumber(r.debit);
    const credit = asNumber(r.credit);
    signedSum += liability ? credit - debit : debit - credit;
  }

  const actual = last.beginningBalance + signedSum;
  return Math.abs(actual - last.endingBalance) >= 0.005;
}

/** True if any ALE for this reference (JE/Payment) is reconciled. */
export async function referenceHasReconciledAles(
  referenceType: string,
  referenceName: string
): Promise<boolean> {
  if (!referenceType || !referenceName) {
    return false;
  }
  const rows = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
    fields: ['name'],
    filters: {
      referenceType,
      referenceName,
      reconciled: true,
      reverted: false,
    },
    limit: 1,
  })) as { name: string }[];
  return rows.length > 0;
}

/** Mark bank-side ALEs for a Payment/JE as cleared (feed confirm). */
export async function setClearedForReference(
  bankAccount: string,
  referenceType: string,
  referenceName: string,
  cleared: boolean
): Promise<void> {
  const rows = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
    fields: ['name'],
    filters: {
      account: bankAccount,
      referenceType,
      referenceName,
      reverted: false,
    },
  })) as { name: string }[];
  for (const r of rows) {
    await fyo.db.update(ModelNameEnum.AccountingLedgerEntry, {
      name: r.name,
      cleared,
    });
  }
}

/** True if any bank-side ALE for the matched ref is reconciled. */
export async function matchedLineIsReconciled(
  bankAccount: string,
  referenceType: string,
  referenceName: string
): Promise<boolean> {
  const rows = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
    fields: ['name'],
    filters: {
      account: bankAccount,
      referenceType,
      referenceName,
      reconciled: true,
      reverted: false,
    },
    limit: 1,
  })) as { name: string }[];
  return rows.length > 0;
}
