import { BrowserWindow } from 'electron';

/** Keep in sync with `src/utils/ui.ts` display zoom constants. */
export const DISPLAY_ZOOM_STEP = 0.05;
export const DISPLAY_ZOOM_MIN = 0.5;
export const DISPLAY_ZOOM_MAX = 2;

/** Snap to 5% increments and clamp to 50%–200%. */
function normalizeDisplayZoomFactor(factor: number): number {
  const stepped = Math.round(factor / DISPLAY_ZOOM_STEP) * DISPLAY_ZOOM_STEP;
  const clamped = Math.min(
    DISPLAY_ZOOM_MAX,
    Math.max(DISPLAY_ZOOM_MIN, stepped)
  );
  return Math.round(clamped * 100) / 100;
}

function focusedWebContents() {
  return BrowserWindow.getFocusedWindow()?.webContents ?? null;
}

export function zoomDisplayInMain(): void {
  const wc = focusedWebContents();
  if (!wc) {
    return;
  }
  wc.setZoomFactor(
    normalizeDisplayZoomFactor(wc.getZoomFactor() + DISPLAY_ZOOM_STEP)
  );
}

export function zoomDisplayOutMain(): void {
  const wc = focusedWebContents();
  if (!wc) {
    return;
  }
  wc.setZoomFactor(
    normalizeDisplayZoomFactor(wc.getZoomFactor() - DISPLAY_ZOOM_STEP)
  );
}

export function resetDisplayZoomMain(): void {
  const wc = focusedWebContents();
  if (!wc) {
    return;
  }
  wc.setZoomFactor(1);
}
