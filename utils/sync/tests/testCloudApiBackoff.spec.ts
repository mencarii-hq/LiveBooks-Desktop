import test from 'tape';
import {
  computeBackoffDelayMs,
  parseRetryAfterSeconds,
  shouldRetryCloudStatus,
} from 'utils/sync/cloudApiBackoff';

test('parseRetryAfterSeconds reads integer header', (t) => {
  t.equal(parseRetryAfterSeconds('5'), 5);
  t.end();
});

test('shouldRetryCloudStatus respects 503 max attempts', (t) => {
  t.ok(shouldRetryCloudStatus(503, 1));
  t.notOk(shouldRetryCloudStatus(503, 3));
  t.end();
});

test('computeBackoffDelayMs honors Retry-After on 429', (t) => {
  const ms = computeBackoffDelayMs({
    attempt: 1,
    status: 429,
    retryAfterHeader: '2',
  });
  t.equal(ms, 2000);
  t.end();
});
