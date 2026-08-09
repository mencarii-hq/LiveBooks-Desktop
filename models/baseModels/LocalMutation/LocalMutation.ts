import { Doc } from 'fyo/model/doc';

export class LocalMutation extends Doc {
  // The row's `schemaName` column (target schema of the mutation) collides
  // with the Doc base-class accessor, so it is intentionally not declared
  // here; outbox code reads rows via knex, not through Doc instances.
  docName?: string;
  operation?: string;
  payload?: string;
  deviceId?: string;
  bookId?: string;
  clientSeq?: number;
  mutationId?: string;
  syncStatus?: string;
  syncError?: string;
  createdAt?: string;
}
