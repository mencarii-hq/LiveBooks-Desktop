/**
 * Local-only persistence for the reconcile flow.
 *
 * We don't yet have a Reconciliation schema in the app DB, so for the MVP we
 * keep "closed reconciles" and "in-progress drafts" in localStorage keyed by
 * the bank account name. This lets the Hub show "Last reconciled" and lets
 * the workbench compute the next Beginning Balance + the set of entries that
 * are no longer eligible for reconciling.
 *
 * Keys:
 *   - lbReconcile.closed.<accountName> : ClosedReconcile[]
 *   - lbReconcile.draft.<accountName>  : ReconcileDraft
 */

export type ClosedReconcile = {
  toDate: string;
  endingBalance: number;
  beginningBalance: number;
  closedAt: string;
  ledgerEntryNames: string[];
};

export type ReconcileDraft = {
  toDate?: string;
  endingBalance?: number | null;
  checked?: Record<string, boolean>;
};

const closedKey = (account: string) => `lbReconcile.closed.${account}`;
const draftKey = (account: string) => `lbReconcile.draft.${account}`;

export function readClosedList(account: string): ClosedReconcile[] {
  try {
    const raw = localStorage.getItem(closedKey(account));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((r): r is ClosedReconcile => {
      if (!r || typeof r !== 'object') {
        return false;
      }
      const o = r as Record<string, unknown>;
      return (
        typeof o.toDate === 'string' &&
        typeof o.endingBalance === 'number' &&
        typeof o.beginningBalance === 'number' &&
        typeof o.closedAt === 'string' &&
        Array.isArray(o.ledgerEntryNames)
      );
    });
  } catch {
    return [];
  }
}

export function appendClosed(account: string, entry: ClosedReconcile): void {
  const list = readClosedList(account);
  list.push(entry);
  localStorage.setItem(closedKey(account), JSON.stringify(list));
}

export function lastReconcileFor(account: string): ClosedReconcile | null {
  const list = readClosedList(account);
  if (!list.length) {
    return null;
  }
  return list
    .slice()
    .sort((a, b) => String(b.toDate).localeCompare(String(a.toDate)))[0];
}

export function reconciledEntryNamesFor(account: string): Set<string> {
  const out = new Set<string>();
  for (const c of readClosedList(account)) {
    for (const n of c.ledgerEntryNames) {
      out.add(n);
    }
  }
  return out;
}

export function readDraft(account: string): ReconcileDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(account));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as ReconcileDraft;
  } catch {
    return null;
  }
}

export function writeDraft(account: string, draft: ReconcileDraft): void {
  localStorage.setItem(draftKey(account), JSON.stringify(draft));
}

export function clearDraft(account: string): void {
  localStorage.removeItem(draftKey(account));
}
