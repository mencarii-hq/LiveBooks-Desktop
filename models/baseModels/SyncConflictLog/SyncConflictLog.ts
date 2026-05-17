import { Doc } from 'fyo/model/doc';

export class SyncConflictLog extends Doc {
  schemaName?: string;
  docName?: string;
  winnerDeviceId?: string;
  loserDeviceId?: string;
  winnerUpdatedAt?: string;
  loserUpdatedAt?: string;
  resolution?: string;
  loserPayload?: string;
}
