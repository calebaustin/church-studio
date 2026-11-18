"""List installed fonts (family, style, file, index) as JSON, for the caption font picker."""
import json
import os
import sys
from pathlib import Path

from PIL import ImageFont

DIRS = ["/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts", str(Path.home() / "Library/Fonts")]


def main() -> None:
    out, seen = [], set()
    for d in DIRS:
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if not name.lower().endswith((".ttf", ".otf", ".ttc")):
                continue
            path = os.path.join(d, name)
            for idx in range(0, 32 if name.lower().endswith(".ttc") else 1):
                try:
                    family, style = ImageFont.truetype(path, 12, index=idx).getname()
                except Exception:
                    break
                if not family or family.startswith(".") or (family, style) in seen:
                    continue
                seen.add((family, style))
                out.append({"family": family, "style": style, "file": path, "index": idx})
    json.dump(sorted(out, key=lambda f: (f["family"].lower(), f["style"])), sys.stdout)


if __name__ == "__main__":
    main()
