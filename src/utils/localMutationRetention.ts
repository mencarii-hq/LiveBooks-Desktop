import type { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { outboxRetentionCutoffIso } from 'utils/sync/localMutationOutbox';

/**
 * Remove stale LocalMutation rows when sync is disabled (no cloud consumer in v1).
 * Never deletes pending rows while sync is enabled.
 */
export async function pruneStaleLocalMutations(fyo: Fyo): Promise<number> {
  if (fyo.store.syncEnabled || !fyo.db.isConnected) {
    return 0;
  }

  const cutoff = outboxRetentionCutoffIso();
  const stale = (await fyo.db.getAllRaw(ModelNameEnum.LocalMutation, {
    fields: ['name', 'syncStatus', 'createdAt'],
  })) as { name: string; syncStatus?: string; createdAt?: string }[];

  let removed = 0;
  for (const row of stale) {
    const purge =
      row.syncStatus === 'synced' || (row.createdAt && row.createdAt < cutoff);
    if (!purge) {
      continue;
    }
    await fyo.db.delete(ModelNameEnum.LocalMutation, row.name);
    removed += 1;
  }
  return removed;
}
