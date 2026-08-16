/**
 * Safe disconnect / delete / archive flows for bank (ledger) accounts on Bank Feed Hub.
 */

import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { QueryFilter } from 'utils/db/types';
import { loadManualFeedStatements } from 'src/utils/bankFeedHelpers';
import { setLineStatus } from 'src/utils/bankLineActions';
import {
  disconnectPlaidAccountFeed,
  removePlaidItem,
} from 'src/utils/plaidBankFeedsApi';
import type { PromptTotpFn } from 'src/utils/plaidBankFeedsApi';
import {
  computeLedgerSignedBalance,
  endOfTodayISO,
} from 'src/utils/ledgerBalance';
import type { LedgerAleRow, LedgerBalanceOpts } from 'src/utils/ledgerBalance';

export {
  computeLedgerSignedBalance,
  endOfTodayISO,
  ledgerMoney,
  signedBalanceDelta,
} from 'src/utils/ledgerBalance';
export type { LedgerAleRow, LedgerBalanceOpts };

async function loadCancelledPaymentNames(
  paymentNames: string[]
): Promise<Set<string>> {
  const cancelled = new Set<string>();
  if (!paymentNames.length) {
    return cancelled;
  }
  const pays = (await fyo.db.getAll(ModelNameEnum.Payment, {
    filters: { name: ['in', paymentNames] },
    fields: ['name', 'cancelled'],
  })) as { name: string; cancelled?: boolean }[];
  for (const p of pays) {
    if (p.cancelled) {
      cancelled.add(p.name);
    }
  }
  return cancelled;
}

function paymentNamesFromAles(ales: LedgerAleRow[]): string[] {
  return [
    ...new Set(
      ales
        .filter((a) => a.referenceType === ModelNameEnum.Payment)
        .map((a) => a.referenceName!)
        .filter(Boolean)
    ),
  ];
}

export async function countLedgerRowsForAccount(
  accountName: string
): Promise<number> {
  return await fyo.db.count(ModelNameEnum.AccountingLedgerEntry, {
    filters: { account: accountName, reverted: false },
  });
}

export async function ledgerSignedBalanceForAccount(
  accountName: string,
  opts?: LedgerBalanceOpts
): Promise<number | null> {
  try {
    const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
      fields: ['name', 'rootType'],
      filters: {
        name: accountName,
        accountType: ['in', [AccountTypeEnum.Bank, AccountTypeEnum.CreditCard]],
        isGroup: false,
      },
      limit: 1,
    })) as { name: string; rootType?: string }[];
    const rootType = rows[0]?.rootType;
    const excludeReverted = opts?.excludeReverted !== false;
    const asOf = opts?.asOf === undefined ? endOfTodayISO() : opts.asOf;
    const filters: QueryFilter = { account: accountName };
    if (excludeReverted) {
      filters.reverted = false;
    }
    if (asOf) {
      filters.date = ['<=', asOf];
    }
    const ales = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
      filters,
      fields: [
        'debit',
        'credit',
        'date',
        'reverted',
        'referenceType',
        'referenceName',
      ],
    })) as LedgerAleRow[];
    const excludeCancelled = opts?.excludeCancelledPayments !== false;
    const cancelled = excludeCancelled
      ? await loadCancelledPaymentNames(paymentNamesFromAles(ales))
      : new Set<string>();
    return computeLedgerSignedBalance(ales, rootType, cancelled, {
      ...opts,
      asOf,
      excludeReverted,
      excludeCancelledPayments: excludeCancelled,
    });
  } catch {
    return null;
  }
}

/** Batch books balances (as-of today, exclude reverted/cancelled) for hub tables. */
export async function ledgerSignedBalancesForAccounts(
  accountNames: string[]
): Promise<Record<string, number>> {
  const unique = [...new Set(accountNames.filter(Boolean))];
  const out: Record<string, number> = {};
  for (const name of unique) {
    out[name] = 0;
  }
  if (!unique.length) {
    return out;
  }
  try {
    const accounts = (await fyo.db.getAll(ModelNameEnum.Account, {
      fields: ['name', 'rootType'],
      filters: {
        name: ['in', unique],
        accountType: ['in', [AccountTypeEnum.Bank, AccountTypeEnum.CreditCard]],
        isGroup: false,
      },
    })) as { name: string; rootType?: string }[];
    const rootByName = new Map(accounts.map((a) => [a.name, a.rootType]));
    const asOf = endOfTodayISO();
    const ales = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
      filters: {
        account: ['in', unique],
        reverted: false,
        date: ['<=', asOf],
      },
      fields: [
        'account',
        'debit',
        'credit',
        'date',
        'reverted',
        'referenceType',
        'referenceName',
      ],
    })) as LedgerAleRow[];
    const cancelled = await loadCancelledPaymentNames(
      paymentNamesFromAles(ales)
    );
    const byAccount = new Map<string, LedgerAleRow[]>();
    for (const ale of ales) {
      const acc = ale.account || '';
      const list = byAccount.get(acc) ?? [];
      list.push(ale);
      byAccount.set(acc, list);
    }
    for (const name of unique) {
      out[name] = computeLedgerSignedBalance(
        byAccount.get(name) ?? [],
        rootByName.get(name),
        cancelled,
        { asOf, excludeReverted: true, excludeCancelledPayments: true }
      );
    }
    return out;
  } catch {
    return out;
  }
}

export async function deletePlaidMapsForItem(itemId: string): Promise<void> {
  const maps = (await fyo.db.getAll(ModelNameEnum.PlaidBankAccountMap, {
    fields: ['name'],
    filters: { plaidItemId: itemId },
  })) as { name: string }[];
  for (const { name } of maps) {
    const doc = await fyo.doc.getDoc(ModelNameEnum.PlaidBankAccountMap, name);
    await doc.delete();
  }
}

export async function deletePlaidMapsForItemAccount(
  itemId: string,
  plaidAccountId: string
): Promise<void> {
  const maps = (await fyo.db.getAll(ModelNameEnum.PlaidBankAccountMap, {
    fields: ['name'],
    filters: { plaidItemId: itemId, plaidAccountId },
  })) as { name: string }[];
  for (const { name } of maps) {
    const doc = await fyo.doc.getDoc(ModelNameEnum.PlaidBankAccountMap, name);
    await doc.delete();
  }
}

export async function disconnectPlaidAccountFeedLocalAndRemote(
  bookId: string,
  itemId: string,
  plaidAccountId: string,
  opts?: { promptTotp?: PromptTotpFn }
): Promise<{ ok: true; itemRemoved: boolean } | { ok: false; error: string }> {
  const remote = await disconnectPlaidAccountFeed(
    bookId,
    itemId,
    plaidAccountId,
    opts
  );
  if (!remote.ok) {
    return { ok: false, error: remote.error ?? 'Disconnect failed.' };
  }
  const itemRemoved = remote.itemRemoved === true;
  // Always clear local map after successful soft-remove; keep ledger history.
  if (itemRemoved) {
    await deletePlaidMapsForItem(itemId);
  } else {
    await deletePlaidMapsForItemAccount(itemId, plaidAccountId);
  }
  return { ok: true, itemRemoved };
}

export async function deletePlaidMapsForChartAccount(
  chartAccount: string
): Promise<void> {
  const maps = (await fyo.db.getAll(ModelNameEnum.PlaidBankAccountMap, {
    fields: ['name'],
    filters: { chartAccount },
  })) as { name: string }[];
  for (const { name } of maps) {
    const doc = await fyo.doc.getDoc(ModelNameEnum.PlaidBankAccountMap, name);
    await doc.delete();
  }
}

export async function excludeUnmatchedFeedLinesForAccount(
  accountName: string,
  ignoreReason: string
): Promise<{ excluded: number; error?: string }> {
  const { lines } = await loadManualFeedStatements(accountName);
  let excluded = 0;
  for (const line of lines) {
    if (line.matchStatus !== 'unmatched') {
      continue;
    }
    const r = await setLineStatus({
      line,
      status: 'ignored',
      ignoreReason,
    });
    if (!r.ok) {
      return { excluded, error: r.error };
    }
    excluded += 1;
  }
  return { excluded };
}

export async function disconnectPlaidItemLocalAndRemote(
  bookId: string,
  itemId: string,
  opts?: { promptTotp?: PromptTotpFn }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const remote = await removePlaidItem(bookId, itemId, opts);
  if (!remote.ok) {
    return { ok: false, error: remote.error ?? 'Disconnect failed.' };
  }
  await deletePlaidMapsForItem(itemId);
  return { ok: true };
}

export async function archiveBankAccount(
  accountName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  // As-of-today books balance (excludes reverted, cancelled, future-dated)
  // so archive eligibility matches the register / hub figure.
  const bal = await ledgerSignedBalanceForAccount(accountName);
  if (bal != null && Math.abs(bal) > 0.005) {
    return {
      ok: false,
      error:
        'This account still has a balance in your books. Record a transfer to zero it before archiving.',
    };
  }
  const ex = await excludeUnmatchedFeedLinesForAccount(
    accountName,
    'archived_account'
  );
  if (ex.error) {
    return { ok: false, error: ex.error };
  }
  await deletePlaidMapsForChartAccount(accountName);
  const acc = await fyo.doc.getDoc(ModelNameEnum.Account, accountName);
  await acc.set('disabled', true);
  await acc.sync();
  return { ok: true };
}

export async function unarchiveBankAccount(
  accountName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const acc = await fyo.doc.getDoc(ModelNameEnum.Account, accountName);
    if (!acc.get('disabled')) {
      return { ok: true };
    }
    await acc.set('disabled', false);
    await acc.sync();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not restore account.',
    };
  }
}

export async function deleteEmptyBankAccount(
  accountName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const n = await countLedgerRowsForAccount(accountName);
  if (n > 0) {
    return {
      ok: false,
      error:
        'This account has ledger history and cannot be deleted. Archive it instead.',
    };
  }
  await deletePlaidMapsForChartAccount(accountName);
  const stmts = (await fyo.db.getAll(ModelNameEnum.BankStatement, {
    fields: ['name'],
    filters: { bankAccount: accountName },
  })) as { name: string }[];
  for (const { name } of stmts) {
    const doc = await fyo.doc.getDoc(ModelNameEnum.BankStatement, name);
    await doc.delete();
  }
  const acc = await fyo.doc.getDoc(ModelNameEnum.Account, accountName);
  await acc.delete();
  return { ok: true };
}
