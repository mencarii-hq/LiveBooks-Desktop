import { asArray } from 'utils/sourcebooks/values';

export type RetData = Record<string, unknown>;

/** Resolve a dotted path ('customer_ref.full_name') in a Ret JSON object. */
export function retGet(data: unknown, path: string): unknown {
  let current: unknown = data;
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Display value: scalars as-is, refs by full_name/name, empty for objects. */
export function retDisplay(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    const name = rec.full_name ?? rec.name;
    if (typeof name === 'string') {
      return name;
    }
  }
  return '';
}

/** QBD address object ({addr1..addr5, city, state, postal_code}) to lines. */
export function addressLines(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const rec = value as Record<string, unknown>;
  const lines: string[] = [];
  for (const key of ['addr1', 'addr2', 'addr3', 'addr4', 'addr5']) {
    const line = rec[key];
    if (typeof line === 'string' && line.trim()) {
      lines.push(line);
    }
  }
  const cityLine = ['city', 'state', 'postal_code']
    .map((key) => rec[key])
    .filter((v): v is string => typeof v === 'string' && !!v.trim())
    .join(', ');
  if (cityLine) {
    lines.push(cityLine);
  }
  const country = rec.country;
  if (typeof country === 'string' && country.trim()) {
    lines.push(country);
  }
  return lines;
}

/** Normalized line rows for a table section (single-vs-array safe). */
export function retLines(data: RetData, key: string): RetData[] {
  return asArray(data[key]).filter(
    (line): line is RetData => typeof line === 'object' && line !== null
  );
}

/** Scalar top-level entries for the generic key-value viewer. */
export function scalarEntries(data: RetData): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'xml_attributes') {
      continue;
    }
    const display = retDisplay(value);
    if (display !== '') {
      out.push({ key, value: display });
    }
  }
  return out;
}
