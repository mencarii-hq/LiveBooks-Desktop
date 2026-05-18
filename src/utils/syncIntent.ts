import type { Fyo } from 'fyo';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import { getLivebooksSubscriptionSnapshot } from 'src/utils/livebooksCloudSubscription';

/** Align `fyo.store.syncEnabled` with Pro entitlement and cloud book linkage. */
export async function refreshSyncIntent(fyo: Fyo): Promise<void> {
  const { proEntitled } = getLivebooksSubscriptionSnapshot();
  if (!proEntitled) {
    fyo.store.syncEnabled = false;
    return;
  }

  const book = await ensureLivebooksCloudBookId(fyo);
  fyo.store.syncEnabled = book.ok;
}
