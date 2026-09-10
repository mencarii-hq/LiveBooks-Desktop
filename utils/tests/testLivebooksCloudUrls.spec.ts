import test from 'tape';
import {
  getLivebooksCloudOrigin,
  livebooksCloudQbdExportUrl,
  livebooksCloudMfaStepUpUrl,
  livebooksCloudAccountSecurityUrl,
  livebooksCloudRootUrl,
  livebooksCloudSignInUrl,
  livebooksCloudSignUpUrl,
  livebooksCloudSubscribeUrl,
} from 'src/utils/livebooksCloudUrls';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3000';

test('livebooksCloudUrls default origin and Rails 8 auth paths', (t) => {
  const prev = process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN;
  delete process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN;

  t.equal(getLivebooksCloudOrigin(), DEFAULT_ORIGIN);
  t.equal(livebooksCloudRootUrl(), `${DEFAULT_ORIGIN}/`);
  t.equal(livebooksCloudSignInUrl(), `${DEFAULT_ORIGIN}/session/new`);
  t.equal(livebooksCloudSignUpUrl(), `${DEFAULT_ORIGIN}/registrations/new`);
  t.equal(livebooksCloudSubscribeUrl(), `${DEFAULT_ORIGIN}/billing`);
  t.equal(
    livebooksCloudAccountSecurityUrl(),
    `${DEFAULT_ORIGIN}/account/security`
  );
  t.equal(
    livebooksCloudMfaStepUpUrl(),
    `${DEFAULT_ORIGIN}/account/security/step_up`
  );
  t.equal(livebooksCloudQbdExportUrl(), `${DEFAULT_ORIGIN}/qbd_exports`);

  t.notOk(
    livebooksCloudSignInUrl().includes('/users/sign_in'),
    'sign-in is not Devise /users/sign_in'
  );
  t.notOk(
    livebooksCloudSignUpUrl().includes('/users/sign_up'),
    'sign-up is not Devise /users/sign_up'
  );
  t.notOk(
    livebooksCloudSubscribeUrl().includes('?'),
    'subscribe URL has no extra query params'
  );

  if (prev === undefined) {
    delete process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN;
  } else {
    process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN = prev;
  }
  t.end();
});

test('livebooksCloudUrls respects VITE_LIVEBOOKS_CLOUD_ORIGIN and strips trailing slash', (t) => {
  const prev = process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN;
  process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN = 'https://cloud.mencarii.com/';

  t.equal(getLivebooksCloudOrigin(), 'https://cloud.mencarii.com');
  t.equal(livebooksCloudSignInUrl(), 'https://cloud.mencarii.com/session/new');
  t.equal(
    livebooksCloudSignUpUrl(),
    'https://cloud.mencarii.com/registrations/new'
  );
  t.equal(livebooksCloudSubscribeUrl(), 'https://cloud.mencarii.com/billing');
  t.equal(livebooksCloudRootUrl(), 'https://cloud.mencarii.com/');

  if (prev === undefined) {
    delete process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN;
  } else {
    process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN = prev;
  }
  t.end();
});
