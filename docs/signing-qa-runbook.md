# Phase 1.6 — Code signing QA runbook (pre-GA manual)

Use this checklist before each GA-grade release. It implements the matrix in [`SECURITY.md`](../SECURITY.md). Record pass/fail, build numbers, and cert fingerprints in your release notes.

**Prerequisites**

- Staging Apple Developer ID + notarization credentials in CI (or local export matching `publish.yml`)
- Windows Authenticode cert (`WIN_CSC_LINK`) for staging
- A company file (`.books`) created on the build under test

---

## macOS / Windows — frozen identity guard

1. Temporarily change `productName` in `electron-builder-config.mjs` without updating `build/signingIdentity.mjs`.
2. Produce a packaged build and launch.

| Expected                                                                |
| ----------------------------------------------------------------------- |
| App exits before DB I/O (`assertFrozenSigningIdentityForPackagedBuild`) |

---

## CI / release engineering

### Missing signing secrets

1. Run the publish workflow with signing secrets removed from one job matrix entry.

| Expected                                                                         |
| -------------------------------------------------------------------------------- |
| Job fails at “Assert … signing identity secrets are present” before `yarn build` |

---

## Sign-off template

```
Release: ___________
Tester: ___________
Date: ___________

[ ] Frozen identity guard (macOS or Windows)
[ ] CI — missing secrets fail-fast

Notes:
```

---

## Token re-authentication spot-check (optional)

After installing a **signed staging** build over an **unsigned dev** build on the same machine (or after a code-signing cert rotation), confirm:

- The local `.books` file still opens without cloud key restore.
- LiveBooks Cloud sign-in is prompted if session tokens no longer decrypt from `safeStorage`.
