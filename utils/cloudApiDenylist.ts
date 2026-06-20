/**
 * Renderer cloud API path denylist.
 *
 * MFA setup/confirm paths must never be invoked from the renderer via
 * LIVEBOOKS_CLOUD_API.
 */

export const RENDERER_CLOUD_API_DENYLIST: readonly string[] = [
  '/api/v1/me/mfa/',
];

export function isRendererDenylistedCloudPath(path: string): boolean {
  return RENDERER_CLOUD_API_DENYLIST.some((prefix) => path.startsWith(prefix));
}
