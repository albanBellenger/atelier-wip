#!/bin/sh
set -e
cd /app

# Bind-mounted named volume at /app/node_modules can hide newer deps from the image.
# Re-run npm ci when package-lock.json changes (not only when vite is missing).
MARKER=/app/node_modules/.atelier-lock-hash
LOCK_HASH=""
if [ -f package-lock.json ] && command -v sha256sum >/dev/null 2>&1; then
  LOCK_HASH=$(sha256sum package-lock.json | awk '{print $1}')
fi

need_install=0
if [ ! -d node_modules/vite ]; then
  need_install=1
elif [ -n "$LOCK_HASH" ]; then
  if [ ! -f "$MARKER" ] || [ "$(cat "$MARKER" 2>/dev/null)" != "$LOCK_HASH" ]; then
    need_install=1
  fi
fi

if [ "$need_install" -eq 1 ]; then
  echo "frontend: installing npm dependencies..."
  npm ci
  if [ -n "$LOCK_HASH" ]; then
    printf '%s' "$LOCK_HASH" > "$MARKER"
  fi
fi

exec "$@"
