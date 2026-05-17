import { Doc } from 'fyo/model/doc';

export class LocalMutation extends Doc {
  schemaName?: string;
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
