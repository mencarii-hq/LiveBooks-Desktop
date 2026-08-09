import { Fyo, t } from 'fyo';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { ModelNameEnum } from 'models/types';

const MANUAL_BANK_PARENT_FALLBACKS = ['Bank Accounts'];
const CREDIT_CARD_PARENT_FALLBACKS = [
  'Credit Cards',
  'Current Liabilities',
  'Liabilities',
];
const OPENING_BALANCE_EQUITY_NAME = 'Opening Balance Equity';

export type ManualBankKind = 'bank' | 'credit_card';

function parseOpeningBalance(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '') {
    return 0;
  }
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

async function resolveAccountParent(
  fyo: Fyo,
  rootType: 'Asset' | 'Liability' | 'Equity',
  preferredNames: string[]
): Promise<string | null> {
  for (const candidate of preferredNames) {
    try {
      const byLabel = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name'],
        filters: { accountName: candidate, isGroup: true },
        limit: 1,
      })) as { name: string }[];
      if (byLabel.length) {
        return byLabel[0].name;
      }
      if (await fyo.db.exists(ModelNameEnum.Account, candidate)) {
        return candidate;
      }
    } catch {
      // Continue searching.
    }
  }
  try {
    const groups = (await fyo.db.getAll(ModelNameEnum.Account, {
      fields: ['name'],
      filters: { rootType, isGroup: true },
      limit: 1,
    })) as { name: string }[];
    if (groups.length > 0) {
      return groups[0].name;
    }
  } catch {
    // Fall through.
  }
  return null;
}

async function resolveOpeningEquityAccount(fyo: Fyo): Promise<string> {
  try {
    const byLabel = (await fyo.db.getAll(ModelNameEnum.Account, {
      fields: ['name'],
      filters: { accountName: OPENING_BALANCE_EQUITY_NAME },
      limit: 1,
    })) as { name: string }[];
    if (byLabel.length) {
      return byLabel[0].name;
    }
  } catch {
    // Fall through.
  }
  try {
    const equityAccounts = (await fyo.db.getAll(ModelNameEnum.Account, {
      fields: ['name'],
      filters: {
        accountType: AccountTypeEnum.Equity,
        isGroup: false,
      },
      limit: 1,
    })) as { name: string }[];
    if (equityAccounts.length > 0) {
      return equityAccounts[0].name;
    }
  } catch {
    // Fall through.
  }
  const equityParent = await resolveAccountParent(fyo, 'Equity', ['Equity']);
  const created = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: OPENING_BALANCE_EQUITY_NAME,
    parentAccount: equityParent ?? undefined,
    isGroup: false,
    rootType: 'Equity',
    accountType: AccountTypeEnum.Equity,
  });
  await created.sync();
  return String(created.name ?? OPENING_BALANCE_EQUITY_NAME);
}

async function postOpeningEntry(
  fyo: Fyo,
  opts: {
    accountName: string;
    kind: ManualBankKind;
    amount: number;
    isNegative: boolean;
    date: string;
  }
) {
  const equityAccount = await resolveOpeningEquityAccount(fyo);
  const entryType =
    opts.kind === 'credit_card' ? 'Credit Card Entry' : 'Bank Entry';
  const jvDoc = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType,
    date: opts.date,
  });
  const debitFirst = opts.kind === 'bank' ? !opts.isNegative : opts.isNegative;
  const amount = fyo.pesa(opts.amount);
  const zero = fyo.pesa(0);
  if (debitFirst) {
    await jvDoc.append('accounts', {
      account: opts.accountName,
      debit: amount,
      credit: zero,
    });
    await jvDoc.append('accounts', {
      account: equityAccount,
      debit: zero,
      credit: amount,
    });
  } else {
    await jvDoc.append('accounts', {
      account: opts.accountName,
      debit: zero,
      credit: amount,
    });
    await jvDoc.append('accounts', {
      account: equityAccount,
      debit: amount,
      credit: zero,
    });
  }
  const synced = await jvDoc.sync();
  await synced.submit();
}

export async function createManualBankAccount(
  fyo: Fyo,
  opts: {
    accountName: string;
    kind: ManualBankKind;
    openingBalance: string;
    openingDate: string;
  }
): Promise<
  | { ok: true; accountName: string; openingBalanceWarning?: string }
  | { ok: false; error: string }
> {
  const name = opts.accountName.trim();
  if (!name || !opts.openingDate) {
    return {
      ok: false,
      error: t`Enter account name, opening date, and opening balance.`,
    };
  }
  const balance = parseOpeningBalance(opts.openingBalance);
  if (balance === null) {
    return { ok: false, error: t`Enter a valid opening balance.` };
  }

  try {
    const dupes = (await fyo.db.getAll(ModelNameEnum.Account, {
      fields: ['name'],
      filters: { accountName: name },
      limit: 1,
    })) as { name: string }[];
    if (dupes.length) {
      return { ok: false, error: t`An account with this name already exists.` };
    }
  } catch {
    // Fall through; sync will surface duplicate errors.
  }

  let createdAccountName: string | null = null;
  try {
    const isCreditCard = opts.kind === 'credit_card';
    const rootType = isCreditCard ? 'Liability' : 'Asset';
    const fallbacks = isCreditCard
      ? CREDIT_CARD_PARENT_FALLBACKS
      : MANUAL_BANK_PARENT_FALLBACKS;
    const parentAccount = await resolveAccountParent(fyo, rootType, fallbacks);
    if (!parentAccount) {
      return {
        ok: false,
        error: t`Couldn't find a parent account in the chart of accounts. Add a Bank Accounts (or Liability) group first.`,
      };
    }
    const accountDoc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
      name,
      accountName: name,
      parentAccount,
      isGroup: false,
      rootType,
      accountType: isCreditCard
        ? AccountTypeEnum.CreditCard
        : AccountTypeEnum.Bank,
    });
    await accountDoc.sync();
    createdAccountName = String(accountDoc.name ?? name);

    let openingBalanceWarning: string | undefined;
    if (balance !== 0) {
      try {
        await postOpeningEntry(fyo, {
          accountName: createdAccountName,
          kind: opts.kind,
          amount: Math.abs(balance),
          isNegative: balance < 0,
          date: opts.openingDate,
        });
      } catch (e) {
        openingBalanceWarning = t`Bank account created, but the opening balance could not be posted: ${
          (e as Error).message
        }`;
      }
    }

    return {
      ok: true,
      accountName: createdAccountName,
      openingBalanceWarning,
    };
  } catch (e) {
    const detail = (e as Error).message?.trim();
    return {
      ok: false,
      error: createdAccountName
        ? detail || t`Couldn't finish setting up the bank account.`
        : detail
        ? t`Couldn't save the bank account: ${detail}`
        : t`Couldn't save the bank account. Please try again.`,
    };
  }
}
