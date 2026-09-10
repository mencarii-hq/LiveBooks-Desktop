import type {
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron';
import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type { ConfigMap } from 'fyo/core/types';
import type { DatabaseMethod } from 'utils/db/types';
import type { BackendResponse } from 'utils/ipc/types';
import { IPC_ACTIONS, IPC_CHANNELS, IPC_MESSAGES } from 'utils/messages';
import type {
  ConfigFilesWithModified,
  Creds,
  LanguageMap,
  SelectFileOptions,
  SelectFileReturn,
  TemplateFile,
} from 'utils/types';
import type {
  CloudQbdExportSummary,
  SourceBookCopiedRecord,
  SourceBookListRequest,
  SourceBookListResult,
  SourceBookOpResult,
  SourceBookRecordDetail,
  SourceBookSearchRequest,
  SourceBookSearchResult,
  SourceBookSnapshot,
  SourceBookStatus,
} from 'utils/sourcebooks/types';

type IPCRendererListener = Parameters<typeof ipcRenderer.on>[1];
const ipc = {
  desktop: true,

  getZoomFactor() {
    return webFrame.getZoomFactor();
  },

  setZoomFactor(factor: number) {
    webFrame.setZoomFactor(factor);
  },

  reloadWindow() {
    return ipcRenderer.send(IPC_MESSAGES.RELOAD_MAIN_WINDOW);
  },

  minimizeWindow() {
    return ipcRenderer.send(IPC_MESSAGES.MINIMIZE_MAIN_WINDOW);
  },

  toggleMaximize() {
    return ipcRenderer.send(IPC_MESSAGES.MAXIMIZE_MAIN_WINDOW);
  },

  isMaximized() {
    return new Promise((resolve) => {
      ipcRenderer.send(IPC_MESSAGES.ISMAXIMIZED_MAIN_WINDOW);
      ipcRenderer.once(
        IPC_MESSAGES.ISMAXIMIZED_RESULT,
        (_event, isMaximized) => {
          resolve(isMaximized);
        }
      );
    });
  },

  isFullscreen() {
    return new Promise((resolve) => {
      ipcRenderer.send(IPC_MESSAGES.ISFULLSCREEN_MAIN_WINDOW);
      ipcRenderer.once(
        IPC_MESSAGES.ISFULLSCREEN_RESULT,
        (_event, isFullscreen) => {
          resolve(isFullscreen);
        }
      );
    });
  },

  closeWindow() {
    return ipcRenderer.send(IPC_MESSAGES.CLOSE_MAIN_WINDOW);
  },

  async getCreds() {
    return (await ipcRenderer.invoke(IPC_ACTIONS.GET_CREDS)) as Creds;
  },

  async getLanguageMap(code: string) {
    return (await ipcRenderer.invoke(IPC_ACTIONS.GET_LANGUAGE_MAP, code)) as {
      languageMap: LanguageMap;
      success: boolean;
      message: string;
    };
  },

  async getTemplates(posTemplateWidth?: number): Promise<TemplateFile[]> {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_TEMPLATES,
      posTemplateWidth
    )) as TemplateFile[];
  },

  async initLoyaltyExpiryJob() {
    await ipcRenderer.invoke(IPC_ACTIONS.INIT_LOYALTY_SCHEDULER);
  },

  async selectFile(options: SelectFileOptions): Promise<SelectFileReturn> {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.SELECT_FILE,
      options
    )) as SelectFileReturn;
  },

  async getSaveFilePath(options: SaveDialogOptions) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_SAVE_FILEPATH,
      options
    )) as SaveDialogReturnValue;
  },

  async getOpenFilePath(options: OpenDialogOptions) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_OPEN_FILEPATH,
      options
    )) as OpenDialogReturnValue;
  },

  async checkDbAccess(filePath: string) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.CHECK_DB_ACCESS,
      filePath
    )) as boolean;
  },

  async checkForUpdates() {
    return (await ipcRenderer.invoke(IPC_ACTIONS.CHECK_FOR_UPDATES)) as {
      status: 'skipped' | 'started' | 'error';
      reason?: string;
    };
  },

  async checkForUpdatesForce() {
    return (await ipcRenderer.invoke(IPC_ACTIONS.CHECK_FOR_UPDATES_FORCE)) as {
      status: 'skipped' | 'started' | 'error';
      reason?: string;
    };
  },

  openLink(link: string) {
    ipcRenderer.send(IPC_MESSAGES.OPEN_EXTERNAL, link);
  },

  async deleteFile(filePath: string) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.DELETE_FILE,
      filePath
    )) as BackendResponse;
  },

  async copyFile(src: string, dest: string) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.COPY_FILE,
      src,
      dest
    )) as BackendResponse;
  },

  async renameFile(src: string, dest: string) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.RENAME_FILE,
      src,
      dest
    )) as BackendResponse;
  },

  async saveData(data: string, savePath: string) {
    await ipcRenderer.invoke(IPC_ACTIONS.SAVE_DATA, data, savePath);
  },

  showItemInFolder(filePath: string) {
    ipcRenderer.send(IPC_MESSAGES.SHOW_ITEM_IN_FOLDER, filePath);
  },

  async makePDF(
    html: string,
    savePath: string,
    width: number,
    height: number
  ): Promise<boolean> {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.SAVE_HTML_AS_PDF,
      html,
      savePath,
      width,
      height
    )) as boolean;
  },

  async printDocument(
    html: string,
    width: number,
    height: number
  ): Promise<boolean> {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.PRINT_HTML_DOCUMENT,
      html,
      width,
      height
    )) as boolean;
  },

  async getDbList() {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_DB_LIST
    )) as ConfigFilesWithModified[];
  },

  async getDbDefaultPath(companyName: string) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_DB_DEFAULT_PATH,
      companyName
    )) as string;
  },

  async getEnv() {
    return (await ipcRenderer.invoke(IPC_ACTIONS.GET_ENV)) as {
      telemetryEnabled: boolean;
      updaterEnabled: boolean;
      isDevelopment: boolean;
      appEnv: 'development' | 'staging' | 'production';
      platform: string;
      arch: string;
      version: string;
    };
  },

  openExternalUrl(url: string) {
    ipcRenderer.send(IPC_MESSAGES.OPEN_EXTERNAL, url);
  },

  async showError(title: string, content: string) {
    await ipcRenderer.invoke(IPC_ACTIONS.SHOW_ERROR, { title, content });
  },

  async sendError(body: string) {
    await ipcRenderer.invoke(IPC_ACTIONS.SEND_ERROR, body);
  },

  async sendDesktopEvent(body: Record<string, unknown>) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.SEND_DESKTOP_EVENT,
      body
    )) as boolean;
  },

  async getLivebooksCloudSession() {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_LIVEBOOKS_CLOUD_SESSION
    )) as { signedIn: boolean; secureStorageDegraded: boolean };
  },

  async clearLivebooksCloudSession() {
    await ipcRenderer.invoke(IPC_ACTIONS.CLEAR_LIVEBOOKS_CLOUD_SESSION);
  },

  async livebooksCloudApi(payload: {
    method: string;
    path: string;
    body?: unknown;
    skipAuth?: boolean;
    headers?: Record<string, string>;
  }) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.LIVEBOOKS_CLOUD_API,
      payload
    )) as { ok: boolean; status: number; data: unknown; etag?: string };
  },

  registerLivebooksCloudSessionListener(listener: IPCRendererListener) {
    ipcRenderer.on(IPC_CHANNELS.LIVEBOOKS_CLOUD_SESSION_CHANGED, listener);
  },

  registerSourceBooksProgressListener(listener: IPCRendererListener) {
    ipcRenderer.on(IPC_CHANNELS.SOURCEBOOKS_PROGRESS, listener);
  },

  unregisterSourceBooksProgressListener(listener: IPCRendererListener) {
    ipcRenderer.removeListener(IPC_CHANNELS.SOURCEBOOKS_PROGRESS, listener);
  },

  /** Source book archive (user-facing: QBD Archive) sidecar access. */
  sourcebooks: {
    async getStatus(booksDbPath: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_GET_STATUS,
        booksDbPath
      )) as SourceBookStatus;
    },

    async listCloudExports() {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_LIST_CLOUD_EXPORTS
      )) as
        | { ok: true; exports: CloudQbdExportSummary[] }
        | { ok: false; error: string };
    },

    async pullFromCloud(payload: {
      booksDbPath: string;
      exportId: string;
      companyName?: string;
      exportedAt?: string;
    }) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_PULL_CLOUD,
        payload
      )) as SourceBookOpResult;
    },

    async attachLocalZip(payload: { booksDbPath: string; zipPath: string }) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_ATTACH_LOCAL,
        payload
      )) as SourceBookOpResult;
    },

    async attachDemoArchive(payload: { booksDbPath: string }) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_ATTACH_DEMO,
        payload
      )) as SourceBookOpResult;
    },

    async detach(booksDbPath: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_DETACH,
        booksDbPath
      )) as SourceBookOpResult;
    },

    async search(booksDbPath: string, request: SourceBookSearchRequest) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_SEARCH,
        booksDbPath,
        request
      )) as SourceBookSearchResult;
    },

    async listRecords(booksDbPath: string, request: SourceBookListRequest) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_LIST_RECORDS,
        booksDbPath,
        request
      )) as SourceBookListResult;
    },

    async getRecord(booksDbPath: string, ref: { id?: number; qbId?: string }) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_GET_RECORD,
        booksDbPath,
        ref
      )) as SourceBookRecordDetail | null;
    },

    async listSnapshots(booksDbPath: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_LIST_SNAPSHOTS,
        booksDbPath
      )) as string[];
    },

    async getSnapshot(booksDbPath: string, name: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_GET_SNAPSHOT,
        booksDbPath,
        name
      )) as SourceBookSnapshot | null;
    },

    async markCopied(booksDbPath: string, copied: SourceBookCopiedRecord) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_MARK_COPIED,
        booksDbPath,
        copied
      )) as boolean;
    },

    async getCopied(booksDbPath: string, qbId: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.SOURCEBOOKS_GET_COPIED,
        booksDbPath,
        qbId
      )) as SourceBookCopiedRecord | null;
    },
  },

  registerMainProcessErrorListener(listener: IPCRendererListener) {
    ipcRenderer.on(IPC_CHANNELS.LOG_MAIN_PROCESS_ERROR, listener);
  },

  registerConsoleLogListener(listener: IPCRendererListener) {
    ipcRenderer.on(IPC_CHANNELS.CONSOLE_LOG, listener);
  },

  db: {
    async getSchema() {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_SCHEMA
      )) as BackendResponse;
    },

    async create(dbPath: string, countryCode?: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_CREATE,
        dbPath,
        countryCode
      )) as BackendResponse;
    },

    async connect(dbPath: string, countryCode?: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_CONNECT,
        dbPath,
        countryCode
      )) as BackendResponse;
    },

    async call(method: DatabaseMethod, ...args: unknown[]) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_CALL,
        method,
        ...args
      )) as BackendResponse;
    },

    async beginTransaction() {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_BEGIN_TRANSACTION
      )) as BackendResponse;
    },

    async endTransaction(commit = true) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_END_TRANSACTION,
        commit
      )) as BackendResponse;
    },

    async bespoke(method: string, ...args: unknown[]) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_BESPOKE,
        method,
        ...args
      )) as BackendResponse;
    },
  },

  store: {
    get<K extends keyof ConfigMap>(key: K) {
      return ipcRenderer.sendSync(IPC_MESSAGES.STORE_GET, key) as
        | ConfigMap[K]
        | undefined;
    },

    set<K extends keyof ConfigMap>(key: K, value: ConfigMap[K]) {
      ipcRenderer.sendSync(IPC_MESSAGES.STORE_SET, key, value);
    },

    delete(key: keyof ConfigMap) {
      ipcRenderer.sendSync(IPC_MESSAGES.STORE_DELETE, key);
    },
  },
} as const;

contextBridge.exposeInMainWorld('ipc', ipc);
export type IPC = typeof ipc;
