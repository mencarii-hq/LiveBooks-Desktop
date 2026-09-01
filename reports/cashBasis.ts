import { t } from 'fyo';
import { AccountRootTypeEnum } from 'models/baseModels/Account/types';
import { ModelNameEnum } from 'models/types';
import {
  Account,
  AccountNameValueMapMap,
  DateRange,
  LedgerEntry,
  ValueMap,
} from 'reports/types';

export type ReportBasis = 'Accrual' | 'Cash';

export const UNAPPLIED_CASH_INCOME = 'Unapplied Cash Payment Income';
export const UNAPPLIED_CASH_EXPENSE = 'Unapplied Cash Payment Expense';
export const CASH_BASIS_NET_INCOME = 'Cash Basis Net Income';

export const BASIS_HELP = t`Cash: income and expenses count when money changes hands. Accrual: they count when invoiced/billed.`;

export const SQLITE_IN_CHUNK = 500;

const INVOICE_TYPES = new Set<string>([
  ModelNameEnum.SalesInvoice,
  ModelNameEnum.PurchaseInvoice,
]);

/**
 * Loyalty-point redemption is a non-cash settlement slice. Those expense
 * legs are excluded from payment-date scaling; the leftover party net goes
 * to Unapplied Cash Payment Income / Expense so cash P&L still nets to cash.
 */

export type CashBasisPayment = {
  name: string;
  date: Date;
  paymentType: 'Receive' | 'Pay';
  amount: number;
};

export type CashBasisPaymentFor = {
  parent: string;
  referenceType: string;
  referenceName: string;
  amount: number;
};

export type CashBasisInvoice = {
  name: string;
  schemaName: string;
  baseGrandTotal: number;
  exchangeRate: number;
};

export type PartyAccountKind = 'Receivable' | 'Payable';

export type CashBasisInput = {
  entries: LedgerEntry[];
  payments: CashBasisPayment[];
  paymentFor: CashBasisPaymentFor[];
  invoiceEntries: LedgerEntry[];
  invoices: CashBasisInvoice[];
  partyAccounts: Map<string, PartyAccountKind>;
  excludeAccounts?: Set<string>;
};

export function invoiceLookupKey(
  referenceType: string,
  referenceName: string
): string {
  return `${referenceType}::${referenceName}`;
}

export function isSyntheticCashBasisAccount(name: string): boolean {
  return (
    name === UNAPPLIED_CASH_INCOME ||
    name === UNAPPLIED_CASH_EXPENSE ||
    name === CASH_BASIS_NET_INCOME
  );
}

export function syntheticAccountHelp(name: string): string {
  if (name === UNAPPLIED_CASH_INCOME) {
    return t`Money received that is not applied to an invoice yet.`;
  }
  if (name === UNAPPLIED_CASH_EXPENSE) {
    return t`Money paid that is not applied to a bill yet.`;
  }
  return '';
}

export function getBasisLabel(basis?: string | null): string {
  if (basis === 'Cash') {
    return t`Cash basis`;
  }
  if (basis === 'Accrual') {
    return t`Accrual basis`;
  }
  return '';
}

export function csvBasisHeader(basis?: string | null): unknown[][] {
  const label = getBasisLabel(basis);
  return label ? [[label], []] : [];
}

export function getBasisBadge(basis?: string | null): string {
  if (basis === 'Cash') {
    return t`Cash Basis`;
  }
  if (basis === 'Accrual') {
    return t`Accrual Basis`;
  }
  return '';
}

export function roundMoney(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * PaymentFor.amount is treated as company (base) currency. Do not infer
 * invoice-currency rows from magnitude: a 50% base partial on an FX invoice
 * equals the foreign grand total and would get doubled. Return auto-pay
 * writes baseGrandTotal into PaymentFor so FX refunds scale 1:1.
 */
export function allocatedBaseAmount(
  paymentForAmount: number,
  _invoice: Pick<CashBasisInvoice, 'baseGrandTotal' | 'exchangeRate'>
): number {
  void _invoice;
  return paymentForAmount;
}

export function injectSyntheticCashBasisAccounts(
  accountMap: Record<string, Account>
): void {
  const incomeRoot = Object.values(accountMap).find(
    (account) =>
      account.rootType === AccountRootTypeEnum.Income && !account.parentAccount
  );
  const expenseRoot = Object.values(accountMap).find(
    (account) =>
      account.rootType === AccountRootTypeEnum.Expense && !account.parentAccount
  );

  if (!accountMap[UNAPPLIED_CASH_INCOME]) {
    accountMap[UNAPPLIED_CASH_INCOME] = {
      name: UNAPPLIED_CASH_INCOME,
      accountName: UNAPPLIED_CASH_INCOME,
      rootType: AccountRootTypeEnum.Income,
      isGroup: false,
      parentAccount: incomeRoot?.name ?? null,
    };
  }

  if (!accountMap[UNAPPLIED_CASH_EXPENSE]) {
    accountMap[UNAPPLIED_CASH_EXPENSE] = {
      name: UNAPPLIED_CASH_EXPENSE,
      accountName: UNAPPLIED_CASH_EXPENSE,
      rootType: AccountRootTypeEnum.Expense,
      isGroup: false,
      parentAccount: expenseRoot?.name ?? null,
    };
  }
}

export function injectCashBasisNetIncomeAccount(
  accountMap: Record<string, Account>
): void {
  const equityRoot = Object.values(accountMap).find(
    (account) =>
      account.rootType === AccountRootTypeEnum.Equity && !account.parentAccount
  );

  if (!accountMap[CASH_BASIS_NET_INCOME]) {
    accountMap[CASH_BASIS_NET_INCOME] = {
      name: CASH_BASIS_NET_INCOME,
      accountName: CASH_BASIS_NET_INCOME,
      rootType: AccountRootTypeEnum.Equity,
      isGroup: false,
      parentAccount: equityRoot?.name ?? null,
    };
  }
}

export function removeSyntheticCashBasisAccounts(
  accountMap: Record<string, Account>
): void {
  delete accountMap[UNAPPLIED_CASH_INCOME];
  delete accountMap[UNAPPLIED_CASH_EXPENSE];
  delete accountMap[CASH_BASIS_NET_INCOME];
}

export function netIncomeValueMap(
  rangeGroupedMap: AccountNameValueMapMap,
  accountMap: Record<string, Account>,
  dateRanges: DateRange[]
): ValueMap {
  const ni: ValueMap = new Map();
  for (const range of dateRanges) {
    ni.set(range, { balance: 0 });
  }

  for (const [account, valueMap] of rangeGroupedMap) {
    if (account === CASH_BASIS_NET_INCOME) {
      continue;
    }
    const rootType = accountMap[account]?.rootType;
    if (
      rootType !== AccountRootTypeEnum.Income &&
      rootType !== AccountRootTypeEnum.Expense
    ) {
      continue;
    }

    for (const range of dateRanges) {
      const bal = valueMap.get(range)?.balance ?? 0;
      const current = ni.get(range)?.balance ?? 0;
      ni.set(range, {
        balance:
          rootType === AccountRootTypeEnum.Income
            ? current + bal
            : current - bal,
      });
    }
  }

  return ni;
}

export async function fetchInChunks<T>(
  names: string[],
  fetchChunk: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < names.length; i += SQLITE_IN_CHUNK) {
    const chunk = names.slice(i, i + SQLITE_IN_CHUNK);
    if (!chunk.length) {
      continue;
    }
    out.push(...(await fetchChunk(chunk)));
  }
  return out;
}

export function transformToCashBasis(input: CashBasisInput): LedgerEntry[] {
  const {
    entries,
    payments,
    paymentFor,
    invoiceEntries,
    invoices,
    partyAccounts,
    excludeAccounts = new Set<string>(),
  } = input;

  const paymentByName = new Map(
    payments.map((payment) => [payment.name, payment])
  );
  const invoiceByKey = new Map(
    invoices.map((invoice) => [
      invoiceLookupKey(invoice.schemaName, invoice.name),
      invoice,
    ])
  );
  const invoiceEntriesByKey = groupInvoiceEntries(invoiceEntries);
  const paymentForByParent = groupPaymentFor(paymentFor);
  const paymentEntriesByName = groupPaymentEntries(entries);

  const result: LedgerEntry[] = [];
  const consumedPayments = new Set<string>();
  let nextSyntheticName = -1;

  for (const entry of entries) {
    if (INVOICE_TYPES.has(entry.referenceType)) {
      continue;
    }

    if (entry.referenceType !== ModelNameEnum.Payment) {
      result.push(entry);
      continue;
    }

    if (consumedPayments.has(entry.referenceName)) {
      continue;
    }
    consumedPayments.add(entry.referenceName);

    const paymentEntries = paymentEntriesByName.get(entry.referenceName) ?? [];

    const hasPartyLeg = paymentEntries.some((row) =>
      partyAccounts.has(row.account)
    );
    if (!hasPartyLeg) {
      result.push(...paymentEntries);
      continue;
    }

    const payment =
      paymentByName.get(entry.referenceName) ??
      inferPaymentFromEntries(
        entry.referenceName,
        paymentEntries,
        partyAccounts
      );
    const datedPayment: CashBasisPayment = {
      ...payment,
      date: paymentEntries[0]?.date ?? payment.date,
    };

    result.push(
      ...paymentEntries.filter((row) => !partyAccounts.has(row.account))
    );

    const allocations = paymentForByParent.get(payment.name) ?? [];
    let scaledDrCr = 0;

    for (const row of allocations) {
      const key = invoiceLookupKey(row.referenceType, row.referenceName);
      const invoice = invoiceByKey.get(key);
      const invoiceLegs = invoiceEntriesByKey.get(key) ?? [];
      if (!invoice || !invoice.baseGrandTotal || !invoiceLegs.length) {
        continue;
      }

      const allocated = allocatedBaseAmount(row.amount, invoice);
      if (!allocated) {
        continue;
      }
      const ratio = allocated / invoice.baseGrandTotal;

      const scaled = invoiceLegs
        .filter(
          (leg) =>
            !partyAccounts.has(leg.account) && !excludeAccounts.has(leg.account)
        )
        .map((leg) =>
          cloneAsPaymentLeg(leg, datedPayment, nextSyntheticName--, ratio)
        );

      const targetNet =
        invoiceNonPartyNet(invoiceLegs, partyAccounts, excludeAccounts) * ratio;
      renormalizeLegs(scaled, targetNet);
      scaledDrCr = roundMoney(
        scaledDrCr +
          scaled.reduce(
            (sum, leg) => sum + (leg.debit ?? 0) - (leg.credit ?? 0),
            0
          )
      );
      result.push(...scaled);
    }

    const remainder = roundMoney(
      partyNet(paymentEntries, partyAccounts) - scaledDrCr
    );
    if (Math.abs(remainder) < 0.005) {
      continue;
    }

    result.push(
      makeUnappliedLeg(
        datedPayment,
        remainder,
        nextSyntheticName--,
        partyKind(paymentEntries, partyAccounts)
      )
    );
  }

  return result;
}

function groupInvoiceEntries(
  entries: LedgerEntry[]
): Map<string, LedgerEntry[]> {
  const map = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const key = invoiceLookupKey(entry.referenceType, entry.referenceName);
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }
  return map;
}

function groupPaymentEntries(
  entries: LedgerEntry[]
): Map<string, LedgerEntry[]> {
  const map = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    if (entry.referenceType !== ModelNameEnum.Payment) {
      continue;
    }
    const list = map.get(entry.referenceName) ?? [];
    list.push(entry);
    map.set(entry.referenceName, list);
  }
  return map;
}

function groupPaymentFor(
  rows: CashBasisPaymentFor[]
): Map<string, CashBasisPaymentFor[]> {
  const map = new Map<string, CashBasisPaymentFor[]>();
  for (const row of rows) {
    const list = map.get(row.parent) ?? [];
    list.push(row);
    map.set(row.parent, list);
  }
  return map;
}

function inferPaymentFromEntries(
  name: string,
  paymentEntries: LedgerEntry[],
  partyAccounts: Map<string, PartyAccountKind>
): CashBasisPayment {
  const party = partyNet(paymentEntries, partyAccounts);
  return {
    name,
    date: paymentEntries[0]?.date ?? new Date(),
    paymentType: party < 0 ? 'Receive' : 'Pay',
    amount: Math.abs(party),
  };
}

function partyKind(
  entries: LedgerEntry[],
  partyAccounts: Map<string, PartyAccountKind>
): PartyAccountKind {
  for (const entry of entries) {
    const kind = partyAccounts.get(entry.account);
    if (kind) {
      return kind;
    }
  }
  return 'Receivable';
}

function partyNet(
  entries: LedgerEntry[],
  partyAccounts: Map<string, PartyAccountKind>
): number {
  return entries
    .filter((entry) => partyAccounts.has(entry.account))
    .reduce((sum, entry) => sum + (entry.debit ?? 0) - (entry.credit ?? 0), 0);
}

function invoiceNonPartyNet(
  entries: LedgerEntry[],
  partyAccounts: Map<string, PartyAccountKind>,
  excludeAccounts: Set<string> = new Set()
): number {
  return entries
    .filter(
      (entry) =>
        !partyAccounts.has(entry.account) && !excludeAccounts.has(entry.account)
    )
    .reduce((sum, entry) => sum + (entry.credit ?? 0) - (entry.debit ?? 0), 0);
}

function cloneAsPaymentLeg(
  source: LedgerEntry,
  payment: CashBasisPayment,
  name: number,
  ratio: number
): LedgerEntry {
  return {
    name,
    account: source.account,
    date: payment.date,
    debit: roundMoney((source.debit ?? 0) * ratio),
    credit: roundMoney((source.credit ?? 0) * ratio),
    balance: 0,
    referenceType: ModelNameEnum.Payment,
    referenceName: payment.name,
    party: source.party,
    reverted: false,
    reverts: '',
  };
}

function renormalizeLegs(legs: LedgerEntry[], targetNet: number): void {
  if (!legs.length) {
    return;
  }

  const actual = legs.reduce(
    (sum, leg) => sum + (leg.credit ?? 0) - (leg.debit ?? 0),
    0
  );
  const drift = roundMoney(targetNet - actual);
  if (Math.abs(drift) < 0.0001) {
    return;
  }

  let best = 0;
  let bestMag = -1;
  for (let i = 0; i < legs.length; i++) {
    const mag = Math.abs((legs[i].credit ?? 0) - (legs[i].debit ?? 0));
    if (mag >= bestMag) {
      bestMag = mag;
      best = i;
    }
  }

  const leg = legs[best];
  const net = (leg.credit ?? 0) - (leg.debit ?? 0);
  if (net >= 0) {
    leg.credit = roundMoney((leg.credit ?? 0) + drift);
  } else {
    leg.debit = roundMoney((leg.debit ?? 0) - drift);
  }
}

function makeUnappliedLeg(
  payment: CashBasisPayment,
  remainder: number,
  name: number,
  kind: PartyAccountKind
): LedgerEntry {
  const amount = Math.abs(remainder);
  return {
    name,
    account:
      kind === 'Payable' ? UNAPPLIED_CASH_EXPENSE : UNAPPLIED_CASH_INCOME,
    date: payment.date,
    debit: remainder > 0 ? amount : 0,
    credit: remainder < 0 ? amount : 0,
    balance: 0,
    referenceType: ModelNameEnum.Payment,
    referenceName: payment.name,
    party: '',
    reverted: false,
    reverts: '',
  };
}
