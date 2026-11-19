#!/usr/bin/env bash
# Publish an update: scripts/release.sh 0.3.1
# 1. Add a "## 0.3.1 · Month Day, Year" section to CHANGELOG.md first.
# The .dmg files keep the same names every release, so these links always get the newest one:
#   https://github.com/<repo>/releases/latest/download/Church-Studio-Mac-arm64.dmg
# 2. This bumps package.json, builds the app for Apple Silicon (and for Intel with WITH_INTEL=1,
#    see docs/INTEL.md), commits, tags, pushes, and creates a GitHub release with the .dmg file(s)
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
FILES=("dist/release/Church-Studio-Mac-arm64.dmg")
# Official releases are Apple Silicon only. To also ship an Intel build, see docs/INTEL.md.
if [ "${WITH_INTEL:-}" = "1" ]; then
  ARCH=x64 scripts/build-app.sh
  FILES+=("dist/release/Church-Studio-Mac-x64.dmg")
fi
git add package.json && git commit -m "Release $V"
git tag "v$V"
git push origin HEAD --tags
gh release create "v$V" "${FILES[@]}" --repo "$REPO" --title "Church Studio $V" --notes "$NOTES"
echo "Published $V to https://github.com/$REPO/releases"
