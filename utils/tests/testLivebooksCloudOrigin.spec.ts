import test from 'tape';
import {
  resolveLivebooksCloudOrigin,
  trimCloudOrigin,
} from 'utils/livebooksCloudOrigin';

test('trimCloudOrigin strips trailing slash', (t) => {
  t.equal(
    trimCloudOrigin('https://api.example.com/'),
    'https://api.example.com'
  );
  t.end();
});

test('unpackaged dev uses default when env unset', (t) => {
  t.equal(
    resolveLivebooksCloudOrigin(undefined, false),
    'http://127.0.0.1:3000'
  );
  t.end();
});

test('unpackaged allows http origin from env', (t) => {
  t.equal(
    resolveLivebooksCloudOrigin('http://localhost:3000/', false),
    'http://localhost:3000'
  );
  t.end();
});

test('unpackaged ignores production Cloud origin', (t) => {
  t.equal(
    resolveLivebooksCloudOrigin('https://cloud.mencarii.com', false),
    'http://127.0.0.1:3000'
  );
  t.equal(
    resolveLivebooksCloudOrigin('https://cloud.mencarii.com/', false),
    'http://127.0.0.1:3000'
  );
  t.end();
});

test('unpackaged still allows staging-style https origins', (t) => {
  t.equal(
    resolveLivebooksCloudOrigin('https://staging-cloud.mencarii.com', false),
    'https://staging-cloud.mencarii.com'
  );
  t.end();
});

test('packaged requires https origin', (t) => {
  t.equal(
    resolveLivebooksCloudOrigin('https://cloud.mencarii.com', true),
    'https://cloud.mencarii.com'
  );
  t.throws(
    () => resolveLivebooksCloudOrigin('http://cloud.livebooks.io', true),
    /https:\/\//
  );
  t.throws(() => resolveLivebooksCloudOrigin(undefined, true), /required/);
  t.end();
});
