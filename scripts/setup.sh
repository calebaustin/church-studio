#!/usr/bin/env bash
# One-time setup on macOS: system tools + Python venv for Whisper and face tracking.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v brew >/dev/null; then
  echo "Homebrew is required: https://brew.sh" >&2; exit 1
fi
brew list ffmpeg >/dev/null 2>&1 || brew install ffmpeg
brew list python@3.12 >/dev/null 2>&1 || brew install python@3.12
command -v node >/dev/null || brew install node

PY="$(brew --prefix)/bin/python3.12"
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r scripts/requirements.txt

npm install
echo
echo "Setup done. Start the app with: npm start"
