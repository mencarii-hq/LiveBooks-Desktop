/**
 * Test stub for src/utils/livebooksCloudUrls.ts (which uses Vite's
 * `import.meta.env` and cannot compile under ts-node CommonJS).
 * Mirrors the real module's behavior, reading the origin from
 * process.env instead.
 */
function getLivebooksCloudOrigin() {
  const raw = String(
    process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN ?? 'http://127.0.0.1:3000'
  ).trim();
  const url = raw || 'http://127.0.0.1:3000';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function livebooksCloudRootUrl() {
  return `${getLivebooksCloudOrigin()}/`;
}

module.exports = {
  getLivebooksCloudOrigin,
  livebooksCloudRootUrl,
  livebooksCloudSignInUrl: livebooksCloudRootUrl,
  livebooksCloudSignUpUrl: livebooksCloudRootUrl,
  livebooksCloudSubscribeUrl: livebooksCloudRootUrl,
  livebooksCloudAccountSecurityUrl: () =>
    `${getLivebooksCloudOrigin()}/account/security`,
  livebooksCloudMfaStepUpUrl: () =>
    `${getLivebooksCloudOrigin()}/account/security/step_up`,
  livebooksCloudFeedbackUrl: () => `${getLivebooksCloudOrigin()}/feedback`,
};
