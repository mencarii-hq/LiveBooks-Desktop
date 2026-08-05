import type { Fyo } from 'fyo';

let cachedIsUsCa: boolean | undefined;
let cachedCountryCode: string | undefined;

export const REGIONAL_LABELS_CHANGED_EVENT = 'regional-labels-changed';

function normalizeCountryCode(countryCode: string | undefined | null): string {
  return (countryCode ?? '').trim().toLowerCase();
}

function readIsUsCaCompany(fyo: Fyo): boolean {
  const code = normalizeCountryCode(fyo.singles.SystemSettings?.countryCode);
  return !code || code === 'us' || code === 'ca';
}

export function isUsCaCompany(fyo: Fyo): boolean {
  const code = normalizeCountryCode(fyo.singles.SystemSettings?.countryCode);

  if (cachedIsUsCa !== undefined && cachedCountryCode === code) {
    return cachedIsUsCa;
  }

  cachedCountryCode = code;
  cachedIsUsCa = readIsUsCaCompany(fyo);
  return cachedIsUsCa;
}

export function invalidateUsCaCompanyCache(): void {
  cachedIsUsCa = undefined;
  cachedCountryCode = undefined;
}

export function emitRegionalLabelsChanged(): void {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent(REGIONAL_LABELS_CHANGED_EVENT));
  }
}

export function invalidateAndEmitRegionalLabelsChanged(): void {
  invalidateUsCaCompanyCache();
  emitRegionalLabelsChanged();
}
