/**
 * Day-1 Phase 4 — outbox pause / resume when Pro lapses (pure state machine).
 */

import type { OutboxPauseReason } from 'utils/sync/types';

export type OutboxSyncControlState = {
  paused: boolean;
  reason: OutboxPauseReason;
  /** When true, flush is blocked until watermark reconciliation completes. */
  awaitingReconcile: boolean;
};

export function initialOutboxSyncControl(): OutboxSyncControlState {
  return { paused: false, reason: null, awaitingReconcile: false };
}

export function applyProEntitlementChange(
  state: OutboxSyncControlState,
  proEntitled: boolean
): OutboxSyncControlState {
  if (proEntitled) {
    if (state.reason === 'pro_lapsed') {
      return { paused: true, reason: 'pro_lapsed', awaitingReconcile: true };
    }
    return { paused: false, reason: null, awaitingReconcile: false };
  }

  if (state.paused && state.reason === 'snapshot_required') {
    return state;
  }

  return { paused: true, reason: 'pro_lapsed', awaitingReconcile: false };
}

export function applySnapshotCap(
  state: OutboxSyncControlState
): OutboxSyncControlState {
  return {
    ...state,
    paused: true,
    reason: 'snapshot_required',
    awaitingReconcile: true,
  };
}

export function markReconcileComplete(
  state: OutboxSyncControlState
): OutboxSyncControlState {
  if (state.reason === 'snapshot_required') {
    return state;
  }
  return { paused: false, reason: null, awaitingReconcile: false };
}

export function canFlushOutbox(state: OutboxSyncControlState): boolean {
  return !state.paused && !state.awaitingReconcile;
}
