import fs from 'fs-extra';
import fetch from 'node-fetch';
import type { Response } from 'node-fetch';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { getSecureToken } from 'utils/secureTokenStore';
import {
  sourceBookDownloadPath,
  sourceBookListPath,
} from 'utils/sourcebooks/cloudEndpoints';
import type { CloudQbdExportSummary } from 'utils/sourcebooks/types';
import { getLivebooksCloudOriginMain } from './livebooksCloudBridge';
import { refreshLivebooksCloudTokens } from './registerIpcMainActionListeners';

const streamPipeline = promisify(pipeline);

/**
 * Bearer-authenticated GET against LiveBooks Online with the same
 * refresh-once-on-401 behaviour as the generic JSON bridge, but usable for
 * binary streaming responses (the QBD archive ZIP).
 */
async function fetchWithCloudAuth(path: string): Promise<Response> {
  const origin = getLivebooksCloudOriginMain();

  const doFetch = async (token: string | undefined) => {
    const headers: Record<string, string> = { Accept: '*/*' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return await fetch(`${origin}${path}`, { method: 'GET', headers });
  };

  const access = getSecureToken('livebooksCloudAccessToken');
  const res = await doFetch(typeof access === 'string' ? access : undefined);
  if (res.status !== 401) {
    return res;
  }

  const refreshed = await refreshLivebooksCloudTokens(origin);
  if (!refreshed) {
    return res;
  }
  return await doFetch(refreshed.access_token);
}

function normalizeExport(raw: unknown): CloudQbdExportSummary | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const rec = raw as Record<string, unknown>;
  const id = rec.id;
  if (typeof id !== 'string' && typeof id !== 'number') {
    return null;
  }
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  return {
    id: String(id),
    companyName: str(rec.company_name) ?? str(rec.companyName),
    status: str(rec.status),
    ready: rec.ready === true,
    progressPercentage: num(rec.progress_percentage),
    completedAt: str(rec.completed_at) ?? str(rec.completedAt),
    createdAt: str(rec.created_at) ?? str(rec.createdAt),
    entitiesComplete: num(rec.entities_complete),
    entitiesFailed: num(rec.entities_failed),
    totalRecords: num(rec.total_records),
  };
}

/** List archives from Online (all of them; the UI decides what is pullable). */
export async function listCloudQbdExports(): Promise<
  { ok: true; exports: CloudQbdExportSummary[] } | { ok: false; error: string }
> {
  let res: Response;
  try {
    res = await fetchWithCloudAuth(sourceBookListPath());
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  if (!res.ok) {
    return { ok: false, error: `Online returned HTTP ${res.status}` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: 'Online returned a non-JSON response' };
  }

  const rawList =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).archives
      : undefined;
  if (!Array.isArray(rawList)) {
    return { ok: false, error: 'Unexpected archive list shape from Online' };
  }

  const exports: CloudQbdExportSummary[] = [];
  for (const raw of rawList) {
    const normalized = normalizeExport(raw);
    if (normalized) {
      exports.push(normalized);
    }
  }
  return { ok: true, exports };
}

/**
 * Map the download endpoint's error bodies (404 not_found, 409 not_ready,
 * 500 archive_failed) to messages a user can act on.
 */
async function downloadErrorMessage(res: Response): Promise<string> {
  let code = '';
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === 'string') {
      code = body.error;
    }
  } catch {
    /* non-JSON error body; fall through to the HTTP status */
  }
  if (res.status === 409 || code === 'not_ready') {
    return (
      'This archive is not finished on Online yet. ' +
      'Wait for the extract to complete, then check again.'
    );
  }
  if (res.status === 404 || code === 'not_found') {
    return 'This archive no longer exists on Online. Check again for the current list.';
  }
  if (code === 'archive_failed') {
    return 'Online could not build the archive ZIP. Try re-running the export on Online.';
  }
  return `Online returned HTTP ${res.status}`;
}

/**
 * Stream one QBD export ZIP to `destPath` (one-shot pull, no polling).
 * Writes to `{destPath}.download` then renames, so an interrupted download
 * never looks like a complete archive.
 */
export async function downloadCloudQbdExportZip(options: {
  exportId: string;
  destPath: string;
  onBytes?: (bytes: number) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { exportId, destPath, onBytes } = options;
  const tmpPath = `${destPath}.download`;

  let res: Response;
  try {
    res = await fetchWithCloudAuth(sourceBookDownloadPath(exportId));
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  if (!res.ok || !res.body) {
    return { ok: false, error: await downloadErrorMessage(res) };
  }

  try {
    await fs.ensureFile(tmpPath);
    let bytes = 0;
    res.body.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      onBytes?.(bytes);
    });
    await streamPipeline(res.body, fs.createWriteStream(tmpPath));
    await fs.move(tmpPath, destPath, { overwrite: true });
    return { ok: true };
  } catch (err) {
    await fs.remove(tmpPath).catch(() => undefined);
    return { ok: false, error: (err as Error).message };
  }
}
