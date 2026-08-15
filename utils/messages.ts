// ipcRenderer.send(...)
export enum IPC_MESSAGES {
  OPEN_MENU = 'open-menu',
  OPEN_SETTINGS = 'open-settings',
  OPEN_EXTERNAL = 'open-external',
  SHOW_ITEM_IN_FOLDER = 'show-item-in-folder',
  RELOAD_MAIN_WINDOW = 'reload-main-window',
  MINIMIZE_MAIN_WINDOW = 'minimize-main-window',
  MAXIMIZE_MAIN_WINDOW = 'maximize-main-window',
  ISMAXIMIZED_MAIN_WINDOW = 'ismaximized-main-window',
  ISMAXIMIZED_RESULT = 'ismaximized-result',
  ISFULLSCREEN_MAIN_WINDOW = 'isfullscreen-main-window',
  ISFULLSCREEN_RESULT = 'isfullscreen-result',
  CLOSE_MAIN_WINDOW = 'close-main-window',
  STORE_GET = 'store-get',
  STORE_SET = 'store-set',
  STORE_DELETE = 'store-delete',
}

// ipcRenderer.invoke(...)
export enum IPC_ACTIONS {
  GET_LIVEBOOKS_CLOUD_SESSION = 'get-livebooks-cloud-session',
  CLEAR_LIVEBOOKS_CLOUD_SESSION = 'clear-livebooks-cloud-session',
  LIVEBOOKS_CLOUD_API = 'livebooks-cloud-api',
  GET_OPEN_FILEPATH = 'open-dialog',
  GET_SAVE_FILEPATH = 'save-dialog',
  GET_DIALOG_RESPONSE = 'show-message-box',
  GET_ENV = 'get-env',
  SAVE_HTML_AS_PDF = 'save-html-as-pdf',
  PRINT_HTML_DOCUMENT = 'print-html-document',
  SAVE_DATA = 'save-data',
  SHOW_ERROR = 'show-error',
  SEND_ERROR = 'send-error',
  SEND_DESKTOP_EVENT = 'send-desktop-event',
  GET_LANGUAGE_MAP = 'get-language-map',
  CHECK_FOR_UPDATES = 'check-for-updates',
  CHECK_FOR_UPDATES_FORCE = 'check-for-updates-force',
  CHECK_DB_ACCESS = 'check-db-access',
  SELECT_FILE = 'select-file',
  GET_CREDS = 'get-creds',
  GET_DB_LIST = 'get-db-list',
  GET_TEMPLATES = 'get-templates',
  INIT_LOYALTY_SCHEDULER = 'init-loyalty-scheduler',
  DELETE_FILE = 'delete-file',
  COPY_FILE = 'copy-file',
  RENAME_FILE = 'rename-file',
  GET_DB_DEFAULT_PATH = 'get-db-default-path',
  // Source book archive (user-facing "QBD Archive") messages
  SOURCEBOOKS_GET_STATUS = 'sourcebooks-get-status',
  SOURCEBOOKS_LIST_CLOUD_EXPORTS = 'sourcebooks-list-cloud-exports',
  SOURCEBOOKS_PULL_CLOUD = 'sourcebooks-pull-cloud',
  SOURCEBOOKS_ATTACH_LOCAL = 'sourcebooks-attach-local',
  SOURCEBOOKS_DETACH = 'sourcebooks-detach',
  SOURCEBOOKS_SEARCH = 'sourcebooks-search',
  SOURCEBOOKS_LIST_RECORDS = 'sourcebooks-list-records',
  SOURCEBOOKS_GET_RECORD = 'sourcebooks-get-record',
  SOURCEBOOKS_LIST_SNAPSHOTS = 'sourcebooks-list-snapshots',
  SOURCEBOOKS_GET_SNAPSHOT = 'sourcebooks-get-snapshot',
  SOURCEBOOKS_MARK_COPIED = 'sourcebooks-mark-copied',
  SOURCEBOOKS_GET_COPIED = 'sourcebooks-get-copied',
  // Database messages
  DB_CREATE = 'db-create',
  DB_CONNECT = 'db-connect',
  DB_CALL = 'db-call',
  DB_BEGIN_TRANSACTION = 'db-begin-transaction',
  DB_END_TRANSACTION = 'db-end-transaction',
  DB_BESPOKE = 'db-bespoke',
  DB_SCHEMA = 'db-schema',
}

// ipcMain.send(...)
export enum IPC_CHANNELS {
  LOG_MAIN_PROCESS_ERROR = 'main-process-error',
  CONSOLE_LOG = 'console-log',
  LIVEBOOKS_CLOUD_SESSION_CHANGED = 'livebooks-cloud-session-changed',
  SOURCEBOOKS_PROGRESS = 'sourcebooks-progress',
}

export enum DB_CONN_FAILURE {
  INVALID_FILE = 'invalid-file',
  CANT_OPEN = 'cant-open',
  CANT_CONNECT = 'cant-connect',
}

// events
export enum CUSTOM_EVENTS {
  MAIN_PROCESS_ERROR = 'main-process-error',
  LOG_UNEXPECTED = 'log-unexpected',
}
