#!/usr/bin/env bash
# Automated security and sync verification slice.
# Manual signing QA: docs/signing-qa-runbook.md

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export IS_TEST=true

DAY1_DESKTOP_SPECS=(
  ./utils/tests/testCloudApiDenylist.spec.ts
  ./utils/tests/testLivebooksCloudOrigin.spec.ts
  ./utils/tests/testLivebooksCloudSubscriptionRevision.spec.ts
  ./utils/crypto/tests/testAssertHexDatabaseKey.spec.ts
  ./main/tests/testFrozenSigningIdentity.spec.ts
  ./backend/database/tests/testCipherProfile.spec.ts
  ./utils/ids/tests/testIds.spec.ts
  ./utils/sync/tests/testLocalMutationOutbox.spec.ts
  ./utils/sync/tests/testSyncDeviceGuard.spec.ts
  ./utils/sync/tests/testLwwConflict.spec.ts
  ./utils/sync/tests/testCloudApiBackoff.spec.ts
  ./utils/sync/tests/testOutboxSyncControl.spec.ts
)

echo "==> LiveBooks Desktop security specs"
./scripts/runner.sh ./node_modules/.bin/tape "${DAY1_DESKTOP_SPECS[@]}" | ./node_modules/.bin/tap-spec

CLOUD_ROOT="$(cd "$ROOT/../livebooks-cloud" && pwd)"
if [[ -d "$CLOUD_ROOT/test" ]]; then
  echo "==> livebooks-cloud integration (desktop link / MFA)"
  if command -v rbenv >/dev/null 2>&1 && rbenv versions --bare 2>/dev/null | grep -qx '4.0.2'; then
    (cd "$CLOUD_ROOT" && RBENV_VERSION=4.0.2 bin/rails test test/integration/web_desktop_session_url_test.rb test/integration/api_v1_mfa_security_test.rb)
  else
    echo "==> skip livebooks-cloud integration (rbenv Ruby 4.0.2 not installed)"
  fi
else
  echo "==> skip livebooks-cloud (directory not found)"
fi

echo "==> Automated verification complete"
echo "Manual before GA: docs/signing-qa-runbook.md + docs/verification-matrix.md"
