#!/bin/zsh
# Runs Church Studio on the local test data (real sermons from ptcchurch.com, designs, writing and more) kept in
# ../Church Studio Test Data. Development only: that folder is never committed or shipped.
#   scripts/dev-test.sh        engine + UI at http://localhost:4327
#   scripts/dev-test.sh app    the desktop app on the same data
set -e
cd "$(dirname "$0")/.."
DATA="$(cd .. && pwd)/Church Studio Test Data"
[ -d "$DATA/home" ] || { echo "No test data at $DATA"; exit 1; }
[ -d dist ] || npm run build
if [ "$1" = "app" ]; then
  SC_HOME="$DATA/home" SC_PORT=4337 npx electron . --user-data-dir="$DATA/electron-profile"
else
  SC_HOME="$DATA/home" SC_PORT=4327 node src/daemon/server.js
fi
