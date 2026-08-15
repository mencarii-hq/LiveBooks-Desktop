import { asArray } from './values';

/**
 * Tolerant reader for the archive ZIP's manifest.json. The manifest carries
 * per-entity counts/partial flags, classified extract errors, reconciliation
 * results, and notes on data QBD never exposes ("not extractable"). All of it
 * is informational — a malformed manifest must never break the archive.
 */

export interface ManifestEntityStatus {
  entityType: string;
  count?: number;
  partial: boolean;
  failed: boolean;
  error?: string;
}

export interface ManifestSummary {
  companyName?: string;
  exportedAt?: string;
  entities: ManifestEntityStatus[];
  /** Entity types that failed to extract, with the classified error. */
  errors: { entityType: string; message: string }[];
  /** Data QBD does not expose (e.g. payroll detail); shown as notes. */
  notExtractable: string[];
  totalRecords?: number;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function asCount(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string' && v && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function readErrors(raw: unknown): { entityType: string; message: string }[] {
  const out: { entityType: string; message: string }[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      const rec = item as Record<string, unknown>;
      const entityType =
        asString(rec.entity_type) ?? asString(rec.entityType) ?? '';
      const message =
        asString(rec.message) ?? asString(rec.error) ?? asString(rec.reason);
      if (entityType && message) {
        out.push({ entityType, message });
      }
    }
    return out;
  }
  if (typeof raw === 'object' && raw !== null) {
    for (const [entityType, value] of Object.entries(raw)) {
      const message =
        asString(value) ??
        (typeof value === 'object' && value !== null
          ? asString((value as Record<string, unknown>).message) ??
            asString((value as Record<string, unknown>).error)
          : undefined);
      if (message) {
        out.push({ entityType, message });
      }
    }
  }
  return out;
}

function readNotExtractable(raw: unknown): string[] {
  const out: string[] = [];
  for (const item of asArray(raw)) {
    if (typeof item === 'string' && item) {
      out.push(item);
      continue;
    }
    if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, unknown>;
      const note =
        asString(rec.note) ?? asString(rec.message) ?? asString(rec.reason);
      const name = asString(rec.name) ?? asString(rec.entity_type);
      if (note) {
        out.push(name ? `${name}: ${note}` : note);
      } else if (name) {
        out.push(name);
      }
    }
  }
  return out;
}

function readEntities(
  raw: unknown,
  errorTypes: Set<string>
): ManifestEntityStatus[] {
  const out: ManifestEntityStatus[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return out;
  }
  for (const [entityType, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) {
      out.push({
        entityType,
        count: asCount(value),
        partial: false,
        failed: errorTypes.has(entityType),
      });
      continue;
    }
    const rec = value as Record<string, unknown>;
    const status = asString(rec.status)?.toLowerCase();
    out.push({
      entityType,
      count: asCount(rec.count) ?? asCount(rec.records) ?? asCount(rec.total),
      partial: rec.partial === true || status === 'partial',
      failed:
        rec.failed === true ||
        status === 'failed' ||
        errorTypes.has(entityType),
      error: asString(rec.error),
    });
  }
  return out;
}

export function summarizeManifest(
  manifestJson: string | undefined
): ManifestSummary | null {
  if (!manifestJson) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestJson);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const rec = parsed as Record<string, unknown>;

  // `failed_entities` is the pre-manifest Cloud shape; fold it into errors.
  const errors = [
    ...readErrors(rec.errors),
    ...readErrors(rec.failed_entities),
  ];
  const errorTypes = new Set(errors.map((e) => e.entityType));

  return {
    companyName: asString(rec.company_name) ?? asString(rec.companyName),
    exportedAt:
      asString(rec.exported_at) ??
      asString(rec.completed_at) ??
      asString(rec.exportedAt),
    entities: readEntities(rec.entities, errorTypes),
    errors,
    notExtractable: readNotExtractable(rec.not_extractable),
    totalRecords: asCount(rec.total_records),
  };
}
