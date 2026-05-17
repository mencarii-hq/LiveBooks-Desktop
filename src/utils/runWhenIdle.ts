/** Run work when the renderer is idle, with a timeout fallback. */
export function runWhenIdle(fn: () => void, timeoutMs = 5000): void {
  const run = () => {
    try {
      fn();
    } catch {
      /* caller logs if needed */
    }
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: timeoutMs });
  } else {
    setTimeout(run, 2000);
  }
}
