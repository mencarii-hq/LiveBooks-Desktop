/** Parse LIVEBOOKS_* env flags (enabled unless explicitly "0" or "false"). */
export function parseLivebooksEnvFlag(
  value: string | undefined,
  defaultEnabled = true
): boolean {
  if (value === undefined || value === '') {
    return defaultEnabled;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '0' || normalized === 'false') {
    return false;
  }

  if (normalized === '1' || normalized === 'true') {
    return true;
  }

  return defaultEnabled;
}

export function isTelemetryEnabledFromEnv(
  value: string | undefined = process.env.LIVEBOOKS_TELEMETRY_ENABLED
): boolean {
  return parseLivebooksEnvFlag(value, true);
}

export function isUpdaterEnabledFromEnv(
  value: string | undefined = process.env.LIVEBOOKS_UPDATER_ENABLED
): boolean {
  return parseLivebooksEnvFlag(value, true);
}

/** Default OTA poll interval while the app stays open. */
export const DEFAULT_UPDATER_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Floor so a bad env value cannot hammer GitHub Releases. */
const MIN_UPDATER_CHECK_INTERVAL_MS = 10_000;

/**
 * OTA re-check interval. Override with LIVEBOOKS_UPDATER_CHECK_INTERVAL_MS
 * (milliseconds) for local QA without waiting 6 hours.
 */
export function resolveUpdaterCheckIntervalMs(
  value: string | undefined = process.env.LIVEBOOKS_UPDATER_CHECK_INTERVAL_MS
): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_UPDATER_CHECK_INTERVAL_MS;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_UPDATER_CHECK_INTERVAL_MS) {
    return DEFAULT_UPDATER_CHECK_INTERVAL_MS;
  }

  return parsed;
}
