import {
  AccountTypeEnum,
  MONEY_ACCOUNT_TYPES,
} from 'models/baseModels/Account/types';

/** Accounts that appear in Check Register / Write Entry pickers. */
export const REGISTER_ACCOUNT_TYPES = MONEY_ACCOUNT_TYPES;

/** Bank Feed Hub / reconcile leaf accounts (Cash stays on register only). */
export const FEED_AND_RECONCILE_ACCOUNT_TYPES = [
  AccountTypeEnum.Bank,
  AccountTypeEnum.CreditCard,
] as const;

export function isCreditCardAccountType(accountType?: string | null): boolean {
  return accountType === AccountTypeEnum.CreditCard;
}

/**
 * Plaid credit-card accounts: type === 'credit', or an explicit credit-card
 * subtype. Do not match loan subtypes like "line of credit".
 */
export function isPlaidCreditAccount(
  type?: string | null,
  subtype?: string | null
): boolean {
  const t = (type ?? '').trim().toLowerCase();
  const st = (subtype ?? '').trim().toLowerCase();
  if (t === 'credit') {
    return true;
  }
  return st === 'credit card' || st === 'creditcard';
}
