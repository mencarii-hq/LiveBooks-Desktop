import test from 'tape';
import {
  applyProEntitlementChange,
  applySnapshotCap,
  canFlushOutbox,
  initialOutboxSyncControl,
  markReconcileComplete,
} from 'utils/sync/outboxSyncControl';

test('Pro lapse pauses outbox', (t) => {
  const next = applyProEntitlementChange(initialOutboxSyncControl(), false);
  t.ok(next.paused);
  t.equal(next.reason, 'pro_lapsed');
  t.notOk(canFlushOutbox(next));
  t.end();
});

test('Pro resume awaits reconcile before flush', (t) => {
  const lapsed = applyProEntitlementChange(initialOutboxSyncControl(), false);
  const resumed = applyProEntitlementChange(lapsed, true);
  t.ok(resumed.awaitingReconcile);
  const ready = markReconcileComplete(resumed);
  t.ok(canFlushOutbox(ready));
  t.end();
});

test('snapshot cap pauses with snapshot_required reason', (t) => {
  const next = applySnapshotCap(initialOutboxSyncControl());
  t.equal(next.reason, 'snapshot_required');
  t.end();
});
