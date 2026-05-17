/**
 * Day-1 Phase 4 — last-write-wins conflict resolution (pure).
 */

import type { SyncConflictRow } from 'utils/sync/types';

export type LwwDocRevision = {
  deviceId: string;
  updatedAt: string;
  payload: Record<string, unknown>;
};

export type LwwResolution = {
  winner: LwwDocRevision;
  loser: LwwDocRevision;
  conflict: SyncConflictRow;
};

function parseUpdatedAt(value: string): number {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

/**
 * Pick the winning revision by `updatedAt`; server tiebreaker prefers
 * `serverPreferredDeviceId` when timestamps are equal.
 */
export function resolveLwwConflict(
  local: LwwDocRevision,
  remote: LwwDocRevision,
  serverPreferredDeviceId?: string
): LwwResolution {
  const localTs = parseUpdatedAt(local.updatedAt);
  const remoteTs = parseUpdatedAt(remote.updatedAt);

  let winner: LwwDocRevision;
  let loser: LwwDocRevision;

  if (remoteTs > localTs) {
    winner = remote;
    loser = local;
  } else if (localTs > remoteTs) {
    winner = local;
    loser = remote;
  } else if (
    serverPreferredDeviceId &&
    remote.deviceId === serverPreferredDeviceId
  ) {
    winner = remote;
    loser = local;
  } else {
    winner = local;
    loser = remote;
  }

  return {
    winner,
    loser,
    conflict: {
      schemaName: String(winner.payload.schemaName ?? ''),
      docName: String(winner.payload.docName ?? winner.payload.name ?? ''),
      winnerDeviceId: winner.deviceId,
      loserDeviceId: loser.deviceId,
      winnerUpdatedAt: winner.updatedAt,
      loserUpdatedAt: loser.updatedAt,
      resolution: 'lww',
    },
  };
}
