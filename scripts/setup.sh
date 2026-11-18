#!/usr/bin/env bash
# One-time dev setup on macOS: Python venv (Whisper, OpenCV, Pillow, yt-dlp) + npm packages.
# ffmpeg/ffprobe come from npm (ffmpeg-static), so Homebrew ffmpeg is not needed.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v brew >/dev/null; then
  echo "Homebrew is required: https://brew.sh" >&2; exit 1
fi
brew list python@3.12 >/dev/null 2>&1 || brew install python@3.12
command -v node >/dev/null || brew install node

PY="$(brew --prefix)/bin/python3.12"
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r scripts/requirements.txt

npm install
# npm asks before running install scripts; these download Electron, esbuild and ffmpeg.
npm install-scripts approve electron esbuild ffmpeg-static @ffprobe-installer/darwin-arm64 >/dev/null 2>&1 || true
npm rebuild electron esbuild ffmpeg-static @ffprobe-installer/darwin-arm64
echo
echo "Setup done. Start the app with: npm start"
