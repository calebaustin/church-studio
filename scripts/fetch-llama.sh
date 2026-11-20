#!/bin/zsh
# Puts llama.cpp's llama-server (MIT) and the libraries it loads into build/bin/llama, for CS Helper.
# Pinned to one release and checked against its SHA-256. The download is cached in build/cache.
set -e
cd "$(dirname "$0")/.."
TAG=b12180
SHA=0883467d96aa2ec28b3992e06796de66623b037f4b5722da52c39ca53941ed5c
NAME=llama-$TAG-bin-macos-arm64.tar.gz
mkdir -p build/cache
if [ ! -f "build/cache/$NAME" ]; then
  curl -fsSL -o "build/cache/$NAME.part" "https://github.com/ggml-org/llama.cpp/releases/download/$TAG/$NAME"
  mv "build/cache/$NAME.part" "build/cache/$NAME"
fi
echo "$SHA  build/cache/$NAME" | shasum -a 256 -c - >/dev/null || { echo "   llama.cpp download failed its checksum"; rm -f "build/cache/$NAME"; exit 1; }
TMP=$(mktemp -d)
tar -xzf "build/cache/$NAME" -C "$TMP"
SRC="$TMP/llama-$TAG"
rm -rf build/bin/llama && mkdir -p build/bin/llama
# Only llama-server and the libraries it loads (followed through @rpath), copied as real files.
cp "$SRC/llama-server" "$SRC/LICENSE" build/bin/llama/
todo=(llama-server)
while (( ${#todo} )); do
  f=${todo[1]}; todo=(${todo[2,-1]})
  for lib in $(otool -L "build/bin/llama/$f" | awk '/@rpath\//{sub("@rpath/","",$1); print $1}'); do
    if [ ! -f "build/bin/llama/$lib" ]; then cp -L "$SRC/$lib" "build/bin/llama/$lib"; todo+=($lib); fi
  done
done
rm -rf "$TMP"
build/bin/llama/llama-server --version 2>&1 | grep -m1 -i version | sed 's/^/   CS Helper engine: /'
