# Publishing an update

Church Studio checks `https://github.com/<updateRepo>/releases` (set `updateRepo` in package.json).

1. Push this project to that GitHub repository (public, so the app can read releases without a login).
2. Fix or add what you need and commit.
3. Add a section to the top of `CHANGELOG.md`:

   ```
   ## 0.3.1 · November 20, 2026

   ### Fixed
   - What changed, in plain words.
   ```

4. Run `scripts/release.sh 0.3.1`. It bumps the version, builds the .dmg, commits, tags, pushes, and creates
   the GitHub release with those notes and the .dmg attached.

Installed copies see the update under Settings › Updates (and once a day on launch). They download the .dmg,
drag the app into Applications and choose Replace.

## Keeping people's work safe

- Sermons, designs, drafts and settings live in `~/Library/Application Support/Church Studio`, never inside the
  app, so replacing the app never touches them.
- The first launch of a new version copies settings and data files to `backups/` before anything else.
- If a release changes how data is stored, add a step to `MIGRATIONS` in `src/daemon/updates.js`. It runs once,
  after the backup. New settings get defaults automatically; never rename or remove a saved field without a
  migration.
- The build is unsigned, so macOS asks people to right-click › Open the first time after each update. Signing
  with an Apple Developer ID would remove that step and allow fully automatic updates later.
