/**
 * Single background loop: ETag feed poll + detect new batches + auto-apply.
 * Started from Desk.vue alongside the apply-journal recovery sweep.
 */

import { fyo } from 'src/initFyo';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import { getLivebooksCloudSessionSummary } from 'src/utils/livebooksCloud';
import { fetchPlaidFeedsWithStepUp } from 'src/utils/plaidBankFeedsApi';
import type { PlaidFeedItemRow } from 'src/utils/plaidBankFeedsApi';
import {
  applyAllPendingForBook,
  inflightApplyPublicIds,
} from 'src/utils/plaidApply';
import {
  isBankSyncMfaPaused,
  setBankSyncMfaPaused,
} from 'src/utils/plaidBankSyncMfaGate';
import {
  clearPlaidSyncLastError,
  setPlaidSyncApplying,
  setPlaidSyncCatchUpBlocked,
  setPlaidSyncLastError,
  setPlaidSyncLastSyncAt,
  setPlaidSyncMfaPaused,
} from 'src/utils/plaidSyncStore';
import {
  ensureNotificationPermission,
  notifyNewBatches,
} from 'src/utils/desktopNotifications';

const PENDING_INTERVAL_MS = 30_000;
const IDLE_INTERVAL_MS = 90_000;
const INITIAL_DELAY_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let tickRunning = false;
let feedsEtag = '';
let consecutiveFailures = 0;
let lastPendingByItem: Record<string, number> = {};
let notificationPermissionRequested = false;
let lastFeedItems: PlaidFeedItemRow[] = [];

function pollIntervalMs(items: PlaidFeedItemRow[]): number {
  const anyPending = items.some(
    (i) =>
      (i.pending_import_batches_count ?? 0) > 0 || i.sync_suggested === true
  );
  return anyPending ? PENDING_INTERVAL_MS : IDLE_INTERVAL_MS;
}

function nextIntervalMs(items: PlaidFeedItemRow[]): number {
  const base = pollIntervalMs(items);
  if (consecutiveFailures === 0) {
    return base;
  }
  const mult = Math.min(2 ** consecutiveFailures, 8);
  return Math.min(base * mult, MAX_BACKOFF_MS);
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNext(ms: number): void {
  clearTimer();
  timer = setTimeout(() => {
    void tick();
  }, ms);
}

function syncMfaPausedToStore(): void {
  const paused = isBankSyncMfaPaused();
  setPlaidSyncMfaPaused(paused);
}

function detectAndNotifyNewBatches(items: PlaidFeedItemRow[]): void {
  const next: Record<string, number> = {};
  let anyGrew = false;
  const grew: Array<{ item: PlaidFeedItemRow; delta: number }> = [];
  for (const it of items) {
    const cur = it.pending_import_batches_count ?? 0;
    next[it.item_id] = cur;
    const prev = lastPendingByItem[it.item_id];
    if (prev !== undefined && cur > prev) {
      anyGrew = true;
      grew.push({ item: it, delta: cur - prev });
    }
  }
  if (Object.keys(lastPendingByItem).length === 0) {
    lastPendingByItem = next;
    return;
  }
  lastPendingByItem = next;

  if (!anyGrew) {
    return;
  }
  if (!notificationPermissionRequested) {
    notificationPermissionRequested = true;
    void ensureNotificationPermission();
  }
  for (const { item, delta } of grew) {
    notifyNewBatches({
      itemId: item.item_id,
      totalBatchesAdded: delta,
      institutionName: item.institution_name,
    });
  }
}

function anyPendingBatches(items: PlaidFeedItemRow[]): boolean {
  return items.some(
    (i) =>
      (i.pending_import_batches_count ?? 0) > 0 || i.sync_suggested === true
  );
}

async function tick(): Promise<void> {
  if (tickRunning) {
    scheduleNext(PENDING_INTERVAL_MS);
    return;
  }
  if (document.hidden) {
    scheduleNext(IDLE_INTERVAL_MS);
    return;
  }

  const { signedIn } = await getLivebooksCloudSessionSummary();
  if (!signedIn) {
    setBankSyncMfaPaused(false);
    setPlaidSyncMfaPaused(false);
    consecutiveFailures = 0;
    clearPlaidSyncLastError();
    scheduleNext(IDLE_INTERVAL_MS);
    return;
  }

  syncMfaPausedToStore();
  if (isBankSyncMfaPaused()) {
    scheduleNext(IDLE_INTERVAL_MS);
    return;
  }

  tickRunning = true;
  let rescheduleMs = IDLE_INTERVAL_MS;

  try {
    const ctx = await ensureLivebooksCloudBookId(fyo);
    if (!ctx.ok) {
      consecutiveFailures = 0;
      clearPlaidSyncLastError();
      rescheduleMs = IDLE_INTERVAL_MS;
      return;
    }

    const bookId = ctx.bookId;
    const feedRes = await fetchPlaidFeedsWithStepUp(bookId, {
      ifNoneMatch: feedsEtag || undefined,
      promptTotp: null,
    });

    if (feedRes.error) {
      consecutiveFailures += 1;
      setPlaidSyncLastError(feedRes.error);
      if (isBankSyncMfaPaused()) {
        setPlaidSyncMfaPaused(true);
      }
      rescheduleMs = nextIntervalMs(lastFeedItems);
      return;
    }

    consecutiveFailures = 0;
    clearPlaidSyncLastError();
    setPlaidSyncLastSyncAt(new Date().toISOString());

    if (feedRes.notModified) {
      rescheduleMs = nextIntervalMs(lastFeedItems);
      if (anyPendingBatches(lastFeedItems)) {
        await runApplyIfNeeded(bookId, lastFeedItems);
      }
      return;
    }

    if (feedRes.payload) {
      const items = feedRes.payload.items ?? [];
      detectAndNotifyNewBatches(items);
      lastFeedItems = items;
      if (feedRes.etag) {
        feedsEtag = feedRes.etag;
      }
      rescheduleMs = nextIntervalMs(items);

      if (anyPendingBatches(items)) {
        await runApplyIfNeeded(bookId, items);
      }
    }
  } catch (e) {
    consecutiveFailures += 1;
    setPlaidSyncLastError((e as Error).message || 'Background sync failed.');
    rescheduleMs = nextIntervalMs(lastFeedItems);
  } finally {
    tickRunning = false;
    scheduleNext(rescheduleMs);
  }
}

async function runApplyIfNeeded(
  bookId: string,
  items: PlaidFeedItemRow[]
): Promise<void> {
  if (!anyPendingBatches(items)) {
    return;
  }
  const inflight = inflightApplyPublicIds();
  if (inflight.size > 0) {
    return;
  }

  setPlaidSyncApplying(true);
  setPlaidSyncCatchUpBlocked(null);
  try {
    const summary = await applyAllPendingForBook(bookId, {
      background: true,
      promptTotp: null,
    });
    if (summary.mfaPaused) {
      setBankSyncMfaPaused(true);
      setPlaidSyncMfaPaused(true);
    }
    if (summary.catchUpBlocked) {
      setPlaidSyncCatchUpBlocked(summary.catchUpBlocked);
    }
    if (summary.error) {
      setPlaidSyncLastError(summary.error);
    }
  } finally {
    setPlaidSyncApplying(false);
  }
}

/** Start the background Plaid feed poll + auto-apply loop. */
export function startPlaidBackgroundSync(): void {
  if (timer) {
    return;
  }
  scheduleNext(INITIAL_DELAY_MS);
}

/** Stop the background loop (e.g. when leaving Desk). */
export function stopPlaidBackgroundSync(): void {
  clearTimer();
  tickRunning = false;
}

/** After MFA step-up from the global banner, nudge an immediate tick. */
export function notifyPlaidBackgroundMfaVerified(): void {
  if (!timer) {
    return;
  }
  clearTimer();
  scheduleNext(0);
}

/** One-shot feed refresh; coalesces with an in-flight tick. */
export function refreshFeedsNow(): void {
  notifyPlaidBackgroundMfaVerified();
}
