import { livebooksCloudRequest } from 'src/utils/livebooksCloud';

export type CloudStatementFileRow = {
  id: number;
  plaid_item_id: string;
  statement_id: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  pdf: boolean;
};

export async function fetchCloudStatementFiles(
  bookId: string,
  itemId?: string
): Promise<{ files: CloudStatementFileRow[]; error?: string }> {
  const q = itemId ? `?item_id=${encodeURIComponent(itemId)}` : '';
  const res = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/${bookId}/plaid/statement_files${q}`,
  });
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { files: [], error: err };
  }
  const body = res.data as { files?: CloudStatementFileRow[] };
  return { files: body.files ?? [] };
}

export async function syncCloudStatementFiles(
  bookId: string,
  itemId?: string
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const q = itemId ? `?item_id=${encodeURIComponent(itemId)}` : '';
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${bookId}/plaid/statement_files/sync${q}`,
    body: {},
  });
  if (!res.ok) {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { ok: false, data: res.data, error: err };
  }
  return { ok: true, data: res.data };
}
