import test from 'tape';
import {
  reconcileDeviceIds,
  resolveLedgerDeviceId,
} from 'utils/sync/syncDeviceGuard';

test('resolveLedgerDeviceId prefers SystemSettings', (t) => {
  t.equal(
    resolveLedgerDeviceId({
      ledgerDeviceId: 'ledger-1',
      mutations: [{ deviceId: 'mut-1' }],
      legacyInstanceId: 'inst-1',
    }),
    'ledger-1'
  );
  t.end();
});

test('reconcileDeviceIds matches when equal', (t) => {
  const r = reconcileDeviceIds({
    ledgerDeviceId: 'dev-a',
    machineDeviceId: 'dev-a',
    cloudReachable: false,
  });
  t.equal(r.status, 'matched');
  t.notOk(r.requiresHandshake);
  t.end();
});

test('reconcileDeviceIds offline mismatch allows pending_reconciliation', (t) => {
  const r = reconcileDeviceIds({
    ledgerDeviceId: 'ledger',
    machineDeviceId: 'machine',
    cloudReachable: false,
  });
  t.equal(r.status, 'pending_reconciliation');
  t.end();
});

test('reconcileDeviceIds online mismatch requires handshake', (t) => {
  const r = reconcileDeviceIds({
    ledgerDeviceId: 'ledger',
    machineDeviceId: 'machine',
    cloudReachable: true,
  });
  t.equal(r.status, 'handshake_required');
  t.ok(r.requiresHandshake);
  t.end();
});
