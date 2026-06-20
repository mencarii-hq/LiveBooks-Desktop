import type { Doc } from 'fyo/model/doc';
import type { Money } from 'pesa';
import type { RawValue } from 'schemas/types';
import type { AuthDemuxBase } from 'utils/auth/types';
import type { DatabaseDemuxBase } from 'utils/db/types';

export type Attachment = { name: string; type: string; data: string };
export type DocValue =
  | string
  | number
  | boolean
  | Date
  | Money
  | null
  | Attachment
  | undefined;
export type DocValueMap = Record<string, DocValue | Doc[] | DocValueMap[]>;
export type RawValueMap = Record<string, RawValue | RawValueMap[]>;

/**
 * DatabaseDemuxConstructor: type for a constructor that returns a DatabaseDemuxBase
 * it's typed this way because `typeof AbstractClass` is invalid as abstract classes
 * can't be initialized using `new`.
 *
 * AuthDemuxConstructor: same as the above but for AuthDemuxBase
 */

export type DatabaseDemuxConstructor = new (
  isElectron?: boolean
) => DatabaseDemuxBase;

export type AuthDemuxConstructor = new (isElectron?: boolean) => AuthDemuxBase;

/**
 * Legacy electron-store keys from the pre-MVP encrypted-ledger era.
 * Plaintext-ledger MVP does not read SQLCipher slots; fields may remain on
 * disk from older installs and are ignored.
 */
export type LocalBookKeyNamespace = {
  dbPath: string;
  /** Cloud user id or +local_{uuid}+; legacy rows use +localNamespaceId+. */
  accountKey?: string;
  /** @deprecated use accountKey */
  localNamespaceId?: string;
  createdAt: string;
};

export type ConfigMap = {
  files: ConfigFile[];
  lastSelectedFilePath: null | string;
  language: string;
  deviceId: string;
  /** LiveBooks Cloud API (Bearer); set by main after desktop link exchange */
  livebooksCloudAccessToken?: string;
  livebooksCloudRefreshToken?: string;
  /** Encrypted variants stored as base64 when safeStorage is available */
  livebooksCloudAccessToken_encrypted?: string;
  livebooksCloudRefreshToken_encrypted?: string;
  /** Legacy global SQLCipher key slot — migrated on first sign-in. */
  dbEncryptionKey_encrypted?: string;
  /** dbPath -> local-only key namespace for unsigned-in users. */
  localBookKeyNamespaces?: LocalBookKeyNamespace[];
  /** per-account namespaced SQLCipher keys (dynamic). */
  [namespacedKey: `dbEncryptionKey_${string}_encrypted`]: string | undefined;
  /** free-tier backup safety-net modal bookkeeping. */
  freeBackupSafetyNetDbOpenCount?: number;
  freeBackupSafetyNetLastShownAt?: string;
  miscLastBackupExportedAt?: string;
  /** @deprecated legacy escrow timestamp; ignored in plaintext-ledger MVP */
  livebooksCloudKeyEscrowedAt?: string;
  /** last seen server subscription_changed_at (ISO timestamp). */
  livebooksCloudSubscriptionChangedAt?: string | null;
};

export interface ConfigFile {
  id: string;
  companyName: string;
  dbPath: string;
  openCount: number;
}

export interface FyoConfig {
  DatabaseDemux?: DatabaseDemuxConstructor;
  AuthDemux?: AuthDemuxConstructor;
  isElectron?: boolean;
  isTest?: boolean;
}
