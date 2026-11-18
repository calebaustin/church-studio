#!/usr/bin/env bash
# Publish an update: scripts/release.sh 0.3.1
# 1. Add a "## 0.3.1 · Month Day, Year" section to CHANGELOG.md first.
# 2. This bumps package.json, builds the app for Apple Silicon and (when scripts/setup-intel.sh has
#    been run) for Intel, commits, tags, pushes, and creates a GitHub release with both .dmg files
#    and that changelog section. Installed copies see it under Settings > Updates.
set -euo pipefail
cd "$(dirname "$0")/.."
V="${1:?Usage: scripts/release.sh <version>  e.g. 0.3.1}"
REPO=$(node -p "require('./package.json').updateRepo")
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first."; exit 1; }
grep -q "^## $V " CHANGELOG.md || { echo "Add a '## $V · <date>' section to CHANGELOG.md first."; exit 1; }
NOTES=$(awk -v v="$V" '$0 ~ "^## "v" " {on=1; next} /^## / && on {exit} on' CHANGELOG.md)
node -e "const f='package.json',p=require('./'+f);p.version='$V';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
ARCH=arm64 scripts/build-app.sh
FILES=("dist/release/Church Studio-$V-arm64.dmg")
if [ -x "$HOME/.church-studio-build/venv-x64/bin/python" ]; then
  ARCH=x64 scripts/build-app.sh
  FILES+=("dist/release/Church Studio-$V-x64.dmg")
else
  echo "Skipping the Intel build (run scripts/setup-intel.sh to include it)."
fi
git add package.json && git commit -m "Release $V"
git tag "v$V"
git push origin HEAD --tags
gh release create "v$V" "${FILES[@]}" --repo "$REPO" --title "Church Studio $V" --notes "$NOTES"
echo "Published $V to https://github.com/$REPO/releases"
