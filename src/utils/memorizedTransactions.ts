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
};

/** Create + submit a register-style Payment (empty for[], Cash method). */
export async function createRegisterPayment(
  fyo: Fyo,
  fields: RegisterPaymentFields
): Promise<Payment> {
  if (!(fields.amount > 0)) {
    throw new Error(t`Amount must be greater than 0.`);
  }

  await ensurePartyExists(fyo, fields.party);

  // Pay: credit bank (account), debit category (paymentAccount)
  // Receive: debit bank (paymentAccount), credit category (account)
  const account =
    fields.paymentType === 'Pay' ? fields.bankAccount : fields.categoryAccount;
  const paymentAccount =
    fields.paymentType === 'Pay' ? fields.categoryAccount : fields.bankAccount;

  const doc = fyo.doc.getNewDoc(ModelNameEnum.Payment, {
    party: fields.party,
    date: fields.date,
    paymentType: fields.paymentType,
    paymentMethod: 'Cash',
    amount: fyo.pesa(fields.amount),
    memo: fields.memo || '',
    for: [],
  }) as Payment;

  await doc.set('paymentMethod', 'Cash');
  await doc.set('paymentType', fields.paymentType);
  await doc.set('party', fields.party);
  await doc.set('date', fields.date);
  await doc.set('amount', fyo.pesa(fields.amount));
  await doc.set('memo', fields.memo || '');
  // Set accounts last so formulas do not overwrite
  await doc.set('account', account);
  await doc.set('paymentAccount', paymentAccount);

  await doc.sync();
  await doc.submit();
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
      title: t`Cannot Memorize`,
      detail: t`Invoice payments cannot be memorized. Use Bank Register for recurring payees.`,
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
      title: t`Cannot Memorize`,
      detail: t`Payee, accounts, and amount are required.`,
      type: 'error',
    });
    return;
  }

  const doc = fyo.doc.getNewDoc(ModelNameEnum.MemorizedTransaction, {
    party: payment.party,
    paymentType,
    fromAccount: payment.account,
    toAccount: payment.paymentAccount,
    amount,
    memo: payment.memo || payment.referenceId || '',
    frequency: 'Monthly',
    paymentMethod: 'Cash',
    nextDueDate: DateTime.now().plus({ months: 1 }).toISODate(),
  });

  await doc.sync();
  showToast({
    type: 'success',
    message: t`Memorized transaction saved`,
  });
  await routeTo(`/edit/MemorizedTransaction/${String(doc.name)}`);
}

export async function memorizeRegisterFields(
  fyo: Fyo,
  fields: RegisterPaymentFields
): Promise<void> {
  if (!(fields.amount > 0) || !fields.party) {
    await showDialog({
      title: t`Cannot Memorize`,
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
    party: fields.party,
    paymentType: fields.paymentType,
    fromAccount: account,
    toAccount: paymentAccount,
    amount: fyo.pesa(fields.amount),
    memo: fields.memo || '',
    frequency: 'Monthly',
    paymentMethod: 'Cash',
    nextDueDate: DateTime.now().plus({ months: 1 }).toISODate(),
  });

  await doc.sync();
  showToast({
    type: 'success',
    message: t`Memorized transaction saved`,
  });
  await routeTo(`/edit/MemorizedTransaction/${String(doc.name)}`);
}

export async function createPaymentFromMemorized(
  fyo: Fyo,
  mt: MemorizedTransaction | Doc
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

  const date =
    (mt.nextDueDate as string | Date | undefined) ||
    DateTime.now().toISODate()!;

  return await createRegisterPayment(fyo, {
    date,
    party: mt.party as string,
    categoryAccount,
    bankAccount,
    amount,
    paymentType,
    memo: (mt.memo as string) || '',
  });
}

export async function advanceNextDueDate(
  mt: MemorizedTransaction | Doc
): Promise<void> {
  const freq = (mt.frequency as string) || 'Monthly';
  const base =
    mt.nextDueDate != null
      ? DateTime.fromISO(String(mt.nextDueDate).slice(0, 10))
      : DateTime.now();
  const start = base.isValid ? base : DateTime.now();

  let next = start;
  if (freq === 'Quarterly') {
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
        return `${String(d.party ?? '')} — ${amt} (${dueDate})`;
      })
      .join('\n');

    const firstParty = String(due[0].party || '');
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
              label: t`Create: ${firstParty}`,
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
            ? t`Created 1 memorized payment`
            : t`Created ${String(created)} memorized payments`,
      });
    }
  } catch {
    // Prompt is best-effort; do not block desk load.
  }
}
