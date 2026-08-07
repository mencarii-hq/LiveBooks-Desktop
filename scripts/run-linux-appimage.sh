#!/usr/bin/env bash
# Build the Linux AppImage, extract it (no FUSE needed), and launch.
# Usage (from WSL/Linux, in the repo root):
#   yarn linux:run
# Optional:
#   yarn linux:run --skip-build   # reuse an existing AppImage
#   LIVEBOOKS_DISABLE_GPU=1 yarn linux:run

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "error: run this from Linux/WSL (uname is $(uname -s))" >&2
  exit 1
fi

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      echo "Usage: yarn linux:run [--skip-build]"
      exit 0
      ;;
    *)
      echo "error: unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

BUNDLE_DIR="$ROOT/dist_electron/bundled"
EXTRACT_DIR="$BUNDLE_DIR/squashfs-root"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "==> Building Linux AppImage (x64)"
  yarn build --linux AppImage:x64 --publish never
fi

shopt -s nullglob
APPIMAGES=("$BUNDLE_DIR"/LiveBooks\ Desktop-v*-linux-*.AppImage)
shopt -u nullglob

if [[ ${#APPIMAGES[@]} -eq 0 ]]; then
  echo "error: no AppImage found under $BUNDLE_DIR" >&2
  echo "hint: run without --skip-build, or build with: yarn build --linux AppImage:x64" >&2
  exit 1
fi

# Prefer the newest AppImage by mtime
APPIMAGE="$(ls -1t "${APPIMAGES[@]}" | head -n 1)"
echo "==> Using $(basename "$APPIMAGE")"

echo "==> Extracting AppImage (avoids FUSE in WSL)"
rm -rf "$EXTRACT_DIR"
(
  cd "$BUNDLE_DIR"
  "./$(basename "$APPIMAGE")" --appimage-extract
)

BINARY="$EXTRACT_DIR/livebooks-desktop"
if [[ ! -x "$BINARY" ]]; then
  echo "error: expected binary missing: $BINARY" >&2
  exit 1
fi

ARGS=(--no-sandbox)
ENV_PREFIX=()
if [[ "${LIVEBOOKS_DISABLE_GPU:-}" == "1" || "${LIVEBOOKS_DISABLE_GPU:-}" == "true" ]]; then
  ENV_PREFIX+=(env ELECTRON_DISABLE_GPU=1)
  ARGS+=(--disable-gpu)
fi

echo "==> Launching LiveBooks Desktop"
exec "${ENV_PREFIX[@]}" "$BINARY" "${ARGS[@]}"
