import { app } from 'electron';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { Creds } from 'utils/types';
import { rendererLog } from './helpers';
import type { Main } from 'main';

/** Avoid spamming the terminal when many errors call getUrlAndTokenString in dev. */
let warnedMissingRemoteLogCreds = false;

export function getUrlAndTokenString(): Creds {
  const inProduction = app.isPackaged;
  const empty: Creds = { errorLogUrl: '', telemetryUrl: '', tokenString: '' };
  let errLogCredsPath = path.join(
    process.resourcesPath,
    '../creds/log_creds.txt'
  );
  if (!fs.existsSync(errLogCredsPath)) {
    errLogCredsPath = path.join(__dirname, '..', '..', 'log_creds.txt');
  }

  if (!fs.existsSync(errLogCredsPath)) {
    if (!inProduction && !warnedMissingRemoteLogCreds) {
      warnedMissingRemoteLogCreds = true;
      // eslint-disable-next-line no-console
      console.log(
        `${errLogCredsPath} is missing; remote error/telemetry logging is disabled (expected in local dev).`
      );
    }
    return empty;
  }

  let apiKey: string | undefined;
  let apiSecret: string | undefined;
  let errorLogUrl: string | undefined;
  let telemetryUrl: string | undefined;
  try {
    [apiKey, apiSecret, errorLogUrl, telemetryUrl] = fs
      .readFileSync(errLogCredsPath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter((f) => f.length);
  } catch (err) {
    if (!inProduction) {
      // eslint-disable-next-line no-console
      console.log(`logging error using creds at: ${errLogCredsPath} failed`);
      // eslint-disable-next-line no-console
      console.log(err);
    }
    return empty;
  }

  if (!apiKey || !apiSecret || !errorLogUrl || !telemetryUrl) {
    return empty;
  }

  const encodedErrorLogUrl = encodeURI(errorLogUrl);
  const encodedTelemetryUrl = encodeURI(telemetryUrl);
  const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

  // sendBeacon / fetch only accept HTTP(S); bad lines in log_creds must not reach the renderer.
  if (!isHttpUrl(encodedErrorLogUrl) || !isHttpUrl(encodedTelemetryUrl)) {
    return empty;
  }

  return {
    errorLogUrl: encodedErrorLogUrl,
    telemetryUrl: encodedTelemetryUrl,
    tokenString: `token ${apiKey}:${apiSecret}`,
  };
}

export async function sendError(body: string, main: Main) {
  const { errorLogUrl, tokenString } = getUrlAndTokenString();
  if (!errorLogUrl || !tokenString) {
    return;
  }

  const headers = {
    Authorization: tokenString,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  await fetch(errorLogUrl, { method: 'POST', headers, body }).catch((err) => {
    rendererLog(main, err);
  });
}
