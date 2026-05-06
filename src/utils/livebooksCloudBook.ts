import type { Fyo } from 'fyo';
import {
  getLivebooksCloudSessionSummary,
  livebooksCloudRequest,
} from 'src/utils/livebooksCloud';

export type CloudBookContext =
  | { ok: true; bookId: string }
  | {
      ok: false;
      reason: 'not_signed_in' | 'no_instance' | 'api_error';
      message?: string;
    };

/**
 * Resolves the cloud book UUID for the open company file using
 * `SystemSettings.instanceId` as `gnu_book_guid`. Creates the cloud book on
 * first success when lookup returns 404.
 */
export async function ensureLivebooksCloudBookId(
  fyo: Fyo
): Promise<CloudBookContext> {
  const { signedIn } = await getLivebooksCloudSessionSummary();
  if (!signedIn) {
    return { ok: false, reason: 'not_signed_in' };
  }

  const gnu = fyo.store.instanceId;
  if (!gnu) {
    return { ok: false, reason: 'no_instance' };
  }

  const lookup = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/lookup?gnu_book_guid=${encodeURIComponent(gnu)}`,
  });

  if (lookup.ok && lookup.data && typeof lookup.data === 'object') {
    const id = (lookup.data as { book_id?: unknown }).book_id;
    if (typeof id === 'string' && id.length > 0) {
      return { ok: true, bookId: id };
    }
  }

  if (lookup.status === 404) {
    const companyName =
      (
        fyo.singles.AccountingSettings?.companyName as string | undefined
      )?.trim() || 'LiveBooks';
    const created = await livebooksCloudRequest({
      method: 'POST',
      path: '/api/v1/books',
      body: { gnu_book_guid: gnu, name: companyName },
    });
    if (
      created.ok &&
      created.data &&
      typeof created.data === 'object' &&
      typeof (created.data as { book_id?: unknown }).book_id === 'string'
    ) {
      return {
        ok: true,
        bookId: (created.data as { book_id: string }).book_id,
      };
    }
    const msg =
      created.data &&
      typeof created.data === 'object' &&
      'message' in created.data
        ? String((created.data as { message: unknown }).message)
        : undefined;
    return {
      ok: false,
      reason: 'api_error',
      message:
        msg ?? `Could not create cloud book (HTTP ${String(created.status)}).`,
    };
  }

  const msg =
    lookup.data && typeof lookup.data === 'object' && 'message' in lookup.data
      ? String((lookup.data as { message: unknown }).message)
      : undefined;
  return {
    ok: false,
    reason: 'api_error',
    message: msg ?? `Cloud book lookup failed (HTTP ${String(lookup.status)}).`,
  };
}
