/**
 * Renderer cloud API path denylist.
 *
 * All MFA verification (setup, confirm, step-up) happens on LiveBooks Cloud web.
 * The renderer must never invoke `/api/v1/me/mfa/*` via LIVEBOOKS_CLOUD_API.
 */

export const RENDERER_CLOUD_API_DENYLIST: readonly string[] = [
  '/api/v1/me/mfa/',
];

export function isRendererDenylistedCloudPath(path: string): boolean {
  return RENDERER_CLOUD_API_DENYLIST.some((prefix) => path.startsWith(prefix));
}
