#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PROJECT_DIR="$PWD"
PORT="${PORT:-3000}"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
DIST="$PROJECT_DIR/dist"

echo "[start] project=$PROJECT_DIR port=$PORT dist=$DIST"

/usr/bin/time -p mkdir -p "$WEB_DIR"
/usr/bin/time -p /usr/bin/printf '{"project":"%s","directory":"%s"}\n' "$PROJECT_DIR" "$DIST" > "$WEB_DIR/deployment-output.json"

if [[ -f package.json ]]; then
  dependency_count="$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));process.stdout.write(String(Object.keys(p.dependencies||{}).length+Object.keys(p.devDependencies||{}).length))')"
  if [[ "$dependency_count" != "0" ]]; then
    if [[ -f package-lock.json ]]; then
      /usr/bin/time -p npm ci --no-audit --no-fund
    else
      /usr/bin/time -p npm install --no-audit --no-fund
    fi
  else
    echo "[start] no npm dependencies declared; skipping install"
  fi
fi

/usr/bin/time -p node scripts/build.mjs

if [[ ! -f "$DIST/index.html" ]]; then
  echo "[start] build output is missing index.html" >&2
  exit 1
fi

export PORT
export HOST="${HOST:-0.0.0.0}"
echo "[start] serving $DIST on $HOST:$PORT"
exec /usr/bin/time -p node scripts/serve.mjs
