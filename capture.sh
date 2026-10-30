#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to an output directory outside the project.}"

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

CAPTURE_ABS="$(cd "$CAPTURE_DIR" && pwd)"
case "$CAPTURE_ABS" in
  "$PWD"|"$PWD"/*)
    echo "[capture] CAPTURE_DIR must be outside the source tree: $CAPTURE_ABS" >&2
    exit 1
    ;;
esac

echo "[capture] url=$CAPTURE_URL output=$CAPTURE_ABS"
/usr/bin/time -p node scripts/capture.mjs
