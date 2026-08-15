import path from 'path';

/**
 * The Source book archive lives in a `{company}.sourcebooks/` directory next
 * to the open `.books` database file. It contains the pulled QBD export ZIP
 * and the SQLite FTS5 index — never anything inside the `.books` ledger.
 */

export const SOURCEBOOKS_DIR_SUFFIX = '.sourcebooks';
export const ARCHIVE_ZIP_NAME = 'archive.zip';
export const INDEX_DB_NAME = 'index.db';

/** Company file base name without the `.books.db` / `.db` / `.books` suffix. */
export function companyBaseFromDbPath(booksDbPath: string): string {
  const base = path.basename(booksDbPath);
  const stripped = base
    .replace(/\.books\.db$/i, '')
    .replace(/\.books$/i, '')
    .replace(/\.db$/i, '');
  return stripped || base;
}

export function sidecarDirForDbPath(booksDbPath: string): string {
  const dir = path.dirname(path.resolve(booksDbPath));
  return path.join(
    dir,
    `${companyBaseFromDbPath(booksDbPath)}${SOURCEBOOKS_DIR_SUFFIX}`
  );
}

export function archiveZipPath(sidecarDir: string): string {
  return path.join(sidecarDir, ARCHIVE_ZIP_NAME);
}

export function indexDbPath(sidecarDir: string): string {
  return path.join(sidecarDir, INDEX_DB_NAME);
}

/**
 * Renderer-provided paths cross the IPC boundary; only accept paths that look
 * like a company database file so the sidecar cannot be planted elsewhere.
 */
export function assertBooksDbPath(booksDbPath: unknown): string {
  if (typeof booksDbPath !== 'string' || !booksDbPath.trim()) {
    throw new Error('Invalid company file path');
  }
  if (booksDbPath.includes('\0')) {
    throw new Error('Invalid company file path');
  }
  const resolved = path.resolve(booksDbPath);
  if (!/\.(books\.db|books|db)$/i.test(path.basename(resolved))) {
    throw new Error('Not a company database file');
  }
  return resolved;
}
