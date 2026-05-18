/**
 * ledger vs machine deviceId reconciliation (pure).
 */

import type { DeviceReconcileResult, LocalMutationRow } from 'utils/sync/types';

export function resolveLedgerDeviceId(args: {
  ledgerDeviceId: string | null | undefined;
  mutations: Pick<LocalMutationRow, 'deviceId'>[];
  legacyInstanceId: string | null | undefined;
}): string | null {
  if (
    typeof args.ledgerDeviceId === 'string' &&
    args.ledgerDeviceId.length > 0
  ) {
    return args.ledgerDeviceId;
  }

  let fromMutations: string | null = null;
  for (const row of args.mutations) {
    if (typeof row.deviceId === 'string' && row.deviceId.length > 0) {
      fromMutations = row.deviceId;
    }
  }
  if (fromMutations) {
    return fromMutations;
  }

  if (
    typeof args.legacyInstanceId === 'string' &&
    args.legacyInstanceId.length > 0
  ) {
    return args.legacyInstanceId;
  }

  return null;
}

export function reconcileDeviceIds(args: {
  ledgerDeviceId: string | null;
  machineDeviceId: string;
  cloudReachable: boolean;
}): DeviceReconcileResult {
  const { ledgerDeviceId, machineDeviceId, cloudReachable } = args;

  if (!ledgerDeviceId || ledgerDeviceId === machineDeviceId) {
    return {
      status: 'matched',
      ledgerDeviceId: ledgerDeviceId ?? machineDeviceId,
      machineDeviceId,
      requiresHandshake: false,
    };
  }

  if (cloudReachable) {
    return {
      status: 'handshake_required',
      ledgerDeviceId,
      machineDeviceId,
      requiresHandshake: true,
    };
  }

  return {
    status: 'pending_reconciliation',
    ledgerDeviceId,
    machineDeviceId,
    requiresHandshake: false,
  };
}
