/**
 * Safe disconnect / delete / archive flows for bank (ledger) accounts on the Bank Feed Settings page.
 */

import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { isCredit } from 'models/helpers';
import { loadManualFeedStatements } from 'src/utils/bankFeedHelpers';
import { setLineStatus } from 'src/utils/bankLineActions';
import {
  disconnectPlaidAccountFeed,
  removePlaidItem,
} from 'src/utils/plaidBankFeedsApi';

export async function countLedgerRowsForAccount(
  accountName: string
): Promise<number> {
  return await fyo.db.count(ModelNameEnum.AccountingLedgerEntry, {
    filters: { account: accountName, reverted: false },
  });
}

export async function ledgerSignedBalanceForAccount(
  accountName: string
): Promise<number | null> {
  try {
    const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
      fields: ['name', 'rootType'],
      filters: {
        name: accountName,
        accountType: AccountTypeEnum.Bank,
        isGroup: false,
      },
      limit: 1,
    })) as { name: string; rootType?: string }[];
    const rootType = rows[0]?.rootType;
    const totals = await fyo.db.getTotalCreditAndDebit();
    const total = totals.find((x) => x.account === accountName);
    if (!total) {
      return 0;
    }
    const td = Number(total.totalDebit ?? 0);
    const tc = Number(total.totalCredit ?? 0);
    let v = td - tc;
    if (rootType && isCredit(rootType)) {
      v = tc - td;
    }
    return v;
  } catch {
    return null;
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
  plaidAccountId: string
): Promise<{ ok: true; itemRemoved: boolean } | { ok: false; error: string }> {
  const remote = await disconnectPlaidAccountFeed(
    bookId,
    itemId,
    plaidAccountId
  );
  if (!remote.ok) {
    return { ok: false, error: remote.error ?? 'Disconnect failed.' };
  }
  const itemRemoved = remote.itemRemoved === true;
  if (itemRemoved) {
    await deletePlaidMapsForItem(itemId);
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
  itemId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const remote = await removePlaidItem(bookId, itemId);
  if (!remote.ok) {
    return { ok: false, error: remote.error ?? 'Disconnect failed.' };
  }
  await deletePlaidMapsForItem(itemId);
  return { ok: true };
}

export async function archiveBankAccount(
  accountName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
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
