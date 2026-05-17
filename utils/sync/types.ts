/**
 * Day-1 Phase 4 — sync / outbox shared types.
 */

export type LocalMutationOperation = 'insert' | 'update' | 'delete' | 'submit' | 'cancel';

export type LocalMutationSyncStatus =
  | 'pending'
  | 'synced'
  | 'failed'
  | 'pending_reconciliation';

export type DeviceReconcileStatus =
  | 'matched'
  | 'pending_reconciliation'
  | 'handshake_required';

export type OutboxPauseReason = 'pro_lapsed' | 'snapshot_required' | null;

export type DeviceReconcileResult = {
  status: DeviceReconcileStatus;
  ledgerDeviceId: string | null;
  machineDeviceId: string;
  /** When online mismatch — caller should show chooser before first cloud push. */
  requiresHandshake: boolean;
};

export type LocalMutationRow = {
  name: string;
  schemaName: string;
  docName: string;
  operation: LocalMutationOperation;
  payload?: string;
  deviceId: string;
  bookId: string;
  clientSeq: number;
  mutationId: string;
  syncStatus: LocalMutationSyncStatus;
  syncError?: string;
  createdAt?: string;
};

export type SyncDeviceSnapshot = {
  status: DeviceReconcileStatus;
  ledgerDeviceId: string | null;
  machineDeviceId: string;
  requiresHandshake: boolean;
  serverWatermark: number | null;
};

export type SyncConflictRow = {
  schemaName: string;
  docName: string;
  winnerDeviceId: string;
  loserDeviceId: string;
  winnerUpdatedAt: string;
  loserUpdatedAt: string;
  resolution: 'lww';
};
