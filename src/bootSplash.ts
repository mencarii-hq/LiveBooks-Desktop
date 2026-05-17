const BOOT_SPLASH_ID = 'boot-splash';

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
