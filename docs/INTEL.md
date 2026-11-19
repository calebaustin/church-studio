# Building Church Studio for Intel Macs

Official releases are for Macs with Apple chips (M1 and newer). The code also runs on Intel Macs, and
everything needed to build an Intel version is already here. These steps were tested in November 2026:
an Intel build transcribed and exported clips correctly under Rosetta on an Apple Silicon Mac. It has not
been run on a real Intel Mac.

## What's different on Intel

Only three parts of the app are built for one kind of chip. The rest is JavaScript and runs anywhere.

| Part | What it is | How the Intel build gets it |
|---|---|---|
| Electron | The app window | electron-builder downloads the Intel version (`--x64`) |
| ffmpeg and ffprobe | Video and audio tools | npm packages for `darwin-x64` |
| `sc-media` | Transcription and video engine (Whisper, OpenCV, Pillow, yt-dlp) frozen with PyInstaller | Must be frozen by an **Intel** copy of Python |

PyInstaller can't cross-build, so the engine has to come from an Intel Python. On an Apple Silicon Mac
that runs through Rosetta.

## Build it on an Apple Silicon Mac

1. Install Rosetta if you haven't: `softwareupdate --install-rosetta`
2. Run the one-time setup. It puts everything in `~/.church-studio-build`, outside the project:
   a portable Intel Python 3.12 (python-build-standalone by Astral, checked against its published
   checksum), a venv with the engine's packages installed as Intel, and Intel ffmpeg and ffprobe.
   ```sh
   scripts/setup-intel.sh
   ```
3. Build the Intel app:
   ```sh
   ARCH=x64 scripts/build-app.sh   # -> dist/release/Church-Studio-Mac-x64.dmg
   ```
4. To include it in a release, run the release script with `WITH_INTEL=1`:
   ```sh
   WITH_INTEL=1 scripts/release.sh 0.6.0
   ```

## Build it on an Intel Mac

On an Intel Mac, Python and npm are already Intel, so `scripts/setup.sh` followed by
`scripts/build-app.sh` builds an Intel app with no Rosetta. Pass `--x64` to electron-builder (or set
`ARCH=x64`) so the app is labeled correctly.

## Already wired in

- **Updates:** each copy downloads the file for its own chip (`process.arch`), so an Intel copy only
  takes `-x64.dmg` files. With no Intel file in a release, Intel copies are told so and keep working.
- **Transcription speed:** Intel Macs default to the faster Base Whisper model (`src/daemon/config.js`).
- **Warnings from Intel's math library:** output from the engine is read past any warning lines
  (`jsonFrom` in `src/daemon/tools.js`), which Intel MKL prints on some chips.

## Things to check on a real Intel Mac

- Speed: transcription with the Base model, and clip exports.
- That the first launch isn't unusually slow.
- Speaker tracking (OpenCV) on a real sermon video.
