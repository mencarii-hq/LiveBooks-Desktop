import { Fyo, t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import type { MemorizedTransaction } from 'models/baseModels/MemorizedTransaction/MemorizedTransaction';
import type { Payment } from 'models/baseModels/Payment/Payment';
import { showDialog, showToast } from 'src/utils/interactive';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getPartyNameMap, partyLabel } from 'src/utils/partyNames';
import { getFormRoute, routeTo } from 'src/utils/ui';
import { isUuidDocId } from 'utils/ids';
import { partyRoleFitsPaymentType } from 'src/utils/registerRows';

/**
 * #7 — day-scoped snooze. Dismissing "These are due" silences that exact due
 * set (same templates + due dates) for the rest of the day, across restarts.
 * A new or changed due item re-prompts; a new day re-prompts.
 * Stored per company so alternating books on the same day keep separate dismissals.
 */
const DUE_SNOOZE_KEY = 'memorizedDueSnooze';
let duePromptCreateLock = false;

type DueSnooze = { company: string; date: string; signature: string };

function snoozeStorageKey(company: string): string {
  return `${DUE_SNOOZE_KEY}:${company || 'default'}`;
}

function readDueSnooze(company: string): DueSnooze | null {
  try {
    const raw =
      localStorage.getItem(snoozeStorageKey(company)) ??
      // Migrate pre–per-company key if it matches this company.
      localStorage.getItem(DUE_SNOOZE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DueSnooze;
    if (parsed.company && parsed.company !== company) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDueSnooze(snooze: DueSnooze): void {
  try {
    localStorage.setItem(
      snoozeStorageKey(snooze.company),
      JSON.stringify(snooze)
    );
    localStorage.removeItem(DUE_SNOOZE_KEY);
  } catch {
    /* snooze is best-effort */
  }
}

function dueSignature(due: MemorizedTransaction[]): string {
  return due
    .map((d) => `${String(d.name)}@${String(d.nextDueDate ?? '').slice(0, 10)}`)
    .sort()
    .join('|');
}

/** #8: one category line of a split register entry. */
export type RegisterSplitLine = {
  account: string;
  amount: number;
  description?: string;
};

export type RegisterPaymentFields = {
  date: string | Date;
  party: string;
  /**
   * Known Party id. When set, it is used directly and `party` (payee text)
   * is never matched or auto-created — callers that already hold the exact
   * Party (e.g. payroll profiles) must pass this so a payee-text mismatch
   * cannot create a stray Party.
   */
  partyId?: string;
  categoryAccount: string;
  bankAccount: string;
  amount: number;
  paymentType: 'Pay' | 'Receive';
  memo?: string;
  paymentMethod?: string;
  /** Queue for batch check printing (only honored for Pay + Check — Q-AF). */
  printLater?: boolean;
  /**
   * #3: manually entered check number for an already-written check (Pay +
   * Check, not queued). Rejected if already used or voided on the bank
   * account; the print sequence auto-advances past manually used numbers.
   */
  checkNumber?: string;
  /**
   * Bank / Transfer / ACH / EFT reference. Not unique. Blank defaults to
   * the payment method label so `validateReferencesAreSet` is satisfied
   * without writing Pay-___ into a user-facing Number column.
   */
  bankReference?: string;
  /**
   * #8: split the category side into multiple lines (2+ signed rows whose
   * sum equals `amount`; negative rows are withholdings that reduce the
   * check). When set, `categoryAccount` may be empty — the first positive
   * split's account stands in for it on account/paymentAccount.
   */
  splits?: RegisterSplitLine[];
};

/**
 * Usable split rows: 2+ lines each with an account and a nonzero amount.
 * Amounts are signed — negative lines reduce the check (withholdings).
 */
function normalizeSplits(
  splits: RegisterSplitLine[] | undefined
): RegisterSplitLine[] {
  const rows = (splits ?? []).filter((s) => s.account && s.amount !== 0);
  return rows.length >= 2 ? rows : [];
}

/** The account standing in for the single category field: first positive line. */
function splitCategoryAccount(splits: RegisterSplitLine[]): string {
  return (splits.find((s) => s.amount > 0) ?? splits[0]).account;
}

/** Coerce a pesa Money, numeric string, or number to a JS number. */
export function moneyToNumber(value: unknown): number {
  const money = value as { float?: number } | null | undefined;
  if (typeof money?.float === 'number') {
    return money.float;
  }
  return Number(String(value ?? 0)) || 0;
}

/** True when the resolved payment method is a Check-type method. */
export async function isCheckMethod(
  fyo: Fyo,
  methodName: string
): Promise<boolean> {
  if (!methodName) return false;
  if (methodName.trim().toLowerCase() === 'check') return true;
  try {
    const type = await fyo.getValue(
      ModelNameEnum.PaymentMethod,
      methodName,
      'type'
    );
    return type === 'Check';
  } catch {
    return false;
  }
}

/**
 * Bank register defaults to Check. Credit-card register defaults to Transfer
 * (never Check/Bank — those surface check # / clearance-date fields the
 * Write Entry form does not collect).
 */
export async function resolveDefaultPaymentMethod(
  fyo: Fyo,
  opts?: { forCreditCard?: boolean }
): Promise<string> {
  try {
    const methods = (await fyo.db.getAll(ModelNameEnum.PaymentMethod, {
      fields: ['name', 'type'],
      orderBy: 'name',
      order: 'asc',
    })) as { name: string; type?: string }[];
    const byType = (type: string) => methods.find((m) => m.type === type);
    const byName = (name: string) =>
      methods.find((m) => m.name.trim().toLowerCase() === name);

    if (opts?.forCreditCard) {
      return (
        byType('Transfer')?.name ||
        byName('transfer')?.name ||
        byName('cash')?.name ||
        methods.find((m) => m.type !== 'Check' && m.type !== 'Bank')?.name ||
        methods[0]?.name ||
        'Transfer'
      );
    }

    return (
      byType('Check')?.name ||
      byName('check')?.name ||
      byName('cash')?.name ||
      byType('Bank')?.name ||
      methods[0]?.name ||
      'Check'
    );
  } catch {
    return opts?.forCreditCard ? 'Transfer' : 'Check';
  }
}

/** Create + submit a register-style Payment (empty for[], Cash method). */
function normalizeRegisterPaymentType(
  value: string | undefined
): 'Pay' | 'Receive' {
  if (value === 'Receive' || value === 'Deposit') {
    return 'Receive';
  }
  // Pay, Payment, or anything else defaults to Pay
  return 'Pay';
}

export async function createRegisterPayment(
  fyo: Fyo,
  fields: RegisterPaymentFields
): Promise<Payment> {
  if (!(fields.amount > 0)) {
    throw new Error(t`Amount must be greater than 0.`);
  }

  // R2: register entries default to Check when no method is supplied.
  const paymentMethod =
    fields.paymentMethod || (await resolveDefaultPaymentMethod(fyo));

  const paymentType = normalizeRegisterPaymentType(fields.paymentType);

  const partyId =
    fields.partyId || (await ensurePartyExists(fyo, fields.party));
  await assertPartyFitsPaymentType(fyo, partyId, paymentType);

  // #8: with splits, the first positive split's account stands in for the
  // single category field so account/paymentAccount stay valid for old code
  // paths.
  const splits = normalizeSplits(fields.splits);
  const categoryAccount = splits.length
    ? splitCategoryAccount(splits)
    : fields.categoryAccount;

  // Pay: credit register account, debit category (paymentAccount)
  // Receive: debit register account, credit category (account)
  // CreditCard: Charge=Pay (credit liability), Payment=Receive (debit liability).
  // Pay-the-card from bank: Pay with bankAccount=Bank and category=CreditCard.
  const account = paymentType === 'Pay' ? fields.bankAccount : categoryAccount;
  const paymentAccount =
    paymentType === 'Pay' ? categoryAccount : fields.bankAccount;

  const wantQueue = !!fields.printLater;
  const isCheck = await isCheckMethod(fyo, paymentMethod);
  // Q-AF: only Pay + Check entries can be queued for printing.
  const queue = wantQueue && paymentType === 'Pay' && isCheck;

  // #3: manual check number for an already-written check. Only meaningful
  // for Pay + Check and never for queued items (print assigns those).
  let manualCheckNumber = '';
  if (!queue && paymentType === 'Pay' && isCheck && fields.checkNumber) {
    const { getUsedCheckNumbers, normalizeCheckNumber } = await import(
      'src/utils/checkPrint/numbering'
    );
    manualCheckNumber = normalizeCheckNumber(fields.checkNumber);
    if (manualCheckNumber) {
      const used = await getUsedCheckNumbers(fyo, fields.bankAccount);
      if (used.has(manualCheckNumber)) {
        // Reject duplicates (incl. voided numbers). Print numbering already
        // auto-advances past manually used numbers, so no sequence bump here.
        throw new Error(
          t`Check number ${manualCheckNumber} is already used on this bank account.`
        );
      }
    }
  }

  // Do not seed paymentType before party: party formulas used to force
  // Receive for Customer/Both and would overwrite Pay.
  const doc = fyo.doc.getNewDoc(ModelNameEnum.Payment, {
    date: fields.date,
    paymentMethod,
    amount: fyo.pesa(fields.amount),
    memo: fields.memo || '',
    for: [],
  }) as Payment;

  await doc.set('paymentMethod', paymentMethod);
  await doc.set('date', fields.date);
  await doc.set('amount', fyo.pesa(fields.amount));
  await doc.set('memo', fields.memo || '');
  await doc.set('party', partyId);
  // Set type AFTER party so role-based formulas cannot win.
  await doc.set('paymentType', paymentType);
  // Set accounts after type so account formulas see the correct Pay/Receive.
  await doc.set('account', account);
  await doc.set('paymentAccount', paymentAccount);

  // #8: the split rows replace the single category leg at posting time
  // (Payment.getPosting); the bank leg stays a single full-amount leg.
  for (const split of splits) {
    await doc.append('splits', {
      account: split.account,
      amount: fyo.pesa(split.amount),
      description: split.description || '',
    });
  }

  // Do not auto-assign a check number on Save. Numbering happens on print
  // (or when the user types referenceId). Unticked Print later = unprinted
  // until then — not the old handwritten / already-printed path.
  // Final guards: sync _preSync runs formulas; keep register values.
  // Direct assign so _canSet / formula side-effects cannot drop printLater
  // or replace the selected bank with Bank[0] from the account formula.
  doc.paymentType = paymentType;
  doc.account = account;
  doc.paymentAccount = paymentAccount;
  doc.printLater = queue;
  if (queue) {
    doc.referenceId = '';
  } else if (manualCheckNumber) {
    doc.referenceId = manualCheckNumber;
  }
  // Transfer/Bank methods are type Bank in PaymentMethod (demo + patch).
  // Write Entry does not collect clearanceDate / referenceId; without
  // these, submit throws "Clearance Date not set."
  const methodType = (await doc.paymentMethodDoc())?.type;
  if (methodType === 'Bank') {
    doc.clearanceDate = doc.date ?? fields.date;
    if (!isCheck) {
      const typedRef = (fields.bankReference || '').trim();
      doc.referenceId = typedRef || String(fields.paymentMethod || '').trim();
    }
  }
  await doc.sync();
  await doc.submit();

  // Queue path: re-assert after submit in case sync/submit round-tripped
  // printLater back to the schema default (false).
  if (queue && !doc.printLater) {
    await doc.set('printLater', true);
    await doc.sync();
  }

  return doc;
}

async function assertPartyFitsPaymentType(
  fyo: Fyo,
  partyId: string,
  paymentType: 'Pay' | 'Receive'
): Promise<void> {
  const role = (await fyo.getValue(ModelNameEnum.Party, partyId, 'role')) as
    | string
    | undefined;
  if (!partyRoleFitsPaymentType(role, paymentType)) {
    throw new Error(
      paymentType === 'Pay'
        ? t`Payee must be a vendor, employee, contractor, or Both.`
        : t`Payor must be a customer or Both.`
    );
  }
}

async function ensurePartyExists(fyo: Fyo, partyName: string): Promise<string> {
  const trimmed = partyName.trim();
  const parties = (await fyo.db.getAll(ModelNameEnum.Party, {
    fields: ['name', 'partyName'],
  })) as { name: string; partyName?: string }[];

  // Link fields store Party.name (UUID). Never treat that as a display name
  // or create a new Party whose partyName is a UUID.
  const byId = parties.find((party) => party.name === trimmed);
  if (byId) {
    return byId.name;
  }

  const normalized = trimmed.toLowerCase();
  const match = parties.find(
    (party) => party.partyName?.trim().toLowerCase() === normalized
  );
  if (match) {
    return match.name;
  }

  // Refuse to persist a UUID as partyName (would show as payee UUID in UI).
  if (isUuidDocId(trimmed)) {
    throw new Error(t`Payee not found.`);
  }

  const party = fyo.doc.getNewDoc(ModelNameEnum.Party, {
    partyName: trimmed,
    role: 'Both',
  });
  await party.sync();
  return party.name as string;
}

export async function memorizePayment(
  fyo: Fyo,
  payment: Payment
): Promise<void> {
  // Invoice-allocated payments use AR/AP accounts, not register bank/category
  // pairs; Create next would post an unlinked payment. Use Bank Register instead.
  if (payment.for?.length) {
    await showDialog({
      title: t`Cannot make recurring`,
      detail: t`Invoice payments cannot be made recurring. Use Check Register for recurring payees.`,
      type: 'error',
    });
    return;
  }

  const paymentType = (payment.paymentType as 'Pay' | 'Receive') || 'Pay';
  const bankAccount =
    paymentType === 'Pay'
      ? (payment.account as string)
      : (payment.paymentAccount as string);
  const categoryAccount =
    paymentType === 'Pay'
      ? (payment.paymentAccount as string)
      : (payment.account as string);

  const amount = payment.amount;
  if (!payment.party || !bankAccount || !categoryAccount || !amount) {
    await showDialog({
      title: t`Cannot make recurring`,
      detail: t`Payee, accounts, and amount are required.`,
      type: 'error',
    });
    return;
  }

  const partyId = String(payment.party);
  const partyNames = await getPartyNameMap(fyo, [partyId]);
  const doc = fyo.doc.getNewDoc(ModelNameEnum.MemorizedTransaction, {
    title: partyLabel(partyNames, partyId),
    party: partyId,
    paymentType,
    fromAccount: payment.account as string,
    toAccount: payment.paymentAccount as string,
    amount,
    memo: payment.memo || payment.referenceId || '',
    frequency: 'Monthly',
    paymentMethod:
      (payment.paymentMethod as string) ||
      (await resolveDefaultPaymentMethod(fyo)),
    nextDueDate: DateTime.now().plus({ months: 1 }).toISODate(),
  });

  // #8: carry split lines into the template so recurring runs re-split.
  for (const split of payment.splits ?? []) {
    await doc.append('splits', {
      account: split.account,
      amount: split.amount,
      description: split.description || '',
    });
  }

  await doc.sync();
  showToast({
    type: 'success',
    message: t`Memorized transaction saved`,
  });
  await routeTo(
    getFormRoute(ModelNameEnum.MemorizedTransaction, String(doc.name))
  );
}

export function memorizeFieldsError(
  fields: Pick<RegisterPaymentFields, 'amount' | 'party'>
): string {
  if (!(fields.amount > 0) || !String(fields.party || '').trim()) {
    return t`Payee and amount are required.`;
  }
  return '';
}

/** Route to Write Entry prefilled from a template. Check # is never copied. */
export function writeEntryRouteFromMemorized(mt: {
  name?: string;
  paymentType?: string;
  fromAccount?: string;
  toAccount?: string;
}): { path: string; query: Record<string, string> } {
  const paymentType = mt.paymentType === 'Receive' ? 'Receive' : 'Pay';
  const bankAccount =
    paymentType === 'Pay'
      ? String(mt.fromAccount || '')
      : String(mt.toAccount || '');
  return {
    path: '/bank-register/write',
    query: {
      account: bankAccount,
      type: paymentType === 'Receive' ? 'deposit' : '',
      fromMemorized: String(mt.name || ''),
    },
  };
}

export async function memorizeRegisterFields(
  fyo: Fyo,
  fields: RegisterPaymentFields,
  options?: { openEditor?: boolean }
): Promise<boolean> {
  const precheck = memorizeFieldsError(fields);
  if (precheck) {
    await showDialog({
      title: t`Cannot save recurring template`,
      detail: precheck,
      type: 'error',
    });
    return false;
  }

  // Prefer explicit partyId (Link stores Party.name UUID). Never use the
  // UUID as the template title — resolve the display partyName instead.
  const partyId =
    fields.partyId || (await ensurePartyExists(fyo, fields.party));
  const partyNames = await getPartyNameMap(fyo, [partyId]);
  const title =
    partyLabel(partyNames, partyId) ||
    (!isUuidDocId(fields.party.trim()) ? fields.party.trim() : '');
  if (!title) {
    await showDialog({
      title: t`Cannot save recurring template`,
      detail: t`Payee and amount are required.`,
      type: 'error',
    });
    return false;
  }

  // #8: with splits, the first positive split's account stands in for the
  // single category account (same convention as createRegisterPayment).
  const splits = normalizeSplits(fields.splits);
  const categoryAccount = splits.length
    ? splitCategoryAccount(splits)
    : fields.categoryAccount;

  const account =
    fields.paymentType === 'Pay' ? fields.bankAccount : categoryAccount;
  const paymentAccount =
    fields.paymentType === 'Pay' ? categoryAccount : fields.bankAccount;

  const doc = fyo.doc.getNewDoc(ModelNameEnum.MemorizedTransaction, {
    title,
    party: partyId,
    paymentType: fields.paymentType,
    fromAccount: account,
    toAccount: paymentAccount,
    amount: fyo.pesa(fields.amount),
    memo: fields.memo || '',
    frequency: 'Monthly',
    paymentMethod:
      fields.paymentMethod || (await resolveDefaultPaymentMethod(fyo)),
    nextDueDate: DateTime.now().plus({ months: 1 }).toISODate(),
  });

  for (const split of splits) {
    await doc.append('splits', {
      account: split.account,
      amount: fyo.pesa(split.amount),
      description: split.description || '',
    });
  }

  await doc.sync();
  const openEditor = options?.openEditor !== false;
  if (openEditor) {
    // Template-only path: make clear nothing hit the register.
    showToast({
      type: 'success',
      message: t`Memorized transaction saved — no payment posted`,
    });
    await routeTo(
      getFormRoute(ModelNameEnum.MemorizedTransaction, String(doc.name))
    );
  }
  // When openEditor is false, caller posts a payment too and owns the toast.
  return true;
}

export async function createPaymentFromMemorized(
  fyo: Fyo,
  mt: MemorizedTransaction | Doc,
  options?: { date?: string | Date }
): Promise<Payment> {
  const paymentType = (mt.paymentType as 'Pay' | 'Receive') || 'Pay';
  const amountMoney = mt.amount as { float?: number; toString?: () => string };
  const amount =
    typeof (amountMoney as { float?: number }).float === 'number'
      ? (amountMoney as { float: number }).float
      : Number(String(mt.amount ?? 0));

  const fromAccount = mt.fromAccount as string;
  const toAccount = mt.toAccount as string;
  const bankAccount = paymentType === 'Pay' ? fromAccount : toAccount;
  const categoryAccount = paymentType === 'Pay' ? toAccount : fromAccount;

  // #8: templates memorized with splits re-split each occurrence.
  const splits = ((mt as MemorizedTransaction).splits ?? []).map((row) => ({
    account: (row.account as string) || '',
    amount: moneyToNumber(row.amount),
    description: (row.description as string) || '',
  }));

  // Prefer explicit date; else due date at "now" clock time; else now.
  let date: string | Date =
    options?.date ||
    (mt.nextDueDate as string | Date | undefined) ||
    DateTime.now().toJSDate();

  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    const now = DateTime.now();
    date = DateTime.fromISO(date.trim())
      .set({
        hour: now.hour,
        minute: now.minute,
        second: now.second,
        millisecond: now.millisecond,
      })
      .toJSDate();
  }

  return await createRegisterPayment(fyo, {
    date,
    party: mt.party as string,
    categoryAccount,
    bankAccount,
    amount,
    paymentType,
    memo: (mt.memo as string) || '',
    paymentMethod: (mt.paymentMethod as string) || undefined,
    splits: splits.length ? splits : undefined,
  });
}

/** Post one occurrence now (real datetime) and advance nextDueDate. */
export async function runMemorizedNow(
  fyo: Fyo,
  mt: MemorizedTransaction | Doc
): Promise<Payment> {
  const payment = await createPaymentFromMemorized(fyo, mt, {
    date: DateTime.now().toJSDate(),
  });
  await advanceNextDueDate(mt);
  return payment;
}

export async function advanceNextDueDate(
  mt: MemorizedTransaction | Doc
): Promise<void> {
  await mt.setAndSync('nextDueDate', computeNextDueISO(mt));
}

/**
 * Next schedule date after posting one occurrence (see advanceNextDueDate).
 *
 * Catch-up policy (Audit N5): this is skip-missed-periods, not catch-up.
 * The next due is always one frequency step from today (or from a still-future
 * due date). Overdue templates do not generate a backdated series for each
 * missed period — only the occurrence the user posts now, then the schedule
 * jumps forward from today. Do not change this to catch-up without an explicit
 * product decision.
 */
function computeNextDueISO(mt: MemorizedTransaction | Doc): string {
  const freq = (mt.frequency as string) || 'Monthly';
  // Anchor from today (not the old nextDueDate) so same-day Run Now is
  // idempotent: Daily → tomorrow, Weekly → today+7, etc.
  // Exception (#7): creating early from a lead-time reminder anchors from the
  // still-future due date so the schedule does not drift earlier.
  const today = DateTime.now().startOf('day');
  const oldDueRaw = String(mt.nextDueDate ?? '').slice(0, 10);
  const oldDue = oldDueRaw ? DateTime.fromISO(oldDueRaw).startOf('day') : null;
  const start = oldDue && oldDue.isValid && oldDue > today ? oldDue : today;

  let next: DateTime;
  if (freq === 'Daily') {
    next = start.plus({ days: 1 });
  } else if (freq === 'Weekly') {
    next = start.plus({ weeks: 1 });
  } else if (freq === 'Quarterly') {
    next = start.plus({ months: 3 });
  } else if (freq === 'Annual') {
    next = start.plus({ years: 1 });
  } else {
    next = start.plus({ months: 1 });
  }

  return next.toISODate()!;
}

function todayISO(): string {
  return DateTime.now().toISODate()!;
}

export async function getDueMemorized(
  fyo: Fyo
): Promise<MemorizedTransaction[]> {
  try {
    const today = todayISO();
    const rows = await fyo.db.getAllRaw(ModelNameEnum.MemorizedTransaction, {
      fields: [
        'name',
        'title',
        'party',
        'amount',
        'nextDueDate',
        'remindDaysBefore',
        'frequency',
        'paymentType',
        'fromAccount',
        'toAccount',
        'memo',
        'paymentMethod',
      ],
    });
    const candidates = (
      rows as {
        name: string;
        nextDueDate?: string;
        remindDaysBefore?: number;
        title?: string;
        party?: string;
      }[]
    ).filter((r) => {
      if (!r.nextDueDate) {
        return false;
      }
      // #7: prompt `remindDaysBefore` days ahead of the due date.
      const lead = Math.max(0, Math.floor(Number(r.remindDaysBefore) || 0));
      const promptFrom = DateTime.fromISO(
        String(r.nextDueDate).slice(0, 10)
      ).minus({ days: lead });
      return promptFrom.isValid && promptFrom.toISODate()! <= today;
    });

    const partyNames = await getPartyNameMap(
      fyo,
      candidates.map((r) => String(r.party || ''))
    );
    const displayLabel = (r: { title?: string; party?: string }) => {
      const title = String(r.title || '').trim();
      const party = String(r.party || '').trim();
      // Write Entry stores a human title; payment-memorize used to store the UUID.
      if (title && title !== party) {
        return title;
      }
      return partyLabel(partyNames, party) || title;
    };

    const dueNames = candidates
      .sort((a, b) => {
        const da = String(a.nextDueDate ?? '').slice(0, 10);
        const db = String(b.nextDueDate ?? '').slice(0, 10);
        if (da !== db) {
          return da < db ? -1 : 1;
        }
        return displayLabel(a).localeCompare(displayLabel(b));
      })
      .map((r) => r.name);

    if (!dueNames.length) {
      return [];
    }

    // Docs are required for create/advance (amounts, accounts, sync).
    const docs: MemorizedTransaction[] = [];
    for (const name of dueNames) {
      docs.push(
        (await fyo.doc.getDoc(
          ModelNameEnum.MemorizedTransaction,
          name
        )) as MemorizedTransaction
      );
    }
    return docs;
  } catch (error) {
    // Schema may not exist yet on very old DBs mid-migrate
    // eslint-disable-next-line no-console
    console.error('getDueMemorized failed', error);
    return [];
  }
}

function companyKey(fyo: Fyo): string {
  return (
    (fyo.db.dbPath as string) ||
    (fyo.singles.SystemSettings?.instanceId as string) ||
    ''
  );
}

/**
 * After desk is fully loaded: prompt for due memorized templates.
 * Suppress during setup / Opening Balances / if dismissed this session.
 */
export async function maybePromptMemorizedDue(fyo: Fyo): Promise<void> {
  const key = companyKey(fyo);

  try {
    const setupComplete = await fyo.getValue(
      ModelNameEnum.AccountingSettings,
      'setupComplete'
    );
    if (!setupComplete) {
      return;
    }

    // Suppress while Get Started / Opening Balances onboarding is the landing route
    const getStarted = await fyo.doc.getDoc(ModelNameEnum.GetStarted);
    const hideGetStarted = await fyo.getValue(
      ModelNameEnum.SystemSettings,
      'hideGetStarted'
    );
    if (!hideGetStarted && !getStarted.onboardingComplete) {
      return;
    }

    const due = await getDueMemorized(fyo);
    if (!due.length) {
      return;
    }

    // Snoozed today for this exact due set (#7) — do not re-prompt.
    const signature = dueSignature(due);
    const snooze = readDueSnooze(key);
    if (
      snooze &&
      snooze.company === key &&
      snooze.date === todayISO() &&
      snooze.signature === signature
    ) {
      return;
    }

    const partyNames = await getPartyNameMap(
      fyo,
      due.map((d) => String(d.party || ''))
    );
    const displayLabel = (d: MemorizedTransaction) => {
      const title = String(d.title || '').trim();
      const party = String(d.party || '').trim();
      if (title && title !== party) {
        return title;
      }
      return partyLabel(partyNames, party) || title;
    };

    // Array detail → one <p> per line in Dialog (string \n collapses in CSS).
    const lines = due.map((d) => {
      const amt = fyo.format(d.amount as never, 'Currency');
      const dueDate = String(d.nextDueDate ?? '').slice(0, 10);
      return `${displayLabel(d)} — ${amt} (${dueDate})`;
    });

    const firstLabel = displayLabel(due[0]);
    const buttons =
      due.length === 1
        ? [
            {
              label: t`Create`,
              action() {
                return 'all' as const;
              },
              isPrimary: true,
            },
            {
              label: t`Dismiss`,
              action() {
                return 'dismiss' as const;
              },
              isEscape: true,
            },
          ]
        : [
            {
              label: t`Create all due`,
              action() {
                return 'all' as const;
              },
              isPrimary: true,
            },
            {
              label: t`Create: ${firstLabel}`,
              action() {
                return 'one' as const;
              },
            },
            {
              label: t`Dismiss`,
              action() {
                return 'dismiss' as const;
              },
              isEscape: true,
            },
          ];

    const choice = await showDialog({
      title: t`These are due`,
      detail: lines,
      type: 'info',
      buttons,
    });

    if (choice === 'dismiss' || choice == null) {
      writeDueSnooze({ company: key, date: todayISO(), signature });
      return;
    }

    // Create then advance. If advance fails after a submitted payment, force the
    // schedule bump via db.update (bypasses Doc validation) so the next prompt
    // cannot double-post this period.
    const toCreate = choice === 'all' ? due : due.slice(0, 1);
    if (duePromptCreateLock) {
      return;
    }
    duePromptCreateLock = true;
    let created = 0;
    try {
      for (const mt of toCreate) {
        try {
          await createPaymentFromMemorized(fyo, mt);
        } catch (error) {
          await handleErrorWithDialog(error, mt as Doc, true, true);
          continue;
        }

        try {
          await advanceNextDueDate(mt);
        } catch (error) {
          const nextISO = computeNextDueISO(mt);
          try {
            await fyo.db.update(ModelNameEnum.MemorizedTransaction, {
              name: mt.name,
              nextDueDate: nextISO,
            });
            mt.nextDueDate = nextISO;
          } catch (forceError) {
            // eslint-disable-next-line no-console
            console.error(
              'advanceNextDueDate failed after payment create',
              forceError
            );
            await handleErrorWithDialog(error, mt as Doc, true, true);
            // Payment exists but schedule did not move — do not count as a
            // successful run (avoids success toast + easy double-post).
            continue;
          }
        }
        created += 1;
      }

      if (created > 0) {
        showToast({
          type: 'success',
          message:
            created === 1
              ? t`Created 1 recurring payment`
              : t`Created ${String(created)} recurring payments`,
        });
      }
    } finally {
      duePromptCreateLock = false;
    }
  } catch (error) {
    // Prompt is best-effort; do not block desk load.
    // eslint-disable-next-line no-console
    console.error('maybePromptMemorizedDue failed', error);
  }
}

/**
 * Older Write Entry → Schedule paths stored Party.id (UUID) as `title`.
 * Rewrite those to the payee's display name so list/form Name is readable.
 */
export async function repairMemorizedTransactionTitles(
  fyo: Fyo
): Promise<void> {
  try {
    const rows = (await fyo.db.getAllRaw(ModelNameEnum.MemorizedTransaction, {
      // Include meta so partial updates do not bump `modified` (open forms
      // would otherwise fail optimistic locking on the next save).
      fields: ['name', 'title', 'party', 'modified', 'modifiedBy'],
    })) as {
      name: string;
      title?: string;
      party?: string;
      modified?: string | Date;
      modifiedBy?: string;
    }[];

    const broken = rows.filter((r) =>
      isUuidDocId(String(r.title ?? '').trim())
    );
    if (!broken.length) {
      return;
    }

    const partyIds = broken
      .map((r) => String(r.party ?? '').trim())
      .filter(Boolean);
    const partyNames = await getPartyNameMap(fyo, partyIds);

    for (const row of broken) {
      const label = partyLabel(partyNames, String(row.party ?? ''));
      if (!label) {
        continue;
      }
      await fyo.db.update(ModelNameEnum.MemorizedTransaction, {
        name: row.name,
        title: label,
        ...(row.modified != null ? { modified: row.modified } : {}),
        ...(row.modifiedBy != null ? { modifiedBy: row.modifiedBy } : {}),
      });
    }
  } catch (error) {
    // Best-effort; do not block desk load.
    // eslint-disable-next-line no-console
    console.error('repairMemorizedTransactionTitles failed', error);
  }
}

/**
 * #7 — the load-time prompt never fires again if the app stays open for
 * days. Poll for the day rollover and re-run the due check once per new day
 * (snooze/dismiss guards above prevent duplicate prompts within a day).
 */
let dueRolloverTimer: ReturnType<typeof setInterval> | null = null;
let dueRolloverDay = '';

export function startMemorizedDueRolloverCheck(fyo: Fyo): void {
  dueRolloverDay = todayISO();
  if (dueRolloverTimer) {
    clearInterval(dueRolloverTimer);
  }
  dueRolloverTimer = setInterval(() => {
    const day = todayISO();
    if (day === dueRolloverDay) {
      return;
    }
    dueRolloverDay = day;
    void maybePromptMemorizedDue(fyo);
  }, 30 * 60 * 1000);
}
