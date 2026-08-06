import { Fyo, t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import type { MemorizedTransaction } from 'models/baseModels/MemorizedTransaction/MemorizedTransaction';
import type { Payment } from 'models/baseModels/Payment/Payment';
import { showDialog, showToast } from 'src/utils/interactive';
import { handleErrorWithDialog } from 'src/errorHandling';
import { routeTo } from 'src/utils/ui';

/** Session-only: dismiss "These are due" until next company open. */
let dismissedDueThisSession = false;
/** Company path/id the dismiss flag applies to (reset on switch). */
let dismissedForCompany: string | null = null;

export function resetMemorizedDuePromptSession(): void {
  dismissedDueThisSession = false;
  dismissedForCompany = null;
}

export type RegisterPaymentFields = {
  date: string | Date;
  party: string;
  categoryAccount: string;
  bankAccount: string;
  amount: number;
  paymentType: 'Pay' | 'Receive';
  memo?: string;
  paymentMethod?: string;
  /** Queue for batch check printing (only honored for Pay + Check — Q-AF). */
  printLater?: boolean;
};

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
 * R2: Register entries (payments and deposits) default to the Check method.
 * Prefer a method of type `Check`, then one literally named "Check", then
 * fall back to Cash / Bank / first available for older books.
 */
export async function resolveDefaultPaymentMethod(fyo: Fyo): Promise<string> {
  try {
    const methods = (await fyo.db.getAll(ModelNameEnum.PaymentMethod, {
      fields: ['name', 'type'],
      orderBy: 'name',
      order: 'asc',
    })) as { name: string; type?: string }[];
    const checkByType = methods.find((m) => m.type === 'Check');
    if (checkByType) return checkByType.name;
    const checkByName = methods.find(
      (m) => m.name.trim().toLowerCase() === 'check'
    );
    if (checkByName) return checkByName.name;
    const cash = methods.find((m) => m.name.trim().toLowerCase() === 'cash');
    if (cash) return cash.name;
    const bank = methods.find((m) => m.type === 'Bank');
    if (bank) return bank.name;
    return methods[0]?.name || 'Check';
  } catch {
    return 'Check';
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

  await ensurePartyExists(fyo, fields.party);

  // R2: register entries default to Check when no method is supplied.
  const paymentMethod =
    fields.paymentMethod || (await resolveDefaultPaymentMethod(fyo));

  const paymentType = normalizeRegisterPaymentType(fields.paymentType);

  // Pay: credit bank (account), debit category (paymentAccount)
  // Receive: debit bank (paymentAccount), credit category (account)
  const account =
    paymentType === 'Pay' ? fields.bankAccount : fields.categoryAccount;
  const paymentAccount =
    paymentType === 'Pay' ? fields.categoryAccount : fields.bankAccount;

  const wantQueue = !!fields.printLater;
  const isCheck = await isCheckMethod(fyo, paymentMethod);
  // Q-AF: only Pay + Check entries can be queued for printing.
  const queue = wantQueue && paymentType === 'Pay' && isCheck;

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
  await doc.set('party', fields.party);
  // Set type AFTER party so role-based formulas cannot win.
  await doc.set('paymentType', paymentType);
  // Set accounts after type so account formulas see the correct Pay/Receive.
  await doc.set('account', account);
  await doc.set('paymentAccount', paymentAccount);

  // Handwritten path (Print later unticked): assign next free check number
  // immediately so X1 treats it as already printed. Never assign when the
  // user asked to queue — even if method/type checks failed.
  let assignedHandNumber: string | null = null;
  if (!wantQueue && paymentType === 'Pay' && isCheck) {
    try {
      const { assignBatchNumbers } = await import(
        'src/utils/checkPrint/numbering'
      );
      const { assignments } = await assignBatchNumbers(fyo, [
        {
          paymentName: 'pending',
          bankAccount: fields.bankAccount,
          amount: fields.amount,
        },
      ]);
      if (assignments[0]) {
        assignedHandNumber = assignments[0].checkNumber;
        await doc.set('referenceId', assignedHandNumber);
      }
    } catch {
      /* leave blank; user can type a number */
    }
  }

  // Final guards: sync _preSync runs formulas; keep register values.
  // Direct assign so _canSet / formula side-effects cannot drop printLater
  // or replace the selected bank with Bank[0] from the account formula.
  doc.paymentType = paymentType;
  doc.account = account;
  doc.paymentAccount = paymentAccount;
  doc.printLater = queue;
  if (queue) {
    doc.referenceId = '';
  }
  await doc.sync();
  await doc.submit();

  // Queue path: re-assert after submit in case sync/submit round-tripped
  // printLater back to the schema default (false).
  if (queue && !doc.printLater) {
    await doc.set('printLater', true);
    await doc.sync();
  }

  if (assignedHandNumber) {
    try {
      const { commitAssignments } = await import(
        'src/utils/checkPrint/numbering'
      );
      await commitAssignments(fyo, [
        {
          paymentName: String(doc.name),
          bankAccount: fields.bankAccount,
          checkNumber: assignedHandNumber,
        },
      ]);
    } catch {
      /* number is already on the payment */
    }
  }

  return doc;
}

async function ensurePartyExists(fyo: Fyo, partyName: string): Promise<void> {
  const exists = await fyo.db.exists(ModelNameEnum.Party, partyName);
  if (exists) {
    return;
  }
  const party = fyo.doc.getNewDoc(ModelNameEnum.Party, {
    name: partyName,
    role: 'Both',
  });
  await party.sync();
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

  const doc = fyo.doc.getNewDoc(ModelNameEnum.MemorizedTransaction, {
    title: payment.party,
    party: payment.party,
    paymentType,
    fromAccount: payment.account,
    toAccount: payment.paymentAccount,
    amount,
    memo: payment.memo || payment.referenceId || '',
    frequency: 'Monthly',
    paymentMethod: (payment.paymentMethod as string) || 'Cash',
    nextDueDate: DateTime.now().plus({ months: 1 }).toISODate(),
  });

  await doc.sync();
  showToast({
    type: 'success',
    message: t`Recurring transaction saved`,
  });
  await routeTo(`/edit/MemorizedTransaction/${String(doc.name)}`);
}

export async function memorizeRegisterFields(
  fyo: Fyo,
  fields: RegisterPaymentFields
): Promise<void> {
  if (!(fields.amount > 0) || !fields.party) {
    await showDialog({
      title: t`Cannot make recurring`,
      detail: t`Payee and amount are required.`,
      type: 'error',
    });
    return;
  }

  await ensurePartyExists(fyo, fields.party);

  const account =
    fields.paymentType === 'Pay' ? fields.bankAccount : fields.categoryAccount;
  const paymentAccount =
    fields.paymentType === 'Pay' ? fields.categoryAccount : fields.bankAccount;

  const doc = fyo.doc.getNewDoc(ModelNameEnum.MemorizedTransaction, {
    title: fields.party,
    party: fields.party,
    paymentType: fields.paymentType,
    fromAccount: account,
    toAccount: paymentAccount,
    amount: fyo.pesa(fields.amount),
    memo: fields.memo || '',
    frequency: 'Monthly',
    paymentMethod: fields.paymentMethod || 'Cash',
    nextDueDate: DateTime.now().plus({ months: 1 }).toISODate(),
  });

  await doc.sync();
  showToast({
    type: 'success',
    message: t`Recurring transaction saved`,
  });
  await routeTo(`/edit/MemorizedTransaction/${String(doc.name)}`);
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
  const freq = (mt.frequency as string) || 'Monthly';
  // Anchor from today (not the old nextDueDate) so same-day Run Now is
  // idempotent: Daily → tomorrow, Weekly → today+7, etc.
  const start = DateTime.now().startOf('day');

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

  await mt.setAndSync('nextDueDate', next.toISODate());
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
        'frequency',
        'paymentType',
        'fromAccount',
        'toAccount',
        'memo',
        'paymentMethod',
      ],
    });
    const dueNames = (rows as { name: string; nextDueDate?: string }[])
      .filter(
        (r) => r.nextDueDate && String(r.nextDueDate).slice(0, 10) <= today
      )
      .map((r) => r.name);

    if (!dueNames.length) {
      return [];
    }

    // Bulk-load docs instead of N+1 getDoc
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
  } catch {
    // Schema may not exist yet on very old DBs mid-migrate
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
  if (dismissedDueThisSession && dismissedForCompany === key) {
    return;
  }
  // Company switched — clear prior dismiss
  if (dismissedForCompany && dismissedForCompany !== key) {
    dismissedDueThisSession = false;
    dismissedForCompany = null;
  }

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

    const lines = due
      .map((d) => {
        const amt = fyo.format(d.amount as never, 'Currency');
        const dueDate = String(d.nextDueDate ?? '').slice(0, 10);
        const label = String(d.title || d.party || '');
        return `${label} — ${amt} (${dueDate})`;
      })
      .join('\n');

    const firstLabel = String(due[0].title || due[0].party || '');
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
      dismissedDueThisSession = true;
      dismissedForCompany = key;
      return;
    }

    // 'all' = one occurrence per due template; 'one' = first template only
    // (still-due others re-list on next open — no multi-period backfill).
    const toCreate = choice === 'all' ? due : due.slice(0, 1);
    let created = 0;
    for (const mt of toCreate) {
      try {
        await createPaymentFromMemorized(fyo, mt);
        await advanceNextDueDate(mt);
        created += 1;
      } catch (error) {
        await handleErrorWithDialog(error, mt as Doc, true, true);
      }
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
  } catch {
    // Prompt is best-effort; do not block desk load.
  }
}
