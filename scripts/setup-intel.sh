#!/usr/bin/env bash
# One-time setup for building the Intel Mac version on an Apple Silicon Mac (through Rosetta).
# Puts everything in ~/.church-studio-build, outside the project:
#   - a portable Intel Python 3.12 (python-build-standalone by Astral), checked against its checksum
#   - a venv with the media engine's packages, installed as Intel
#   - Intel ffmpeg and ffprobe from npm
# Then: ARCH=x64 scripts/build-app.sh
set -euo pipefail
cd "$(dirname "$0")/.."
D="$HOME/.church-studio-build"
TAG="20261110"
F="cpython-3.12.16+${TAG}-x86_64-apple-darwin-install_only.tar.gz"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${TAG}"

arch -x86_64 /usr/bin/true 2>/dev/null || { echo "Rosetta is needed: softwareupdate --install-rosetta"; exit 1; }
mkdir -p "$D/dl"

if [ ! -x "$D/python-x64/bin/python3" ]; then
  echo "==> Intel Python"
  curl -fsSL -o "$D/dl/$F" "$URL/${F//+/%2B}"
  curl -fsSL -o "$D/dl/SHA256SUMS" "$URL/SHA256SUMS"
  (cd "$D/dl" && grep " $F\$" SHA256SUMS | shasum -a 256 -c -)
  rm -rf "$D/python-x64" && mkdir -p "$D/python-x64"
  tar -xzf "$D/dl/$F" -C "$D/python-x64" --strip-components 1
fi
arch -x86_64 "$D/python-x64/bin/python3" -c "import platform; assert platform.machine() == 'x86_64'; print('   Intel Python', platform.python_version())"

echo "==> Intel packages"
[ -x "$D/venv-x64/bin/python" ] || arch -x86_64 "$D/python-x64/bin/python3" -m venv "$D/venv-x64"
arch -x86_64 "$D/venv-x64/bin/python" -m pip install -q --upgrade pip
arch -x86_64 "$D/venv-x64/bin/python" -m pip install -q -r scripts/requirements.txt "pyinstaller>=6.10"

echo "==> Intel ffmpeg"
FV=$(node -p "require('ffmpeg-static/package.json').version")
PV=$(node -p "require('@ffprobe-installer/ffprobe/package.json').optionalDependencies['@ffprobe-installer/darwin-x64']")
mkdir -p "$D/ffmpeg-x64"
(cd "$D/ffmpeg-x64" && [ -f package.json ] || echo '{"private":true}' > package.json)
(cd "$D/ffmpeg-x64" && npm_config_arch=x64 npm install --no-audit --no-fund --silent "ffmpeg-static@$FV" "@ffprobe-installer/darwin-x64@$PV" --force)
file "$D/ffmpeg-x64/node_modules/ffmpeg-static/ffmpeg" "$D/ffmpeg-x64/node_modules/@ffprobe-installer/darwin-x64/ffprobe"

echo "Ready. Build the Intel app with: ARCH=x64 scripts/build-app.sh"
