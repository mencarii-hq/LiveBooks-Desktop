import {
  MessageBoxOptions,
  OpenDialogOptions,
  SaveDialogOptions,
  app,
  dialog,
  ipcMain,
} from 'electron';
import fetch from 'node-fetch';
import { fetchWithCloudBackoff } from './cloudApiFetchWithBackoff';
import { autoUpdater } from 'electron-updater';
import { constants } from 'fs';
import fs from 'fs-extra';
import path from 'path';
import { isRendererDenylistedCloudPath } from 'utils/cloudApiDenylist';
import {
  getSecureToken,
  hasSecureToken,
  setSecureToken,
} from 'utils/secureTokenStore';
import { SelectFileOptions, SelectFileReturn } from 'utils/types';
import databaseManager from '../backend/database/manager';
import { emitMainProcessError } from '../backend/helpers';
import { Main } from '../main';
import { DatabaseMethod } from '../utils/db/types';
import {
  broadcastLivebooksCloudSession,
  clearLivebooksCloudSessionFromStore,
  getLivebooksCloudOriginMain,
  isLivebooksCloudSignedIn,
} from './livebooksCloudBridge';
import { IPC_ACTIONS } from '../utils/messages';
import { getUrlAndTokenString, sendError } from './contactMothership';
import { getLanguageMap } from './getLanguageMap';
import { getTemplates } from './getPrintTemplates';
import { printHtmlDocument } from './printHtmlDocument';
import {
  getConfigFilesWithModified,
  getErrorHandledReponse,
  isNetworkError,
  setAndGetCleanedConfigFiles,
} from './helpers';
import { saveHtmlAsPdf } from './saveHtmlAsPdf';
import { initLoyaltyExpiryJob } from './initSheduler';

type LivebooksCloudApiResult = {
  ok: boolean;
  status: number;
  data: unknown;
  etag?: string;
  subscriptionChangedAt?: string;
};

type LivebooksCloudTokenPair = { access_token: string; refresh_token: string };

let livebooksCloudRefreshInFlight: Promise<LivebooksCloudTokenPair | null> | null =
  null;

async function readJsonBody(
  res: import('node-fetch').Response
): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

async function refreshLivebooksCloudTokens(
  origin: string
): Promise<LivebooksCloudTokenPair | null> {
  if (livebooksCloudRefreshInFlight) {
    return await livebooksCloudRefreshInFlight;
  }

  livebooksCloudRefreshInFlight = (async () => {
    const refresh = getSecureToken('livebooksCloudRefreshToken');
    if (typeof refresh !== 'string' || refresh.length === 0) {
      return null;
    }

    try {
      const res = await fetch(`${origin}/api/v1/sessions/refresh`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refresh }),
      } as import('node-fetch').RequestInit);

      const data = await readJsonBody(res);
      if (!res.ok || !data || typeof data !== 'object') {
        return null;
      }

      const at = (data as { access_token?: unknown }).access_token;
      const rt = (data as { refresh_token?: unknown }).refresh_token;
      if (
        typeof at === 'string' &&
        at.length > 0 &&
        typeof rt === 'string' &&
        rt.length > 0
      ) {
        setSecureToken('livebooksCloudAccessToken', at);
        setSecureToken('livebooksCloudRefreshToken', rt);
        return { access_token: at, refresh_token: rt };
      }
      return null;
    } catch {
      return null;
    } finally {
      livebooksCloudRefreshInFlight = null;
    }
  })();

  return await livebooksCloudRefreshInFlight;
}

export default function registerIpcMainActionListeners(main: Main) {
  ipcMain.handle(IPC_ACTIONS.CHECK_DB_ACCESS, async (_, filePath: string) => {
    try {
      await fs.access(filePath, constants.W_OK | constants.R_OK);
    } catch (err) {
      return false;
    }

    return true;
  });

  ipcMain.handle(
    IPC_ACTIONS.GET_DB_DEFAULT_PATH,
    async (_, companyName: string) => {
      let root: string;
      try {
        root = app.getPath('documents');
      } catch {
        root = app.getPath('userData');
      }

      if (main.isDevelopment) {
        root = 'dbs';
      }

      const dbsPath = path.join(root, 'Frappe Books');
      const backupPath = path.join(dbsPath, 'livebooks_backups');
      await fs.ensureDir(backupPath);

      let dbFilePath = path.join(dbsPath, `${companyName}.books.db`);

      if (await fs.pathExists(dbFilePath)) {
        const option = await dialog.showMessageBox({
          type: 'question',
          title: 'File Exists',
          message: `Filename already exists. Do you want to overwrite the existing file or create a new one?`,
          buttons: ['Overwrite', 'New'],
        });

        if (option.response === 1) {
          const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '');

          dbFilePath = path.join(
            dbsPath,
            `${companyName}_${timestamp}.books.db`
          );

          await dialog.showMessageBox({
            type: 'info',
            message: `New file: ${path.basename(dbFilePath)}`,
          });
        }
      }

      return dbFilePath;
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_OPEN_FILEPATH,
    async (_, options: OpenDialogOptions) => {
      return await dialog.showOpenDialog(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_SAVE_FILEPATH,
    async (_, options: SaveDialogOptions) => {
      return await dialog.showSaveDialog(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_DIALOG_RESPONSE,
    async (_, options: MessageBoxOptions) => {
      if (main.isDevelopment || main.isLinux) {
        Object.assign(options, { icon: main.icon });
      }

      return await dialog.showMessageBox(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SHOW_ERROR,
    (_, { title, content }: { title: string; content: string }) => {
      return dialog.showErrorBox(title, content);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SAVE_HTML_AS_PDF,
    async (
      _,
      html: string,
      savePath: string,
      width: number,
      height: number
    ) => {
      return await saveHtmlAsPdf(html, savePath, app, width, height);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.PRINT_HTML_DOCUMENT,
    async (_, html: string, width: number, height: number) => {
      return await printHtmlDocument(html, app, width, height);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SAVE_DATA,
    async (_, data: string, savePath: string) => {
      return await fs.writeFile(savePath, data, { encoding: 'utf-8' });
    }
  );

  ipcMain.handle(IPC_ACTIONS.SEND_ERROR, async (_, bodyJson: string) => {
    await sendError(bodyJson, main);
  });

  ipcMain.handle(IPC_ACTIONS.CHECK_FOR_UPDATES, async () => {
    if (main.isDevelopment || main.checkedForUpdate || !main.updaterEnabled) {
      return;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      if (isNetworkError(error as Error)) {
        return;
      }

      emitMainProcessError(error);
    }
    main.checkedForUpdate = true;
  });

  ipcMain.handle(IPC_ACTIONS.GET_LANGUAGE_MAP, async (_, code: string) => {
    const obj = { languageMap: {}, success: true, message: '' };
    try {
      obj.languageMap = await getLanguageMap(code);
    } catch (err) {
      obj.success = false;
      obj.message = (err as Error).message;
    }

    return obj;
  });

  ipcMain.handle(
    IPC_ACTIONS.SELECT_FILE,
    async (_, options: SelectFileOptions): Promise<SelectFileReturn> => {
      const response: SelectFileReturn = {
        name: '',
        filePath: '',
        success: false,
        data: Buffer.from('', 'utf-8'),
        canceled: false,
      };
      const { filePaths, canceled } = await dialog.showOpenDialog(
        main.mainWindow!,
        { ...options, properties: ['openFile'] }
      );

      response.filePath = filePaths?.[0];
      response.canceled = canceled;

      if (!response.filePath) {
        return response;
      }

      response.success = true;
      if (canceled) {
        return response;
      }

      response.name = path.basename(response.filePath);
      response.data = await fs.readFile(response.filePath);
      return response;
    }
  );

  ipcMain.handle(IPC_ACTIONS.GET_CREDS, () => {
    return getUrlAndTokenString();
  });

  ipcMain.handle(IPC_ACTIONS.DELETE_FILE, async (_, filePath: string) => {
    return getErrorHandledReponse(async () => await fs.unlink(filePath));
  });

  ipcMain.handle(IPC_ACTIONS.GET_DB_LIST, async () => {
    const files = await setAndGetCleanedConfigFiles();
    return await getConfigFilesWithModified(files);
  });

  ipcMain.handle(IPC_ACTIONS.GET_ENV, async () => {
    let version = app.getVersion();
    if (main.isDevelopment) {
      const packageJson = await fs.readFile('package.json', 'utf-8');
      version = (JSON.parse(packageJson) as { version: string }).version;
    }

    return {
      isDevelopment: main.isDevelopment,
      appEnv: main.appEnv,
      platform: process.platform,
      version,
      telemetryEnabled: main.telemetryEnabled,
      updaterEnabled: main.updaterEnabled,
    };
  });

  ipcMain.handle(
    IPC_ACTIONS.GET_TEMPLATES,
    async (_, posPrintWidth?: number) => {
      return getTemplates(posPrintWidth);
    }
  );

  ipcMain.handle(IPC_ACTIONS.INIT_LOYALTY_SCHEDULER, async () => {
    return initLoyaltyExpiryJob();
  });

  ipcMain.handle(IPC_ACTIONS.GET_LIVEBOOKS_CLOUD_SESSION, () => {
    return { signedIn: isLivebooksCloudSignedIn() };
  });

  ipcMain.handle(IPC_ACTIONS.CLEAR_LIVEBOOKS_CLOUD_SESSION, async () => {
    const origin = getLivebooksCloudOriginMain();
    const refresh = getSecureToken('livebooksCloudRefreshToken');
    if (typeof refresh === 'string' && refresh.length > 0) {
      try {
        await fetch(`${origin}/api/v1/sessions`, {
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: refresh }),
        });
      } catch {
        /* still clear local session */
      }
    }
    clearLivebooksCloudSessionFromStore();
    broadcastLivebooksCloudSession(main, false);
  });

  ipcMain.handle(
    IPC_ACTIONS.LIVEBOOKS_CLOUD_API,
    async (
      _,
      payload: {
        method: string;
        path: string;
        body?: unknown;
        skipAuth?: boolean;
        headers?: Record<string, string>;
      }
    ) => {
      const { method, path, body, skipAuth, headers: extraHeaders } = payload;
      if (!path.startsWith('/api/')) {
        return {
          ok: false,
          status: 0,
          data: { error: 'invalid_path' as const },
        } as LivebooksCloudApiResult;
      }
      // MFA verification is web-only. Renderer must never call /api/v1/me/mfa/*.
      if (isRendererDenylistedCloudPath(path)) {
        return {
          ok: false,
          status: 403,
          data: {
            error: 'forbidden_in_renderer' as const,
            message: 'This endpoint is only callable from the main process.',
          },
        } as LivebooksCloudApiResult;
      }

      try {
        const origin = getLivebooksCloudOriginMain();

        const makeHeaders = (accessToken?: string): Record<string, string> => {
          const headers: Record<string, string> = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          };
          if (
            !skipAuth &&
            typeof accessToken === 'string' &&
            accessToken.length > 0
          ) {
            headers.Authorization = `Bearer ${accessToken}`;
          }
          if (extraHeaders) {
            for (const [k, v] of Object.entries(extraHeaders)) {
              if (v !== undefined && v !== '') {
                headers[k] = v;
              }
            }
          }
          return headers;
        };

        const makeInit = (headers: Record<string, string>): RequestInit => {
          const init: RequestInit = { method, headers };
          if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
            init.body = JSON.stringify(body);
          }
          return init;
        };

        const access0 = skipAuth
          ? undefined
          : getSecureToken('livebooksCloudAccessToken');
        const accessToken0 = typeof access0 === 'string' ? access0 : undefined;
        const { response: res0 } = await fetchWithCloudBackoff(
          `${origin}${path}`,
          makeInit(
            makeHeaders(accessToken0)
          ) as import('node-fetch').RequestInit
        );
        const data0 = await readJsonBody(res0);
        const etag0 = res0.headers.get('etag') ?? undefined;
        const subscriptionChangedAt0 =
          res0.headers.get('x-subscription-changed-at') ?? undefined;

        // Access JWTs are intentionally short-lived on the server; auto-refresh + retry once on 401.
        const eligibleForRefresh =
          !skipAuth &&
          res0.status === 401 &&
          !path.startsWith('/api/v1/sessions/') &&
          hasSecureToken('livebooksCloudRefreshToken');

        if (!eligibleForRefresh) {
          return {
            ok: res0.ok,
            status: res0.status,
            data: data0,
            etag: etag0,
            subscriptionChangedAt: subscriptionChangedAt0,
          };
        }

        const refreshed = await refreshLivebooksCloudTokens(origin);
        if (!refreshed) {
          clearLivebooksCloudSessionFromStore();
          broadcastLivebooksCloudSession(main, false);
          return {
            ok: res0.ok,
            status: res0.status,
            data: data0,
            etag: etag0,
            subscriptionChangedAt: subscriptionChangedAt0,
          };
        }

        broadcastLivebooksCloudSession(main, true);
        const { response: res1 } = await fetchWithCloudBackoff(
          `${origin}${path}`,
          makeInit(
            makeHeaders(refreshed.access_token)
          ) as import('node-fetch').RequestInit
        );
        const data1 = await readJsonBody(res1);
        const etag1 = res1.headers.get('etag') ?? undefined;
        const subscriptionChangedAt1 =
          res1.headers.get('x-subscription-changed-at') ??
          subscriptionChangedAt0;
        return {
          ok: res1.ok,
          status: res1.status,
          data: data1,
          etag: etag1,
          subscriptionChangedAt: subscriptionChangedAt1,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          status: 0,
          data: {
            error: 'network_error' as const,
            message,
          },
        } as LivebooksCloudApiResult;
      }
    }
  );

  /**
   * Database Related Actions
   */

  ipcMain.handle(
    IPC_ACTIONS.DB_CREATE,
    async (_, dbPath: string, countryCode: string) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.createNewDatabase(dbPath, countryCode);
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_CONNECT,
    async (_, dbPath: string, countryCode?: string) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.connectToDatabase(dbPath, countryCode);
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_CALL,
    async (_, method: DatabaseMethod, ...args: unknown[]) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.call(method, ...args);
      });
    }
  );

  ipcMain.handle(IPC_ACTIONS.DB_BEGIN_TRANSACTION, async () => {
    return await getErrorHandledReponse(() => {
      databaseManager.beginTransaction();
    });
  });

  ipcMain.handle(IPC_ACTIONS.DB_END_TRANSACTION, async (_, commit = true) => {
    return await getErrorHandledReponse(async () => {
      await databaseManager.endTransaction(commit !== false);
    });
  });

  ipcMain.handle(
    IPC_ACTIONS.DB_BESPOKE,
    async (_, method: string, ...args: unknown[]) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.callBespoke(method, ...args);
      });
    }
  );

  ipcMain.handle(IPC_ACTIONS.DB_SCHEMA, async () => {
    return await getErrorHandledReponse(() => {
      return databaseManager.getSchemaMap();
    });
  });
}
