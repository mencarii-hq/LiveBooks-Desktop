/**
 * Day-1 Phase 1b.0 — renderer cloud API path denylist.
 *
 * Paths that touch escrow keys, recovery grants, or MFA must never be
 * invoked from the renderer via LIVEBOOKS_CLOUD_API.
 */

export const RENDERER_CLOUD_API_DENYLIST: readonly string[] = [
  '/api/v1/me/escrow_key_',
  '/api/v1/me/recovery_grants/',
  '/api/v1/me/mfa/',
];

export function isRendererDenylistedCloudPath(path: string): boolean {
  return RENDERER_CLOUD_API_DENYLIST.some((prefix) => path.startsWith(prefix));
}
