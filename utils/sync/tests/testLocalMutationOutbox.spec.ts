import test from 'tape';
import {
  evaluateOutboxCap,
  maxClientSeq,
  nextClientSeq,
  shouldLogMutation,
  OUTBOX_MAX_MUTATIONS,
} from 'utils/sync/localMutationOutbox';

test('shouldLogMutation skips internal tables', (t) => {
  t.notOk(shouldLogMutation('LocalMutation'));
  t.ok(shouldLogMutation('SalesInvoice'));
  t.end();
});

test('clientSeq increments from max', (t) => {
  t.equal(maxClientSeq([{ clientSeq: 3 }, { clientSeq: 9 }]), 9);
  t.equal(nextClientSeq([{ clientSeq: 9 }]), 10);
  t.end();
});

test('outbox cap triggers snapshot_required by count', (t) => {
  const rows = Array.from({ length: OUTBOX_MAX_MUTATIONS }, () => ({
    syncStatus: 'pending' as const,
    createdAt: new Date().toISOString(),
  }));
  t.equal(evaluateOutboxCap(rows), 'snapshot_required');
  t.end();
});
