import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { showDialog } from 'src/utils/interactive';
import { updateConfigFiles } from 'src/utils/misc';
import { getSavePath } from 'src/utils/ui';
import { connectToDatabase } from 'src/utils/db';
import { initializeInstance } from 'src/utils/initialization';
import { handleErrorWithDialog } from 'src/errorHandling';
import type { ConfigFile } from 'fyo/core/types';

function sidecarPaths(dbPath: string): string[] {
  return [`${dbPath}-wal`, `${dbPath}-shm`];
}

function fileBasename(p: string, ext?: string): string {
  const base = p.split(/[/\\]/).pop() || p;
  if (ext && base.endsWith(ext)) {
    return base.slice(0, -ext.length);
  }
  return base;
}

async function deleteQuiet(path: string): Promise<void> {
  const { error } = await ipc.deleteFile(path);
  if (error && error.code !== 'ENOENT') {
    throw new Error(error.message || String(error));
  }
}

async function copyRequired(src: string, dest: string): Promise<void> {
  const { error } = await ipc.copyFile(src, dest);
  if (error) {
    throw new Error(error.message || String(error));
  }
}

async function copyOptional(src: string, dest: string): Promise<void> {
  const { error } = await ipc.copyFile(src, dest);
  if (error && error.code !== 'ENOENT') {
    throw new Error(error.message || String(error));
  }
}

/** Copy company .db and any -wal/-shm sidecars. Clears stale dest sidecars first. */
export async function copyCompanyDbFiles(
  sourcePath: string,
  destPath: string
): Promise<void> {
  for (const side of sidecarPaths(destPath)) {
    await deleteQuiet(side);
  }
  await deleteQuiet(destPath);

  await copyRequired(sourcePath, destPath);
  await copyOptional(`${sourcePath}-wal`, `${destPath}-wal`);
  await copyOptional(`${sourcePath}-shm`, `${destPath}-shm`);
}

async function deleteDbTrio(dbPath: string): Promise<void> {
  for (const side of sidecarPaths(dbPath)) {
    await deleteQuiet(side);
  }
  await deleteQuiet(dbPath);
}

async function renameRequired(src: string, dest: string): Promise<void> {
  const { error } = await ipc.renameFile(src, dest);
  if (error) {
    throw new Error(error.message || String(error));
  }
}

async function archiveOldCompanyFile(oldPath: string): Promise<void> {
  const archived = `${oldPath}.archived-${Date.now()}`;
  // Prefer rename (atomic / no double disk). IPC falls back to copy+delete on EXDEV.
  try {
    await renameRequired(oldPath, archived);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/ENOENT|no such file/i.test(msg)) {
      return;
    }
    // If rename unavailable for any other reason, copy then delete.
    await copyOptional(oldPath, archived);
    await deleteQuiet(oldPath);
    for (const side of sidecarPaths(oldPath)) {
      await deleteQuiet(side);
    }
    return;
  }
  for (const side of sidecarPaths(oldPath)) {
    await deleteQuiet(side);
  }
}

function patchConfigPath(from: string, to: string): void {
  const files = fyo.config.get('files', []) as ConfigFile[];
  const idx = files.findIndex((f) => f.dbPath === from);
  if (idx !== -1) {
    files[idx].dbPath = to;
    fyo.config.set('files', files);
  }
  if (fyo.config.get('lastSelectedFilePath') === from) {
    fyo.config.set('lastSelectedFilePath', to);
  }
}

async function reconnectTo(filePath: string, label: string): Promise<boolean> {
  try {
    const { countryCode, error } = await connectToDatabase(fyo, filePath);
    if (!countryCode && error) {
      throw error;
    }
    await initializeInstance(filePath, false, countryCode, fyo);
    fyo.config.set('lastSelectedFilePath', filePath);
    updateConfigFiles(fyo);
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Save As: failed to reconnect to ${label}`, error);
    try {
      if (fyo.db.isConnected && fyo.db.dbPath === filePath) {
        await fyo.db.close();
      }
    } catch (closeError) {
      // eslint-disable-next-line no-console
      console.error('Save As: close after failed reconnect', closeError);
    }
    await showDialog({
      title: t`Reconnect failed`,
      detail: t`Could not open the company at ${filePath}. Please reopen it from the company list.`,
      type: 'error',
    });
    return false;
  }
}

/**
 * Save As (move): copy DB trio, keep instanceId, update config + lastSelectedFilePath,
 * archive old file, reconnect. Never re-runs SetupWizard.
 */
export async function saveCompanyAs(
  sourcePath?: string
): Promise<string | null> {
  const currentPath = sourcePath || fyo.db.dbPath;
  if (!currentPath || currentPath === ':memory:') {
    await showDialog({
      title: t`Cannot Save As`,
      detail: t`Save As is not available for an in-memory company.`,
      type: 'error',
    });
    return null;
  }

  const companyName =
    (fyo.singles.AccountingSettings?.companyName as string) ||
    fileBasename(currentPath, '.db') ||
    'company';

  const slash = Math.max(
    currentPath.lastIndexOf('/'),
    currentPath.lastIndexOf('\\')
  );
  const dir = slash >= 0 ? currentPath.slice(0, slash + 1) : '';
  const suggested = `${dir}${companyName}.db`;

  const { canceled, filePath } = await getSavePath(
    companyName,
    'db',
    suggested
  );
  if (canceled || !filePath) {
    return null;
  }
  if (filePath === currentPath) {
    return currentPath;
  }

  const archiveChoice = await showDialog({
    title: t`Save As`,
    detail: t`The company file will move to the new location. The old file will be archived so two copies do not share the same company id.`,
    type: 'warning',
    buttons: [
      {
        label: t`Move and archive old file`,
        action() {
          return 'archive' as const;
        },
        isPrimary: true,
      },
      {
        label: t`Cancel`,
        action() {
          return null;
        },
        isEscape: true,
      },
    ],
  });

  if (archiveChoice !== 'archive') {
    return null;
  }

  const wasOpen = !!fyo.db.isConnected && fyo.db.dbPath === currentPath;
  let movedAndConnected = false;

  try {
    if (wasOpen) {
      await fyo.db.close();
    }
    // Copy first; archive only after the new file is usable so failure can
    // reconnect to the original path.
    await copyCompanyDbFiles(currentPath, filePath);

    if (wasOpen) {
      const ok = await reconnectTo(filePath, 'new location');
      if (!ok) {
        // reconnectTo already showed a dialog and closed a partial connection.
        try {
          await deleteDbTrio(filePath);
        } catch (cleanupError) {
          // eslint-disable-next-line no-console
          console.error(
            'Save As: cleanup of incomplete copy failed',
            cleanupError
          );
        }
        await reconnectTo(currentPath, 'original location');
        return null;
      }
      movedAndConnected = true;
    } else {
      patchConfigPath(currentPath, filePath);
      movedAndConnected = true;
    }
  } catch (error) {
    await handleErrorWithDialog(error, undefined, true, true);

    // Only delete the destination if we never successfully connected to it.
    // Never delete a live connected DB, and never leave config pointing at a
    // path we just deleted.
    if (!movedAndConnected) {
      try {
        if (fyo.db.isConnected && fyo.db.dbPath === filePath) {
          await fyo.db.close();
        }
      } catch (closeError) {
        // eslint-disable-next-line no-console
        console.error('Save As: close before cleanup', closeError);
      }
      try {
        await deleteDbTrio(filePath);
      } catch (cleanupError) {
        // eslint-disable-next-line no-console
        console.error(
          'Save As: cleanup of incomplete copy failed',
          cleanupError
        );
      }
      if (wasOpen) {
        await reconnectTo(currentPath, 'original location');
      } else {
        // Config may have been partially patched; ensure it still points at source.
        patchConfigPath(filePath, currentPath);
        fyo.config.set('lastSelectedFilePath', currentPath);
      }
    }
    return null;
  }

  // Archive is best-effort AFTER a successful move. Failure must not roll back
  // the new file or config — that would delete the live company.
  try {
    await archiveOldCompanyFile(currentPath);
  } catch (archiveError) {
    // eslint-disable-next-line no-console
    console.error('Save As: archive of old file failed', archiveError);
    await showDialog({
      title: t`Saved with warning`,
      detail: t`Company file moved to ${filePath}, but the old file could not be archived. Remove or rename it manually so two copies do not share the same company id.`,
      type: 'warning',
    });
    return filePath;
  }

  await showDialog({
    title: t`Saved`,
    detail: t`Company file moved to ${filePath}`,
    type: 'info',
  });
  return filePath;
}
