import { livebooksCloudRequest } from 'src/utils/livebooksCloud';

export type PlaidFeedItemRow = {
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  sync_suggested: boolean;
  last_webhook_at: string | null;
  last_sync_at: string | null;
  feed_version: number;
  item_login_required: boolean;
  pending_import_batches_count: number;
  pending_import_batches_by_plaid_account_id: Record<string, number>;
};

export type PlaidFeedsPayload = { items: PlaidFeedItemRow[] };

export type ImportBatchListRow = {
  public_id: string;
  created_at: string;
  has_more_hint?: boolean;
  cursor_after?: string | null;
  plaid_account_id?: string;
  acked_at?: string;
};

export type ImportBatchesListPayload = {
  delivery_status: string;
  batches: ImportBatchListRow[];
};

export async function fetchPlaidFeeds(
  bookId: string,
  options?: { ifNoneMatch?: string }
): Promise<{
  notModified: boolean;
  etag?: string;
  payload: PlaidFeedsPayload | null;
  error?: string;
}> {
  const headers: Record<string, string> = {};
  if (options?.ifNoneMatch) {
    headers['If-None-Match'] = options.ifNoneMatch;
  }
  const res = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/${bookId}/plaid_feeds`,
    headers: Object.keys(headers).length ? headers : undefined,
  });
  if (res.status === 304) {
    return {
      notModified: true,
      etag: options?.ifNoneMatch ?? res.etag,
      payload: null,
    };
  }
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { notModified: false, payload: null, error: err };
  }
  return {
    notModified: false,
    etag: res.etag,
    payload: res.data as PlaidFeedsPayload,
  };
}

export async function fetchPendingImportBatches(
  bookId: string,
  itemId: string,
  opts?: { plaidAccountId?: string; limit?: number }
): Promise<{ batches: ImportBatchListRow[]; error?: string }> {
  const q = new URLSearchParams({
    item_id: itemId,
    delivery_status: 'pending',
  });
  if (opts?.plaidAccountId) {
    q.set('plaid_account_id', opts.plaidAccountId);
  }
  if (opts?.limit != null) {
    q.set('limit', String(opts.limit));
  }
  const res = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/${bookId}/plaid/import_batches?${q.toString()}`,
  });
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { batches: [], error: err };
  }
  const body = res.data as ImportBatchesListPayload;
  return { batches: body.batches ?? [] };
}

export async function fetchImportBatchPayload(
  bookId: string,
  publicId: string
): Promise<{ payload: unknown; error?: string }> {
  const res = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/${bookId}/plaid/import_batches/${encodeURIComponent(
      publicId
    )}`,
  });
  if (!res.ok) {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { payload: null, error: err };
  }
  return { payload: res.data };
}

export async function ackImportBatch(
  bookId: string,
  publicId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${bookId}/plaid/import_batches/${encodeURIComponent(
      publicId
    )}/ack`,
    body: {},
  });
  if (!res.ok) {
    return {
      ok: false,
      error: `Ack failed (HTTP ${String(res.status)})`,
    };
  }
  return { ok: true };
}
