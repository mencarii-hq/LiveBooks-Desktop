import { asArray } from './values';

/**
 * Flatten a raw qbXML ReportRet (as parsed to snake_case JSON by Cloud) into
 * a plain columns/rows table for the read-only snapshot viewer.
 *
 * ReportRet shape after the XML→JSON conversion:
 *   report_title / report_subtitle / report_basis  (strings)
 *   col_desc: ColDesc[]        attrs colID/dataType, child col_title
 *                              (attrs titleRow/value)
 *   report_data: { data_row / text_row / subtotal_row / total_row }
 *     each row has col_data[] (attrs colID/value) and data rows may carry
 *     a row_data label (attrs rowType/value)
 * The single-vs-array quirk applies to every level, and XML attributes live
 * under `xml_attributes` with their original camelCase names.
 */

export interface FlatReportTable {
  title?: string;
  subtitle?: string;
  basis?: string;
  columns: string[];
  rows: string[][];
}

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read `name` from xml_attributes (camelCase) or the node itself. */
function attr(value: unknown, ...names: string[]): string | undefined {
  if (!isNode(value)) {
    return undefined;
  }
  const attrs = isNode(value.xml_attributes) ? value.xml_attributes : {};
  for (const name of names) {
    for (const source of [attrs, value]) {
      const v = source[name];
      if (typeof v === 'string' || typeof v === 'number') {
        return String(v);
      }
    }
  }
  return undefined;
}

/** Element text content is a plain string; tolerate attribute variants too. */
function textValue(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return attr(value, 'value');
}

/** Locate the node that carries report_data, unwrapping report_ret/Rs layers. */
function findReportRet(value: unknown, depth = 4): Node | null {
  if (!isNode(value) || depth < 0) {
    return null;
  }
  if (value.report_data !== undefined || value.col_desc !== undefined) {
    return value;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'xml_attributes') {
      continue;
    }
    for (const candidate of asArray(child)) {
      const found = findReportRet(candidate, depth - 1);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function colIndex(value: unknown): number | undefined {
  const raw = attr(value, 'colID', 'col_id');
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed - 1;
}

function buildColumns(ret: Node): string[] {
  const descs = asArray(ret.col_desc).filter(isNode);
  const columns: string[] = [];
  for (let i = 0; i < descs.length; i++) {
    const desc = descs[i];
    const idx = colIndex(desc) ?? i;
    const title = asArray(desc.col_title)
      .map((ct) => attr(ct, 'value') ?? '')
      .filter(Boolean)
      .join(' ');
    while (columns.length <= idx) {
      columns.push('');
    }
    columns[idx] = title;
  }
  return columns;
}

function buildRow(row: unknown, width: number): string[] {
  const cells: string[] = new Array(Math.max(width, 1)).fill('') as string[];
  const place = (idx: number | undefined, value: string | undefined) => {
    if (value === undefined) {
      return;
    }
    const at = idx ?? 0;
    while (cells.length <= at) {
      cells.push('');
    }
    cells[at] = value;
  };
  if (!isNode(row)) {
    place(0, textValue(row));
    return cells;
  }
  for (const colData of asArray(row.col_data)) {
    place(colIndex(colData), attr(colData, 'value'));
  }
  // TextRow / label fallback: RowData value labels the row when column 1
  // carried no ColData.
  if (!cells[0]) {
    const label =
      attr(row, 'value') ??
      asArray(row.row_data)
        .map((rd) => attr(rd, 'value'))
        .find(Boolean);
    place(0, label);
  }
  return cells;
}

/**
 * Returns null when `parsed` does not look like a ReportRet, so callers can
 * fall back to other renderings.
 *
 * The XML→JSON conversion groups rows by element name, losing how text,
 * data, and subtotal rows interleaved in the original report; groups are
 * emitted in reading order (text, data, subtotal, total) as a best effort.
 */
export function flattenReportRet(parsed: unknown): FlatReportTable | null {
  const ret = findReportRet(parsed);
  if (!ret || ret.report_data === undefined) {
    return null;
  }
  const columns = buildColumns(ret);
  const reportData = asArray(ret.report_data).filter(isNode);

  const rows: string[][] = [];
  for (const data of reportData) {
    for (const key of ['text_row', 'data_row', 'subtotal_row', 'total_row']) {
      for (const row of asArray(data[key])) {
        rows.push(buildRow(row, columns.length));
      }
    }
  }

  return {
    title: textValue(ret.report_title),
    subtitle: textValue(ret.report_subtitle),
    basis: textValue(ret.report_basis),
    columns,
    rows,
  };
}
