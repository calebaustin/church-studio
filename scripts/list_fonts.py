"""List installed fonts (family, style, file, index) as JSON, for the caption font picker."""
import json
import os
import sys
from pathlib import Path

from PIL import ImageFont

DIRS = ["/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts", str(Path.home() / "Library/Fonts")]
# Folders searched all the way down: fonts turned on in Adobe Fonts (Creative Cloud), and the extra Apple fonts
# you can download in Font Book.
DEEP = [str(Path.home() / "Library/Application Support/Adobe/CoreSync/plugins/livetype"), "/System/Library/AssetsV2"]
FONT_EXT = (".ttf", ".otf", ".ttc")


def font_files():
    for d in DIRS:
        if os.path.isdir(d):
            for name in sorted(os.listdir(d)):
                if name.lower().endswith(FONT_EXT):
                    yield os.path.join(d, name)
    for root in DEEP:
        if not os.path.isdir(root):
            continue
        for d, subdirs, files in os.walk(root):
            if root.endswith("AssetsV2") and d == root:
                subdirs[:] = [x for x in subdirs if "Font" in x]  # only Apple's font downloads, not every asset
            for name in sorted(files):
                if name.lower().endswith(FONT_EXT):
                    yield os.path.join(d, name)


def main() -> None:
    out, seen = [], set()
    for path in font_files():
        name = os.path.basename(path)
        if True:
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
