/**
 * Background recovery sweep for `PlaidBatchApplyJournal` orphans.
 *
 * Triggered post-`fyo.db` connect (e.g. from `Desk.vue#mounted` via
 * `setTimeout(..., 2000)`) so the first paint of the desk shell is unblocked.
 * Never `await` from a Vue lifecycle hook — fire and forget; results are
 * surfaced via the existing apply-failure channel.
 */

import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import {
  ackImportBatch,
  reportPlaidApplyFailed,
} from 'src/utils/plaidBankFeedsApi';
import {
  applyPlaidBatch,
  deleteApplyJournal,
  inflightApplyPublicIds,
} from 'src/utils/plaidApply';

const MAX_RECOVERY_ATTEMPTS = 5;
const STALE_PURGE_DAYS = 30;

function swallowRecoveryError(): undefined {
  return undefined;
}

type JournalRow = {
  name: string;
  bookId?: string;
  itemId?: string;
  phase?: string;
  appliedCount?: number;
  excludedCount?: number;
  removedCount?: number;
  attemptCount?: number;
  updatedAt?: string | Date | null;
};

let recoveryRunning = false;

async function loadOrphans(): Promise<JournalRow[]> {
  return (await fyo.db.getAll(ModelNameEnum.PlaidBatchApplyJournal, {
    fields: [
      'name',
      'bookId',
      'itemId',
      'phase',
      'appliedCount',
      'excludedCount',
      'removedCount',
      'attemptCount',
      'updatedAt',
    ],
    orderBy: 'updatedAt',
    order: 'asc',
  })) as JournalRow[];
}

function ageDaysOf(value: string | Date | null | undefined): number {
  if (!value) {
    return Infinity;
  }
  const t = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(t)) {
    return Infinity;
  }
  return (Date.now() - t) / 86_400_000;
}

async function purgeStaleRows(rows: JournalRow[]): Promise<void> {
  for (const row of rows) {
    const attempts = Number(row.attemptCount ?? 0) || 0;
    if (
      row.phase === 'applying' &&
      attempts >= MAX_RECOVERY_ATTEMPTS &&
      ageDaysOf(row.updatedAt) >= STALE_PURGE_DAYS
    ) {
      await deleteApplyJournal(row.name).catch(swallowRecoveryError);
    }
  }
}

/**
 * Best-effort sweep over orphaned `PlaidBatchApplyJournal` rows. Safe to call
 * multiple times: a per-process guard prevents overlapping sweeps and the
 * apply path's `inflightPublicIds` mutex prevents collisions with the auto-apply
 * triggered by the Bank Feed poll loop.
 */
export async function runApplyJournalRecovery(): Promise<void> {
  if (recoveryRunning) {
    return;
  }
  recoveryRunning = true;
  try {
    const orphans = await loadOrphans().catch(() => [] as JournalRow[]);
    const inflight = inflightApplyPublicIds();

    for (const row of orphans) {
      if (!row.name || !row.bookId || !row.itemId) {
        await deleteApplyJournal(row.name).catch(swallowRecoveryError);
        continue;
      }
      if (inflight.has(row.name)) {
        // Auto-apply is already running this batch; skip.
        continue;
      }

      const attempts = Number(row.attemptCount ?? 0) || 0;
      if (attempts >= MAX_RECOVERY_ATTEMPTS) {
        await reportPlaidApplyFailed(row.bookId, row.name, {
          message: `Recovery gave up after ${attempts} attempts in phase ${
            row.phase ?? 'unknown'
          }`,
          code: 'apply_recovery_exhausted',
        }).catch(swallowRecoveryError);
        await deleteApplyJournal(row.name).catch(swallowRecoveryError);
        continue;
      }

      if (row.phase === 'ack_pending') {
        const r = await ackImportBatch(row.bookId, row.name, {
          applied_count: Number(row.appliedCount ?? 0) || 0,
          excluded_count: Number(row.excludedCount ?? 0) || 0,
        }).catch((e: unknown) => ({
          ok: false,
          error: (e as Error)?.message ?? 'ack failed',
        }));
        if (r.ok) {
          await deleteApplyJournal(row.name).catch(swallowRecoveryError);
        }
        continue;
      }

      // Phase is 'applying' (or anything unknown) — re-run end-to-end.
      // applyPlaidBatch will upsert the journal and bump attemptCount.
      try {
        await applyPlaidBatch(row.bookId, row.name, row.itemId);
      } catch {
        // Swallow; next sweep will pick it up unless attempts exhausted.
      }
    }

    await purgeStaleRows(orphans);
  } finally {
    recoveryRunning = false;
  }
}

/** Public for tests/debug. */
export function applyRecoveryConstants() {
  return { MAX_RECOVERY_ATTEMPTS, STALE_PURGE_DAYS };
}
