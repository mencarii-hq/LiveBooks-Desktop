import { livebooksCloudRequest } from 'src/utils/livebooksCloud';

export type PlaidLinkedAccountRow = {
  account_id: string;
  name?: string | null;
  official_name?: string | null;
  mask?: string | null;
  subtype?: string | null;
  type?: string | null;
  balances?: Record<string, unknown>;
};

export async function fetchPlaidLinkedAccounts(
  bookId: string,
  itemId: string
): Promise<{ accounts: PlaidLinkedAccountRow[]; error?: string }> {
  const q = new URLSearchParams({ item_id: itemId });
  const res = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/${bookId}/plaid/linked_accounts?${q.toString()}`,
  });
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { accounts: [], error: err };
  }
  const body = res.data as { accounts?: PlaidLinkedAccountRow[] };
  return { accounts: body.accounts ?? [] };
}

export function formatPlaidAccountLabel(a: PlaidLinkedAccountRow): string {
  const base = a.name || a.official_name || a.account_id;
  const mask = a.mask ? ` · ${a.mask}` : '';
  const st = a.subtype ? ` (${a.subtype})` : '';
  return `${base}${mask}${st}`;
}
