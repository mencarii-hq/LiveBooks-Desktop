/** Shared width for all right-side drawers (quick edit, linked entries, bank feed, etc.). */

export const SIDE_DRAWER_WIDTH_STORAGE_KEY = 'livebooks-side-drawer-width-px';
/** @deprecated migrated on read */
const LEGACY_KEYS = [
  'livebooks-quickedit-width-px',
  'livebooks-drawer-width-px',
] as const;

export const SIDE_DRAWER_MIN_PX = 280;
export const SIDE_DRAWER_MAX_PX = 720;
export const SIDE_DRAWER_DEFAULT_PX = 352; // 22rem @ 16px

export function clampSideDrawerPx(
  n: number,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
): number {
  let px = Math.min(SIDE_DRAWER_MAX_PX, Math.max(SIDE_DRAWER_MIN_PX, n));
  if (viewportWidth > 0) {
    const maxForWindow = Math.max(
      SIDE_DRAWER_MIN_PX,
      Math.min(SIDE_DRAWER_MAX_PX, viewportWidth * 0.55)
    );
    px = Math.min(maxForWindow, Math.max(SIDE_DRAWER_MIN_PX, px));
  }
  return Math.round(px);
}

export function loadSideDrawerWidthPx(): number {
  try {
    const raw = localStorage.getItem(SIDE_DRAWER_WIDTH_STORAGE_KEY);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampSideDrawerPx(n, 0);
    }
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy == null) continue;
      const n = Number(legacy);
      if (!Number.isFinite(n)) continue;
      const px = clampSideDrawerPx(n, 0);
      persistSideDrawerWidthPx(px);
      return px;
    }
  } catch {
    /* ignore */
  }
  return SIDE_DRAWER_DEFAULT_PX;
}

export function persistSideDrawerWidthPx(px: number): void {
  try {
    localStorage.setItem(SIDE_DRAWER_WIDTH_STORAGE_KEY, String(px));
    for (const key of LEGACY_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** Sets `--w-quick-edit` and returns the clamped live width. */
export function syncSideDrawerCssVar(preferredPx: number): number {
  const live = clampSideDrawerPx(preferredPx);
  document.documentElement.style.setProperty('--w-quick-edit', `${live}px`);
  return live;
}
