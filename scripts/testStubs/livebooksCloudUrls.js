/**
 * Test stub for src/utils/livebooksCloudUrls.ts (which uses Vite's
 * `import.meta.env` and cannot compile under ts-node CommonJS).
 * Mirrors the real module's behavior, reading the origin from
 * process.env instead.
 *
 * Paths match livebooks-cloud Rails 8 auth (not Devise).
 */
function trimTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function getLivebooksCloudOrigin() {
  const raw = String(
    process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN ?? 'http://127.0.0.1:3000'
  ).trim();
  return trimTrailingSlash(raw || 'http://127.0.0.1:3000');
}

function livebooksCloudRootUrl() {
  return `${getLivebooksCloudOrigin()}/`;
}

function livebooksCloudSignInUrl() {
  return `${getLivebooksCloudOrigin()}/session/new`;
}

function livebooksCloudSignUpUrl() {
  return `${getLivebooksCloudOrigin()}/registrations/new`;
}

function livebooksCloudSubscribeUrl() {
  return `${getLivebooksCloudOrigin()}/billing`;
}

module.exports = {
  getLivebooksCloudOrigin,
  livebooksCloudRootUrl,
  livebooksCloudSignInUrl,
  livebooksCloudSignUpUrl,
  livebooksCloudSubscribeUrl,
  livebooksCloudAccountSecurityUrl: () =>
    `${getLivebooksCloudOrigin()}/account/security`,
  livebooksCloudMfaStepUpUrl: () =>
    `${getLivebooksCloudOrigin()}/account/security/step_up`,
  livebooksCloudFeedbackUrl: () => `${getLivebooksCloudOrigin()}/feedback`,
};
