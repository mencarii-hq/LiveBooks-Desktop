/**
 * Day-1 Phase 4 — global outbox pause state (renderer + fyo).
 */

import type { OutboxSyncControlState } from 'utils/sync/outboxSyncControl';
import {
  applyProEntitlementChange,
  initialOutboxSyncControl,
  markReconcileComplete,
} from 'utils/sync/outboxSyncControl';

let state: OutboxSyncControlState = initialOutboxSyncControl();
const listeners = new Set<(s: OutboxSyncControlState) => void>();

function notify(): void {
  for (const fn of listeners) {
    fn(state);
  }
}

export function getOutboxSyncControl(): OutboxSyncControlState {
  return { ...state };
}

export function setOutboxSyncControl(next: OutboxSyncControlState): void {
  state = next;
  notify();
}

export function subscribeOutboxSyncControl(
  listener: (s: OutboxSyncControlState) => void
): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function onProEntitlementChanged(proEntitled: boolean): void {
  state = applyProEntitlementChange(state, proEntitled);
  notify();
}

export function completeOutboxReconcile(): void {
  state = markReconcileComplete(state);
  notify();
}
