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
- **Do not** include live API keys, Plaid/Stripe secrets, JWTs, or customer ledger exports in reports or public issues.

## Threat model and architecture

LiveBooks is **local-first**. Customer ledgers live in a **plaintext SQLite file** on the user's machine; cloud sync is opt-in and additive. The security boundaries below match the MVP implementation in this repository and `livebooks-cloud`.

### Local ledger (desktop)

- Each book is stored as a standard SQLite file (`.books`) under the user's documents folder. The app does **not** apply SQLCipher or hold a per-book encryption key in the MVP.
- **At-rest protection** relies on the host OS: enable **FileVault** (macOS), **BitLocker** (Windows), or equivalent full-disk encryption (FDE) on Linux. Anyone with filesystem access while the disk is unlocked can read the ledger file.
- Backups (in `livebooks_backups/`) are file copies of the live database. Export backups to media you control; LiveBooks does not cloud-host a full ledger copy.
- There is **no** cloud key escrow, Recovery Mode, or OS-keychain slot for database keys in the MVP.

### Renderer ↔ main IPC

- Sensitive cloud paths are explicitly **denylisted** so the renderer cannot invoke MFA setup/confirm via `LIVEBOOKS_CLOUD_API` (see [`utils/cloudApiDenylist.ts`](utils/cloudApiDenylist.ts): `/api/v1/me/mfa/`).
- MFA enrollment and step-up remain **main-process or web** flows; the renderer never receives raw TOTP seeds or Plaid tokens.

### Cloud session tokens

- LiveBooks Cloud issues **short-lived access JWTs** (~15 minutes) and **refresh tokens** (default **30 days**, configurable via `jwt.refresh_ttl_days` on the server). Refresh rotation revokes the presented row; reuse of a revoked refresh revokes all active refresh rows for that user.
- Refresh and access tokens are stored encrypted via Electron [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage) (macOS Keychain / Windows DPAPI) under `livebooksCloud{Access,Refresh}Token_encrypted`. See [`utils/secureTokenStore.ts`](utils/secureTokenStore.ts).
- When `safeStorage` is **unavailable** (e.g. Linux without a configured Secret Service):
  - **Packaged builds** refuse to write tokens in plaintext. The user re-authenticates each launch.
  - **Dev/unpackaged builds** allow plaintext fallback so contributors aren't blocked.
- Settings surfaces a "Secure storage unavailable" badge whenever the store is degraded.

### Plaid and MFA (Pro)

- Bank feed credentials and Plaid access tokens live only on **LiveBooks Cloud**, encrypted at rest (Lockbox / Active Record encryption). The desktop never stores Plaid secrets.
- Linking banks and other sensitive cloud actions require **LiveBooks Pro** and **TOTP MFA** on the cloud account. This protects cloud-held Plaid tokens and subscription state — not a local SQLCipher key (there isn't one in the MVP).

### HTTPS enforcement

- `getLivebooksCloudOriginMain()` rejects any non-`https://` origin when `app.isPackaged === true`. A misconfigured production build will fail loudly rather than leak Bearer tokens in the clear.

### Code signing and token keychain identity

`safeStorage` entries for cloud session tokens are scoped to the app's bundle id and code-signing identity (macOS Keychain / Windows DPAPI). A change in either (e.g. installing a signed build over an unsigned dev build, or after a certificate rolls) can invalidate prior token slots. The user **re-authenticates** to LiveBooks Cloud; there is no database Recovery Mode in the MVP.

#### Frozen identity contract

The bundle id and product name are the single source of truth in [`build/signingIdentity.mjs`](build/signingIdentity.mjs):

| Field                                        | Frozen value                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| macOS `CFBundleIdentifier` / Windows `appId` | `io.livebooks.desktop`                                                                      |
| `productName`                                | `LiveBooks Desktop`                                                                         |
| macOS notarization team id                   | provided via the `APPLE_TEAM_ID` CI secret; pinned to the LiveBooks Apple Developer account |
| Windows Authenticode certificate             | provided via the `WIN_CSC_LINK` CI secret                                                   |

`electron-builder-config.mjs` imports the constants directly and the main process mirrors them in [`main/frozenSigningIdentity.ts`](main/frozenSigningIdentity.ts). [`main/tests/testFrozenSigningIdentity.spec.ts`](main/tests/testFrozenSigningIdentity.spec.ts) enforces that the two copies never drift. Packaged builds boot through `assertFrozenSigningIdentityForPackagedBuild()`, which throws (and the app exits) if a binary somehow shipped with a different `productName` or macOS bundle id than the frozen contract.

The publish workflow ([`.github/workflows/publish.yml`](.github/workflows/publish.yml)) fails fast if signing secrets are missing — an unsigned official build with the frozen `productName`/`appId` would invalidate shipped users' token keychain slots.

#### QA matrix (run before each GA-grade release)

Step-by-step runbook: [`docs/signing-qa-runbook.md`](docs/signing-qa-runbook.md).

| Platform | Scenario                                                                                                                            | Expected behavior                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| macOS    | Boot a packaged build whose `productName` was changed in `electron-builder-config.mjs` without updating `build/signingIdentity.mjs` | `assertFrozenSigningIdentityForPackagedBuild()` throws and the app exits before DB I/O    |
| any      | Publish workflow run without the macOS or Windows signing secrets                                                                   | Fails at the "Assert … signing identity secrets are present" step before `yarn build`     |
| any      | Signed build after OS reinstall or signing-identity change                                                                          | User signs in again to LiveBooks Cloud; local ledger file opens without cloud key restore |

### Logging hygiene

`config/initializers/filter_parameter_logging.rb` (cloud) filters: passwords, emails, secrets, tokens, and OTP codes/seeds. The desktop main-process IPC handlers never log request bodies for the cloud bridge.

## Re-entry trigger for ledger encryption (future)

We may reintroduce **SQLCipher at-rest encryption** for company files when **all** of the following are true:

1. A stable per-account key lifecycle is shipped (main-process only, no silent re-key on open).
2. Cloud escrow / MFA retrieval is restored and audited on `livebooks-cloud`, or an explicit offline-only recovery story is documented.
3. Migration from plaintext `.books` files is tested on real customer copies (backup → migrate → verify reports).
4. Support and [`SECURITY.md`](SECURITY.md) are updated before the feature flag is enabled in production builds.

Until then, treat **OS FDE + user-controlled backups** as the supported at-rest control for local ledgers.

## Out of scope (MVP)

- Malware running with the user's privileges on the host machine.
- Protection against physical access to an unlocked, unencrypted disk.
- Linux distributions without a `safeStorage`-capable secret backend (degraded token storage; see above).
- Zero-knowledge cloud backup of ledger contents (we do not store the full ledger in the cloud).

## Public commitments

We will not:

- Persist cloud refresh tokens or OTP codes in `electron-store` plaintext in packaged builds.
- Allow the renderer to call MFA setup/confirm cloud paths directly via `LIVEBOOKS_CLOUD_API`.
- Market the MVP as SQLCipher-encrypted at the application layer.

## LiveBooks Cloud

For vulnerabilities in the hosted API (`livebooks-cloud`), use the same contact email and note that the report targets the **cloud** service.

## Safe harbor

We appreciate responsible disclosure and will not pursue legal action against researchers who act in good faith, avoid privacy violations, and give us reasonable time to fix confirmed issues before public disclosure.
