/**
 * free-tier backup safety-net modal gating.
 */

const REMINDER_INTERVAL = 30;

export function recordDatabaseOpenForBackupReminder(): number {
  const prev = ipc.store.get('freeBackupSafetyNetDbOpenCount') ?? 0;
  const next = prev + 1;
  ipc.store.set('freeBackupSafetyNetDbOpenCount', next);
  return next;
}

export function shouldShowFreeBackupSafetyNet(openCount: number): boolean {
  const exportedAt = ipc.store.get('miscLastBackupExportedAt');
  if (typeof exportedAt === 'string' && exportedAt.length > 0) {
    return false;
  }
  return openCount === 1 || openCount % REMINDER_INTERVAL === 0;
}
