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
