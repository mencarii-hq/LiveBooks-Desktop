import { Fyo, t } from 'fyo';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import type { Payment } from 'models/baseModels/Payment/Payment';
import type { PayrollProfile } from 'models/baseModels/PayrollProfile/PayrollProfile';
import {
  createRegisterPayment,
  moneyToNumber,
  resolveDefaultPaymentMethod,
} from 'src/utils/memorizedTransactions';
import type { RegisterSplitLine } from 'src/utils/memorizedTransactions';
import { getPartyNameMap } from 'src/utils/partyNames';

/**
 * Memo written on generated payroll payments. It doubles as the marker the
 * duplicate-run guard matches on, so it stays a fixed untranslated string.
 */
export const PAYROLL_MEMO = 'Payroll';

export type PayRunLineInput = {
  profileName: string;
  hours?: number;
};

export type PayRunInput = {
  payDate: string | Date;
  bankAccount: string;
  paymentMethod?: string;
  printLater?: boolean;
  lines: PayRunLineInput[];
};

export type PayRunDeductionLine = {
  account: string;
  amount: number;
  description?: string;
  deductionType: 'Fixed' | 'Percent';
};

export type PayRunComputedLine = {
  profileName: string;
  party: string;
  payType: 'Salary' | 'Hourly';
  rate: number;
  hours?: number;
  gross: number;
  deductions: PayRunDeductionLine[];
  deductionTotal: number;
  net: number;
  expenseAccount: string;
  splits: RegisterSplitLine[];
};

export type PayrollProfileLike = {
  name?: string;
  party?: string;
  payType?: string;
  rate?: unknown;
  expenseAccount?: string;
  deductions?: Array<{
    account?: string;
    deductionType?: string;
    amount?: unknown;
    description?: string;
  }>;
};

function roundToPrecision(n: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

/** The book's currency precision for pay math (SystemSettings). */
export function getPayrollPrecision(fyo: Fyo): number {
  return (fyo.singles.SystemSettings?.displayPrecision as number) ?? 2;
}

/**
 * Pure pay-line math for salary/hourly + fixed/percent deductions.
 * All amounts are rounded to `precision` (the book's currency precision) so
 * the signed split sum exactly equals the net payment amount.
 */
export function computePayRunLine(
  profile: PayrollProfileLike,
  hours?: number,
  precision = 2
): PayRunComputedLine {
  const round = (n: number) => roundToPrecision(n, precision);
  const payType = profile.payType === 'Hourly' ? 'Hourly' : 'Salary';
  const rate = moneyToNumber(profile.rate);
  if (!(rate > 0)) {
    throw new Error(t`Pay rate must be greater than 0.`);
  }

  let gross: number;
  if (payType === 'Salary') {
    gross = round(rate);
  } else {
    if (hours == null || !(hours > 0)) {
      throw new Error(t`Hours are required for hourly employees.`);
    }
    gross = round(rate * hours);
  }

  const expenseAccount = String(profile.expenseAccount || '');
  if (!expenseAccount) {
    throw new Error(t`Expense account is required.`);
  }

  const party = String(profile.party || '');
  if (!party) {
    throw new Error(t`Employee is required.`);
  }

  const deductions: PayRunDeductionLine[] = [];
  for (const row of profile.deductions ?? []) {
    const account = String(row.account || '');
    if (!account) continue;
    const deductionType = row.deductionType === 'Percent' ? 'Percent' : 'Fixed';
    const raw = moneyToNumber(row.amount);
    if (!(raw > 0)) continue;
    const amount =
      deductionType === 'Percent' ? round(gross * (raw / 100)) : round(raw);
    if (!(amount > 0)) continue;
    deductions.push({
      account,
      amount,
      description: row.description || undefined,
      deductionType,
    });
  }

  const deductionTotal = round(
    deductions.reduce((sum, d) => sum + d.amount, 0)
  );
  const net = round(gross - deductionTotal);
  if (!(net > 0)) {
    throw new Error(t`Net pay must be greater than 0.`);
  }

  const splits: RegisterSplitLine[] = [
    {
      account: expenseAccount,
      amount: gross,
      description: t`Gross wages`,
    },
    ...deductions.map((d) => ({
      account: d.account,
      amount: -d.amount,
      description: d.description || t`Payroll deduction`,
    })),
  ];

  return {
    profileName: String(profile.name || ''),
    party,
    payType,
    rate,
    hours: payType === 'Hourly' ? hours : undefined,
    gross,
    deductions,
    deductionTotal,
    net,
    expenseAccount,
    splits,
  };
}

/** ISO date (local zone) for date-only comparison of stored/input values. */
function toIsoDate(value: unknown): string {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate() ?? '';
  }
  return String(value ?? '').slice(0, 10);
}

/**
 * Parties among `partyIds` that already have a submitted, non-cancelled
 * payroll Payment (memo marker) dated `payDate`.
 */
async function getAlreadyPaidParties(
  fyo: Fyo,
  partyIds: string[],
  payDate: string | Date
): Promise<string[]> {
  const payDateIso = toIsoDate(payDate);
  const existing = (await fyo.db.getAll(ModelNameEnum.Payment, {
    fields: ['name', 'party', 'date'],
    filters: {
      memo: PAYROLL_MEMO,
      paymentType: 'Pay',
      party: ['in', partyIds],
      submitted: true,
      cancelled: false,
    },
  })) as { name: string; party: string; date: unknown }[];

  const paid = existing
    .filter((p) => toIsoDate(p.date) === payDateIso)
    .map((p) => p.party);
  return [...new Set(paid)];
}

export async function generatePayRunPayments(
  fyo: Fyo,
  input: PayRunInput
): Promise<Payment[]> {
  if (!input.bankAccount) {
    throw new Error(t`Bank account is required.`);
  }
  if (!input.lines?.length) {
    throw new Error(t`Select at least one employee.`);
  }

  const precision = getPayrollPrecision(fyo);
  const paymentMethod =
    input.paymentMethod || (await resolveDefaultPaymentMethod(fyo));
  const printLater = input.printLater ?? false;

  // Compute and validate every line before posting anything so a
  // predictable failure (disabled profile, missing hours, net <= 0)
  // can never leave a partially posted run.
  const profiles: { input: PayRunLineInput; profile: PayrollProfile }[] = [];
  for (const line of input.lines) {
    const profile = (await fyo.doc.getDoc(
      ModelNameEnum.PayrollProfile,
      line.profileName
    )) as PayrollProfile;
    profiles.push({ input: line, profile });
  }

  const partyNames = await getPartyNameMap(fyo, [
    ...new Set(
      profiles.map((p) => String(p.profile.party || '')).filter(Boolean)
    ),
  ]);
  const displayName = (partyId: string) => partyNames.get(partyId) || partyId;

  const computedLines: PayRunComputedLine[] = [];
  const problems: string[] = [];
  const seenParties = new Set<string>();
  for (const { input: line, profile } of profiles) {
    const label = displayName(String(profile.party || line.profileName));

    if (profile.disabled) {
      problems.push(t`${label}: pay setup is disabled for this employee.`);
      continue;
    }

    let computed: PayRunComputedLine;
    try {
      computed = computePayRunLine(profile, line.hours, precision);
    } catch (error) {
      problems.push(`${label}: ${(error as Error).message}`);
      continue;
    }

    if (seenParties.has(computed.party)) {
      problems.push(t`${label}: employee appears more than once in this run.`);
      continue;
    }
    seenParties.add(computed.party);
    computedLines.push(computed);
  }

  if (problems.length) {
    throw new Error(
      t`No payments were created. Fix these lines and retry:` +
        '\n' +
        problems.join('\n')
    );
  }

  const partyIds = computedLines.map((l) => l.party);

  // Duplicate-run guard: block a second run for anyone already paid via a
  // payroll payment on the same pay date.
  const alreadyPaid = await getAlreadyPaidParties(fyo, partyIds, input.payDate);
  if (alreadyPaid.length) {
    const names = alreadyPaid.map(displayName).join(', ');
    throw new Error(
      t`No payments were created. Already paid on ${toIsoDate(
        input.payDate
      )}: ${names}. Cancel those payments or choose a different pay date.`
    );
  }

  const created: Payment[] = [];
  try {
    for (const line of computedLines) {
      const payment = await createRegisterPayment(fyo, {
        date: input.payDate,
        party: displayName(line.party),
        partyId: line.party,
        categoryAccount: line.expenseAccount,
        bankAccount: input.bankAccount,
        amount: line.net,
        paymentType: 'Pay',
        memo: PAYROLL_MEMO,
        paymentMethod,
        printLater,
        splits: line.splits,
      });
      created.push(payment);
    }
  } catch (error) {
    // Unexpected posting failure: report exactly how far the run got so the
    // user knows which payments now exist before retrying.
    const err = error as Error;
    const createdNames = created.map((p) => String(p.name)).join(', ');
    err.message =
      t`Pay run stopped after creating ${String(created.length)} of ${String(
        computedLines.length
      )} payments${createdNames ? ` (${createdNames})` : ''}.` +
      ' ' +
      err.message;
    throw err;
  }

  return created;
}
