#!/usr/bin/env sh
set -eu

python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r api/requirements.local.txt

echo "Local API environment is ready."
echo "Run: . .venv/bin/activate && python api/server.py --host 127.0.0.1 --port 5173"

