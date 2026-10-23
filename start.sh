#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
PORT="${PORT:-3000}"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
DIST="$ROOT/dist"
SOURCE="$ROOT/site"
export PORT

timed() {
  local label="$1"
  shift
  printf '[start] %s\n' "$label" >&2
  /usr/bin/time -p "$@"
}

timed "prepare worker metadata directory" mkdir -p "$WEB_DIR"
timed "remove previous build" rm -rf "$DIST"
timed "create build directory" mkdir -p "$DIST"
timed "copy static source into build" cp -R "$SOURCE"/. "$DIST"/
timed "write deployment output" node -e 'require("node:fs").writeFileSync(process.argv[1], JSON.stringify({ project: process.argv[2], directory: process.argv[3] }) + "\n")' "$WEB_DIR/deployment-output.json" "$ROOT" "$DIST"
timed "verify build entrypoint" test -s "$DIST/index.html"
printf '[start] serving %s on 0.0.0.0:%s\n' "$DIST" "$PORT" >&2
/usr/bin/time -p python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$DIST"
