#!/usr/bin/env bash
# Build "Church Studio.app" (and a .dmg) with everything inside: no Homebrew, Python or Node needed
# on the computer that runs it. Run on an Apple Silicon Mac after scripts/setup.sh.
#   ARCH=arm64 (default) builds for Apple Silicon. ARCH=x64 builds for Intel Macs; it runs the Intel
#   tools through Rosetta and needs an Intel Python (see scripts/setup-intel.sh).
#   1. Freeze the Python media engine (Whisper, OpenCV, Pillow, yt-dlp) into build/sc-media
#   2. Copy static ffmpeg + ffprobe into build/bin
#   3. Build the UI and package the app with electron-builder
set -euo pipefail
cd "$(dirname "$0")/.."
ARCH="${ARCH:-arm64}"
INTEL="$HOME/.church-studio-build"

if [ "$ARCH" = "x64" ]; then
  [ -x "$INTEL/venv-x64/bin/python" ] || { echo "Run scripts/setup-intel.sh first."; exit 1; }
  PYRUN=(arch -x86_64 "$INTEL/venv-x64/bin/python")
else
  PYRUN=(.venv/bin/python)
fi

echo "==> Freezing the media engine ($ARCH)"
"${PYRUN[@]}" -m pip install -q "pyinstaller>=6.10"
rm -rf build/sc-media build/pyi
"${PYRUN[@]}" -m PyInstaller scripts/sc_media.py --name sc-media --onedir --noconfirm --clean \
  --distpath build --workpath build/pyi --specpath build/pyi \
  --paths scripts \
  --hidden-import transcribe --hidden-import render_clip --hidden-import list_fonts \
  --collect-data cv2 --collect-data faster_whisper --collect-binaries ctranslate2 \
  --collect-submodules yt_dlp --collect-data yt_dlp \
  --exclude-module tkinter --exclude-module matplotlib
if [ "$ARCH" = "x64" ]; then arch -x86_64 build/sc-media/sc-media version; else build/sc-media/sc-media version; fi

echo "==> Bundling ffmpeg ($ARCH)"
rm -rf build/bin && mkdir -p build/bin
if [ "$ARCH" = "x64" ]; then
  cp "$INTEL/ffmpeg-x64/node_modules/ffmpeg-static/ffmpeg" build/bin/ffmpeg
  cp "$INTEL/ffmpeg-x64/node_modules/@ffprobe-installer/darwin-x64/ffprobe" build/bin/ffprobe
else
  cp "$(node -e "process.stdout.write(require('ffmpeg-static'))")" build/bin/ffmpeg
  cp "$(node -e "process.stdout.write(require('@ffprobe-installer/ffprobe').path)")" build/bin/ffprobe
fi
chmod +x build/bin/*
file build/bin/ffmpeg build/sc-media/sc-media | sed 's/^/   /'

echo "==> Building the app"
npx vite build
npx electron-builder --mac dir "--$ARCH" "$@"
# Sign the whole app (ad hoc, no Apple developer account). Without a valid signature, macOS calls a
# downloaded copy "damaged". With it, people get the usual first-launch prompt instead.
# Signed in a temp folder: iCloud-synced folders (like Documents) add file tags that codesign rejects.
SIGN="$(mktemp -d)"
OUT="dist/release/mac-arm64"; [ "$ARCH" = "x64" ] && OUT="dist/release/mac"
ditto --noextattr --norsrc "$OUT/Church Studio.app" "$SIGN/Church Studio.app"
xattr -cr "$SIGN/Church Studio.app"
codesign --force --deep --sign - "$SIGN/Church Studio.app"
codesign --verify --deep --strict "$SIGN/Church Studio.app"
npx electron-builder --mac dmg "--$ARCH" --prepackaged "$SIGN/Church Studio.app"
rm -rf "$SIGN"
echo
echo "Done: see dist/release/"
