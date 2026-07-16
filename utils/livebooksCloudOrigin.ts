/**
 * cloud origin resolution (pure; testable without Electron).
 */

const DEV_DEFAULT_ORIGIN = 'http://127.0.0.1:3000';

/** Production API hosts — never used by unpackaged / yarn-dev runs. */
export const PRODUCTION_CLOUD_ORIGINS: readonly string[] = [
  'https://cloud.mencarii.com',
];

export function trimCloudOrigin(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function isProductionCloudOrigin(origin: string): boolean {
  const normalized = trimCloudOrigin(origin).toLowerCase();
  return PRODUCTION_CLOUD_ORIGINS.some(
    (prod) => normalized === prod.toLowerCase()
  );
}

/**
 * Resolve LIVEBOOKS_CLOUD_ORIGIN for main-process HTTP.
 *
 * Packaged builds require https:// and an explicit origin env var.
 * Unpackaged (yarn dev) never talks to production Cloud — even if
 * LIVEBOOKS_CLOUD_ORIGIN is set in the shell (e.g. copied from GH secrets).
 */
export function resolveLivebooksCloudOrigin(
  envOrigin: string | undefined,
  isPackaged: boolean,
  devDefault = DEV_DEFAULT_ORIGIN
): string {
  const raw = envOrigin?.trim();
  if (raw) {
    const origin = trimCloudOrigin(raw);
    if (!isPackaged && isProductionCloudOrigin(origin)) {
      return devDefault;
    }
    if (isPackaged && !origin.startsWith('https://')) {
      throw new Error(
        `LIVEBOOKS_CLOUD_ORIGIN must use https:// in packaged builds, got: ${origin}`
      );
    }
    return origin;
  }
  if (isPackaged) {
    throw new Error(
      'LIVEBOOKS_CLOUD_ORIGIN is required (https://...) in packaged builds.'
    );
  }
  return devDefault;
}
