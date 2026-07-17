import { t } from 'fyo';
import {
  livebooksCloudRequest,
  openLivebooksCloudMfaStepUp,
} from 'src/utils/livebooksCloud';
import { MFA_BROWSER_STEP_UP_MESSAGE } from 'src/utils/plaidBankFeedsApi';
import { setBankSyncMfaPaused } from 'src/utils/plaidBankSyncMfaGate';

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

function handleTotpRequired(): {
  error: string;
  needsTotp: true;
} {
  openLivebooksCloudMfaStepUp();
  setBankSyncMfaPaused(true);
  return { error: MFA_BROWSER_STEP_UP_MESSAGE, needsTotp: true };
}

export async function requestPlaidLinkToken(
  bookId: string,
  options?: { itemId?: string }
): Promise<{
  linkToken?: string;
  error?: string;
  needsTotp?: boolean;
  mfaNotConfigured?: boolean;
}> {
  const body: Record<string, string> = {};
  if (options?.itemId) {
    body.item_id = options.itemId;
  }
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${encodeURIComponent(bookId)}/plaid/link_token`,
    body: Object.keys(body).length ? body : {},
  });
  if (!res.ok) {
    const err = messageFromCloudResponse(res.data, res.status);
    const code =
      res.data && typeof res.data === 'object'
        ? (res.data as { error?: string }).error
        : undefined;
    const needsTotp = res.status === 401 && code === 'totp_required';
    const mfaNotConfigured =
      res.status === 403 && code === 'mfa_not_configured';
    if (needsTotp) {
      return handleTotpRequired();
    }
    return { error: err, needsTotp, mfaNotConfigured };
  }
  if (!res.data || typeof res.data !== 'object') {
    return { error: messageFromCloudResponse(res.data, res.status) };
  }
  const linkToken = (res.data as { link_token?: unknown }).link_token;
  if (typeof linkToken !== 'string' || linkToken.length === 0) {
    return { error: messageFromCloudResponse(res.data, res.status) };
  }
  return { linkToken };
}

export async function requestPlaidLinkTokenWithStepUp(
  bookId: string,
  options?: { itemId?: string }
): Promise<{
  linkToken?: string;
  error?: string;
  mfaNotConfigured?: boolean;
  needsBrowserStepUp?: boolean;
}> {
  const res = await requestPlaidLinkToken(
    bookId,
    options?.itemId ? { itemId: options.itemId } : undefined
  );
  if (res.mfaNotConfigured) {
    return { error: res.error, mfaNotConfigured: true };
  }
  if (res.needsTotp) {
    return {
      error: res.error ?? MFA_BROWSER_STEP_UP_MESSAGE,
      needsBrowserStepUp: true,
    };
  }
  if (res.error || !res.linkToken) {
    return { error: res.error ?? t`Could not start Plaid Link.` };
  }
  return { linkToken: res.linkToken };
}

export async function exchangePlaidPublicToken(
  bookId: string,
  publicToken: string
): Promise<{
  ok: boolean;
  error?: string;
  needsTotp?: boolean;
  mfaNotConfigured?: boolean;
}> {
  const body: Record<string, string> = { public_token: publicToken };
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${encodeURIComponent(bookId)}/plaid/exchange`,
    body,
  });
  if (!res.ok) {
    const err = messageFromCloudResponse(res.data, res.status);
    const code =
      res.data && typeof res.data === 'object'
        ? (res.data as { error?: string }).error
        : undefined;
    const needsTotp = res.status === 401 && code === 'totp_required';
    const mfaNotConfigured =
      res.status === 403 && code === 'mfa_not_configured';
    if (needsTotp) {
      const handled = handleTotpRequired();
      return { ok: false, ...handled };
    }
    return { ok: false, error: err, needsTotp, mfaNotConfigured };
  }
  return { ok: true };
}

export async function exchangePlaidPublicTokenWithStepUp(
  bookId: string,
  publicToken: string
): Promise<{
  ok: boolean;
  error?: string;
  mfaNotConfigured?: boolean;
  needsBrowserStepUp?: boolean;
}> {
  const ex = await exchangePlaidPublicToken(bookId, publicToken);
  if (ex.mfaNotConfigured) {
    return ex;
  }
  if (ex.needsTotp) {
    return {
      ok: false,
      error: ex.error ?? MFA_BROWSER_STEP_UP_MESSAGE,
      needsBrowserStepUp: true,
    };
  }
  return ex;
}
