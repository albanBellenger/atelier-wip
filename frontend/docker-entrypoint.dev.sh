#!/bin/sh
set -e
cd /app
if [ ! -d node_modules/vite ]; then
  echo "frontend: installing npm dependencies..."
  npm ci
fi
exec "$@"
