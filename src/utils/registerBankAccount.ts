import { fyo } from 'src/initFyo';

const LEGACY_KEY = 'livebooks-register-bank-account';

function scopedKey(): string {
  const path = fyo.db?.dbPath || '';
  return path ? `${LEGACY_KEY}:${path}` : LEGACY_KEY;
}

/** Last bank selected in Cheque Register — kept until a different account is chosen. */
export function getLastRegisterBankAccount(validNames: string[]): string {
  const names = new Set(validNames);
  try {
    const key = scopedKey();
    let saved = localStorage.getItem(key) || '';
    if (!saved || !names.has(saved)) {
      const legacy = localStorage.getItem(LEGACY_KEY) || '';
      if (legacy && names.has(legacy)) {
        saved = legacy;
        localStorage.setItem(key, legacy);
      }
    }
    return saved && names.has(saved) ? saved : '';
  } catch {
    return '';
  }
}

/** Persist only when switching to a concrete account (empty clear does not wipe default). */
export function setLastRegisterBankAccount(account: string): void {
  if (!account) return;
  try {
    localStorage.setItem(scopedKey(), account);
    localStorage.setItem(LEGACY_KEY, account);
  } catch {
    // ignore quota / private mode
  }
}
