#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
SOURCE_DIR="$PROJECT_DIR/src"
BUILD_DIR="$PROJECT_DIR/dist"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
DEPLOYMENT_FILE="$WEB_DIR/deployment-output.json"

timed() {
  /usr/bin/time -p "$@"
}

[[ -f "$SOURCE_DIR/index.html" ]] || {
  echo "Missing source entry point: $SOURCE_DIR/index.html" >&2
  exit 1
}

if [[ -f "$PROJECT_DIR/package.json" ]]; then
  if [[ ! -d "$PROJECT_DIR/node_modules" ]] || [[ "$PROJECT_DIR/package.json" -nt "$PROJECT_DIR/node_modules/.package-lock.json" ]]; then
    timed npm install --no-audit --no-fund
  fi
fi

timed rm -rf "$BUILD_DIR"
timed mkdir -p "$BUILD_DIR"
timed cp -R "$SOURCE_DIR"/. "$BUILD_DIR"/

[[ -f "$BUILD_DIR/index.html" ]] || {
  echo "Build did not produce $BUILD_DIR/index.html" >&2
  exit 1
}

timed mkdir -p "$WEB_DIR"
deployment_tmp="$DEPLOYMENT_FILE.tmp.$$"
timed printf '{"project":"%s","directory":"%s"}\n' "$PROJECT_DIR" "$BUILD_DIR" > "$deployment_tmp"
timed mv "$deployment_tmp" "$DEPLOYMENT_FILE"

echo "Serving $BUILD_DIR on http://0.0.0.0:$PORT"
timed node "$PROJECT_DIR/server.mjs"
