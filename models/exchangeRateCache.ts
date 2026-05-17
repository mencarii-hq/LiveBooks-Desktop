import type { Fyo } from 'fyo';

export type CachedExchangeRate = {
  rate: number;
  rateDate: string;
  fetchedAt: string;
};

type ExchangeRateCacheStore = Record<string, CachedExchangeRate[]>;

function pairKey(fromCurrency: string, toCurrency: string): string {
  return `${fromCurrency}:${toCurrency}`;
}

function readStore(fyo: Fyo): ExchangeRateCacheStore {
  const raw = fyo.singles.SystemSettings?.exchangeRateCacheJson as
    | string
    | undefined;
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as ExchangeRateCacheStore;
  } catch {
    return {};
  }
}

export function getCachedExchangeRates(
  fyo: Fyo,
  fromCurrency: string,
  toCurrency: string
): CachedExchangeRate[] {
  const store = readStore(fyo);
  return store[pairKey(fromCurrency, toCurrency)] ?? [];
}

export function resolveCachedExchangeRate(
  entries: CachedExchangeRate[],
  date: string
): { entry: CachedExchangeRate; usedStaleDate: boolean } | null {
  const forDate = entries
    .filter((e) => e.rateDate === date)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));

  if (forDate.length) {
    return { entry: forDate[0], usedStaleDate: false };
  }

  const sorted = [...entries].sort((a, b) =>
    b.fetchedAt.localeCompare(a.fetchedAt)
  );
  if (!sorted.length) {
    return null;
  }

  return {
    entry: sorted[0],
    usedStaleDate: sorted[0].rateDate !== date,
  };
}

export async function persistExchangeRateCache(
  fyo: Fyo,
  fromCurrency: string,
  toCurrency: string,
  entry: CachedExchangeRate
): Promise<void> {
  const key = pairKey(fromCurrency, toCurrency);
  const store = readStore(fyo);
  const list = (store[key] ?? []).filter((e) => e.rateDate !== entry.rateDate);
  store[key] = [entry, ...list].slice(0, 30);
  const json = JSON.stringify(store);

  await fyo.singles.SystemSettings?.setAndSync('exchangeRateCacheJson', json);
}
