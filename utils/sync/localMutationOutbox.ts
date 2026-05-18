/**
 * LocalMutation outbox helpers (pure; testable without DB).
 */

import { generateDocId } from 'utils/ids';
import type {
  LocalMutationOperation,
  LocalMutationRow,
  LocalMutationSyncStatus,
} from 'utils/sync/types';

export const OUTBOX_MAX_MUTATIONS = 10_000;
export const OUTBOX_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** Internal / meta tables — never enqueue for cloud sync. */
export const MUTATION_LOG_SKIP_SCHEMAS = new Set([
  'LocalMutation',
  'SyncConflictLog',
  'SingleValue',
  'PatchRun',
  'ERPNextSyncQueue',
  'FetchFromERPNextQueue',
  'Misc',
]);

export function shouldLogMutation(schemaName: string): boolean {
  return !MUTATION_LOG_SKIP_SCHEMAS.has(schemaName);
}

export type LocalMutationGateContext = {
  syncEnabled: boolean;
  proEntitled: boolean;
  deviceId: string;
};

/** True when cloud sync intent is active and the device may enqueue mutations. */
export function shouldRecordLocalMutation(
  ctx: LocalMutationGateContext
): boolean {
  if (!ctx.syncEnabled) {
    return false;
  }
  if (!ctx.proEntitled) {
    return false;
  }
  if (!ctx.deviceId) {
    return false;
  }
  return true;
}

/** Delete stale synced / aged rows when sync is off (disk hygiene). */
export function outboxRetentionCutoffIso(
  maxAgeMs: number = OUTBOX_MAX_AGE_MS,
  nowMs: number = Date.now()
): string {
  return new Date(nowMs - maxAgeMs).toISOString();
}

export function maxClientSeq(
  rows: Pick<LocalMutationRow, 'clientSeq'>[]
): number {
  let max = 0;
  for (const row of rows) {
    if (typeof row.clientSeq === 'number' && row.clientSeq > max) {
      max = row.clientSeq;
    }
  }
  return max;
}

export function nextClientSeq(
  rows: Pick<LocalMutationRow, 'clientSeq'>[]
): number {
  return maxClientSeq(rows) + 1;
}

export function buildMutationRecord(args: {
  schemaName: string;
  docName: string;
  operation: LocalMutationOperation;
  payload?: string;
  deviceId: string;
  bookId: string;
  clientSeq: number;
  syncStatus: LocalMutationSyncStatus;
}): Omit<LocalMutationRow, 'name'> & { name: string } {
  return {
    name: generateDocId(),
    mutationId: generateDocId(),
    schemaName: args.schemaName,
    docName: args.docName,
    operation: args.operation,
    payload: args.payload,
    deviceId: args.deviceId,
    bookId: args.bookId,
    clientSeq: args.clientSeq,
    syncStatus: args.syncStatus,
  };
}

export type OutboxCapStatus = 'ok' | 'snapshot_required';

export function evaluateOutboxCap(
  rows: Pick<LocalMutationRow, 'createdAt' | 'syncStatus'>[],
  nowMs: number = Date.now()
): OutboxCapStatus {
  const pending = rows.filter((r) => r.syncStatus !== 'synced');
  if (pending.length >= OUTBOX_MAX_MUTATIONS) {
    return 'snapshot_required';
  }

  let oldestPendingMs: number | null = null;
  for (const row of pending) {
    if (!row.createdAt) {
      continue;
    }
    const ts = Date.parse(row.createdAt);
    if (Number.isNaN(ts)) {
      continue;
    }
    if (oldestPendingMs === null || ts < oldestPendingMs) {
      oldestPendingMs = ts;
    }
  }

  if (
    oldestPendingMs !== null &&
    nowMs - oldestPendingMs >= OUTBOX_MAX_AGE_MS
  ) {
    return 'snapshot_required';
  }

  return 'ok';
}
