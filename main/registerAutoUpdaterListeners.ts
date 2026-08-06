import { dialog } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import { emitMainProcessError } from '../backend/helpers';
import { Main } from '../main';
import { resolveUpdaterCheckIntervalMs } from '../utils/livebooksFeatureFlags';
import { isNetworkError } from './helpers';

let updateCheckInFlight = false;

/**
 * Timestamp until which update prompts are suppressed.
 * Set when the user chooses "Not now" in the consent dialog.
 */
let declinedUntil = 0;

/** Show "latest version" dialog only after a user-initiated force check. */
let pendingNotAvailableDialog = false;

const FORCE_WAIT_MS = 30_000;
const FORCE_POLL_MS = 100;

export type UpdateCheckResult = {
  status: 'skipped' | 'started' | 'error';
  reason?: string;
};

async function waitForUpdateCheckIdle(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (updateCheckInFlight && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, FORCE_POLL_MS));
  }
  return !updateCheckInFlight;
}

/** Shared by the company-open IPC path and the poll. */
export async function checkForAppUpdates(
  main: Main,
  options?: { force?: boolean }
): Promise<UpdateCheckResult> {
  if (main.isDevelopment) {
    return { status: 'skipped', reason: 'development' };
  }

  if (!main.updaterEnabled) {
    return { status: 'skipped', reason: 'disabled' };
  }

  if (updateCheckInFlight) {
    if (!options?.force) {
      return { status: 'skipped', reason: 'in_flight' };
    }
    // Settings → Check for updates: wait out dialogs/downloads instead of
    // silently skipping while a background check still holds the lock.
    const idle = await waitForUpdateCheckIdle(FORCE_WAIT_MS);
    if (!idle) {
      return { status: 'skipped', reason: 'in_flight' };
    }
  }

  if (!options?.force && declinedUntil > Date.now()) {
    return { status: 'skipped', reason: 'declined' };
  }

  if (options?.force) {
    pendingNotAvailableDialog = true;
  }

  updateCheckInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
    // Keep the lock until update-available / update-not-available / error
    // handlers finish — checkForUpdates() resolves before consent dialogs.
    return { status: 'started' };
  } catch (error) {
    updateCheckInFlight = false;
    pendingNotAvailableDialog = false;
    if (isNetworkError(error as Error)) {
      return { status: 'error', reason: 'network' };
    }

    emitMainProcessError(error);
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export default function registerAutoUpdaterListeners(main: Main) {
  autoUpdater.autoDownload = false;
  const allowPrerelease =
    process.env.LIVEBOOKS_UPDATER_ALLOW_PRERELEASE === 'true' ||
    process.env.LIVEBOOKS_UPDATER_ALLOW_PRERELEASE === '1';
  autoUpdater.allowPrerelease = allowPrerelease;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('error', (error) => {
    updateCheckInFlight = false;
    pendingNotAvailableDialog = false;
    if (isNetworkError(error)) {
      return;
    }

    emitMainProcessError(error);
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  autoUpdater.on('update-not-available', async () => {
    try {
      if (!pendingNotAvailableDialog) {
        return;
      }

      pendingNotAvailableDialog = false;
      await dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: "You're on the latest version",
        buttons: ['OK'],
      });
    } finally {
      updateCheckInFlight = false;
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  autoUpdater.on('update-available', async (info: UpdateInfo) => {
    pendingNotAvailableDialog = false;
    let downloadStarted = false;
    try {
      const nextVersion = info.version;

      const option = await dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version (${nextVersion}) is available.`,
        buttons: ['Update now', 'Not now'],
        defaultId: 0,
        cancelId: 1,
      });

      if (option.response !== 0) {
        const intervalMs = resolveUpdaterCheckIntervalMs();
        declinedUntil = Date.now() + intervalMs;
        autoUpdater.autoInstallOnAppQuit = false;
        return;
      }

      declinedUntil = 0;
      downloadStarted = true;
      await autoUpdater.downloadUpdate();
      autoUpdater.autoInstallOnAppQuit = true;
    } catch (error) {
      autoUpdater.autoInstallOnAppQuit = false;
      updateCheckInFlight = false;
      emitMainProcessError(error);
    } finally {
      // Hold lock through download + restart prompt when user accepted update.
      if (!downloadStarted) {
        updateCheckInFlight = false;
      }
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  autoUpdater.on('update-downloaded', async () => {
    try {
      const option = await dialog.showMessageBox({
        type: 'info',
        title: 'Update Downloaded',
        message: 'Restart LiveBooks Desktop to install update?',
        buttons: ['Yes', 'No'],
      });

      if (option.response === 1) {
        return;
      }

      autoUpdater.quitAndInstall();
    } finally {
      updateCheckInFlight = false;
    }
  });

  if (!main.isDevelopment && main.updaterEnabled) {
    const intervalMs = resolveUpdaterCheckIntervalMs();
    setInterval(() => {
      void checkForAppUpdates(main);
    }, intervalMs);
  }
}
