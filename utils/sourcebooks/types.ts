/**
 * Source book archive (user-facing: "QBD Archive") shared types.
 *
 * These types cross the IPC boundary between the renderer and the main
 * process. The archive lives in a `{company}.sourcebooks/` sidecar next to
 * the open `.books` file and is never written into the live ledger.
 */

export type SourceBookOrigin = 'cloud' | 'local';

/** Row stored in the sidecar `archive_meta` table (all values are strings). */
export interface SourceBookMeta {
  /** Random id minted when the archive is attached; stamps copied rows. */
  archiveId: string;
  origin: SourceBookOrigin;
  /** Cloud QBD export id, when origin is 'cloud'. */
  exportId?: string;
  companyName?: string;
  /** When the QBD extract finished on Cloud (ISO8601), when known. */
  exportedAt?: string;
  /** When Desktop pulled/attached the ZIP (ISO8601). */
  attachedAt?: string;
  /** When indexing finished (ISO8601). */
  indexedAt?: string;
  /** Raw manifest.json contents, when present in the ZIP. */
  manifestJson?: string;
}

export interface SourceBookEntityCount {
  entityType: string;
  count: number;
}

export interface SourceBookStatus {
  attached: boolean;
  /** Sidecar directory path (exists only when attached). */
  sidecarPath?: string;
  meta?: SourceBookMeta;
  entityCounts?: SourceBookEntityCount[];
  snapshotNames?: string[];
  /** Set while a pull/index is in progress. */
  busy?: boolean;
}

/** Summary row from the sidecar index (full Ret JSON excluded). */
export interface SourceBookRecordSummary {
  id: number;
  entityType: string;
  /** ListID or TxnID from QBD, when present. */
  qbId?: string;
  idKind: 'list' | 'txn' | 'other';
  name?: string;
  refNumber?: string;
  txnDate?: string;
  amount?: number;
  memo?: string;
  /** Parent ListID (customer jobs, sub-accounts, sub-items). */
  parentId?: string;
  /** Customer/vendor/account name attached to a transaction. */
  entityName?: string;
}

export interface SourceBookLink {
  kind: 'linked_txn' | 'applied_to_txn' | 'ref' | 'parent';
  /** Which `*_ref` field produced a 'ref' link (e.g. `customer_ref`). */
  refField?: string;
  toTxnType?: string;
  qbId: string;
  /** Resolved target/source record, when the id exists in the index. */
  record?: SourceBookRecordSummary;
}

export interface SourceBookRecordDetail {
  record: SourceBookRecordSummary;
  /** Full Ret JSON as extracted from the ZIP (parsed). */
  data: Record<string, unknown>;
  /** Links out of this record (refs, linked txns). */
  outgoing: SourceBookLink[];
  /** Records elsewhere in the archive pointing at this record. */
  incoming: SourceBookLink[];
  /** Set when this record was copied into the live book. */
  copiedTo?: { targetSchema: string; targetName: string; copiedAt: string };
}

export interface SourceBookSearchRequest {
  query: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface SourceBookSearchResult {
  rows: SourceBookRecordSummary[];
  /** Counts per entity type for the whole match set (drives grouping UI). */
  groupCounts: SourceBookEntityCount[];
  total: number;
}

export interface SourceBookListRequest {
  entityType: string;
  limit?: number;
  offset?: number;
  /** Only children of this parent ListID (e.g. jobs of a customer). */
  parentId?: string;
}

export interface SourceBookListResult {
  rows: SourceBookRecordSummary[];
  total: number;
}

export interface SourceBookSnapshot {
  name: string;
  /** Raw snapshot JSON string from report_snapshots/ in the ZIP. */
  data: string;
}

/** One QBD export/archive as listed from Online (`GET /api/v1/source-books`). */
export interface CloudQbdExportSummary {
  id: string;
  companyName?: string;
  status?: string;
  /** Only archives with `ready: true` can be downloaded. */
  ready: boolean;
  /** Extract progress (0-100) while not ready. */
  progressPercentage?: number;
  completedAt?: string;
  createdAt?: string;
  entitiesComplete?: number;
  entitiesFailed?: number;
  totalRecords?: number;
}

export interface SourceBookProgress {
  stage: 'downloading' | 'copying' | 'indexing' | 'done' | 'error';
  /** Bytes downloaded so far, when downloading. */
  bytes?: number;
  entityType?: string;
  /** Records indexed so far, when indexing. */
  count?: number;
  error?: string;
}

export type SourceBookOpResult =
  | { ok: true; status: SourceBookStatus }
  | { ok: false; error: string };

export interface SourceBookCopiedRecord {
  qbId: string;
  archiveId: string;
  targetSchema: string;
  targetName: string;
  copiedAt: string;
}
