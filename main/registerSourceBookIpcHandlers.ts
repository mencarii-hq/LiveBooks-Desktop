import { ipcMain } from 'electron';
import fs from 'fs-extra';
import { IPC_ACTIONS, IPC_CHANNELS } from 'utils/messages';
import type {
  SourceBookCopiedRecord,
  SourceBookListRequest,
  SourceBookOpResult,
  SourceBookProgress,
  SourceBookSearchRequest,
} from 'utils/sourcebooks/types';
import { attachDemoQbdArchive } from 'backend/sourcebooks/demoArchive';
import { sourceBookStore } from 'backend/sourcebooks/store';
import type { Main } from '../main';
import {
  downloadCloudQbdExportZip,
  listCloudQbdExports,
} from './sourceBooksCloud';

/**
 * IPC surface for the Source book archive (QBD Archive). All heavy work —
 * ZIP streaming, JSON parsing, FTS indexing — happens here in the main
 * process; the renderer only ever sees summaries and one record at a time.
 */
export default function registerSourceBookIpcHandlers(main: Main) {
  const sendProgress = (progress: SourceBookProgress) => {
    if (main.mainWindow && !main.mainWindow.isDestroyed()) {
      main.mainWindow.webContents.send(
        IPC_CHANNELS.SOURCEBOOKS_PROGRESS,
        progress
      );
    }
  };

  const asOpResult = async (
    booksDbPath: string,
    op: () => Promise<unknown>
  ): Promise<SourceBookOpResult> => {
    try {
      await op();
      return { ok: true, status: sourceBookStore.getStatus(booksDbPath) };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      sendProgress({ stage: 'error', error });
      return { ok: false, error };
    }
  };

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_GET_STATUS,
    (_, booksDbPath: string) => {
      try {
        return sourceBookStore.getStatus(booksDbPath);
      } catch {
        return { attached: false };
      }
    }
  );

  ipcMain.handle(IPC_ACTIONS.SOURCEBOOKS_LIST_CLOUD_EXPORTS, async () => {
    return await listCloudQbdExports();
  });

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_PULL_CLOUD,
    async (
      _,
      payload: {
        booksDbPath: string;
        exportId: string;
        companyName?: string;
        exportedAt?: string;
      }
    ): Promise<SourceBookOpResult> => {
      const { booksDbPath, exportId, companyName, exportedAt } = payload;
      return await asOpResult(booksDbPath, async () => {
        const paths = sourceBookStore.paths(booksDbPath);
        await fs.ensureDir(paths.sidecar);
        // Download to staging — never overwrite archive.zip until indexing
        // succeeds inside attachZip.
        const stagingZip = `${paths.zip}.staging`;

        sendProgress({ stage: 'downloading', bytes: 0 });
        const download = await downloadCloudQbdExportZip({
          exportId,
          destPath: stagingZip,
          onBytes: (bytes) => sendProgress({ stage: 'downloading', bytes }),
        });
        if (!download.ok) {
          throw new Error(download.error);
        }

        await sourceBookStore.attachZip({
          booksDbPath,
          zipSource: stagingZip,
          meta: { origin: 'cloud', exportId, companyName, exportedAt },
          onProgress: sendProgress,
        });
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_ATTACH_LOCAL,
    async (
      _,
      payload: { booksDbPath: string; zipPath: string }
    ): Promise<SourceBookOpResult> => {
      const { booksDbPath, zipPath } = payload;
      return await asOpResult(booksDbPath, async () => {
        if (
          typeof zipPath !== 'string' ||
          !zipPath.toLowerCase().endsWith('.zip') ||
          !(await fs.pathExists(zipPath))
        ) {
          throw new Error('Please choose a QBD export ZIP file');
        }
        await sourceBookStore.attachZip({
          booksDbPath,
          zipSource: zipPath,
          meta: { origin: 'local' },
          onProgress: sendProgress,
        });
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_ATTACH_DEMO,
    async (
      _,
      payload: { booksDbPath: string }
    ): Promise<SourceBookOpResult> => {
      const booksDbPath = payload?.booksDbPath;
      return await asOpResult(booksDbPath, async () => {
        await attachDemoQbdArchive(booksDbPath, sendProgress);
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_DETACH,
    async (_, booksDbPath: string): Promise<SourceBookOpResult> => {
      return await asOpResult(booksDbPath, async () => {
        await sourceBookStore.detach(booksDbPath);
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_SEARCH,
    (_, booksDbPath: string, request: SourceBookSearchRequest) => {
      return sourceBookStore.search(booksDbPath, request);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_LIST_RECORDS,
    (_, booksDbPath: string, request: SourceBookListRequest) => {
      return sourceBookStore.listRecords(booksDbPath, request);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_GET_RECORD,
    (_, booksDbPath: string, ref: { id?: number; qbId?: string }) => {
      return sourceBookStore.getRecord(booksDbPath, ref);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_LIST_SNAPSHOTS,
    (_, booksDbPath: string) => {
      return sourceBookStore.listSnapshots(booksDbPath);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_GET_SNAPSHOT,
    (_, booksDbPath: string, name: string) => {
      return sourceBookStore.getSnapshot(booksDbPath, name);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_MARK_COPIED,
    (_, booksDbPath: string, copied: SourceBookCopiedRecord) => {
      sourceBookStore.markCopied(booksDbPath, copied);
      return true;
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SOURCEBOOKS_GET_COPIED,
    (_, booksDbPath: string, qbId: string) => {
      return sourceBookStore.getCopied(booksDbPath, qbId);
    }
  );
}
