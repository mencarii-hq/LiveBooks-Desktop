import Bree from 'bree';
import path from 'path';

let bree: Bree;

/**
 * Packaged builds never shipped `Contents/jobs` or ts-node; Bree threw on every
 * open and lit up desktop_error telemetry. Flip to true only after a
 * production-safe job path exists.
 */
const LOYALTY_EXPIRY_SCHEDULER_ENABLED = false;

/** POS loyalty program expiry — independent of legacy ERPNext sync (removed). */
export async function initLoyaltyExpiryJob() {
  if (!LOYALTY_EXPIRY_SCHEDULER_ENABLED) {
    return;
  }

  const jobsRoot = path.join(__dirname, '..', '..', 'jobs');

  if (bree) {
    await bree.stop();
  }

  bree = new Bree({
    root: jobsRoot,
    defaultExtension: 'ts',
    jobs: [
      {
        name: 'checkLoyaltyProgramExpiry',
        interval: '24 hours',
        worker: {
          workerData: {
            useTsNode: true,
          },
        },
      },
    ],
    worker: {
      argv: ['--require', 'ts-node/register'],
    },
  });

  await bree.start();
}
