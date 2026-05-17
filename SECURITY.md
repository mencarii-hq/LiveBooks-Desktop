# Security Policy

Automated checks: [`docs/verification-matrix.md`](docs/verification-matrix.md) · `yarn test:day1`

## Supported versions

Security fixes are applied to the current **LiveBooks Desktop** release line published on [GitHub Releases](https://github.com/Mencarii/LiveBooks-Desktop/releases). Older builds are not supported unless we state otherwise in a release note.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report sensitive issues by email to **[ben.cheng@mencarii.com](mailto:ben.cheng@mencarii.com)** with:

- A clear description of the issue and impact
- Steps to reproduce (version, OS, and minimal scenario if possible)
- Any proof-of-concept you are comfortable sharing

We aim to acknowledge reports within a few business days. We will work with you on remediation and coordinated disclosure when appropriate.

## What to include (and avoid)

- **Do** describe the component (Desktop app, LiveBooks Cloud API, etc.) and affected feature.
- **Do not** include live API keys, Plaid/Stripe secrets, JWTs, database encryption keys, OTP seeds, or customer ledger exports in reports or public issues.

## Threat model and architecture

LiveBooks is **local-first**. Customer ledgers live in an encrypted SQLite file on the user's machine; cloud sync is opt-in and additive. The security boundaries below match the implementation in this repository and `livebooks-cloud`.

### Local ledger encryption (desktop)

- Each book is stored in a [SQLCipher](https://www.zetetic.net/sqlcipher/)-encrypted SQLite file under the user's documents folder, with the canonical "target" cipher profile (`cipher='sqlcipher'`, `legacy=4`, raw 256-bit `hexkey`) defined in [`backend/database/cipherProfile.ts`](backend/database/cipherProfile.ts).
- The 64-hex SQLCipher key never lives in `electron-store` as plaintext. It is wrapped via Electron's [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage) (macOS Keychain / Windows DPAPI) and stored under a **per-account namespace** at `dbEncryptionKey_${accountKey}_encrypted`, where `accountKey` is the LiveBooks Cloud user id when signed in or `local_${uuid}` for offline books.
- The connect path is **read-only** with respect to keys: a decrypt failure surfaces `KEYCHAIN_CORRUPTED` and routes the user to recovery. There is no `getOrCreate`-style fallback. Mint-a-new-key is reachable only at `DB_CREATE`.
- Backups (in `livebooks_backups/`) are verified with `probeDatabaseCipherMode` immediately after creation. An unverifiable backup is deleted; we will not retain a possibly-plaintext copy of a customer ledger on disk.

### Renderer ↔ main IPC

- The renderer cannot read or write SQLCipher keys. All key-handling code lives in [`utils/databaseKeyStore.ts`](utils/databaseKeyStore.ts) and runs only in the Electron main process.
- The renderer has a single generic cloud bridge (`LIVEBOOKS_CLOUD_API`) for unauthenticated read APIs. Sensitive paths are explicitly **denylisted** in [`main/registerIpcMainActionListeners.ts`](main/registerIpcMainActionListeners.ts):
  - `/api/v1/me/escrow_key_*`
  - `/api/v1/me/recovery_grants/*`
  - `/api/v1/me/mfa/*`
- Recovery uses a dedicated main-process channel `RECOVERY_SUBMIT_AND_REKEY`. The renderer sends cloud credentials and a TOTP code; the main process calls `escrow_key_retrieval`, persists the recovered key under the OS keychain, wipes its in-memory `Buffer`, and reconnects the database. **Raw key material never crosses the IPC boundary.**

### Cloud session tokens

- LiveBooks Cloud issues **short-lived access JWTs** (~15 minutes) and **refresh tokens** (default **30 days**, configurable via `jwt.refresh_ttl_days` on the server). Refresh rotation revokes the presented row; reuse of a revoked refresh revokes all active refresh rows for that user.
- Refresh and access tokens are stored encrypted via `safeStorage` under `livebooksCloud{Access,Refresh}Token_encrypted`. See [`utils/secureTokenStore.ts`](utils/secureTokenStore.ts).
- When `safeStorage` is **unavailable** (e.g. Linux without a configured Secret Service):
  - **Packaged builds** refuse to write tokens in plaintext. The user re-authenticates each launch.
  - **Dev/unpackaged builds** allow plaintext fallback so contributors aren't blocked.
- Settings surfaces a "Secure storage unavailable" badge whenever the store is degraded.

### HTTPS enforcement

- `getLivebooksCloudOriginMain()` rejects any non-`https://` origin when `app.isPackaged === true`. A misconfigured production build will fail loudly rather than leak Bearer tokens or recovery payloads in the clear.

### Code signing and OS keychain identity

`safeStorage` entries are scoped to the app's bundle id and code-signing identity (macOS Keychain / Windows DPAPI). A change in either (e.g. installing a signed build over an unsigned dev build, or after an Apple Developer ID or Authenticode certificate rolls) is **indistinguishable from a corrupted keychain at decrypt time**. We surface this as `KEYCHAIN_CORRUPTED`, route to Recovery Mode, and never silently re-key.

#### Frozen identity contract

The bundle id and product name are the single source of truth in [`build/signingIdentity.mjs`](build/signingIdentity.mjs):

| Field                                        | Frozen value                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| macOS `CFBundleIdentifier` / Windows `appId` | `io.livebooks.desktop`                                                                      |
| `productName`                                | `LiveBooks Desktop`                                                                         |
| macOS notarization team id                   | provided via the `APPLE_TEAM_ID` CI secret; pinned to the LiveBooks Apple Developer account |
| Windows Authenticode certificate             | provided via the `WIN_CSC_LINK` CI secret                                                   |

`electron-builder-config.mjs` imports the constants directly and the main process mirrors them in [`main/frozenSigningIdentity.ts`](main/frozenSigningIdentity.ts). [`main/tests/testFrozenSigningIdentity.spec.ts`](main/tests/testFrozenSigningIdentity.spec.ts) enforces that the two copies never drift. Packaged builds boot through `assertFrozenSigningIdentityForPackagedBuild()`, which throws (and the app exits) if a binary somehow shipped with a different `productName` or macOS bundle id than the frozen contract.

The publish workflow ([`.github/workflows/publish.yml`](.github/workflows/publish.yml)) fails fast if any of `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, `CSC_KEY_PASSWORD` (macOS) or `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows) are missing — an unsigned official build with the frozen `productName`/`appId` would invalidate every shipped user's keychain slot.

#### QA matrix (run before each GA-grade release)

Step-by-step runbook: [`docs/signing-qa-runbook.md`](docs/signing-qa-runbook.md).

Each scenario must reach a recoverable state — never a silent re-key.

| Platform | Scenario                                                                                                                            | Expected behavior                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| macOS    | Unsigned dev build creates a DB → install signed staging build over it on the same machine                                          | Boot → `safeStorage.decryptString` fails → `KEYCHAIN_CORRUPTED` → Recovery Mode → cloud key restored → DB reopens |
| macOS    | Cert renewal: notarize with old Apple Developer ID cert → publish next release notarized with renewed cert from the same team id    | Recovery Mode reached on first launch of the renewed build; same restore loop succeeds                            |
| macOS    | Boot a packaged build whose `productName` was changed in `electron-builder-config.mjs` without updating `build/signingIdentity.mjs` | `assertFrozenSigningIdentityForPackagedBuild()` throws and the app exits before any keystore code runs            |
| Windows  | Unsigned dev build creates a DB → install Authenticode-signed staging build over it on the same machine                             | DPAPI decrypt fails → `KEYCHAIN_CORRUPTED` → Recovery Mode → cloud restore → DB reopens                           |
| Windows  | Authenticode cert renewal: ship a build signed with the renewed cert from the same publisher subject                                | Document whether DPAPI entries survived rotation in the release notes; reach Recovery Mode if they did not        |
| any      | Publish workflow run without the macOS or Windows signing secrets                                                                   | Fails at the "Assert … signing identity secrets are present" step before any `yarn build` runs                    |

#### Support copy

The Recovery Mode screen and any support reply must distinguish a **security-context change** from a **wrong password**:

- The recovery form collects the user's **LiveBooks Cloud** credentials, not a database password. The local SQLCipher key is restored by the main process after the cloud auth succeeds.
- An `invalid_credentials` response means the user mistyped their cloud email or password — the local database file itself is unaffected.
- A keychain / signing-identity change is shown in Recovery Mode as **"Sign in to unlock your books"** (see [`src/pages/RecoveryMode.vue`](src/pages/RecoveryMode.vue)). Technical triggers (OS migration, dev-to-signed build, renewed code-signing certificate) live under a collapsible **"Why am I seeing this?"** for users and support.
- Support replies must never instruct the user to retype "their database password". There is no such password — there is only the OS keychain entry and the cloud-escrowed recovery key.

### Cloud key escrow (Pro)

LiveBooks Cloud offers an opt-in **encrypted backup** of the SQLCipher key for users on a paid plan. The backup is **not** zero-knowledge: the cloud holds an envelope-encrypted copy under a server-side `LOCKBOX_MASTER_KEY` (Lockbox). On retrieval, the server decrypts the envelope and returns the plaintext key over TLS to the authenticated desktop client.

We do not market the escrow flow as zero-knowledge. The trust boundary is "you trust the cloud operator" + "MFA-gated retrieval" + "audit mail on every retrieval".

Day-1 retrieval requires:

- Valid Bearer (cloud session) **or** email + password when no session (recovery only)
- Pro subscription entitlement (`RequiresProSubscription`)
- TOTP step-up (Phase 1b — greenfield)
- Step-up Rack::Attack throttle on `/api/v1/me/escrow_key_retrieval` per IP and per JWT subject

Every retrieval generates an `EscrowKeyRetrieval` audit row and triggers an `EscrowNotificationMailer` email after commit.

#### Escrow breach response

If `LOCKBOX_MASTER_KEY` is compromised, every escrowed key is potentially exposed. Response procedure:

1. Treat all escrowed `encrypted_desktop_key` rows as compromised.
2. Rotate `LOCKBOX_MASTER_KEY` and re-encrypt all rows under the new key.
3. Notify affected users by email and force-trigger desktop re-key on next sign-in.
4. Optionally rotate every desktop SQLCipher key as a belt-and-suspenders measure (this requires a `hexrekey` migration on each book; see `upgradeUnlockedDatabaseToTargetProfile` in [`backend/database/cipherProfile.ts`](backend/database/cipherProfile.ts)).

### Logging hygiene

`config/initializers/filter_parameter_logging.rb` (cloud) filters: passwords, emails, secrets, tokens, OTP codes/seeds, recovery grants, and `encryption_key` / `encrypted_desktop_key` payloads. The desktop main-process IPC handlers never log request bodies for the cloud bridge.

## Out of scope

- Malware running with the user's privileges on the host machine.
- Recovery from a signed-build install over an unsigned dev DB **without** the cloud escrow opt-in (a Pro-only safety net).
- Linux distributions without a `safeStorage`-capable secret backend (we ship in a degraded mode there; see above).
- Full zero-knowledge key escrow (deliberately not the design — see "Cloud key escrow" above).

## Public commitments

We will not:

- Persist SQLCipher keys, refresh tokens, or OTP codes in `electron-store` plaintext in packaged builds.
- Allow the renderer to call escrow / MFA / recovery cloud paths directly.
- Silently re-key an encrypted database when the OS keychain rolls.

## LiveBooks Cloud

For vulnerabilities in the hosted API (`livebooks-cloud`), use the same contact email and note that the report targets the **cloud** service.

## Safe harbor

We appreciate responsible disclosure and will not pursue legal action against researchers who act in good faith, avoid privacy violations, and give us reasonable time to fix confirmed issues before public disclosure.
