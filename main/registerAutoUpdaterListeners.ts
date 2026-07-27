import { app, dialog } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import { emitMainProcessError } from '../backend/helpers';
import { Main } from '../main';
import { resolveUpdaterCheckIntervalMs } from '../utils/livebooksFeatureFlags';
import { isNetworkError } from './helpers';

let updateCheckInFlight = false;

/** Shared by the company-open IPC path and the 6h poll. */
export async function checkForAppUpdates(main: Main): Promise<void> {
  if (main.isDevelopment || !main.updaterEnabled || updateCheckInFlight) {
    return;
  }

  updateCheckInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    if (isNetworkError(error as Error)) {
      return;
    }

    emitMainProcessError(error);
  } finally {
    updateCheckInFlight = false;
  }
}

export default function registerAutoUpdaterListeners(main: Main) {
  autoUpdater.autoDownload = false;
  // Stable releases: do not install prerelease artifacts unless explicitly enabled when LIVEBOOKS_UPDATER_ALLOW_PRERELEASE is set.
  const allowPrerelease =
    process.env.LIVEBOOKS_UPDATER_ALLOW_PRERELEASE === 'true' ||
    process.env.LIVEBOOKS_UPDATER_ALLOW_PRERELEASE === '1';
  autoUpdater.allowPrerelease = allowPrerelease;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (error) => {
    if (isNetworkError(error)) {
      return;
    }

    emitMainProcessError(error);
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  autoUpdater.on('update-available', async (info: UpdateInfo) => {
    const currentVersion = app.getVersion();
    const nextVersion = info.version;
    const isCurrentBeta = currentVersion.includes('beta');
    const isNextBeta = nextVersion.includes('beta');

    let downloadUpdate = true;
    if (!isCurrentBeta && isNextBeta) {
      const option = await dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `Download version ${nextVersion}?`,
        buttons: ['Yes', 'No'],
      });

      downloadUpdate = option.response === 0;
    }

    if (!downloadUpdate) {
      return;
    }

    await autoUpdater.downloadUpdate();
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  autoUpdater.on('update-downloaded', async () => {
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
  });

  if (!main.isDevelopment && main.updaterEnabled) {
    const intervalMs = resolveUpdaterCheckIntervalMs();
    setInterval(() => {
      void checkForAppUpdates(main);
    }, intervalMs);
  }
}
