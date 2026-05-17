import Bree from 'bree';
import path from 'path';

let bree: Bree;

/** POS loyalty program expiry — independent of legacy ERPNext sync (removed). */
export async function initLoyaltyExpiryJob() {
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
