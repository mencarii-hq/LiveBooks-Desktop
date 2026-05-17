/**
 * Day-1 Phase 4 — exponential backoff for cloud API retries (pure).
 */

export const CLOUD_API_MAX_503_RETRIES = 3;
export const CLOUD_API_BASE_DELAY_MS = 1000;
export const CLOUD_API_MAX_DELAY_MS = 30_000;

export type BackoffAttempt = {
  attempt: number;
  status: number;
  retryAfterHeader?: string | null;
};

export function parseRetryAfterSeconds(
  header: string | null | undefined
): number | null {
  if (!header || header.length === 0) {
    return null;
  }
  const asInt = parseInt(header, 10);
  if (!Number.isNaN(asInt) && asInt >= 0) {
    return asInt;
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }
  return null;
}

export function computeBackoffDelayMs(attempt: BackoffAttempt): number {
  if (attempt.status === 429) {
    const retrySec = parseRetryAfterSeconds(attempt.retryAfterHeader);
    if (retrySec !== null) {
      return Math.min(retrySec * 1000, CLOUD_API_MAX_DELAY_MS);
    }
  }

  const exp = CLOUD_API_BASE_DELAY_MS * 2 ** Math.max(0, attempt.attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(exp + jitter, CLOUD_API_MAX_DELAY_MS);
}

export function shouldRetryCloudStatus(
  status: number,
  attempt: number
): boolean {
  if (status === 429) {
    return attempt < CLOUD_API_MAX_503_RETRIES + 1;
  }
  if (status === 503) {
    return attempt < CLOUD_API_MAX_503_RETRIES;
  }
  return false;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
