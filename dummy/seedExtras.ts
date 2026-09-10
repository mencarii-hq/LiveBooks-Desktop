import { Fyo, t } from 'fyo';
import { DateTime } from 'luxon';
import {
  AccountRootTypeEnum,
  AccountTypeEnum,
} from 'models/baseModels/Account/types';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { SalesQuote } from 'models/baseModels/SalesQuote/SalesQuote';
import { ModelNameEnum } from 'models/types';
import { MovementTypeEnum } from 'models/inventory/types';
import { generatePayRunPayments } from 'src/utils/payrollPayRun';
import { createRegisterPayment } from 'src/utils/memorizedTransactions';
import {
  resolveAccountIdByLabel,
  salesIncomeAccountId,
} from 'utils/ids/coaAccountLookup';
import {
  DEMO_CREDIT_CARD_NAME,
  DEMO_EMPLOYEES,
  DEMO_FIT_ACCOUNT_NAME,
  isTrackedDemoItem,
  purchaseItemPartyMap,
} from './helpers';
import items from './items.json';
import parties from './parties.json';

export type DemoIdMaps = {
  partyIdByDisplayName: Record<string, string>;
  itemIdByDisplayName: Record<string, string>;
};

type Notifier = (stage: string, percent: number) => void;

export async function enableDemoInventory(fyo: Fyo): Promise<void> {
  const settings = await fyo.doc.getDoc(ModelNameEnum.AccountingSettings);
  await settings.setAndSync('enableInventory', true);
}

export async function resolveDemoLocationId(fyo: Fyo): Promise<string> {
  const stores = fyo.t`Stores`;
  if (await fyo.db.exists(ModelNameEnum.Location, stores)) {
    return stores;
  }
  const rows = (await fyo.db.getAll(ModelNameEnum.Location, {
    fields: ['name'],
  })) as { name: string }[];
  if (!rows.length) {
    throw new Error('Demo seed: no Location found');
  }
  return rows[0].name;
}

export async function resolvePaymentMethodName(
  fyo: Fyo,
  preferred: 'Check' | 'Cash' | 'Transfer'
): Promise<string> {
  const methods = (await fyo.db.getAll(ModelNameEnum.PaymentMethod, {
    fields: ['name', 'type'],
  })) as { name: string; type?: string }[];
  const byName = methods.find((m) => m.name === preferred);
  if (byName) {
    return byName.name;
  }
  if (preferred === 'Check') {
    return methods.find((m) => m.type === 'Check')?.name ?? 'Check';
  }
  if (preferred === 'Cash') {
    return methods.find((m) => m.type === 'Cash')?.name ?? 'Cash';
  }
  return (
    methods.find((m) => m.name === 'Transfer')?.name ??
    methods.find((m) => m.type === 'Bank')?.name ??
    'Transfer'
  );
}

async function accountIdByAccountName(
  fyo: Fyo,
  accountName: string
): Promise<string | null> {
  const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { accountName },
  })) as { name: string }[];
  return rows[0]?.name ?? null;
}

async function ensureLeafAccount(
  fyo: Fyo,
  fields: {
    accountName: string;
    rootType: AccountRootTypeEnum;
    parentAccount: string;
    accountType?: AccountTypeEnum;
  }
): Promise<string> {
  const existing = await accountIdByAccountName(fyo, fields.accountName);
  if (existing) {
    return existing;
  }
  const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    accountName: fields.accountName,
    rootType: fields.rootType,
    parentAccount: fields.parentAccount,
    accountType: fields.accountType,
    isGroup: false,
  });
  await doc.sync();
  return doc.name as string;
}

function trackedItemNames(): string[] {
  return items.filter((i) => isTrackedDemoItem(i)).map((i) => i.name);
}

export async function seedInventoryDocuments(
  fyo: Fyo,
  ids: DemoIdMaps
): Promise<void> {
  const location = await resolveDemoLocationId(fyo);
  const tracked = trackedItemNames();
  const date = DateTime.now().minus({ months: 13 }).startOf('month').toJSDate();
  const itemMap = Object.fromEntries(items.map((i) => [i.name, i]));

  const bySupplier: Record<string, string[]> = {};
  for (const name of tracked) {
    const supplier = purchaseItemPartyMap[name] ?? 'Maxwell';
    bySupplier[supplier] ??= [];
    bySupplier[supplier].push(name);
  }

  for (const [supplier, names] of Object.entries(bySupplier)) {
    const partyId = ids.partyIdByDisplayName[supplier];
    if (!partyId) {
      continue;
    }
    const receipt = fyo.doc.getNewDoc(ModelNameEnum.PurchaseReceipt, {
      party: partyId,
      date,
    });
    for (const name of names) {
      const item = itemMap[name];
      await receipt.append('items', {
        item: ids.itemIdByDisplayName[name],
        location,
        quantity: 500,
        rate: fyo.pesa(item?.rate ?? 1).clip(0),
      });
    }
    await receipt.sync();
    await receipt.submit();
  }

  const jeans = ids.itemIdByDisplayName['611 Jeans - PCH'];
  const cloth = ids.itemIdByDisplayName['Cool Cloth'];
  const gloves = ids.itemIdByDisplayName['Cryo Gloves'];
  const receiptDate = DateTime.now().minus({ months: 2 }).toJSDate();
  const issueDate = DateTime.now().minus({ weeks: 3 }).toJSDate();

  if (cloth) {
    const inbound = fyo.doc.getNewDoc(ModelNameEnum.StockMovement, {
      movementType: MovementTypeEnum.MaterialReceipt,
      date: receiptDate,
    });
    await inbound.append('items', {
      item: cloth,
      toLocation: location,
      quantity: 12,
      rate: fyo.pesa(itemMap['Cool Cloth']?.rate ?? 48).clip(0),
    });
    await inbound.sync();
    await inbound.submit();
  }

  if (jeans) {
    const issue = fyo.doc.getNewDoc(ModelNameEnum.StockMovement, {
      movementType: MovementTypeEnum.MaterialIssue,
      date: issueDate,
    });
    await issue.append('items', {
      item: jeans,
      fromLocation: location,
      quantity: 4,
      rate: fyo.pesa(itemMap['611 Jeans - PCH']?.rate ?? 54).clip(0),
    });
    await issue.sync();
    await issue.submit();
  }

  if (gloves) {
    const extra = fyo.doc.getNewDoc(ModelNameEnum.StockMovement, {
      movementType: MovementTypeEnum.MaterialReceipt,
      date: DateTime.now().minus({ weeks: 1 }).toJSDate(),
    });
    await extra.append('items', {
      item: gloves,
      toLocation: location,
      quantity: 8,
      rate: fyo.pesa(itemMap['Cryo Gloves']?.rate ?? 42).clip(0),
    });
    await extra.sync();
    await extra.submit();
  }
}

export async function seedSalesQuotes(
  fyo: Fyo,
  ids: DemoIdMaps
): Promise<SalesQuote[]> {
  const customers = parties.filter((p) => p.role !== 'Supplier');
  const salesItems = items.filter((i) => i.for !== 'Purchases');
  const quotes: SalesQuote[] = [];

  for (let i = 0; i < 10; i++) {
    const customer = customers[i % customers.length];
    const item = salesItems[i % salesItems.length];
    const date = DateTime.now()
      .minus({ days: 20 + i * 3 })
      .toJSDate();
    const doc = fyo.doc.getNewDoc(ModelNameEnum.SalesQuote, {
      date,
      referenceType: 'Party',
    }) as SalesQuote;
    await doc.set('party', ids.partyIdByDisplayName[customer.name]);
    await doc.append('items', {});
    await doc.items!.at(-1)!.set({
      item: ids.itemIdByDisplayName[item.name],
      rate: fyo.pesa(item.rate).clip(0),
      quantity: i % 3 === 0 ? 2 : 1,
    });
    quotes.push(doc);
  }

  return quotes;
}

export async function convertQuotesToInvoices(
  quotes: SalesQuote[]
): Promise<SalesInvoice[]> {
  const invoices: SalesInvoice[] = [];
  for (const quote of quotes.slice(0, 3)) {
    const invoice = (await quote.getInvoice()) as SalesInvoice | null;
    if (!invoice) {
      continue;
    }
    await invoice.set('date', quote.date);
    invoices.push(invoice);
  }
  return invoices;
}

async function seedOpeningEntry(fyo: Fyo): Promise<void> {
  const bankId = await resolveAccountIdByLabel(fyo, 'Supreme Bank');
  const equityId = await resolveAccountIdByLabel(fyo, 'Opening Balance Equity');
  const fyStart = fyo.singles.AccountingSettings?.fiscalYearStart as
    | Date
    | string
    | undefined;
  const date = fyStart
    ? new Date(fyStart)
    : DateTime.now().startOf('year').toJSDate();
  const amount = fyo.pesa(5000);

  const doc = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    date,
    entryType: 'Opening Entry',
  });
  await doc.append('accounts', {
    account: bankId,
    debit: amount,
    credit: fyo.pesa(0),
  });
  await doc.append('accounts', {
    account: equityId,
    credit: amount,
    debit: fyo.pesa(0),
  });
  await doc.sync();
  await doc.submit();
}

async function seedCreditCard(fyo: Fyo, ids: DemoIdMaps): Promise<string> {
  const parent =
    (await accountIdByAccountName(fyo, 'Credit Cards')) ??
    (await resolveAccountIdByLabel(fyo, 'Credit Cards'));
  const ccId = await ensureLeafAccount(fyo, {
    accountName: DEMO_CREDIT_CARD_NAME,
    rootType: AccountRootTypeEnum.Liability,
    parentAccount: parent,
    accountType: AccountTypeEnum.CreditCard,
  });

  const partyId =
    ids.partyIdByDisplayName['Le Socials'] ??
    ids.partyIdByDisplayName['Maxwell'];
  const marketing = await resolveAccountIdByLabel(fyo, 'Marketing Expenses');
  const cashMethod = await resolvePaymentMethodName(fyo, 'Cash');
  const checkMethod = await resolvePaymentMethodName(fyo, 'Check');
  const bankId = await resolveAccountIdByLabel(fyo, 'Supreme Bank');

  const chargeAmounts = [42.18, 67.5, 19.99, 128.4, 55];
  for (let i = 0; i < chargeAmounts.length; i++) {
    await createRegisterPayment(fyo, {
      date: DateTime.now()
        .minus({ days: 8 + i * 5 })
        .toJSDate(),
      party: 'Le Socials',
      partyId,
      categoryAccount: marketing,
      bankAccount: ccId,
      amount: chargeAmounts[i],
      paymentType: 'Pay',
      paymentMethod: cashMethod,
      memo: 'Card charge',
    });
  }

  await createRegisterPayment(fyo, {
    date: DateTime.now().minus({ days: 3 }).toJSDate(),
    party: 'Le Socials',
    partyId,
    categoryAccount: ccId,
    bankAccount: bankId,
    amount: 150,
    paymentType: 'Pay',
    paymentMethod: checkMethod,
    checkNumber: '1999',
    memo: 'Pay card',
  });

  return ccId;
}

async function seedEmployeesAndPayRun(
  fyo: Fyo,
  ids: DemoIdMaps
): Promise<void> {
  const salaryId = await resolveAccountIdByLabel(fyo, 'Salary');
  const liabilitiesParent = await resolveAccountIdByLabel(
    fyo,
    'Current Liabilities'
  );
  const fitId = await ensureLeafAccount(fyo, {
    accountName: DEMO_FIT_ACCOUNT_NAME,
    rootType: AccountRootTypeEnum.Liability,
    parentAccount: liabilitiesParent,
  });
  const bankId = await resolveAccountIdByLabel(fyo, 'Supreme Bank');
  const checkMethod = await resolvePaymentMethodName(fyo, 'Check');

  const profileNames: string[] = [];
  for (const emp of DEMO_EMPLOYEES) {
    const party = fyo.doc.getNewDoc(ModelNameEnum.Party, {
      partyName: emp.partyName,
      role: 'Employee',
    });
    await party.sync();
    ids.partyIdByDisplayName[emp.partyName] = party.name as string;

    const profile = fyo.doc.getNewDoc(ModelNameEnum.PayrollProfile, {
      party: party.name,
      payType: emp.payType,
      rate: fyo.pesa(emp.rate),
      expenseAccount: salaryId,
    });
    await profile.append('deductions', {
      account: fitId,
      deductionType: 'Percent',
      amount: fyo.pesa(8),
      description: 'FIT',
    });
    await profile.sync();
    profileNames.push(profile.name as string);
  }

  await generatePayRunPayments(fyo, {
    payDate: DateTime.now().minus({ days: 7 }).toJSDate(),
    bankAccount: bankId,
    paymentMethod: checkMethod,
    lines: DEMO_EMPLOYEES.map((emp, i) => ({
      profileName: profileNames[i],
      hours: emp.payType === 'Hourly' ? 40 : undefined,
    })),
  });
}

async function seedMemorizedTemplates(
  fyo: Fyo,
  ids: DemoIdMaps
): Promise<void> {
  const bankId = await resolveAccountIdByLabel(fyo, 'Supreme Bank');
  const rentExpense = await resolveAccountIdByLabel(fyo, 'Office Rent');
  const salaryId = await resolveAccountIdByLabel(fyo, 'Salary');
  const fitId = (await accountIdByAccountName(fyo, DEMO_FIT_ACCOUNT_NAME))!;
  const checkMethod = await resolvePaymentMethodName(fyo, 'Check');
  const due = DateTime.now().plus({ days: 5 }).toISODate()!;

  const rentParty = ids.partyIdByDisplayName['Janky Office Spaces'];
  const rent = fyo.doc.getNewDoc(ModelNameEnum.MemorizedTransaction, {
    title: 'Office Rent',
    party: rentParty,
    paymentType: 'Pay',
    fromAccount: bankId,
    toAccount: rentExpense,
    amount: fyo.pesa(1800),
    memo: 'Monthly rent',
    frequency: 'Monthly',
    nextDueDate: due,
    paymentMethod: checkMethod,
  });
  await rent.sync();

  const customer = parties.find((p) => p.role !== 'Supplier')!;
  const deposit = fyo.doc.getNewDoc(ModelNameEnum.MemorizedTransaction, {
    title: 'Customer retainer',
    party: ids.partyIdByDisplayName[customer.name],
    paymentType: 'Receive',
    fromAccount: salesIncomeAccountId(fyo),
    toAccount: bankId,
    amount: fyo.pesa(250),
    memo: 'Retainer deposit',
    frequency: 'Monthly',
    nextDueDate: due,
    paymentMethod: await resolvePaymentMethodName(fyo, 'Cash'),
  });
  await deposit.sync();

  const empId = ids.partyIdByDisplayName[DEMO_EMPLOYEES[0].partyName];
  const payroll = fyo.doc.getNewDoc(ModelNameEnum.MemorizedTransaction, {
    title: 'Payroll splits',
    party: empId,
    paymentType: 'Pay',
    fromAccount: bankId,
    toAccount: salaryId,
    amount: fyo.pesa(2576),
    memo: 'Payroll',
    frequency: 'Monthly',
    nextDueDate: due,
    paymentMethod: checkMethod,
  });
  await payroll.append('splits', {
    account: salaryId,
    amount: fyo.pesa(2800),
    description: 'Gross wages',
  });
  await payroll.append('splits', {
    account: fitId,
    amount: fyo.pesa(-224),
    description: 'FIT',
  });
  await payroll.sync();
}

function moneyFloat(value: unknown): number {
  if (value && typeof value === 'object' && 'float' in value) {
    const f = (value as { float?: unknown }).float;
    if (typeof f === 'number' && Number.isFinite(f)) {
      return f;
    }
  }
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isoDay(value: unknown): string {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate() ?? '';
  }
  if (typeof value === 'string' && value) {
    return value.slice(0, 10);
  }
  return '';
}

function demoFeedHash(parts: (string | number)[]): string {
  const s = parts.map((p) => String(p)).join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `demo_h${(h >>> 0).toString(16)}`;
}

type SeedFeedLine = {
  date: string;
  description: string;
  amount: number;
  bankReference?: string;
  matchStatus: 'unmatched' | 'matched' | 'ignored';
  matchedReferenceType?: string;
  matchedReferenceName?: string;
  ignoreReason?: string;
  possibleDuplicate?: boolean;
};

type AleRow = {
  date?: unknown;
  debit?: unknown;
  credit?: unknown;
  referenceType?: string;
  referenceName?: string;
};

async function describeBankAle(
  fyo: Fyo,
  row: AleRow
): Promise<{ description: string; bankReference: string }> {
  const refType = String(row.referenceType ?? '');
  const refName = String(row.referenceName ?? '');
  if (refType === ModelNameEnum.Payment && refName) {
    const pays = (await fyo.db.getAll(ModelNameEnum.Payment, {
      fields: ['party', 'paymentType', 'referenceId', 'memo'],
      filters: { name: refName },
      limit: 1,
    })) as {
      party?: string;
      paymentType?: string;
      referenceId?: string;
      memo?: string;
    }[];
    const pay = pays[0];
    const partyName = pay?.party
      ? String(
          (await fyo.getValue(ModelNameEnum.Party, pay.party, 'partyName')) ??
            ''
        )
      : '';
    const memo = String(pay?.memo ?? '').trim();
    const ref = String(pay?.referenceId ?? '').trim();
    if (memo.toLowerCase() === 'payroll' && partyName) {
      return {
        description: `ACH PAYROLL ${partyName}`.toUpperCase(),
        bankReference: ref || refName.slice(0, 8),
      };
    }
    if (pay?.paymentType === 'Receive') {
      return {
        description: partyName
          ? `ACH DEPOSIT ${partyName}`.toUpperCase()
          : 'ACH DEPOSIT',
        bankReference: ref || `DEP-${refName.slice(0, 6)}`,
      };
    }
    if (ref) {
      return {
        description: `CHECK ${ref} ${partyName}`.trim().toUpperCase(),
        bankReference: ref,
      };
    }
    return {
      description: partyName
        ? `ACH DEBIT ${partyName}`.toUpperCase()
        : memo.toUpperCase() || 'ACH DEBIT',
      bankReference: refName.slice(0, 8),
    };
  }
  if (refType === ModelNameEnum.JournalEntry && refName) {
    const jes = (await fyo.db.getAll(ModelNameEnum.JournalEntry, {
      fields: ['userRemark', 'entryType', 'referenceNumber'],
      filters: { name: refName },
      limit: 1,
    })) as {
      userRemark?: string;
      entryType?: string;
      referenceNumber?: string;
    }[];
    const je = jes[0];
    const remark = String(je?.userRemark ?? '').trim();
    const kind = String(je?.entryType ?? 'Bank Entry');
    return {
      description: (remark || kind).toUpperCase(),
      bankReference: String(je?.referenceNumber ?? refName.slice(0, 8)),
    };
  }
  return {
    description: 'BANK TRANSACTION',
    bankReference: refName.slice(0, 8),
  };
}

async function loadMatchableAles(
  fyo: Fyo,
  accountId: string
): Promise<AleRow[]> {
  const rows = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
    fields: ['date', 'debit', 'credit', 'referenceType', 'referenceName'],
    filters: { account: accountId, reverted: false },
    orderBy: 'date',
    order: 'desc',
    limit: 80,
  })) as AleRow[];
  const allowed = new Set<string>([
    ModelNameEnum.Payment,
    ModelNameEnum.JournalEntry,
  ]);
  const seen = new Set<string>();
  const out: AleRow[] = [];
  for (const row of rows) {
    const refType = String(row.referenceType ?? '');
    const refName = String(row.referenceName ?? '');
    if (!allowed.has(refType) || !refName) {
      continue;
    }
    const amount = moneyFloat(row.debit) - moneyFloat(row.credit);
    if (!Number.isFinite(amount) || amount === 0) {
      continue;
    }
    const key = `${refType}::${refName}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function seedFeedStatement(
  fyo: Fyo,
  opts: {
    bankAccount: string;
    filename: string;
    lines: SeedFeedLine[];
  }
): Promise<void> {
  const usable = opts.lines.filter(
    (l) => l.date && Number.isFinite(l.amount) && l.amount !== 0
  );
  if (!usable.length) {
    return;
  }
  const dates = usable.map((l) => l.date).sort();
  const doc = fyo.doc.getNewDoc(ModelNameEnum.BankStatement, {
    bankAccount: opts.bankAccount,
    fromDate: dates[0],
    toDate: dates[dates.length - 1],
    importedAt: new Date(),
    source: 'manual_csv',
    sourceFilename: opts.filename,
    kind: 'feed_window',
    status: 'Open',
  });
  for (const line of usable) {
    await doc.append('lines', {
      date: line.date,
      description: line.description,
      amount: fyo.pesa(line.amount),
      bankReference: line.bankReference ?? '',
      matchStatus: line.matchStatus,
      matchedReferenceType: line.matchedReferenceType ?? '',
      matchedReferenceName: line.matchedReferenceName ?? '',
      ignoreReason: line.ignoreReason ?? '',
      possibleDuplicate: Boolean(line.possibleDuplicate),
      contentHash: demoFeedHash([
        opts.bankAccount,
        line.date,
        line.amount,
        line.description,
      ]),
    });
  }
  await doc.sync();
}

async function linesFromAles(
  fyo: Fyo,
  ales: AleRow[],
  status: SeedFeedLine['matchStatus']
): Promise<SeedFeedLine[]> {
  const lines: SeedFeedLine[] = [];
  for (const row of ales) {
    const date = isoDay(row.date);
    const amount = moneyFloat(row.debit) - moneyFloat(row.credit);
    if (!date || amount === 0) {
      continue;
    }
    const { description, bankReference } = await describeBankAle(fyo, row);
    lines.push({
      date,
      description,
      amount,
      bankReference,
      matchStatus: status,
      matchedReferenceType:
        status === 'matched' ? String(row.referenceType ?? '') : undefined,
      matchedReferenceName:
        status === 'matched' ? String(row.referenceName ?? '') : undefined,
    });
  }
  return lines;
}

/**
 * Manual bank-feed windows for Supreme Bank and Flo's Business Card so the
 * hub opens with For Review / Reviewed / Excluded already populated. Online
 * (Plaid) stays empty — connecting a live bank is not part of the demo seed.
 */
async function seedBankFeeds(fyo: Fyo): Promise<void> {
  const bankId = await resolveAccountIdByLabel(fyo, 'Supreme Bank');
  const ccId = await accountIdByAccountName(fyo, DEMO_CREDIT_CARD_NAME);
  const now = DateTime.now();

  const bankAles = await loadMatchableAles(fyo, bankId);
  const bankReviewed = await linesFromAles(
    fyo,
    bankAles.slice(0, 5),
    'matched'
  );
  const bankMatchable = await linesFromAles(
    fyo,
    bankAles.slice(5, 8),
    'unmatched'
  );
  const bankSynthetic: SeedFeedLine[] = [
    {
      date: now.minus({ days: 2 }).toISODate()!,
      description: "SQ *DAILY BATCH FLO'S CLOTHES",
      amount: 412.55,
      bankReference: 'SQ-88421',
      matchStatus: 'unmatched',
    },
    {
      date: now.minus({ days: 4 }).toISODate()!,
      description: 'ATM 400 CONGRESS AVE AUSTIN TX',
      amount: -80,
      bankReference: 'ATM-400',
      matchStatus: 'unmatched',
    },
    {
      date: now.minus({ days: 6 }).toISODate()!,
      description: 'SUPREME BANK MONTHLY FEE',
      amount: -12,
      bankReference: 'FEE-SEP',
      matchStatus: 'unmatched',
    },
    {
      date: now.minus({ days: 8 }).toISODate()!,
      description: 'AUSTIN ENERGY AUTOPAY',
      amount: -87.32,
      bankReference: 'AE-8821',
      matchStatus: 'unmatched',
    },
    {
      date: now.minus({ days: 3 }).toISODate()!,
      description: 'VENMO *PERSONAL DINNER',
      amount: -34.5,
      bankReference: 'VENMO-19',
      matchStatus: 'ignored',
      ignoreReason: 'Personal',
    },
    {
      date: now.minus({ days: 5 }).toISODate()!,
      description: 'STARBUCKS STORE 11847',
      amount: -6.75,
      bankReference: 'SBUX-11847',
      matchStatus: 'ignored',
      ignoreReason: 'Personal',
    },
    {
      date: now.minus({ days: 4 }).toISODate()!,
      description: 'ATM 400 CONGRESS AVE AUSTIN TX',
      amount: -80,
      bankReference: 'ATM-400-DUP',
      matchStatus: 'ignored',
      ignoreReason: 'Duplicate',
      possibleDuplicate: true,
    },
  ];
  await seedFeedStatement(fyo, {
    bankAccount: bankId,
    filename: 'demo-supreme-bank.csv',
    lines: [...bankReviewed, ...bankMatchable, ...bankSynthetic],
  });

  if (!ccId) {
    return;
  }
  const ccAles = await loadMatchableAles(fyo, ccId);
  const ccReviewed = await linesFromAles(fyo, ccAles.slice(0, 2), 'matched');
  const ccMatchable = await linesFromAles(fyo, ccAles.slice(2, 4), 'unmatched');
  const ccSynthetic: SeedFeedLine[] = [
    {
      date: now.minus({ days: 1 }).toISODate()!,
      description: 'NETFLIX.COM',
      amount: -15.99,
      bankReference: 'NFX-SEP',
      matchStatus: 'unmatched',
    },
    {
      date: now.minus({ days: 3 }).toISODate()!,
      description: 'SHELL OIL 5742 AUSTIN TX',
      amount: -54.2,
      bankReference: 'SHELL-5742',
      matchStatus: 'unmatched',
    },
    {
      date: now.minus({ days: 7 }).toISODate()!,
      description: 'TARGET T-2148 AUSTIN TX',
      amount: -41.18,
      bankReference: 'TGT-2148',
      matchStatus: 'ignored',
      ignoreReason: 'Personal',
    },
  ];
  await seedFeedStatement(fyo, {
    bankAccount: ccId,
    filename: 'demo-flos-card.csv',
    lines: [...ccReviewed, ...ccMatchable, ...ccSynthetic],
  });
}

export async function seedDemoExtras(
  fyo: Fyo,
  ids: DemoIdMaps,
  notifier?: Notifier
): Promise<void> {
  notifier?.(t`Seeding opening balances`, -1);
  await seedOpeningEntry(fyo);

  notifier?.(t`Seeding credit card`, -1);
  await seedCreditCard(fyo, ids);

  notifier?.(t`Seeding payroll`, -1);
  await seedEmployeesAndPayRun(fyo, ids);

  notifier?.(t`Seeding memorized transactions`, -1);
  await seedMemorizedTemplates(fyo, ids);

  notifier?.(t`Seeding bank feeds`, -1);
  await seedBankFeeds(fyo);
}
