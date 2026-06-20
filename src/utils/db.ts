import { Fyo, t } from 'fyo';
import {
  CLOUD_FOLDER_DB_WARNING,
  isCloudSyncFolderPath,
} from 'utils/database/cloudStoragePath';
import { withSqliteBusyRetry } from 'utils/database/sqliteBusyRetry';

type Conn = {
  countryCode: string;
  error?: Error;
  actionSymbol?: typeof dbErrorActionSymbols[keyof typeof dbErrorActionSymbols];
};

export const dbErrorActionSymbols = {
  SelectFile: Symbol('select-file'),
  CancelSelection: Symbol('cancel-selection'),
} as const;

const dbErrors = {
  DirectoryDoesNotExist: 'directory does not exist',
  UnableToAcquireConnection: 'Unable to acquire a connection',
} as const;

export async function connectToDatabase(
  fyo: Fyo,
  dbPath: string,
  countryCode?: string
): Promise<Conn> {
  try {
    const countryCodeResult = await withSqliteBusyRetry(() =>
      fyo.db.connectToDatabase(dbPath, countryCode)
    );
    if (isCloudSyncFolderPath(dbPath)) {
      const { showToast } = await import('src/utils/interactive');
      showToast({
        type: 'warning',
        message: t`${CLOUD_FOLDER_DB_WARNING}`,
        duration: 'long',
      });
    }
    return { countryCode: countryCodeResult };
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    return {
      countryCode: '',
      error,
      actionSymbol: await handleDatabaseConnectionError(error, dbPath),
    };
  }
}

export async function handleDatabaseConnectionError(
  error: Error,
  dbPath: string
) {
  const message = error.message;
  if (typeof message !== 'string') {
    throw error;
  }

  if (message.includes(dbErrors.DirectoryDoesNotExist)) {
    return await handleDirectoryDoesNotExist(dbPath);
  }

  if (message.includes(dbErrors.UnableToAcquireConnection)) {
    return await handleUnableToAcquireConnection(dbPath);
  }

  throw error;
}

async function handleUnableToAcquireConnection(dbPath: string) {
  return await showDbErrorDialog(
    t`Could not connect to database file ${dbPath}, please select the file manually`
  );
}

async function handleDirectoryDoesNotExist(dbPath: string) {
  return await showDbErrorDialog(
    t`Directory for database file ${dbPath} does not exist, please select the file manually`
  );
}

async function showDbErrorDialog(detail: string) {
  const { showDialog } = await import('src/utils/interactive');
  return showDialog({
    type: 'error',
    title: t`Cannot Open File`,
    detail,
    buttons: [
      {
        label: t`Select File`,
        action() {
          return dbErrorActionSymbols.SelectFile;
        },
        isPrimary: true,
      },
      {
        label: t`Cancel`,
        action() {
          return dbErrorActionSymbols.CancelSelection;
        },
        isEscape: true,
      },
    ],
  });
}
