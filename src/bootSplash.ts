const BOOT_SPLASH_ID = 'boot-splash';

/** Wait for the next composited frame so route DOM is painted before splash removal. */
export async function waitForNextPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Hide the static boot splash after optional minimum visible time. */
export async function dismissBootSplash(
  minVisibleMs = 0,
  startedAt = Date.now()
): Promise<void> {
  const el = document.getElementById(BOOT_SPLASH_ID);
  if (!el) {
    return;
  }

  const elapsed = Date.now() - startedAt;
  if (elapsed < minVisibleMs) {
    await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
  }

  el.remove();
}
