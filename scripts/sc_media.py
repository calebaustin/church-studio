"""Single entry point for the packaged app (frozen with PyInstaller as `sc-media`).

  sc-media transcribe <wav> [...]      -> scripts/transcribe.py
  sc-media render_clip <job.json> [...] -> scripts/render_clip.py
  sc-media yt-dlp [...]                 -> yt-dlp
  sc-media version
"""
import sys


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd, rest = sys.argv[1], sys.argv[2:]
    sys.argv = [cmd, *rest]
    if cmd == "transcribe":
        import transcribe
        transcribe.main()
    elif cmd == "render_clip":
        import render_clip
        render_clip.main()
    elif cmd == "list_fonts":
        import list_fonts
        list_fonts.main()
    elif cmd == "yt-dlp":
        import yt_dlp
        sys.exit(yt_dlp.main())
    elif cmd == "version":
        import faster_whisper, cv2, yt_dlp.version as v
        print(f"sc-media 0.2 (faster-whisper {faster_whisper.__version__}, opencv {cv2.__version__}, yt-dlp {v.__version__})")
    else:
        raise SystemExit(f"Unknown command {cmd!r}\n{__doc__}")


if __name__ == "__main__":
    main()
