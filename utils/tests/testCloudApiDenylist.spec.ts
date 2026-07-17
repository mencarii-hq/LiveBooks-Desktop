import test from 'tape';
import {
  isRendererDenylistedCloudPath,
  RENDERER_CLOUD_API_DENYLIST,
} from 'utils/cloudApiDenylist';

test('denylist covers MFA prefix', (t) => {
  t.equal(RENDERER_CLOUD_API_DENYLIST.length, 1);
  t.end();
});

test('renderer denylisted paths block MFA cloud routes', (t) => {
  const blocked = [
    '/api/v1/me/mfa/setup',
    '/api/v1/me/mfa/confirm',
    '/api/v1/me/mfa/step_up',
  ];
  for (const path of blocked) {
    t.ok(isRendererDenylistedCloudPath(path), `expected deny: ${path}`);
  }
  t.end();
});

test('renderer allowlisted paths stay reachable via LIVEBOOKS_CLOUD_API', (t) => {
  const allowed = [
    '/api/v1/me',
    '/api/v1/me/subscription',
    '/api/v1/auth/token',
  ];
  for (const path of allowed) {
    t.notOk(isRendererDenylistedCloudPath(path), `expected allow: ${path}`);
  }
  t.end();
});
