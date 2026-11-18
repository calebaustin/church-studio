#!/usr/bin/env bash
# Build "Church Studio.app" (and a .dmg) with everything inside: no Homebrew, Python or Node needed
# on the computer that runs it. Run on an Apple Silicon Mac after scripts/setup.sh.
#   1. Freeze the Python media engine (Whisper, OpenCV, Pillow, yt-dlp) into build/sc-media
#   2. Copy static ffmpeg + ffprobe into build/bin
#   3. Build the UI and package the app with electron-builder
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Freezing the media engine"
.venv/bin/pip install -q "pyinstaller>=6.10"
rm -rf build/sc-media build/pyi
.venv/bin/pyinstaller scripts/sc_media.py --name sc-media --onedir --noconfirm --clean \
  --distpath build --workpath build/pyi --specpath build/pyi \
  --paths scripts \
  --hidden-import transcribe --hidden-import render_clip --hidden-import list_fonts \
  --collect-data cv2 --collect-data faster_whisper --collect-binaries ctranslate2 \
  --collect-submodules yt_dlp --collect-data yt_dlp \
  --exclude-module tkinter --exclude-module matplotlib
build/sc-media/sc-media version

echo "==> Bundling ffmpeg"
mkdir -p build/bin
cp "$(node -e "process.stdout.write(require('ffmpeg-static'))")" build/bin/ffmpeg
cp "$(node -e "process.stdout.write(require('@ffprobe-installer/ffprobe').path)")" build/bin/ffprobe
chmod +x build/bin/*

echo "==> Building the app"
npx vite build
npx electron-builder --mac dir --arm64 "$@"
# Sign the whole app (ad hoc, no Apple developer account). Without a valid signature, macOS calls a
# downloaded copy "damaged". With it, people get the usual first-launch prompt instead.
# Signed in a temp folder: iCloud-synced folders (like Documents) add file tags that codesign rejects.
SIGN="$(mktemp -d)"
ditto --noextattr --norsrc "dist/release/mac-arm64/Church Studio.app" "$SIGN/Church Studio.app"
xattr -cr "$SIGN/Church Studio.app"
codesign --force --deep --sign - "$SIGN/Church Studio.app"
codesign --verify --deep --strict "$SIGN/Church Studio.app"
npx electron-builder --mac dmg --arm64 --prepackaged "$SIGN/Church Studio.app"
rm -rf "$SIGN"
echo
echo "Done: see dist/release/"
