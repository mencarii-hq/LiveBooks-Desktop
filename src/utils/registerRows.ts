import { signedBalanceDelta } from 'src/utils/ledgerBalance';

export type RegisterAleSortKey = {
  date: string;
  created?: string;
  name: string;
};

/** Oldest-first; same-day ties break on created then name (stable running balance). */
export function compareRegisterAles(
  a: RegisterAleSortKey,
  b: RegisterAleSortKey
): number {
  const da = String(a.date ?? '');
  const db = String(b.date ?? '');
  if (da !== db) {
    return da < db ? -1 : 1;
  }
  const ca = String(a.created ?? a.name ?? '');
  const cb = String(b.created ?? b.name ?? '');
  if (ca !== cb) {
    return ca < cb ? -1 : 1;
  }
  return String(a.name ?? '').localeCompare(String(b.name ?? ''));
}

export function accumulateRunningBalances(
  entries: { debit: number; credit: number }[],
  rootType?: string
): number[] {
  let balance = 0;
  return entries.map((e) => {
    balance += signedBalanceDelta(rootType, e.debit, e.credit);
    return balance;
  });
}

export const PAY_PARTY_ROLES = [
  'Supplier',
  'Both',
  'Employee',
  'Contractor',
] as const;
export const RECEIVE_PARTY_ROLES = ['Customer', 'Both'] as const;

export function partyRoleFitsPaymentType(
  role: string | undefined,
  paymentType: 'Pay' | 'Receive'
): boolean {
  if (!role) {
    return false;
  }
  return paymentType === 'Pay'
    ? (PAY_PARTY_ROLES as readonly string[]).includes(role)
    : (RECEIVE_PARTY_ROLES as readonly string[]).includes(role);
}
