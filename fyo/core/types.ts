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
 * NOTE — Day-1 Phase 1.1 namespacing:
 *
 *   * `dbEncryptionKey_encrypted` is the LEGACY global slot. It is migrated
 *     into a per-account namespace on first cloud sign-in via
 *     +databaseKeyStore.migrateLegacyGlobalKeyIfPresent+ and is treated as
 *     read-only after that. New books MUST never write back to the global
 *     slot.
 *
 *   * Per-account / per-local-book SQLCipher hex keys live at
 *     +`dbEncryptionKey_${accountKey}_encrypted`+ where +accountKey+ is
 *     either the cloud user id (signed-in) or +`local_${uuid}`+ (offline
 *     book). These are dynamic keys — electron-store happily stores
 *     arbitrary string keys, so this type intentionally widens to allow
 *     them via index signature.
 *
 *   * +localBookKeyNamespaces+ maps a +dbPath+ to the +accountKey+ that owns
 *     its SQLCipher key (+local_{uuid}+ or cloud user id). Persists across
 *     cloud disconnect so +DB_CONNECT+ does not require a live JWT.
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
  /** Phase 1.1: dbPath -> local-only key namespace for unsigned-in users. */
  localBookKeyNamespaces?: LocalBookKeyNamespace[];
  /** Phase 1.1: per-account namespaced SQLCipher keys (dynamic). */
  [namespacedKey: `dbEncryptionKey_${string}_encrypted`]: string | undefined;
  /** Phase 2.6 — free-tier backup safety-net modal bookkeeping. */
  freeBackupSafetyNetDbOpenCount?: number;
  freeBackupSafetyNetLastShownAt?: string;
  miscLastBackupExportedAt?: string;
  /** Phase 2.3 — last successful cloud key escrow push (ISO timestamp). */
  livebooksCloudKeyEscrowedAt?: string;
  /** Phase 2.7 — last seen server subscription_changed_at (ISO timestamp). */
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
