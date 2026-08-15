import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { getLivebooksCloudOrigin } from 'src/utils/livebooksCloudUrls';
import type {
  CloudQbdExportSummary,
  SourceBookListRequest,
  SourceBookListResult,
  SourceBookOpResult,
  SourceBookRecordDetail,
  SourceBookSearchRequest,
  SourceBookSearchResult,
  SourceBookSnapshot,
  SourceBookStatus,
} from 'utils/sourcebooks/types';

/**
 * Renderer client for the Source book archive (user-facing: "QBD Archive").
 * All data lives in the `{company}.sourcebooks/` sidecar and is served by
 * the main process; this module only adds the current book's path and keeps
 * a synchronous status snapshot for the sidebar.
 */

/** Fired on `document` when the archive is attached, replaced, or detached. */
export const SOURCEBOOKS_CHANGED_EVENT = 'sourcebooks-changed';

let cachedStatus: SourceBookStatus | null = null;

export function getBooksDbPath(): string {
  const dbPath = fyo.db.dbPath;
  if (!dbPath || dbPath === ':memory:') {
    throw new Error(t`No company file is open`);
  }
  return dbPath;
}

/** Synchronous snapshot for the sidebar (refreshed on boot and on changes). */
export function isSourceBookAttachedSync(): boolean {
  return !!cachedStatus?.attached;
}

function sourceBookStatusChanged(
  previous: SourceBookStatus,
  next: SourceBookStatus
): boolean {
  if (previous.attached !== next.attached) {
    return true;
  }
  if ((previous.meta?.archiveId ?? '') !== (next.meta?.archiveId ?? '')) {
    return true;
  }
  const prevSnaps = (previous.snapshotNames ?? []).join('\0');
  const nextSnaps = (next.snapshotNames ?? []).join('\0');
  return prevSnaps !== nextSnaps;
}

export async function refreshSourceBookStatus(): Promise<SourceBookStatus> {
  const previous = cachedStatus;
  let status: SourceBookStatus = { attached: false };
  try {
    status = await ipc.sourcebooks.getStatus(getBooksDbPath());
  } catch {
    /* no open book; treat as unattached */
  }
  cachedStatus = status;
  // Fire on attach, detach, *and* replace (new archiveId / snapshots). Skip
  // the first cache fill so sidebar boot does not loop on its own refresh.
  if (previous && sourceBookStatusChanged(previous, status)) {
    document.dispatchEvent(new CustomEvent(SOURCEBOOKS_CHANGED_EVENT));
  }
  return status;
}

export async function getSourceBookStatus(): Promise<SourceBookStatus> {
  if (cachedStatus) {
    return cachedStatus;
  }
  return await refreshSourceBookStatus();
}

/**
 * All archives on Cloud, ready or still extracting. Only `ready: true`
 * archives can be pulled; the rest are shown with their extract progress.
 */
export async function listCloudQbdExports(): Promise<
  { ok: true; exports: CloudQbdExportSummary[] } | { ok: false; error: string }
> {
  return await ipc.sourcebooks.listCloudExports();
}

export async function pullSourceBookFromCloud(
  exportSummary: CloudQbdExportSummary
): Promise<SourceBookOpResult> {
  const result = await ipc.sourcebooks.pullFromCloud({
    booksDbPath: getBooksDbPath(),
    exportId: exportSummary.id,
    companyName: exportSummary.companyName,
    exportedAt: exportSummary.completedAt,
  });
  await refreshSourceBookStatus();
  return result;
}

export async function attachLocalSourceBookZip(
  zipPath: string
): Promise<SourceBookOpResult> {
  const result = await ipc.sourcebooks.attachLocalZip({
    booksDbPath: getBooksDbPath(),
    zipPath,
  });
  await refreshSourceBookStatus();
  return result;
}

export async function detachSourceBook(): Promise<SourceBookOpResult> {
  const result = await ipc.sourcebooks.detach(getBooksDbPath());
  await refreshSourceBookStatus();
  return result;
}

export async function searchSourceBook(
  request: SourceBookSearchRequest
): Promise<SourceBookSearchResult> {
  return await ipc.sourcebooks.search(getBooksDbPath(), request);
}

export async function listSourceBookRecords(
  request: SourceBookListRequest
): Promise<SourceBookListResult> {
  return await ipc.sourcebooks.listRecords(getBooksDbPath(), request);
}

export async function getSourceBookRecord(ref: {
  id?: number;
  qbId?: string;
}): Promise<SourceBookRecordDetail | null> {
  return await ipc.sourcebooks.getRecord(getBooksDbPath(), ref);
}

export async function listSourceBookSnapshots(): Promise<string[]> {
  return await ipc.sourcebooks.listSnapshots(getBooksDbPath());
}

export async function getSourceBookSnapshot(
  name: string
): Promise<SourceBookSnapshot | null> {
  return await ipc.sourcebooks.getSnapshot(getBooksDbPath(), name);
}

/** Route to an archive document by row id or QBD ListID/TxnID. */
export function sourceBookDocRoute(ref: {
  id?: number;
  qbId?: string;
}): string {
  if (ref.qbId) {
    return `/source-books/doc/qb/${encodeURIComponent(ref.qbId)}`;
  }
  return `/source-books/doc/id/${ref.id ?? 0}`;
}

/** Open the Cloud QBD export setup page (manual Web Connector setup). */
export function openCloudQbdExportSetup(): void {
  ipc.openLink(`${getLivebooksCloudOrigin()}/qbd_exports`);
}

/** "as exported from QBD on {date}" label used across archive views. */
export function formatExportedAt(iso?: string): string {
  if (!iso) {
    return t`unknown date`;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function formatArchiveAmount(amount?: number): string {
  if (amount === undefined || amount === null) {
    return '';
  }
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
