/**
 * Day-1 Phase 4 — persist LocalMutation rows on desk writes.
 */

import type { Fyo } from 'fyo';
import { DEFAULT_USER } from 'fyo/utils/consts';
import { generateDocId } from 'utils/ids';
import { ModelNameEnum } from 'models/types';
import {
  buildMutationRecord,
  evaluateOutboxCap,
  nextClientSeq,
  shouldLogMutation,
} from 'utils/sync/localMutationOutbox';
import { applySnapshotCap } from 'utils/sync/outboxSyncControl';
import type { LocalMutationOperation } from 'utils/sync/types';
import {
  getOutboxSyncControl,
  setOutboxSyncControl,
} from 'utils/sync/outboxSyncState';

let loggingDepth = 0;

/** Base meta columns (from schemas/meta/base.json) required on every table insert. */
function baseMetaForInsert(fyo: Fyo): {
  createdBy: string;
  modifiedBy: string;
  created: string;
  modified: string;
} {
  const now = new Date().toISOString();
  const user = fyo.auth.session?.user || DEFAULT_USER;
  return {
    createdBy: user,
    modifiedBy: user,
    created: now,
    modified: now,
  };
}

function resolveBookId(fyo: Fyo): string {
  return fyo.store.instanceId || 'local';
}

function defaultSyncStatus(fyo: Fyo): 'pending' | 'pending_reconciliation' {
  if (fyo.store.syncDevice?.status === 'pending_reconciliation') {
    return 'pending_reconciliation';
  }
  return 'pending';
}

async function loadPendingMutations(
  fyo: Fyo
): Promise<{ clientSeq: number; createdAt?: string; syncStatus: string }[]> {
  return (await fyo.db.getAllRaw(ModelNameEnum.LocalMutation, {
    fields: ['clientSeq', 'createdAt', 'syncStatus'],
    orderBy: 'clientSeq',
    order: 'desc',
  })) as { clientSeq: number; createdAt?: string; syncStatus: string }[];
}

export async function recordLocalMutation(
  fyo: Fyo,
  args: {
    schemaName: string;
    docName: string;
    operation: LocalMutationOperation;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  if (!fyo.db.isConnected || loggingDepth > 0) {
    return;
  }
  if (!shouldLogMutation(args.schemaName)) {
    return;
  }
  if (getOutboxSyncControl().paused) {
    return;
  }

  const deviceId = fyo.store.deviceId;
  if (!deviceId) {
    return;
  }

  loggingDepth += 1;
  try {
    const existing = await loadPendingMutations(fyo);
    const cap = evaluateOutboxCap(
      existing.map((r) => ({
        createdAt: r.createdAt,
        syncStatus: r.syncStatus as 'pending',
      }))
    );
    if (cap === 'snapshot_required') {
      setOutboxSyncControl(applySnapshotCap(getOutboxSyncControl()));
      return;
    }

    const record = buildMutationRecord({
      schemaName: args.schemaName,
      docName: args.docName,
      operation: args.operation,
      payload: args.payload ? JSON.stringify(args.payload) : undefined,
      deviceId,
      bookId: resolveBookId(fyo),
      clientSeq: nextClientSeq(existing),
      syncStatus: defaultSyncStatus(fyo),
    });

    await fyo.db.insert(ModelNameEnum.LocalMutation, {
      ...baseMetaForInsert(fyo),
      ...record,
      createdAt: new Date().toISOString(),
    });
  } finally {
    loggingDepth -= 1;
  }
}

export async function logSyncConflict(
  fyo: Fyo,
  conflict: {
    schemaName: string;
    docName: string;
    winnerDeviceId: string;
    loserDeviceId: string;
    winnerUpdatedAt: string;
    loserUpdatedAt: string;
    loserPayload?: string;
  }
): Promise<void> {
  if (!fyo.db.isConnected || loggingDepth > 0) {
    return;
  }

  loggingDepth += 1;
  try {
    await fyo.db.insert(ModelNameEnum.SyncConflictLog, {
      ...baseMetaForInsert(fyo),
      name: generateDocId(),
      schemaName: conflict.schemaName,
      docName: conflict.docName,
      winnerDeviceId: conflict.winnerDeviceId,
      loserDeviceId: conflict.loserDeviceId,
      winnerUpdatedAt: conflict.winnerUpdatedAt,
      loserUpdatedAt: conflict.loserUpdatedAt,
      resolution: 'lww',
      loserPayload: conflict.loserPayload,
    });
  } finally {
    loggingDepth -= 1;
  }
}
