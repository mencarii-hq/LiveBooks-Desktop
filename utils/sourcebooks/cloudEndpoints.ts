/**
 * Cloud endpoints for the QBD source book archive (final for this release).
 * Bearer JWT auth, same as other /api/v1 endpoints. Paths are isolated here
 * so a route tweak on Cloud is a one-line change on Desktop.
 *
 * Contract:
 *   GET {list}     -> 200 { "archives": [{ id, company_name, status, ready,
 *                     progress_percentage, created_at, completed_at,
 *                     entities_complete, entities_failed, total_records }] }
 *                     Pullable archives are the ones with `ready: true`
 *                     (do NOT infer readiness from `status`).
 *   GET {download} -> 200 application/zip (streamed
 *                     `{company}_source_book_archive.zip`)
 *                     404 {"error":"not_found"}
 *                     409 {"error":"not_ready","status":...} (still extracting)
 *                     500 {"error":"archive_failed"}
 */
export function sourceBookListPath(): string {
  return '/api/v1/source-books';
}

export function sourceBookDownloadPath(archiveId: string): string {
  return `/api/v1/source-books/${encodeURIComponent(archiveId)}/download`;
}
