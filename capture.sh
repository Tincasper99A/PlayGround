#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$PROJECT_DIR"

: "${CAPTURE_URL:?Set CAPTURE_URL to the page that should be captured.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to an output directory outside the project.}"

CAPTURE_DIR="$(/usr/bin/time -p realpath -m "$CAPTURE_DIR")"

case "$CAPTURE_DIR/" in
  "$PROJECT_DIR/"*)
    echo "CAPTURE_DIR must be outside the project source: $CAPTURE_DIR" >&2
    exit 1
    ;;
esac

[[ -f "$PROJECT_DIR/capture.mjs" ]] || {
  echo "Missing capture entry point: $PROJECT_DIR/capture.mjs" >&2
  exit 1
}

export CAPTURE_URL
export CAPTURE_DIR

timed() {
  /usr/bin/time -p "$@"
}

timed mkdir -p "$CAPTURE_DIR"
timed node "$PROJECT_DIR/capture.mjs"

for name in final-desktop.png final-mobile.png; do
  [[ -s "$CAPTURE_DIR/$name" ]] || {
    echo "Capture did not produce $CAPTURE_DIR/$name" >&2
    exit 1
  }
  timed stat -c '%n %s bytes' "$CAPTURE_DIR/$name"
done
