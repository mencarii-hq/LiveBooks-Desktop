import { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';
import type { Payment } from 'models/baseModels/Payment/Payment';
import type { Account } from 'models/baseModels/Account/Account';

/** One queued check to be numbered/printed. `bankAccount` = account the check draws on. */
export interface CheckQueueItem {
  paymentName: string;
  bankAccount: string;
  amount: number;
}

export interface CheckAssignment {
  paymentName: string;
  bankAccount: string;
  checkNumber: string;
}

export interface CheckSkip {
  paymentName: string;
  reason: string;
}

export interface AssignResult {
  assignments: CheckAssignment[];
  skips: CheckSkip[];
  /** Final `nextCheckNumber` pointer per bank account after this batch. */
  nextByAccount: Record<string, number>;
}

/**
 * X1 — printed inference: a check is "already printed" when it uses the Check
 * method, is not queued, and has a non-empty referenceId.
 */
export function isPrintedCheck(payment: {
  paymentMethod?: string;
  printLater?: boolean;
  referenceId?: string;
  paymentMethodType?: string;
}): boolean {
  const isCheck =
    payment.paymentMethodType === 'Check' ||
    (payment.paymentMethod ?? '').trim().toLowerCase() === 'check';
  return isCheck && !payment.printLater && !!(payment.referenceId ?? '').trim();
}

/** All referenceId strings already in use for a bank account (Q-F scope). */
export async function getUsedCheckNumbers(
  fyo: Fyo,
  bankAccount: string
): Promise<Set<string>> {
  const used = new Set<string>();
  try {
    const rows = (await fyo.db.getAll(ModelNameEnum.Payment, {
      fields: ['referenceId'],
      filters: { account: bankAccount },
    })) as { referenceId?: string }[];
    for (const r of rows) {
      const ref = (r.referenceId ?? '').trim();
      if (ref) {
        used.add(ref);
      }
    }
  } catch {
    /* best effort */
  }

  for (const v of await getVoidedCheckNumbers(fyo, bankAccount)) {
    used.add(v);
  }
  return used;
}

export async function getVoidedCheckNumbers(
  fyo: Fyo,
  bankAccount: string
): Promise<string[]> {
  try {
    const raw = await fyo.getValue(
      ModelNameEnum.Account,
      bankAccount,
      'voidedCheckNumbers'
    );
    if (typeof raw !== 'string' || !raw.trim()) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v).trim()).filter(Boolean);
    }
  } catch {
    /* ignore malformed log */
  }
  return [];
}

async function getNextCheckNumber(
  fyo: Fyo,
  bankAccount: string
): Promise<number> {
  try {
    const raw = await fyo.getValue(
      ModelNameEnum.Account,
      bankAccount,
      'nextCheckNumber'
    );
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1001;
  } catch {
    return 1001;
  }
}

/**
 * O2 / P2 — assign-first in memory. Walk items in order per bank account.
 * Collision (candidate number already used, string equality Q-AI) → skip that
 * item (stays queued) and auto-advance to the next free number. Successful
 * items receive contiguous free numbers per bank account. Provisional numbers
 * are NOT persisted here (Q-AC) — commit happens after the post-print confirm.
 */
export async function assignBatchNumbers(
  fyo: Fyo,
  items: CheckQueueItem[]
): Promise<AssignResult> {
  const assignments: CheckAssignment[] = [];
  const skips: CheckSkip[] = [];
  const nextByAccount: Record<string, number> = {};

  const byAccount = new Map<string, CheckQueueItem[]>();
  for (const item of items) {
    if (!byAccount.has(item.bankAccount)) {
      byAccount.set(item.bankAccount, []);
    }
    byAccount.get(item.bankAccount)!.push(item);
  }

  for (const [bankAccount, accountItems] of byAccount.entries()) {
    const used = await getUsedCheckNumbers(fyo, bankAccount);
    let pointer = await getNextCheckNumber(fyo, bankAccount);

    const advancePastUsed = () => {
      while (used.has(String(pointer))) {
        pointer += 1;
      }
    };

    for (const item of accountItems) {
      if (!(item.amount > 0)) {
        skips.push({
          paymentName: item.paymentName,
          reason: 'Missing or zero amount',
        });
        continue;
      }

      const candidate = String(pointer);
      if (used.has(candidate)) {
        // Forced collision → skip this item, auto-advance to next free number.
        skips.push({
          paymentName: item.paymentName,
          reason: `Check number ${candidate} already used — advanced past it`,
        });
        pointer += 1;
        advancePastUsed();
        continue;
      }

      assignments.push({
        paymentName: item.paymentName,
        bankAccount,
        checkNumber: candidate,
      });
      used.add(candidate);
      pointer += 1;
      advancePastUsed();
    }

    nextByAccount[bankAccount] = pointer;
  }

  return { assignments, skips, nextByAccount };
}

/**
 * Q-AA — commit confirmed checks on already-submitted Payments via
 * doc.set + doc.sync (write referenceId, clear printLater). Advance each bank
 * account's nextCheckNumber past the highest committed number only, so
 * unchecked/rolled-back items leave the sequence available.
 */
export async function commitAssignments(
  fyo: Fyo,
  confirmed: CheckAssignment[]
): Promise<void> {
  const highestByAccount: Record<string, number> = {};

  for (const a of confirmed) {
    const payment = (await fyo.doc.getDoc(
      ModelNameEnum.Payment,
      a.paymentName
    )) as Payment;
    await payment.set('referenceId', a.checkNumber);
    await payment.set('printLater', false);
    await payment.sync();

    const n = Number(a.checkNumber);
    if (Number.isFinite(n)) {
      highestByAccount[a.bankAccount] = Math.max(
        highestByAccount[a.bankAccount] ?? 0,
        n
      );
    }
  }

  for (const [bankAccount, highest] of Object.entries(highestByAccount)) {
    const account = (await fyo.doc.getDoc(
      ModelNameEnum.Account,
      bankAccount
    )) as Account;
    const current = Number(account.nextCheckNumber) || 0;
    const advanced = Math.max(current, highest + 1);
    if (advanced !== current) {
      await account.set('nextCheckNumber', advanced);
      await account.sync();
    }
  }
}

/**
 * U1 — record a voided check number on the bank account (never reused) and
 * requeue the payment for reprint with a fresh number.
 */
export async function voidAndRequeue(
  fyo: Fyo,
  paymentName: string
): Promise<void> {
  const payment = (await fyo.doc.getDoc(
    ModelNameEnum.Payment,
    paymentName
  )) as Payment;
  const bankAccount = payment.account as string;
  const oldNumber = (payment.referenceId ?? '').trim();

  if (oldNumber && bankAccount) {
    const voided = await getVoidedCheckNumbers(fyo, bankAccount);
    if (!voided.includes(oldNumber)) {
      voided.push(oldNumber);
      const account = (await fyo.doc.getDoc(
        ModelNameEnum.Account,
        bankAccount
      )) as Account;
      await account.set('voidedCheckNumbers', JSON.stringify(voided));
      await account.sync();
    }
  }

  await payment.set('referenceId', '');
  await payment.set('printLater', true);
  await payment.sync();
}
