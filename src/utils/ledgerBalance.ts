import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';

export type LedgerBalanceOpts = {
  /** Default end-of-today local. `null` = all dates (future-dated entries included). */
  asOf?: string | null;
  /** Default true — match Check Register (exclude reverted ALEs). */
  excludeReverted?: boolean;
  /** Default true — match Check Register (skip cancelled Payment ALEs). */
  excludeCancelledPayments?: boolean;
};

export type LedgerAleRow = {
  account?: string;
  date?: string | Date;
  debit?: { float?: number } | number;
  credit?: { float?: number } | number;
  reverted?: boolean;
  referenceType?: string;
  referenceName?: string;
};

const CREDIT_ROOTS = new Set(['Liability', 'Equity', 'Income']);

/** Asset bank/cash: debit − credit. Credit (CC) roots: credit − debit (owed). */
export function signedBalanceDelta(
  rootType: string | undefined,
  debit: number,
  credit: number
): number {
  if (rootType && CREDIT_ROOTS.has(rootType)) {
    return credit - debit;
  }
  return debit - credit;
}

export function ledgerMoney(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v && 'float' in v) {
    return Number((v as { float: number }).float) || 0;
  }
  return Number(v) || 0;
}

export function endOfTodayISO(): string {
  return DateTime.now().endOf('day').toISO() ?? '';
}

function aleDateISO(value: string | Date | undefined): string {
  if (!value) return '';
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISO() ?? '';
  }
  return String(value);
}

/**
 * Shared books-balance math used by hub, register, reconcile, and archive.
 * Defaults match Check Register `loadBalanceAsOfToday`: as-of today, skip
 * reverted ALEs and cancelled payments.
 */
export function computeLedgerSignedBalance(
  ales: LedgerAleRow[],
  rootType: string | undefined,
  cancelledPaymentNames: Set<string>,
  opts?: LedgerBalanceOpts
): number {
  const asOf = opts?.asOf === undefined ? endOfTodayISO() : opts.asOf;
  const excludeReverted = opts?.excludeReverted !== false;
  const excludeCancelled = opts?.excludeCancelledPayments !== false;
  let balance = 0;
  for (const ale of ales) {
    if (excludeReverted && ale.reverted) {
      continue;
    }
    if (asOf) {
      const d = aleDateISO(ale.date);
      if (d && d > asOf) {
        continue;
      }
    }
    if (
      excludeCancelled &&
      ale.referenceType === ModelNameEnum.Payment &&
      ale.referenceName &&
      cancelledPaymentNames.has(ale.referenceName)
    ) {
      continue;
    }
    balance += signedBalanceDelta(
      rootType,
      ledgerMoney(ale.debit),
      ledgerMoney(ale.credit)
    );
  }
  return balance;
}
