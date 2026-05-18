import test from 'tape';
import { shouldRecordLocalMutation } from 'utils/sync/localMutationOutbox';

test('shouldRecordLocalMutation requires sync intent, Pro, and device', (t) => {
  t.notOk(
    shouldRecordLocalMutation({
      syncEnabled: false,
      proEntitled: true,
      deviceId: 'dev-1',
    })
  );
  t.notOk(
    shouldRecordLocalMutation({
      syncEnabled: true,
      proEntitled: false,
      deviceId: 'dev-1',
    })
  );
  t.notOk(
    shouldRecordLocalMutation({
      syncEnabled: true,
      proEntitled: true,
      deviceId: '',
    })
  );
  t.ok(
    shouldRecordLocalMutation({
      syncEnabled: true,
      proEntitled: true,
      deviceId: 'dev-1',
    })
  );
  t.end();
});
