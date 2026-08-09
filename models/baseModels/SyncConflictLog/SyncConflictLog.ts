import { Doc } from 'fyo/model/doc';

export class SyncConflictLog extends Doc {
  // The row's `schemaName` column (target schema of the conflict) collides
  // with the Doc base-class accessor, so it is intentionally not declared
  // here; conflict-log code reads rows via knex, not through Doc instances.
  docName?: string;
  winnerDeviceId?: string;
  loserDeviceId?: string;
  winnerUpdatedAt?: string;
  loserUpdatedAt?: string;
  resolution?: string;
  loserPayload?: string;
}
