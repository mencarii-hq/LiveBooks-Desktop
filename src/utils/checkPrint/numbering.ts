import { Fyo, t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import type { Payment } from 'models/baseModels/Payment/Payment';
import type { Account } from 'models/baseModels/Account/Account';
import { isCheckMethodName } from 'src/utils/bankingIdentity';

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

/**
 * Canonical form for collision checks: trim, drop a leading `#`, and for
 * pure-digit values strip leading zeros so "0123" / "#123" / "123" match.
 * Non-numeric refs stay as trimmed text (minus leading `#`).
 */
export function normalizeCheckNumber(value: unknown): string {
  let s = String(value ?? '').trim();
  if (!s) {
    return '';
  }
  if (s.startsWith('#')) {
    s = s.slice(1).trim();
  }
  if (/^\d+$/.test(s)) {
    const stripped = s.replace(/^0+/, '');
    return stripped || '0';
  }
  return s;
}

/**
 * All referenceId strings already in use for a bank account (Q-F scope).
 * Throws if payment lookup fails — callers must not assign/accept numbers
 * against an empty used-set (fail closed).
 */
export async function getUsedCheckNumbers(
  fyo: Fyo,
  bankAccount: string,
  excludePaymentName?: string
): Promise<Set<string>> {
  const used = new Set<string>();
  const rows = (await fyo.db.getAll(ModelNameEnum.Payment, {
    fields: ['name', 'referenceId', 'paymentMethod'],
    filters: { account: bankAccount },
  })) as { name?: string; referenceId?: string; paymentMethod?: string }[];

  const methodNames = [
    ...new Set(
      rows.map((r) => String(r.paymentMethod || '').trim()).filter(Boolean)
    ),
  ];
  const typeByName = new Map<string, string>();
  if (methodNames.length) {
    const methods = (await fyo.db.getAll(ModelNameEnum.PaymentMethod, {
      fields: ['name', 'type'],
      filters: { name: ['in', methodNames] },
    })) as { name: string; type?: string }[];
    for (const m of methods) {
      typeByName.set(m.name, m.type || '');
    }
  }

  for (const r of rows) {
    if (excludePaymentName && r.name === excludePaymentName) {
      continue;
    }
    const method = String(r.paymentMethod || '');
    if (method && !isCheckMethodName(method, typeByName.get(method))) {
      continue;
    }
    const ref = normalizeCheckNumber(r.referenceId);
    if (ref) {
      used.add(ref);
    }
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
      return [
        ...new Set(parsed.map((v) => normalizeCheckNumber(v)).filter(Boolean)),
      ];
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
 * Always advance past used numbers (Q-AI string equality) before assigning so
 * a stale `nextCheckNumber` never skips a payment — it gets the next free #.
 * Successful items receive contiguous free numbers per bank account.
 * Provisional numbers are NOT persisted here (Q-AC) — commit happens after
 * the post-print confirm.
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
      while (used.has(normalizeCheckNumber(pointer))) {
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

      // Skip used #s (e.g. leftover from old handwritten Save) then assign.
      advancePastUsed();
      const candidate = normalizeCheckNumber(pointer);
      assignments.push({
        paymentName: item.paymentName,
        bankAccount,
        checkNumber: candidate,
      });
      used.add(candidate);
      pointer += 1;
    }

    advancePastUsed();
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

  const { isCheckMethod } = await import('src/utils/memorizedTransactions');
  if (!(await isCheckMethod(fyo, payment.paymentMethod || ''))) {
    throw new Error('Only Check payments can void a check number.');
  }

  const bankAccount = payment.account as string;
  const oldNumber = normalizeCheckNumber(payment.referenceId);

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

/**
 * Dedicated post-submit check-# edit: sets `referenceId` (plus a memo
 * audit line) and clears `printLater` so the payment leaves Checks to
 * Print. Does not whitelist the field in `canEdit`. Uniqueness is per
 * bank account (voided numbers stay reserved). Numeric values advance
 * `Account.nextCheckNumber` past the new number so later print assignment
 * skips it; `assignBatchNumbers` also walks past used numbers.
 */
export async function setPaymentCheckNumber(
  fyo: Fyo,
  paymentName: string,
  newNumberRaw: string
): Promise<void> {
  const payment = (await fyo.doc.getDoc(
    ModelNameEnum.Payment,
    paymentName
  )) as Payment;

  if (!payment.name || payment.isCancelled) {
    throw new Error(t`Cannot set a check number on this payment.`);
  }

  const newNumber = normalizeCheckNumber(newNumberRaw);
  if (!newNumber) {
    throw new Error(t`Enter a check number.`);
  }

  const bankAccount = String(payment.account || '');
  if (!bankAccount) {
    throw new Error(t`Payment has no bank account.`);
  }

  const used = await getUsedCheckNumbers(
    fyo,
    bankAccount,
    String(payment.name)
  );
  if (used.has(newNumber)) {
    throw new Error(
      t`Check number ${newNumber} is already used on this bank account.`
    );
  }

  const oldNumber = String(payment.referenceId || '').trim() || '(none)';
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const note = `Check # ${oldNumber} → ${newNumber} (${stamp})`;
  const memo = String(payment.memo || '').trim();
  const nextMemo = memo ? `${memo}\n${note}` : note;

  await payment.set('referenceId', newNumber);
  await payment.set('printLater', false);
  await payment.set('memo', nextMemo);
  await payment.sync();

  const n = Number(newNumber);
  if (Number.isFinite(n) && n > 0) {
    const account = (await fyo.doc.getDoc(
      ModelNameEnum.Account,
      bankAccount
    )) as Account;
    const current = Number(account.nextCheckNumber) || 0;
    const advanced = Math.max(current, Math.floor(n) + 1);
    if (advanced !== current) {
      await account.set('nextCheckNumber', advanced);
      await account.sync();
    }
  }
}
