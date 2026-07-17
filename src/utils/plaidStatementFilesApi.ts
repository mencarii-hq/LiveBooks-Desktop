import { livebooksCloudRequest } from 'src/utils/livebooksCloud';
import {
  livebooksCloudRequestWithStepUp,
  MFA_BROWSER_STEP_UP_MESSAGE,
} from 'src/utils/plaidBankFeedsApi';
import type { PromptTotpFn } from 'src/utils/plaidBankFeedsApi';

export type CloudStatementFileRow = {
  id: number;
  plaid_item_id: string;
  statement_id: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  pdf: boolean;
};

function messageFromCloudResponse(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.length > 0) {
      return o.message;
    }
    if (typeof o.error === 'string' && o.error.length > 0) {
      return o.error;
    }
  }
  return `HTTP ${String(status)}`;
}

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
    return {
      files: [],
      error: messageFromCloudResponse(res.data, res.status),
    };
  }
  const body = res.data as { files?: CloudStatementFileRow[] };
  return { files: body.files ?? [] };
}

export async function syncCloudStatementFiles(
  bookId: string,
  itemId?: string,
  opts?: { promptTotp?: PromptTotpFn }
): Promise<{
  ok: boolean;
  data: unknown;
  error?: string;
  totpRequired?: boolean;
}> {
  const q = itemId ? `?item_id=${encodeURIComponent(itemId)}` : '';
  const res = await livebooksCloudRequestWithStepUp({
    method: 'POST',
    path: `/api/v1/books/${bookId}/plaid/statement_files/sync${q}`,
    body: {},
    promptTotp: opts?.promptTotp,
  });
  if (res.totpRequired) {
    return {
      ok: false,
      data: res.data,
      error: MFA_BROWSER_STEP_UP_MESSAGE,
      totpRequired: true,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      data: res.data,
      error: messageFromCloudResponse(res.data, res.status),
    };
  }
  return { ok: true, data: res.data };
}
