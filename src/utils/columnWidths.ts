/**
 * Shared column-width persistence and grid helpers for resizable tables.
 * Widths are a device-level UI preference (localStorage), keyed by column id.
 */

export const MIN_COL_PX = 60;
export const MAX_COL_PX = 600;
export const FALLBACK_COL_GAP_PX = 16;

export function clampColWidth(w: number): number {
  return Math.min(MAX_COL_PX, Math.max(MIN_COL_PX, Math.round(w)));
}

/** Canonical key: `columnWidths:v1:<scope>` (e.g. list:Payment, table:SalesInvoiceItem). */
export function columnWidthsStorageKey(scope: string, version = 'v1'): string {
  return `columnWidths:${version}:${scope}`;
}

function widthsFromRecord(
  rec: Record<string, unknown>,
  columnIds: string[],
  minPx: number
): number[] | null {
  const widths: number[] = [];
  for (const id of columnIds) {
    const w = rec[id];
    if (!Number.isFinite(w) || (w as number) < minPx) {
      return null;
    }
    widths.push(clampColWidth(w as number));
  }
  return widths;
}

export function readColumnWidths(
  storageKey: string,
  columnIds: string[],
  options?: { legacyKey?: string; minPx?: number }
): number[] | null {
  if (!columnIds.length) {
    return null;
  }
  const minPx = options?.minPx ?? MIN_COL_PX;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return widthsFromRecord(
          parsed as Record<string, unknown>,
          columnIds,
          minPx
        );
      }
    }

    const legacyKey = options?.legacyKey;
    if (legacyKey) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) {
        const parsed = JSON.parse(legacy) as unknown;
        if (
          Array.isArray(parsed) &&
          parsed.length === columnIds.length &&
          parsed.every((w) => Number.isFinite(w) && w >= minPx)
        ) {
          const widths = parsed.map((w) => clampColWidth(w as number));
          try {
            writeColumnWidths(storageKey, columnIds, widths);
            localStorage.removeItem(legacyKey);
          } catch {
            /* migration is best-effort */
          }
          return widths;
        }
      }
    }
  } catch {
    /* ignore malformed storage */
  }
  return null;
}

export function writeColumnWidths(
  storageKey: string,
  columnIds: string[],
  widths: number[]
): void {
  const rec = Object.fromEntries(columnIds.map((id, i) => [id, widths[i]]));
  localStorage.setItem(storageKey, JSON.stringify(rec));
}

export function clearColumnWidths(
  storageKey: string,
  legacyKeys: string[] = []
): void {
  try {
    localStorage.removeItem(storageKey);
    for (const key of legacyKeys) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** CSS grid-template-columns from pixel widths; last track can absorb leftover. */
export function gridTemplateFromWidths(
  widths: number[],
  options?: { lastAbsorbs?: boolean }
): string {
  const lastAbsorbs = options?.lastAbsorbs !== false;
  return widths
    .map((w, i) =>
      lastAbsorbs && i === widths.length - 1 ? `minmax(${w}px, 1fr)` : `${w}px`
    )
    .join(' ');
}

export function minWidthPxFromColumns(
  widths: number[],
  gapPx: number,
  extraPx = 0
): number {
  return (
    widths.reduce((a, b) => a + b, 0) +
    gapPx * Math.max(0, widths.length - 1) +
    extraPx
  );
}

export function snapshotChildrenWidths(
  rowEl: HTMLElement | undefined | null,
  expectedCount: number
): number[] | null {
  const cells = rowEl?.children;
  if (!cells || cells.length !== expectedCount) {
    return null;
  }
  return Array.from(cells).map((c) =>
    clampColWidth((c as HTMLElement).getBoundingClientRect().width)
  );
}

export function measureRowGapPx(
  rowEl: HTMLElement | undefined | null,
  fallback = FALLBACK_COL_GAP_PX
): number {
  if (!rowEl) {
    return fallback;
  }
  const styles = getComputedStyle(rowEl);
  const gapRaw = styles.columnGap || styles.gap || '';
  const gapPx = Number.parseFloat(gapRaw);
  return Number.isFinite(gapPx) ? gapPx : fallback;
}

export type ColResizeState = {
  columnWidths: number[] | null;
  resizingCol: number;
  resizeStartX: number;
  resizeStartWidth: number;
  resizeMoved: boolean;
};

export function createColResizeState(): ColResizeState {
  return {
    columnWidths: null,
    resizingCol: -1,
    resizeStartX: 0,
    resizeStartWidth: 0,
    resizeMoved: false,
  };
}
