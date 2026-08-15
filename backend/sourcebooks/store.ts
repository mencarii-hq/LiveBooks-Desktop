import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import type {
  SourceBookCopiedRecord,
  SourceBookEntityCount,
  SourceBookLink,
  SourceBookListRequest,
  SourceBookListResult,
  SourceBookMeta,
  SourceBookRecordDetail,
  SourceBookRecordSummary,
  SourceBookSearchRequest,
  SourceBookSearchResult,
  SourceBookSnapshot,
  SourceBookStatus,
} from 'utils/sourcebooks/types';
import { buildIndex, ProgressCallback } from './indexer';
import {
  archiveZipPath,
  assertBooksDbPath,
  indexDbPath,
  sidecarDirForDbPath,
} from './sidecar';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

interface RecordRow {
  id: number;
  entity_type: string;
  qb_id: string | null;
  id_kind: string;
  name: string | null;
  ref_number: string | null;
  txn_date: string | null;
  amount: number | null;
  memo: string | null;
  parent_id: string | null;
  entity_name: string | null;
}

function toSummary(row: RecordRow): SourceBookRecordSummary {
  return {
    id: row.id,
    entityType: row.entity_type,
    qbId: row.qb_id ?? undefined,
    idKind: (row.id_kind as SourceBookRecordSummary['idKind']) ?? 'other',
    name: row.name ?? undefined,
    refNumber: row.ref_number ?? undefined,
    txnDate: row.txn_date ?? undefined,
    amount: row.amount ?? undefined,
    memo: row.memo ?? undefined,
    parentId: row.parent_id ?? undefined,
    entityName: row.entity_name ?? undefined,
  };
}

/**
 * Convert free text into an FTS5 MATCH expression: each token quoted (so
 * user input can never inject FTS syntax) with prefix matching.
 */
export function toFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .map((token) => token.replace(/"/g, '').trim())
    .filter(Boolean)
    .map((token) => `"${token}"*`)
    .join(' ');
}

/**
 * Read-side access to one attached Source book archive index, plus the
 * attach/replace/detach lifecycle. Only ever touches the sidecar directory —
 * never the `.books` ledger.
 */
export class SourceBookStore {
  private handles = new Map<string, Database>();
  private busy = new Set<string>();

  private openDb(booksDbPath: string): Database | null {
    const dbPath = this.paths(booksDbPath).index;
    const cached = this.handles.get(dbPath);
    if (cached) {
      return cached;
    }
    if (!fs.existsSync(dbPath)) {
      return null;
    }
    const db = new BetterSqlite3(dbPath, { readonly: false });
    // Read-mostly sidecar; only copied_records is written after indexing.
    db.pragma('journal_mode = WAL');
    this.handles.set(dbPath, db);
    return db;
  }

  private closeDb(booksDbPath: string): void {
    const dbPath = this.paths(booksDbPath).index;
    const cached = this.handles.get(dbPath);
    if (cached) {
      cached.close();
      this.handles.delete(dbPath);
    }
  }

  paths(booksDbPath: string) {
    const books = assertBooksDbPath(booksDbPath);
    const sidecar = sidecarDirForDbPath(books);
    return {
      books,
      sidecar,
      zip: archiveZipPath(sidecar),
      index: indexDbPath(sidecar),
    };
  }

  isBusy(booksDbPath: string): boolean {
    return this.busy.has(this.paths(booksDbPath).sidecar);
  }

  getStatus(booksDbPath: string): SourceBookStatus {
    const { sidecar } = this.paths(booksDbPath);
    const db = this.openDb(booksDbPath);
    if (!db) {
      return { attached: false, busy: this.isBusy(booksDbPath) };
    }

    const metaRows = db
      .prepare('SELECT key, value FROM archive_meta')
      .all() as { key: string; value: string }[];
    const meta = Object.fromEntries(
      metaRows.map((r) => [r.key, r.value])
    ) as unknown as SourceBookMeta;

    const entityCounts = (
      db
        .prepare(
          `SELECT entity_type, COUNT(*) as count FROM records
           GROUP BY entity_type ORDER BY count DESC`
        )
        .all() as { entity_type: string; count: number }[]
    ).map((r) => ({ entityType: r.entity_type, count: r.count }));

    const snapshotNames = (
      db.prepare('SELECT name FROM report_snapshots ORDER BY name').all() as {
        name: string;
      }[]
    ).map((r) => r.name);

    return {
      attached: true,
      sidecarPath: sidecar,
      meta,
      entityCounts,
      snapshotNames,
      busy: this.isBusy(booksDbPath),
    };
  }

  /**
   * Attach (or replace) the archive for a book from a ZIP already on disk.
   * `zipSource` is copied into the sidecar unless it is already there.
   * One archive per book: any existing index/ZIP is replaced, never unioned.
   */
  async attachZip(options: {
    booksDbPath: string;
    zipSource: string;
    meta: Omit<SourceBookMeta, 'archiveId' | 'attachedAt'>;
    onProgress?: ProgressCallback;
  }): Promise<SourceBookStatus> {
    const { booksDbPath, zipSource, meta, onProgress } = options;
    const paths = this.paths(booksDbPath);
    if (this.busy.has(paths.sidecar)) {
      throw new Error('An archive operation is already in progress');
    }

    this.busy.add(paths.sidecar);
    try {
      this.closeDb(booksDbPath);
      await fs.ensureDir(paths.sidecar);

      // Copy the source ZIP into the sidecar unless it was downloaded there.
      const sameFile =
        fs.existsSync(paths.zip) &&
        fs.existsSync(zipSource) &&
        (await fs.stat(paths.zip)).ino === (await fs.stat(zipSource)).ino;
      if (!sameFile && zipSource !== paths.zip) {
        onProgress?.({ stage: 'copying' });
        await fs.copy(zipSource, paths.zip, { overwrite: true });
      }

      const fullMeta: SourceBookMeta = {
        ...meta,
        archiveId: randomUUID(),
        attachedAt: new Date().toISOString(),
      };
      await buildIndex({
        zipPath: paths.zip,
        indexPath: paths.index,
        meta: fullMeta,
        onProgress,
      });
      onProgress?.({ stage: 'done' });
    } finally {
      this.busy.delete(paths.sidecar);
    }
    return this.getStatus(booksDbPath);
  }

  /** Remove the sidecar entirely (ZIP + index). */
  async detach(booksDbPath: string): Promise<void> {
    const paths = this.paths(booksDbPath);
    if (this.busy.has(paths.sidecar)) {
      throw new Error('An archive operation is already in progress');
    }
    this.closeDb(booksDbPath);
    await fs.remove(paths.sidecar);
  }

  search(
    booksDbPath: string,
    request: SourceBookSearchRequest
  ): SourceBookSearchResult {
    const db = this.openDb(booksDbPath);
    if (!db) {
      return { rows: [], groupCounts: [], total: 0 };
    }

    const limit = Math.min(request.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(request.offset ?? 0, 0);
    const ftsQuery = toFtsQuery(request.query ?? '');

    const filters: string[] = [];
    const params: unknown[] = [];
    if (request.entityType) {
      // Trailing '*' means prefix match (e.g. 'item*' covers all item types).
      if (request.entityType.endsWith('*')) {
        filters.push('r.entity_type LIKE ?');
        params.push(`${request.entityType.slice(0, -1)}%`);
      } else {
        filters.push('r.entity_type = ?');
        params.push(request.entityType);
      }
    }
    if (request.dateFrom) {
      filters.push('r.txn_date >= ?');
      params.push(request.dateFrom);
    }
    if (request.dateTo) {
      filters.push('r.txn_date <= ?');
      params.push(request.dateTo);
    }

    let fromClause: string;
    let matchParams: unknown[];
    let orderBy: string;
    if (ftsQuery) {
      fromClause = `records_fts f JOIN records r ON r.id = f.rowid
        WHERE records_fts MATCH ?`;
      matchParams = [ftsQuery];
      orderBy = 'ORDER BY rank';
    } else {
      fromClause = 'records r WHERE 1=1';
      matchParams = [];
      orderBy = 'ORDER BY r.entity_type, r.name';
    }
    const filterSql = filters.length ? ` AND ${filters.join(' AND ')}` : '';

    const rows = (
      db
        .prepare(
          `SELECT r.id, r.entity_type, r.qb_id, r.id_kind, r.name,
                  r.ref_number, r.txn_date, r.amount, r.memo, r.parent_id,
                  r.entity_name
           FROM ${fromClause}${filterSql} ${orderBy} LIMIT ? OFFSET ?`
        )
        .all(...matchParams, ...params, limit, offset) as RecordRow[]
    ).map(toSummary);

    const groupCounts = db
      .prepare(
        `SELECT r.entity_type as entityType, COUNT(*) as count
         FROM ${fromClause}${filterSql}
         GROUP BY r.entity_type ORDER BY count DESC`
      )
      .all(...matchParams, ...params) as SourceBookEntityCount[];

    const total = groupCounts.reduce((sum, g) => sum + g.count, 0);
    return { rows, groupCounts, total };
  }

  listRecords(
    booksDbPath: string,
    request: SourceBookListRequest
  ): SourceBookListResult {
    const db = this.openDb(booksDbPath);
    if (!db) {
      return { rows: [], total: 0 };
    }
    const limit = Math.min(request.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(request.offset ?? 0, 0);

    const filters: string[] = [];
    const params: unknown[] = [];
    if (request.entityType.endsWith('*')) {
      filters.push('entity_type LIKE ?');
      params.push(`${request.entityType.slice(0, -1)}%`);
    } else {
      filters.push('entity_type = ?');
      params.push(request.entityType);
    }
    if (request.parentId !== undefined) {
      if (request.parentId === '') {
        filters.push('parent_id IS NULL');
      } else {
        filters.push('parent_id = ?');
        params.push(request.parentId);
      }
    }
    const where = filters.join(' AND ');

    const rows = (
      db
        .prepare(
          `SELECT id, entity_type, qb_id, id_kind, name, ref_number, txn_date,
                  amount, memo, parent_id, entity_name
           FROM records WHERE ${where}
           ORDER BY COALESCE(txn_date, '') DESC, name COLLATE NOCASE
           LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset) as RecordRow[]
    ).map(toSummary);

    const total = (
      db
        .prepare(`SELECT COUNT(*) as count FROM records WHERE ${where}`)
        .get(...params) as { count: number }
    ).count;

    return { rows, total };
  }

  listEntityTypes(booksDbPath: string): SourceBookEntityCount[] {
    return this.getStatus(booksDbPath).entityCounts ?? [];
  }

  private summaryByQbId(
    db: Database,
    qbId: string
  ): SourceBookRecordSummary | undefined {
    const row = db
      .prepare(
        `SELECT id, entity_type, qb_id, id_kind, name, ref_number, txn_date,
                amount, memo, parent_id, entity_name
         FROM records WHERE qb_id = ? LIMIT 1`
      )
      .get(qbId) as RecordRow | undefined;
    return row ? toSummary(row) : undefined;
  }

  /**
   * Fetch one record with its full Ret JSON and resolved link graph.
   * Links resolve strictly by ListID/TxnID — never by name.
   */
  getRecord(
    booksDbPath: string,
    ref: { id?: number; qbId?: string }
  ): SourceBookRecordDetail | null {
    const db = this.openDb(booksDbPath);
    if (!db) {
      return null;
    }

    let row: (RecordRow & { data: string }) | undefined;
    if (ref.id !== undefined) {
      row = db
        .prepare('SELECT * FROM records WHERE id = ?')
        .get(ref.id) as typeof row;
    } else if (ref.qbId) {
      row = db
        .prepare('SELECT * FROM records WHERE qb_id = ? LIMIT 1')
        .get(ref.qbId) as typeof row;
    }
    if (!row) {
      return null;
    }

    const record = toSummary(row);
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      /* leave empty; raw JSON is unreadable */
    }

    interface LinkRow {
      from_qb_id: string | null;
      to_qb_id: string;
      link_kind: string;
      ref_field: string | null;
      to_txn_type: string | null;
    }

    const outgoing: SourceBookLink[] = (
      db
        .prepare('SELECT * FROM record_links WHERE from_id = ?')
        .all(row.id) as LinkRow[]
    ).map((l) => ({
      kind: l.link_kind as SourceBookLink['kind'],
      refField: l.ref_field ?? undefined,
      toTxnType: l.to_txn_type ?? undefined,
      qbId: l.to_qb_id,
      record: this.summaryByQbId(db, l.to_qb_id),
    }));

    const incoming: SourceBookLink[] = record.qbId
      ? (
          db
            .prepare(
              `SELECT * FROM record_links WHERE to_qb_id = ?
               AND from_qb_id IS NOT NULL AND from_qb_id != ?`
            )
            .all(record.qbId, record.qbId) as LinkRow[]
        ).map((l) => ({
          kind: l.link_kind as SourceBookLink['kind'],
          refField: l.ref_field ?? undefined,
          toTxnType: l.to_txn_type ?? undefined,
          qbId: l.from_qb_id as string,
          record: this.summaryByQbId(db, l.from_qb_id as string),
        }))
      : [];

    let copiedTo: SourceBookRecordDetail['copiedTo'];
    if (record.qbId) {
      const copied = db
        .prepare(
          `SELECT target_schema, target_name, copied_at FROM copied_records
           WHERE qb_id = ? LIMIT 1`
        )
        .get(record.qbId) as
        | { target_schema: string; target_name: string; copied_at: string }
        | undefined;
      if (copied) {
        copiedTo = {
          targetSchema: copied.target_schema,
          targetName: copied.target_name,
          copiedAt: copied.copied_at,
        };
      }
    }

    return { record, data, outgoing, incoming, copiedTo };
  }

  listSnapshots(booksDbPath: string): string[] {
    const db = this.openDb(booksDbPath);
    if (!db) {
      return [];
    }
    return (
      db.prepare('SELECT name FROM report_snapshots ORDER BY name').all() as {
        name: string;
      }[]
    ).map((r) => r.name);
  }

  getSnapshot(booksDbPath: string, name: string): SourceBookSnapshot | null {
    const db = this.openDb(booksDbPath);
    if (!db) {
      return null;
    }
    const row = db
      .prepare('SELECT name, data FROM report_snapshots WHERE name = ?')
      .get(name) as { name: string; data: string } | undefined;
    return row ?? null;
  }

  markCopied(booksDbPath: string, copied: SourceBookCopiedRecord): void {
    const db = this.openDb(booksDbPath);
    if (!db) {
      throw new Error('No archive attached');
    }
    db.prepare(
      `INSERT OR REPLACE INTO copied_records
        (qb_id, archive_id, target_schema, target_name, copied_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      copied.qbId,
      copied.archiveId,
      copied.targetSchema,
      copied.targetName,
      copied.copiedAt
    );
  }

  getCopied(booksDbPath: string, qbId: string): SourceBookCopiedRecord | null {
    const db = this.openDb(booksDbPath);
    if (!db) {
      return null;
    }
    const row = db
      .prepare('SELECT * FROM copied_records WHERE qb_id = ? LIMIT 1')
      .get(qbId) as
      | {
          qb_id: string;
          archive_id: string;
          target_schema: string;
          target_name: string;
          copied_at: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      qbId: row.qb_id,
      archiveId: row.archive_id,
      targetSchema: row.target_schema,
      targetName: row.target_name,
      copiedAt: row.copied_at,
    };
  }

  /** Close every open handle (app shutdown / company switch). */
  closeAll(): void {
    for (const db of this.handles.values()) {
      db.close();
    }
    this.handles.clear();
  }
}

export const sourceBookStore = new SourceBookStore();
