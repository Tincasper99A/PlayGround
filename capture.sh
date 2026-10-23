#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
: "${CAPTURE_URL:?Set CAPTURE_URL to the URL that should be captured.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the output directory.}"

timed() {
  local label="$1"
  shift
  printf '[capture] %s\n' "$label" >&2
  /usr/bin/time -p "$@"
}

timed "prepare capture output directory" mkdir -p "$CAPTURE_DIR"
timed "render desktop and mobile screenshots" node "$ROOT/scripts/capture.mjs" "$CAPTURE_URL" "$CAPTURE_DIR"
timed "verify desktop screenshot" test -s "$CAPTURE_DIR/final-desktop.png"
timed "verify mobile screenshot" test -s "$CAPTURE_DIR/final-mobile.png"
