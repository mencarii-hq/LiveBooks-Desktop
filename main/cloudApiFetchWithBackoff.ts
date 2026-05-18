/**
 * cloud fetch with 429/503 backoff (main process).
 */

import fetch from 'node-fetch';
import type { Response } from 'node-fetch';
import {
  computeBackoffDelayMs,
  shouldRetryCloudStatus,
  sleepMs,
} from 'utils/sync/cloudApiBackoff';

export type CloudFetchAttemptResult = {
  response: Response;
  attempts: number;
};

export async function fetchWithCloudBackoff(
  url: string,
  init: Parameters<typeof fetch>[1]
): Promise<CloudFetchAttemptResult> {
  let attempt = 0;

  while (true) {
    attempt += 1;
    const response = await fetch(url, init);

    if (!shouldRetryCloudStatus(response.status, attempt)) {
      return { response, attempts: attempt };
    }

    const delayMs = computeBackoffDelayMs({
      attempt,
      status: response.status,
      retryAfterHeader: response.headers.get('Retry-After'),
    });
    await sleepMs(delayMs);
  }
}
