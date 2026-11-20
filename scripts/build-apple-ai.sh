#!/bin/zsh
# Builds cs-apple-ai, the small bridge to Apple Intelligence (Foundation Models, macOS 26+), into build/bin.
# Apple silicon only. On older macOS the app simply reports Apple Intelligence as unavailable.
set -e
cd "$(dirname "$0")/.."
mkdir -p build/bin
if ! command -v swiftc >/dev/null; then echo "   swiftc not found; skipping Apple Intelligence bridge"; exit 0; fi
swiftc -O -target arm64-apple-macos26.0 native/apple-ai/main.swift -o build/bin/cs-apple-ai
swiftc -O -target arm64-apple-macos26.0 native/apple-ai/playground.swift -o build/bin/cs-image-playground
echo '{"op":"status"}' | build/bin/cs-apple-ai | sed 's/^/   Apple Intelligence: /'
