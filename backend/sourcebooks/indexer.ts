import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import StreamZip from 'node-stream-zip';
import type {
  SourceBookMeta,
  SourceBookProgress,
} from 'utils/sourcebooks/types';
import { resolveEntityType } from 'utils/sourcebooks/entityTypes';
import { extractRecord } from './extract';
import { iterateJsonArrayItems } from './jsonArrayStream';

export type ProgressCallback = (progress: SourceBookProgress) => void;

const INSERT_BATCH_SIZE = 500;

/**
 * Sidecar index schema. One row per QBD list/txn record; the full Ret JSON
 * rides along in `data` so viewers never re-open the ZIP. FTS5 is populated
 * once after the bulk insert (the index is read-only afterwards).
 */
const SCHEMA_SQL = `
CREATE TABLE archive_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE records (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  qb_id TEXT,
  id_kind TEXT NOT NULL,
  name TEXT,
  ref_number TEXT,
  txn_date TEXT,
  amount REAL,
  memo TEXT,
  parent_id TEXT,
  entity_name TEXT,
  data TEXT NOT NULL
);
CREATE INDEX idx_records_type_name ON records(entity_type, name);
CREATE INDEX idx_records_qb_id ON records(qb_id);
CREATE INDEX idx_records_parent ON records(parent_id);
CREATE INDEX idx_records_date ON records(txn_date);
CREATE TABLE record_links (
  from_id INTEGER NOT NULL,
  from_qb_id TEXT,
  to_qb_id TEXT NOT NULL,
  link_kind TEXT NOT NULL,
  ref_field TEXT,
  to_txn_type TEXT
);
CREATE INDEX idx_links_from ON record_links(from_qb_id);
CREATE INDEX idx_links_to ON record_links(to_qb_id);
CREATE VIRTUAL TABLE records_fts USING fts5(
  name, ref_number, memo, entity_name, qb_id,
  content='records', content_rowid='id', tokenize='unicode61'
);
CREATE TABLE report_snapshots (name TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE copied_records (
  qb_id TEXT NOT NULL,
  archive_id TEXT NOT NULL,
  target_schema TEXT NOT NULL,
  target_name TEXT NOT NULL,
  copied_at TEXT NOT NULL,
  PRIMARY KEY (qb_id, archive_id)
);
`;

interface ZipEntryPlan {
  entryName: string;
  kind: 'entity' | 'snapshot' | 'manifest';
  /** entity type or snapshot name */
  name: string;
}

/**
 * Classify ZIP entries. The Cloud archive ZIP layout is:
 *   manifest.json
 *   entities/<entity_type>.json
 *   report_snapshots/<report>.json
 *   reconciliation/transactions.json   (metadata-only; surfaced via manifest)
 * Older Cloud web downloads and hand-made local ZIPs put entity files at the
 * root or inside a single `{Company}_extracted_QBD_files/` folder — keep
 * accepting those.
 */
export function classifyZipEntry(entryName: string): ZipEntryPlan | null {
  const normalized = entryName.replace(/\\/g, '/');
  if (normalized.endsWith('/')) {
    return null;
  }
  const parts = normalized.split('/').filter(Boolean);
  const base = parts[parts.length - 1];
  if (!base.toLowerCase().endsWith('.json')) {
    return null;
  }
  const stem = base.slice(0, -'.json'.length);

  if (stem.toLowerCase() === 'manifest') {
    return { entryName, kind: 'manifest', name: 'manifest' };
  }
  const dirParts = parts.slice(0, -1).map((p) => p.toLowerCase());
  if (dirParts.includes('report_snapshots')) {
    return { entryName, kind: 'snapshot', name: stem };
  }
  // Reconciliation counts are duplicated in the manifest; skip the file.
  if (dirParts.includes('reconciliation')) {
    return null;
  }
  if (dirParts.includes('entities')) {
    return { entryName, kind: 'entity', name: resolveEntityType(stem) };
  }
  // Legacy layouts: entity files at the root or exactly one folder deep.
  if (parts.length > 2) {
    return null;
  }
  return { entryName, kind: 'entity', name: resolveEntityType(stem) };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Pull display metadata out of manifest.json without trusting its shape. */
export function metaFromManifest(
  manifestJson: string
): Partial<SourceBookMeta> {
  const out: Partial<SourceBookMeta> = {};
  try {
    const parsed = JSON.parse(manifestJson) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) {
      return out;
    }
    for (const key of ['exported_at', 'completed_at', 'exportedAt']) {
      const v = parsed[key];
      if (typeof v === 'string' && v) {
        out.exportedAt = v;
        break;
      }
    }
    for (const key of ['company_name', 'companyName', 'company']) {
      const v = parsed[key];
      if (typeof v === 'string' && v) {
        out.companyName = v;
        break;
      }
    }
  } catch {
    /* manifest is informational; ignore malformed content */
  }
  return out;
}

/**
 * Build the sidecar FTS index from the archive ZIP. Streams each per-entity
 * JSON file (never the whole ZIP into RAM), one row per list/txn record.
 * Writes to `{indexPath}.tmp` and renames on success so a crash never leaves
 * a half-built index behind.
 */
export async function buildIndex(options: {
  zipPath: string;
  indexPath: string;
  meta: SourceBookMeta;
  onProgress?: ProgressCallback;
}): Promise<void> {
  const { zipPath, indexPath, meta, onProgress } = options;
  const tmpPath = `${indexPath}.tmp`;
  await fs.remove(tmpPath);
  await fs.ensureDir(path.dirname(indexPath));

  const db = new BetterSqlite3(tmpPath);
  const zip = new StreamZip.async({ file: zipPath });

  try {
    db.pragma('journal_mode = MEMORY');
    db.pragma('synchronous = OFF');
    db.exec(SCHEMA_SQL);

    const insertRecord = db.prepare(
      `INSERT INTO records
        (entity_type, qb_id, id_kind, name, ref_number, txn_date, amount,
         memo, parent_id, entity_name, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertLink = db.prepare(
      `INSERT INTO record_links
        (from_id, from_qb_id, to_qb_id, link_kind, ref_field, to_txn_type)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertSnapshot = db.prepare(
      'INSERT OR REPLACE INTO report_snapshots (name, data) VALUES (?, ?)'
    );
    const insertMeta = db.prepare(
      'INSERT OR REPLACE INTO archive_meta (key, value) VALUES (?, ?)'
    );

    const entries = await zip.entries();
    const plans: ZipEntryPlan[] = [];
    for (const entry of Object.values(entries)) {
      const plan = classifyZipEntry(entry.name);
      if (plan) {
        plans.push(plan);
      }
    }

    let manifestJson: string | undefined;
    let indexedCount = 0;

    for (const plan of plans) {
      if (plan.kind === 'manifest') {
        const data = await zip.entryData(plan.entryName);
        manifestJson = data.toString('utf8');
        continue;
      }
      if (plan.kind === 'snapshot') {
        const data = await zip.entryData(plan.entryName);
        insertSnapshot.run(plan.name, data.toString('utf8'));
        continue;
      }

      onProgress?.({
        stage: 'indexing',
        entityType: plan.name,
        count: indexedCount,
      });

      // node-stream-zip types the stream as NodeJS.ReadableStream; it is a
      // stream.Readable at runtime (required for async iteration).
      const stream = (await zip.stream(
        plan.entryName
      )) as unknown as import('stream').Readable;
      let batch: (() => void)[] = [];

      const flushBatch = () => {
        if (!batch.length) {
          return;
        }
        const ops = batch;
        batch = [];
        db.transaction(() => {
          for (const op of ops) {
            op();
          }
        })();
      };

      for await (const item of iterateJsonArrayItems(stream)) {
        const extracted = extractRecord(item);
        if (!extracted) {
          continue;
        }
        const json = JSON.stringify(item);
        const links = extracted.links;
        const entityType = plan.name;
        batch.push(() => {
          const info = insertRecord.run(
            entityType,
            extracted.qbId ?? null,
            extracted.idKind,
            extracted.name ?? null,
            extracted.refNumber ?? null,
            extracted.txnDate ?? null,
            extracted.amount ?? null,
            extracted.memo ?? null,
            extracted.parentId ?? null,
            extracted.entityName ?? null,
            json
          );
          const fromId = info.lastInsertRowid as number;
          for (const link of links) {
            insertLink.run(
              fromId,
              extracted.qbId ?? null,
              link.qbId,
              link.kind,
              link.refField ?? null,
              link.toTxnType ?? null
            );
          }
        });
        indexedCount += 1;

        if (batch.length >= INSERT_BATCH_SIZE) {
          flushBatch();
          onProgress?.({
            stage: 'indexing',
            entityType: plan.name,
            count: indexedCount,
          });
          // Keep the main process responsive during large builds.
          await yieldToEventLoop();
        }
      }
      flushBatch();
    }

    db.exec(
      `INSERT INTO records_fts (rowid, name, ref_number, memo, entity_name, qb_id)
       SELECT id, name, ref_number, memo, entity_name, qb_id FROM records`
    );

    const finalMeta: SourceBookMeta = {
      ...meta,
      ...(manifestJson ? metaFromManifest(manifestJson) : {}),
      // Explicit meta (e.g. from the Cloud export listing) wins over manifest.
      ...(meta.exportedAt ? { exportedAt: meta.exportedAt } : {}),
      ...(meta.companyName ? { companyName: meta.companyName } : {}),
      indexedAt: new Date().toISOString(),
      ...(manifestJson ? { manifestJson } : {}),
    };
    for (const [key, value] of Object.entries(finalMeta)) {
      if (typeof value === 'string' && value !== '') {
        insertMeta.run(key, value);
      }
    }

    db.pragma('journal_mode = DELETE');
    db.pragma('synchronous = FULL');
  } finally {
    await zip.close().catch(() => undefined);
    db.close();
  }

  await fs.move(tmpPath, indexPath, { overwrite: true });
}
