/**
 * LiveBooks Cloud web and API paths (see livebooks-cloud config/routes.rb).
 * Set `VITE_LIVEBOOKS_CLOUD_ORIGIN` (dev server / build) for a non-default API host.
 */

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function getLivebooksCloudOrigin(): string {
  const env = import.meta.env as { VITE_LIVEBOOKS_CLOUD_ORIGIN?: string };
  const raw = String(
    env.VITE_LIVEBOOKS_CLOUD_ORIGIN ?? 'http://127.0.0.1:3000'
  ).trim();
  return trimTrailingSlash(raw || 'http://127.0.0.1:3000');
}

/** Cloud dashboard (Explore). Unauthenticated visitors can look around; not a Devise route. */
export function livebooksCloudRootUrl(): string {
  return `${getLivebooksCloudOrigin()}/`;
}

/** Rails 8 auth sign-in (`resource :session` → GET /session/new). Not Devise `/users/sign_in`. */
export function livebooksCloudSignInUrl(): string {
  return `${getLivebooksCloudOrigin()}/session/new`;
}

/** Rails 8 auth registration (`resources :registrations` → GET /registrations/new). Not Devise `/users/sign_up`. */
export function livebooksCloudSignUpUrl(): string {
  return `${getLivebooksCloudOrigin()}/registrations/new`;
}

/** Cloud billing. Logged-out `/billing` already returns here after Cloud sign-in — no extra query params. */
export function livebooksCloudSubscribeUrl(): string {
  return `${getLivebooksCloudOrigin()}/billing`;
}

export function livebooksCloudAccountSecurityUrl(): string {
  return `${getLivebooksCloudOrigin()}/account/security`;
}

/** Browser MFA step-up for desktop bank feeds (records cloud mfa_verified_at). */
export function livebooksCloudMfaStepUpUrl(): string {
  return `${getLivebooksCloudOrigin()}/account/security/step_up`;
}

/** Stable survey entry — cloud 302s to the Google Form (Phase 0). */
export function livebooksCloudFeedbackUrl(): string {
  return `${getLivebooksCloudOrigin()}/feedback`;
}

/** QuickBooks Desktop export (Web Connector) on Cloud. */
export function livebooksCloudQbdExportUrl(): string {
  return `${getLivebooksCloudOrigin()}/qbd_exports`;
}
