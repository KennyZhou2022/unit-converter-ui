#!/usr/bin/env sh
set -eu

if [ -d ".venv" ]; then
  . .venv/bin/activate
fi

python api/server.py --host "${HOST:-127.0.0.1}" --port "${PORT:-5173}"

