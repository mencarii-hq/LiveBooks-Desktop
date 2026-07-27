import fetch from 'node-fetch';
import { Creds } from 'utils/types';
import { rendererLog } from './helpers';
import { getLivebooksCloudOriginMain } from './livebooksCloudBridge';
import type { Main } from 'main';

const DESKTOP_EVENTS_PATH = '/api/v1/desktop_events';
const MAX_BODY_BYTES = 4096;

function truncate(value: unknown, max: number): string {
  const s = value == null ? '' : String(value);
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * Telemetry + error ingest URLs from LIVEBOOKS_CLOUD_ORIGIN.
 * No shared secrets — public rate-limited cloud endpoint.
 */
export function getUrlAndTokenString(): Creds {
  const empty: Creds = { errorLogUrl: '', telemetryUrl: '', tokenString: '' };
  let origin: string;
  try {
    origin = getLivebooksCloudOriginMain();
  } catch {
    return empty;
  }

  if (!origin || !/^https?:\/\//i.test(origin)) {
    return empty;
  }

  const url = `${origin}${DESKTOP_EVENTS_PATH}`;
  return {
    errorLogUrl: url,
    telemetryUrl: url,
    // Kept for Creds shape / older callers; cloud ingest needs no Authorization.
    tokenString: '',
  };
}

/** POST JSON to /api/v1/desktop_events; true only on 2xx. */
export async function postDesktopEvent(
  body: Record<string, unknown>,
  main?: Main
): Promise<boolean> {
  const { telemetryUrl } = getUrlAndTokenString();
  if (!telemetryUrl) {
    return false;
  }

  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_BODY_BYTES) {
    return false;
  }

  try {
    const response = await fetch(telemetryUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: serialized,
    });
    return response.ok;
  } catch (err) {
    if (main) {
      rendererLog(main, err);
    }
    return false;
  }
}

export async function sendError(body: string, main: Main) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return;
  }

  const payload = {
    kind: 'error',
    event: 'desktop_error',
    device_id: truncate(parsed.device_id, 128),
    instance_id: truncate(parsed.instance_id, 128),
    book_id: truncate(parsed.book_id, 36),
    app_version: truncate(parsed.version, 64),
    platform: truncate(parsed.platform, 64),
    payload: {
      error_name: truncate(parsed.error_name, 256),
      message: truncate(parsed.message, 1024),
      stack: truncate(parsed.stack, 2048),
      language: truncate(parsed.language, 64),
      instance_id: truncate(parsed.instance_id, 128),
      open_count: parsed.open_count,
      country_code: truncate(parsed.country_code, 16),
      more: truncate(parsed.more, 512),
    },
  };

  let serialized = JSON.stringify(payload);
  if (serialized.length > MAX_BODY_BYTES) {
    payload.payload.stack = truncate(payload.payload.stack, 512);
    payload.payload.more = '';
    serialized = JSON.stringify(payload);
    if (serialized.length > MAX_BODY_BYTES) {
      return;
    }
  }

  await postDesktopEvent(
    JSON.parse(serialized) as Record<string, unknown>,
    main
  );
}
