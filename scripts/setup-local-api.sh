#!/usr/bin/env sh
set -eu

python3 -m venv .venv
. .venv/bin/activate
# v2 renamed the distribution but retained the same import package directory.
python -m pip uninstall --yes unit-converter
python -m pip install --force-reinstall -r api/requirements.local.txt

echo "Local API environment is ready."
echo "Run: . .venv/bin/activate && python api/server.py --host 127.0.0.1 --port 5173"
