"""Render one sermon clip as a 9:16 video with a smooth auto-centered crop and live captions.

Usage: render_clip.py <job.json> [--track-only]

Pipeline (frame-accurate, no libass needed):
  1. Track: sample the clip at ~6 fps, detect faces (OpenCV Haar, frontal + profile), keep the
     speaker with a continuity bias, then turn the samples into a smooth camera path
     (outlier rejection -> dead-zone spring -> zero-phase smoothing).
  2. Render: ffmpeg decodes the source -> Python crops each frame on the camera path, scales to
     1080x1920 and draws word-by-word captions with Pillow -> ffmpeg encodes with the audio.
  3. Cuts: an optional list of keep-segments (removed words / tightened pauses) drops frames and
     audio, and captions are re-timed onto the shortened clip.

Progress lines: "PROGRESS <0-100> <message>" on stderr. With --track-only, only step 1 runs and the
camera path is written to job["trackOut"] (used by the editor preview).
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FFMPEG = os.environ.get("FFMPEG_PATH", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE_PATH", "ffprobe")


def progress(pct: float, msg: str = "") -> None:
    print(f"PROGRESS {int(pct)} {msg}", file=sys.stderr, flush=True)


def detail(key: str, value: str) -> None:
    """An extra fact for the task's hover details, like "Frames|900 of 1800"."""
    print(f"DETAIL {key}|{value}", file=sys.stderr, flush=True)


def probe_size(video: str) -> tuple[int, int]:
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
         "-of", "csv=p=0:s=x", video], capture_output=True, text=True, check=True,
    ).stdout.strip()
    w, h = out.split("x")[:2]
    return int(w), int(h)


def has_audio(video: str) -> bool:
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", video],
        capture_output=True, text=True,
    ).stdout.strip()
    return bool(out)


# ---------------------------------------------------------------- tracking

def detect_faces(video: str, start: float, dur: float, src_w: int, src_h: int, fps: float = 6.0):
    """(t, [(cx, cy, w, h) normalised 0..1]) per sample, one ffmpeg pass of small grey frames."""
    base = cv2.data.haarcascades
    frontal = cv2.CascadeClassifier(base + "haarcascade_frontalface_default.xml")
    profile = cv2.CascadeClassifier(base + "haarcascade_profileface.xml")
    fw = 960 if src_w >= 960 else src_w // 2 * 2
    fh = int(src_h * fw / src_w) // 2 * 2
    proc = subprocess.Popen(
        [FFMPEG, "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", video,
         "-an", "-vf", f"fps={fps},scale={fw}:{fh}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    samples = []
    size = fw * fh
    total = max(1, int(dur * fps))
    i = 0
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            img = np.frombuffer(buf, dtype=np.uint8).reshape(fh, fw)
            img = cv2.equalizeHist(img)
            boxes = list(frontal.detectMultiScale(img, scaleFactor=1.1, minNeighbors=5, minSize=(20, 20)))
            if not boxes:  # turned head: try profile, both directions
                boxes = list(profile.detectMultiScale(img, 1.1, 5, minSize=(20, 20)))
                flipped = profile.detectMultiScale(cv2.flip(img, 1), 1.1, 5, minSize=(20, 20))
                boxes += [(fw - x - w, y, w, h) for x, y, w, h in flipped]
            samples.append((i / fps, [((x + w / 2) / fw, (y + h / 2) / fh, w / fw, h / fh) for x, y, w, h in boxes]))
            i += 1
            if i % 15 == 0:
                progress(min(30, 2 + 28 * i / total), "Finding the speaker")
    finally:
        proc.stdout.close()
        proc.wait()
    return samples


def pick_speaker(samples, anchors=None, prior=None):
    """One x per sample (or None). Prefer the biggest face, stay with the face near the previous
    pick (so a worship leader or interpreter doesn't steal the frame), and lean toward:
      - anchors: faces the user clicked in this clip, {t, x} (seconds into the clip, 0..1)
      - prior: where the speaker usually stands in this church's videos, {x, w}
    When the user clicked a spot and no face is found near it, that spot is used directly."""
    anchors = sorted(anchors or [], key=lambda a: a["t"])
    out = []
    prev = None
    for t, faces in samples:
        near = min(anchors, key=lambda a: abs(a["t"] - t)) if anchors else None
        target = near["x"] if near and abs(near["t"] - t) <= 8 else (prior or {}).get("x")
        faces = [f for f in faces if f[2] >= 0.025]  # tiny detections are usually noise
        if prior and prior.get("w"):
            faces = [f for f in faces if f[2] >= prior["w"] * 0.4] or faces  # far too small to be the speaker
        if not faces:
            if near and abs(near["t"] - t) <= 2:
                out.append((t, near["x"], 0.05))
                prev = near["x"]
            else:
                out.append((t, None, None))
            continue

        def score(f):
            sc = f[2] * f[3]
            if prev is not None:
                sc /= 1.0 + 12 * abs(f[0] - prev)
            if target is not None:
                sc /= 1.0 + 10 * abs(f[0] - target)
            return sc

        best = max(faces, key=score)
        if near and abs(near["t"] - t) <= 2 and abs(best[0] - near["x"]) > 0.2:
            best = (near["x"], 0.0, 0.05, 0.0)  # the user knows better than the detector here
        prev = best[0]
        out.append((t, best[0], best[2]))
    return out


def camera_path(picks, n_frames: int, fps: float, crop_frac: float) -> tuple[np.ndarray, dict]:
    """Per-output-frame crop centre (0..1 of source width). Smooth, with a dead zone so the camera
    holds still while the speaker shifts weight, and glides when they walk."""
    xs = np.array([p[1] if p[1] is not None else np.nan for p in picks], dtype=float)
    ts = np.array([p[0] for p in picks], dtype=float)
    found = np.isfinite(xs)
    info = {"samples": len(xs), "found": int(found.sum())}
    if found.sum() < max(2, 0.2 * len(xs)):
        info["fallback"] = True
        return np.full(n_frames, 0.5), info

    # Outlier rejection: a 5-sample running median.
    med = xs.copy()
    for i in range(len(xs)):
        win = xs[max(0, i - 2): i + 3]
        win = win[np.isfinite(win)]
        if win.size:
            med[i] = np.median(win)
    good = np.isfinite(med)
    t_out = np.arange(n_frames) / fps
    target = np.interp(t_out, ts[good], med[good])  # holds the edge values outside the range

    # Dead-zone spring (critically damped), forward pass.
    dead = crop_frac * 0.18  # speaker may drift ~18% of the crop width before we move
    omega = 2 * math.pi * 0.55  # ~0.55 Hz: glides, never snaps
    dt = 1.0 / fps
    cam = np.empty(n_frames)
    x, v = target[0], 0.0
    for i in range(n_frames):
        err = target[i] - x
        goal = x if abs(err) < dead else target[i] - math.copysign(dead * 0.35, err)
        a = omega * omega * (goal - x) - 2 * omega * v
        v += a * dt
        x += v * dt
        cam[i] = x

    # Zero-phase smoothing to remove any remaining jerk (forward + backward EMA).
    alpha = 1 - math.exp(-dt / 0.35)
    for _ in range(2):
        for i in range(1, n_frames):
            cam[i] = cam[i - 1] + alpha * (cam[i] - cam[i - 1])
        for i in range(n_frames - 2, -1, -1):
            cam[i] = cam[i + 1] + alpha * (cam[i] - cam[i + 1])
    half = crop_frac / 2
    cam = np.clip(cam, half, 1 - half)
    info["fallback"] = False
    return cam, info


def ease_in_out(u: np.ndarray) -> np.ndarray:
    """Sine ease: starts and ends at rest, so the move never jerks."""
    u = np.clip(u, 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * u)


def glide_path(picks, n_frames: int, fps: float, crop_frac: float) -> tuple[np.ndarray, dict]:
    """One continuous move: where the speaker settles at the start -> where they are at the end,
    eased across the whole clip. Steadier than following every step."""
    ts = np.array([p[0] for p in picks], dtype=float)
    xs = np.array([p[1] if p[1] is not None else np.nan for p in picks], dtype=float)
    found = np.isfinite(xs)
    info = {"samples": len(xs), "found": int(found.sum()), "motion": "glide"}
    if found.sum() < max(2, 0.2 * len(xs)):
        info["fallback"] = True
        return np.full(n_frames, 0.5), info
    dur = n_frames / fps
    window = min(3.0, max(1.0, dur * 0.2))
    head = xs[(ts <= window) & found]
    tail = xs[(ts >= dur - window) & found]
    allx = xs[found]
    a = float(np.median(head)) if head.size else float(np.median(allx[: max(1, len(allx) // 4)]))
    b = float(np.median(tail)) if tail.size else float(np.median(allx[-max(1, len(allx) // 4):]))
    if abs(b - a) < crop_frac * 0.08:  # barely moved: hold one steady frame
        a = b = float(np.median(allx))
    info.update({"from": round(a, 4), "to": round(b, 4), "fallback": False})
    u = np.arange(n_frames) / max(1, n_frames - 1)
    return a + (b - a) * ease_in_out(u), info


def cue_path(cues, n_frames: int, fps: float, default_x: float = 0.5) -> np.ndarray:
    """Framing from manual cues: each cue {t, x, move: 'cut'|'glide', dur} sets a new position at
    time t (seconds into the clip), either instantly or with an eased glide over `dur` seconds."""
    cues = sorted([c for c in cues or [] if c.get("x") is not None], key=lambda c: float(c.get("t", 0)))
    t = np.arange(n_frames) / fps
    if not cues:
        return np.full(n_frames, default_x)
    out = np.full(n_frames, float(cues[0]["x"]))
    cur = float(cues[0]["x"])
    for c in cues[1:]:
        t0, x1 = float(c["t"]), float(c["x"])
        if c.get("move") == "glide":
            d = max(0.1, float(c.get("dur", 1.5)))
            seg = (t >= t0)
            u = (t[seg] - t0) / d
            out[seg] = cur + (x1 - cur) * ease_in_out(u)
        else:
            out[t >= t0] = x1
        cur = x1
    return out


# ---------------------------------------------------------------- cuts / timing

def in_keep(t: float, keep) -> bool:
    return any(s <= t < e for s, e in keep)


def remap(t: float, keep):
    removed, prev_end = 0.0, 0.0
    for s, e in keep:
        removed += s - prev_end
        if s <= t <= e:
            return t - removed
        prev_end = e
    return None


def remap_words(words, clip_start: float, keep):
    """Words re-timed onto the shortened clip."""
    out = []
    for w in words:
        a, b = w["start"] - clip_start, w["end"] - clip_start
        parts = [(max(a, s), min(b, e)) for s, e in keep if a < e and b > s]
        if not parts:
            continue
        s, e = remap(parts[0][0], keep), remap(parts[-1][1], keep)
        out.append({"w": w["w"], "start": s, "end": max(e, s + 0.05)})
    return out


# ---------------------------------------------------------------- captions

def load_font(path: str, style: str | None, size: int, index: int | None = None):
    if index is not None:
        try:
            return ImageFont.truetype(path, size, index=int(index))
        except OSError:
            pass
    if style and path.lower().endswith(".ttc"):
        for idx in range(0, 24):
            try:
                f = ImageFont.truetype(path, size, index=idx)
            except OSError:
                break
            if f.getname()[1].lower() == style.lower():
                return f
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default(size)


def hex_rgba(h: str, a: int = 255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def group_words(words, max_words: int, max_chars: int = 22):
    groups, cur = [], []
    for w in words:
        chars = sum(len(x["w"]) for x in cur) + len(cur)
        gap = (w["start"] - cur[-1]["end"]) if cur else 0
        if cur and (len(cur) >= max_words or chars + len(w["w"]) > max_chars * max(1, max_words / 3) or gap > 0.6):
            groups.append(cur)
            cur = []
        cur.append(w)
        if w["w"][-1:] in ".?!,;:":
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    return groups


class Captions:
    """Pre-computes caption events and renders each (group, active word) state once."""

    def __init__(self, words, theme: dict, W: int, H: int, hook: str | None, clip_len: float, hook_y=None):
        self.hook_y = hook_y
        self.W, self.H = W, H
        self.k = min(W, H) / 1080
        self.theme = theme
        self.font = load_font(theme["fontFile"], theme.get("fontStyle"), int(theme.get("size", 78) * self.k), theme.get("fontIndex"))
        self.cache: dict = {}
        self.events = []  # (start, end, group_idx, active_idx)
        self.groups = group_words(words, int(theme.get("words", 3)))
        for gi, g in enumerate(self.groups):
            for wi, w in enumerate(g):
                s = w["start"]
                e = g[wi + 1]["start"] if wi + 1 < len(g) else w["end"] + 0.15
                if gi + 1 < len(self.groups):
                    e = min(e, self.groups[gi + 1][0]["start"])
                e = min(e, clip_len)
                if e - s > 0.01:
                    self.events.append((s, e, gi, wi))
        self.hook = hook.strip() if hook else None
        self.hook_img = self._render_hook() if self.hook else None
        self.ei = 0

    def _text(self, s: str) -> str:
        return s.upper() if self.theme.get("uppercase") else s

    def _layout(self, toks):
        """Wrap tokens into lines that fit 86% of the width. Returns [(line tokens, widths)]."""
        maxw = self.W * float(self.theme.get("maxWidth", 0.86))
        space = self.font.getlength(" ") + (22 * self.k if self.theme.get("highlight") == "pill" else 0)
        lines, cur, curw = [], [], 0.0
        for i, t in enumerate(toks):
            w = self.font.getlength(t)
            if cur and curw + space + w > maxw:
                lines.append(cur)
                cur, curw = [], 0.0
            cur.append((i, t, w))
            curw += (space if len(cur) > 1 else 0) + w
        if cur:
            lines.append(cur)
        return lines, space

    def _render(self, gi: int, wi: int):
        key = (gi, wi)
        if key in self.cache:
            return self.cache[key]
        th = self.theme
        toks = [self._text(w["w"]) for w in self.groups[gi]]
        lines, space = self._layout(toks)
        asc, desc = self.font.getmetrics()
        line_h = int((asc + desc) * float(th.get("lineHeight", 1.12)))
        outline = int(th.get("outline", 6) * self.k)
        pad = outline + int(24 * self.k) + (int(16 * self.k) if th.get("highlight") == "pill" else 0)
        widths = [sum(w for _, _, w in ln) + space * (len(ln) - 1) for ln in lines]
        img_w = int(max(widths) + 2 * pad)
        img_h = int(line_h * len(lines) + 2 * pad)
        layer = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        op = lambda key, d=1.0: int(255 * max(0.0, min(1.0, float(th.get(key, d)))))
        color = hex_rgba(th.get("color", "#FFFFFF"), op("colorOpacity"))
        active = hex_rgba(th.get("active", "#FFD54A"), op("activeOpacity"))
        future = hex_rgba(th.get("future") or th.get("color", "#FFFFFF"), op("futureOpacity", th.get("colorOpacity", 1.0)))
        stroke = hex_rgba(th.get("outlineColor", "#000000"), op("outlineOpacity"))
        box = th.get("highlight") == "box"
        pill = th.get("highlight") == "pill"
        box_color = hex_rgba(th.get("boxColor", "#FFFFFF"), op("boxOpacity", 0.92))
        r = int(18 * self.k)
        if box:  # one soft box behind the whole group
            d.rounded_rectangle([pad * 0.4, pad * 0.4, img_w - pad * 0.4, img_h - pad * 0.4], radius=r, fill=box_color)
        y = pad
        for ln, lw in zip(lines, widths):
            x = pad if self.theme.get("align") == "left" else (img_w - lw) / 2
            for idx, tok, w in ln:
                is_active = idx == wi
                fill = active if is_active else (color if idx < wi else future)
                if pill and is_active:  # rounded box behind the spoken word only
                    px = 14 * self.k
                    d.rounded_rectangle([x - px, y + line_h * 0.04, x + w + px, y + line_h * 0.96],
                                        radius=int(12 * self.k), fill=box_color)
                elif box and is_active:
                    d.rounded_rectangle([x - 8 * self.k, y + 2, x + w + 8 * self.k, y + line_h - 2],
                                        radius=int(10 * self.k), fill=hex_rgba(th.get("active", "#000000"), 40))
                d.text((x, y), tok, font=self.font, fill=fill,
                       stroke_width=0 if (box or pill) else outline, stroke_fill=stroke)
                x += w + space
            y += line_h
        shadow = float(th.get("shadow", 0.35))
        if shadow > 0 and not box and not pill:
            alpha = layer.getchannel("A").filter(ImageFilter.GaussianBlur(10 * self.k))
            alpha = alpha.point(lambda v: int(v * shadow))
            shade = Image.new("RGBA", layer.size, (0, 0, 0, 0))
            shade.paste((0, 0, 0, 255), (0, int(6 * self.k)), alpha)
            layer = Image.alpha_composite(shade, layer)
        arr = np.array(layer)
        cx = self.W / 2
        cy = self.H * float(th.get("position", 0.68))
        if th.get("align") == "left":
            x0 = int(self.W * (1 - float(th.get("maxWidth", 0.86))) / 2 - pad)
        else:
            x0 = int(cx - img_w / 2)
        y0 = int(cy - img_h / 2)
        self.cache[key] = (arr, x0, y0)
        if len(self.cache) > 400:
            self.cache.pop(next(iter(self.cache)))
        return self.cache[key]

    def _render_hook(self):
        th = self.theme
        font = load_font(th["fontFile"], th.get("fontStyle"), int(float(th.get("hookSize", 58)) * self.k), th.get("fontIndex"))
        text = self.hook.upper() if th.get("hookUppercase") else self.hook
        maxw = self.W * 0.8
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = f"{cur} {w}".strip()
            if cur and font.getlength(t) > maxw:
                lines.append(cur)
                cur = w
            else:
                cur = t
        lines.append(cur)
        asc, desc = font.getmetrics()
        lh = int((asc + desc) * 1.1)
        pad = int(28 * self.k)
        w = int(max(font.getlength(l) for l in lines) + 2 * pad)
        h = lh * len(lines) + 2 * pad
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        shape = th.get("hookShape", "pill")
        bg = hex_rgba(th.get("hookBg", "#FFFFFF"), int(255 * float(th.get("hookBgOpacity", 0.94))))
        fg = hex_rgba(th.get("hookColor", "#11141C"))
        if shape != "none":
            radius = int((h / 2) if shape == "pill" and len(lines) == 1 else 26 * self.k) if shape != "box" else int(8 * self.k)
            d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=bg)
        for i, l in enumerate(lines):
            d.text(((w - font.getlength(l)) / 2, pad + i * lh), l, font=font, fill=fg,
                   stroke_width=int(4 * self.k) if shape == "none" else 0, stroke_fill=(0, 0, 0, 200))
        y = float(self.hook_y if self.hook_y is not None else th.get("hookY", 0.13))
        return np.array(img), int((self.W - w) / 2), int(self.H * y - h / 2)

    def at(self, t: float):
        """Overlays to draw at output time t (events are sorted, so a moving pointer is enough)."""
        out = []
        hd = float(self.theme.get("hookDuration", 3.5))
        if self.hook_img is not None and t < hd:
            arr, x, y = self.hook_img
            fade = min(1.0, t / 0.15, (hd - t) / 0.3)
            out.append((arr, x, y, fade))
        while self.ei < len(self.events) and self.events[self.ei][1] <= t:
            self.ei += 1
        j = self.ei
        while j < len(self.events) and self.events[j][0] <= t:
            s, e, gi, wi = self.events[j]
            if s <= t < e:
                arr, x, y = self._render(gi, wi)
                out.append((arr, x, y, 1.0))
                break
            j += 1
        return out


def blend(frame: np.ndarray, arr: np.ndarray, x: int, y: int, opacity: float = 1.0) -> None:
    """Alpha-blend an RGBA patch onto a BGR frame in place."""
    H, W = frame.shape[:2]
    h, w = arr.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    patch = arr[y0 - y: y1 - y, x0 - x: x1 - x]
    a = (patch[:, :, 3:4].astype(np.float32) / 255.0) * opacity
    rgb = patch[:, :, 2::-1].astype(np.float32)  # RGBA -> BGR
    roi = frame[y0:y1, x0:x1].astype(np.float32)
    frame[y0:y1, x0:x1] = (rgb * a + roi * (1 - a)).astype(np.uint8)


# ---------------------------------------------------------------- lyric backgrounds and pop-ups

def hex_bgr(h: str) -> np.ndarray:
    h = str(h).lstrip("#")[:6].ljust(6, "0")
    return np.array([int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)], dtype=np.float32)


class Lyric:
    """Slowly moving soft color for clips with no picture (lyric and podcast clips)."""

    def __init__(self, colors, W, H):
        cols = [hex_bgr(c) for c in (colors or ["#2B7F5F", "#D9A441", "#1B2440"])][:4]
        while len(cols) < 3:
            cols.append(cols[-1] * 0.6)
        self.cols = cols
        self.W, self.H = W, H
        self.w, self.h = max(8, W // 10), max(8, H // 10)
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        self.x = xx / self.w
        self.y = yy / self.h

    def frame(self, t: float) -> np.ndarray:
        img = np.zeros((self.h, self.w, 3), np.float32)
        img[:] = self.cols[-1] * 0.55
        weight = np.full((self.h, self.w, 1), 0.35, np.float32)
        acc = img * weight
        for i, c in enumerate(self.cols[:3]):
            cx = 0.5 + 0.38 * np.sin(t * 0.21 + i * 2.1)
            cy = 0.5 + 0.40 * np.cos(t * 0.17 + i * 1.7)
            d = (self.x - cx) ** 2 + ((self.y - cy) * (self.h / self.w)) ** 2
            w = np.exp(-d / 0.09)[..., None]
            acc += c * w
            weight += w
        small = (acc / weight) * 0.82  # a little darker, so captions stand out
        return cv2.resize(small.clip(0, 255).astype(np.uint8), (self.W, self.H), interpolation=cv2.INTER_CUBIC)


def _rgba(hexstr, alpha: float):
    b, g, r = hex_bgr(hexstr)
    return (int(r), int(g), int(b), int(max(0.0, min(1.0, float(alpha))) * 255))


# Each shape's starting look. A pop-up's own colors and size override these (mirrors POPUP_LOOK in the clip editor).
POPUP_LOOK = {
    "pill": {"color": "#141821", "bg": "#FFFFFF", "bgOpacity": 0.92, "size": 50},
    "lower": {"color": "#FFFFFF", "bg": "#0C0E14", "bgOpacity": 0.78, "size": 44},
    "plain": {"color": "#FFFFFF", "bg": None, "bgOpacity": 0, "size": 50},
}


def popup_image(p: dict, W: int, H: int, font_path, style_name, font_index, accent: str) -> np.ndarray:
    """One text pop-up drawn once: a pill, a lower third, or plain text with a shadow."""
    k = W / 1080
    style = p.get("style", "pill")
    look = POPUP_LOOK.get(style, POPUP_LOOK["pill"])
    size = int(float(p.get("size") or look["size"]) * k)
    font = load_font(font_path, style_name, size, font_index)
    text = str(p.get("text", "")).strip() or " "
    if p.get("uppercase"):
        text = text.upper()
    fg = _rgba(p.get("color") or look["color"], 1)
    bg_op = p.get("bgOpacity")
    bg = _rgba(p.get("bg") or look["bg"] or "#000000", look["bgOpacity"] if bg_op is None else bg_op)
    lines = text.split("\n")[:3]
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    widths = [probe.textlength(l, font=font) for l in lines]
    lh = int(size * 1.25)
    pad_x, pad_y = int(size * 0.6), int(size * 0.36)
    tw = int(min(W * 0.86, max(widths)))
    th = lh * len(lines)
    if style == "lower":
        bar = max(4, int(size * 0.22))
        bw, bh = tw + pad_x * 2 + bar, th + pad_y * 2
        img = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, bw - 1, bh - 1], radius=int(size * 0.3), fill=bg)
        d.rectangle([0, 0, bar, bh], fill=_rgba(p.get("accent") or accent, 1))
        for i, l in enumerate(lines):
            d.text((pad_x + bar, pad_y + i * lh), l, font=font, fill=fg)
    elif style == "plain":
        bw, bh = tw + pad_x * 2, th + pad_y * 2
        img = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        for i, l in enumerate(lines):
            x = (bw - probe.textlength(l, font=font)) / 2
            d.text((x + 3 * k, pad_y + i * lh + 3 * k), l, font=font, fill=(0, 0, 0, 150))
            d.text((x, pad_y + i * lh), l, font=font, fill=fg)
    else:
        bw, bh = tw + pad_x * 2, th + pad_y * 2
        img = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, bw - 1, bh - 1], radius=int(min(bh / 2, size * 1.2)), fill=bg)
        for i, l in enumerate(lines):
            x = (bw - probe.textlength(l, font=font)) / 2
            d.text((x, pad_y + i * lh), l, font=font, fill=fg)
    return np.array(img)


class Popups:
    """Text that appears for a while, with a fade, slide or pop transition."""

    def __init__(self, items, W, H, theme, accent):
        self.W, self.H = W, H
        self.items = []
        for p in items or []:
            try:
                start, end = float(p.get("start", 0)), float(p.get("end", 0))
            except (TypeError, ValueError):
                continue
            if end <= start:
                continue
            arr = popup_image(p, W, H, theme.get("fontFile"), theme.get("fontStyle"), theme.get("fontIndex"), accent)
            h, w = arr.shape[:2]
            pos = p.get("position", "lower")
            y = int(H * {"top": 0.12, "middle": 0.44, "lower": 0.70}.get(pos, 0.70))
            x = int(W * 0.06) if p.get("style") == "lower" else (W - w) // 2
            self.items.append((start, end, arr, x, y, p.get("transition", "fade")))

    def at(self, t: float):
        out = []
        for start, end, arr, x, y, tr in self.items:
            if t < start or t > end:
                continue
            d = 0.18 if tr == "pop" else 0.35
            r = max(0.0, min(1.0, (t - start) / d, (end - t) / d))
            dy = int((1 - r) * 46 * self.W / 1080) if tr == "slide" else 0
            out.append((arr, x, y + dy, r))
        return out



def split_frame(frame, src_w, src_h, W, H, split, gap, interp):
    """Stack two crops of one shot: the person at split[0] on top, split[1] below, with a thin gap."""
    g = int(round((gap if gap is not None else 8) * W / 1080)) // 2 * 2
    ph = (H - g) // 2
    out = np.zeros((H, W, 3), dtype=np.uint8)
    cw = min(src_w, int(src_h * W / ph) // 2 * 2)  # crop width that fills each half at full height
    for k, cx in enumerate(split):
        x0 = int(round(cx * src_w - cw / 2))
        x0 = max(0, min(src_w - cw, x0))
        part = cv2.resize(frame[:, x0:x0 + cw], (W, ph), interpolation=interp)
        y = 0 if k == 0 else ph + g
        out[y:y + ph] = part
    return out


# ---------------------------------------------------------------- studio look
# Quick lighting passes, matched by the clip editor's preview (src/ui/studioLook.js).
LOOKS = {
    "none": {},
    "clean": {"contrast": 1.06, "sat": 1.06},
    "warm": {"warm": 0.05, "sat": 1.06, "contrast": 1.04},
    "cool": {"warm": -0.045, "contrast": 1.04},
    "bright": {"gamma": 0.86, "lift": 0.03},
    "punchy": {"contrast": 1.16, "sat": 1.18},
    "film": {"contrast": 0.92, "lift": 0.06, "gain": 0.96, "warm": 0.025, "sat": 0.88},
    "soft": {"contrast": 0.9, "lift": 0.05, "sat": 0.94},
    "mono": {"sat": 0.0, "contrast": 1.1},
}


def look_tables(look):
    """Per-channel 256-step tables (B, G, R) and a saturation amount for a look, a strength and a lighting lift."""
    if not look:
        return None
    spec = LOOKS.get(look.get("preset") or "none", {})
    k = max(0.0, min(1.0, float(look.get("strength", 1.0))))
    lift_amt = max(0.0, min(1.0, float(look.get("light", 0.0))))
    if not spec and lift_amt <= 0:
        return None
    x = np.linspace(0, 1, 256, dtype=np.float32)
    y = spec.get("lift", 0.0) + (spec.get("gain", 1.0) - spec.get("lift", 0.0)) * x
    y = np.clip(y, 0, 1) ** spec.get("gamma", 1.0)
    y = (y - 0.5) * spec.get("contrast", 1.0) + 0.5
    if lift_amt > 0:  # lighting lift: brighten shadows and midtones, keep highlights from clipping
        y = 1 - (1 - np.clip(y, 0, 1)) ** (1 + lift_amt * 0.9)
    warm = spec.get("warm", 0.0)
    chans = []
    for c, w in (("b", -warm), ("g", warm * 0.25), ("r", warm)):
        t = np.clip(y + w * (1 - np.abs(2 * y - 1)) * 1.6, 0, 1)
        t = x + (t - x) * (k if spec else 1.0)  # strength mixes toward the original
        chans.append(np.clip(t * 255 + 0.5, 0, 255).astype(np.uint8))
    sat = 1.0 + (spec.get("sat", 1.0) - 1.0) * k
    return np.dstack(chans).reshape(1, 256, 3), sat


def apply_look(img, tables):
    lut, sat = tables
    out = cv2.LUT(img, lut)
    if abs(sat - 1.0) > 0.01:
        gray = cv2.cvtColor(cv2.cvtColor(out, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
        out = cv2.addWeighted(out, sat, gray, 1.0 - sat, 0)
    return out


def blur_weights(W, H):
    """Where the speaker usually is in the frame stays sharp; the edges soften. 1 = sharp, 0 = blurred."""
    m = np.zeros((H, W), np.float32)
    cv2.ellipse(m, (W // 2, int(H * 0.44)), (int(W * 0.36), int(H * 0.4)), 0, 0, 360, 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), max(W, H) * 0.08)
    return m


def apply_blur(img, weights, amount):
    h, w = img.shape[:2]
    small = cv2.resize(img, (max(2, w // 6), max(2, h // 6)), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 1.0 + 4.0 * amount)
    soft = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
    return cv2.blendLinear(img, soft, weights, 1.0 - weights)

# ---------------------------------------------------------------- render

def encoder_args(preview: bool, codec: str = "h264", mbps: float = 12.0) -> list[str]:
    rate = f"{4 if preview else mbps:g}M"
    if sys.platform == "darwin" and not os.environ.get("SC_SOFTWARE_ENCODER"):
        if codec == "hevc":
            return ["-c:v", "hevc_videotoolbox", "-b:v", rate, "-tag:v", "hvc1", "-allow_sw", "1"]
        return ["-c:v", "h264_videotoolbox", "-b:v", rate, "-allow_sw", "1"]
    if codec == "hevc":
        return ["-c:v", "libx265", "-preset", "fast", "-b:v", rate, "-tag:v", "hvc1"]
    return ["-c:v", "libx264", "-preset", "veryfast" if preview else "medium", "-b:v", rate, "-maxrate", rate, "-bufsize", f"{2 * (4 if preview else mbps):g}M"]


def main() -> None:
    job = json.loads(Path(sys.argv[1]).read_text())
    track_only = "--track-only" in sys.argv
    src, start, end = job["source"], float(job["start"]), float(job["end"])
    dur = end - start
    fps = float(job.get("fps", 30))
    preview = bool(job.get("preview"))
    W, H = int(job.get("width", 1080)), int(job.get("height", 1920))
    if preview:
        W, H = W // 4 * 2, H // 4 * 2
    crop = job.get("crop") or {"mode": "auto"}
    mode = crop.get("mode", "auto")
    try:
        src_w, src_h = probe_size(src)
    except Exception:  # audio only: there is no picture to read
        src_w, src_h = W, H
        mode = "lyric"
    if mode == "lyric":
        src_w, src_h = W, H

    crop_w = min(src_w, int(src_h * W / H) // 2 * 2)
    crop_frac = crop_w / src_w
    n_frames = max(1, int(round(dur * fps)))

    # ---- 1. camera path
    info = {"mode": mode}
    follow = glide = None
    if mode == "auto" and crop_frac < 0.98 and mode != "lyric":
        picks = pick_speaker(detect_faces(src, start, dur, src_w, src_h), crop.get("anchors"), job.get("speakerPrior"))
        follow, f_info = camera_path(picks, n_frames, fps, crop_frac)
        glide, g_info = glide_path(picks, n_frames, fps, crop_frac)
        # 0 = follow closely, 1 = one smooth glide; anything between blends the two paths.
        smooth = crop.get("smooth")
        if smooth is None:
            smooth = 1.0 if crop.get("motion") == "glide" else 0.0
        smooth = max(0.0, min(1.0, float(smooth)))
        path = follow * (1 - smooth) + glide * smooth
        info.update(f_info)
        info["smooth"] = smooth
        info["picks"] = [[round(p[0], 2), None if p[1] is None else round(p[1], 4)] for p in picks]
        if info.get("fallback"):
            info["note"] = "No steady face found; centred crop used."
    elif mode == "cues":
        path = cue_path(crop.get("cues"), n_frames, fps, float(crop.get("x", 0.5)))
    elif mode == "manual":
        path = np.full(n_frames, float(crop.get("x", 0.5)))
    else:
        path = np.full(n_frames, 0.5)
    half = crop_frac / 2
    path = np.clip(path, half, 1 - half)
    # Two speakers: where each person sits across the shot (0 left .. 1 right), top first.
    split = [float(v) for v in (crop.get("split") or [0.3, 0.7])][:2]

    if job.get("trackOut"):
        step = max(1, int(fps / 6))
        half_ = crop_frac / 2
        pack = lambda arr: [round(float(v), 4) for v in np.clip(arr, half_, 1 - half_)[::step]]
        Path(job["trackOut"]).write_text(json.dumps({
            "fps": fps / step, "cropFrac": crop_frac, "x": pack(path),
            "follow": pack(follow) if follow is not None else None,
            "glide": pack(glide) if glide is not None else None, "info": info,
        }))
    if track_only:
        progress(100, "Tracked")
        print(json.dumps(info))
        return

    # ---- 2. cuts + captions
    keep = job.get("keep") or [[0.0, dur]]
    keep = [(max(0.0, float(s)), min(dur, float(e))) for s, e in keep if float(e) > float(s)]
    out_len = sum(e - s for s, e in keep)
    words = remap_words(job.get("words", []), start, keep)
    theme = job["theme"]
    caps = Captions(words, theme, W, H, job.get("hook"), out_len, job.get("hookY")) if (job.get("captions", True) or job.get("hook")) else None
    if caps and not job.get("captions", True):
        caps.events = []  # hook only

    tmp = Path(tempfile.mkdtemp(prefix="sc-render-"))
    audio_in: list[str] = []
    if has_audio(src):
        audio = tmp / "audio.m4a"
        expr = "+".join(f"between(t,{s:.3f},{e:.3f})" for s, e in keep)
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src, "-vn",
             "-af", f"aselect='{expr}',asetpts=N/SR/TB" + (f",{job['audioFilter']}" if job.get("audioFilter") else "")
             + f",afade=t=in:d=0.05,afade=t=out:st={max(0, out_len - 0.12):.3f}:d=0.12",
             "-c:a", "aac", "-b:a", "192k", str(audio)],
            check=True,
        )
        audio_in = ["-i", str(audio)]

    # Graphics from the brand library: a logo/bug in a corner, and an end card for the last seconds.
    overlay = None
    ov = job.get("overlay") or {}
    if ov.get("file") and os.path.exists(ov["file"]):
        img = Image.open(ov["file"]).convert("RGBA")
        ow = max(16, int(W * float(ov.get("size", 0.18))))
        img = img.resize((ow, max(1, int(img.height * ow / img.width))), Image.LANCZOS)
        arr = np.array(img)
        m = int(W * 0.045)
        corner = ov.get("corner", "tr")
        ox = m if corner in ("tl", "bl") else W - arr.shape[1] - m
        oy = m + int(H * 0.02) if corner in ("tl", "tr") else H - arr.shape[0] - m - int(H * 0.06)
        overlay = (arr, ox, oy, float(ov.get("opacity", 1.0)))
    def load_card(cfg):
        if not (cfg.get("file") and os.path.exists(cfg["file"])):
            return None
        from PIL import ImageOps
        src_card = Image.open(cfg["file"]).convert("RGBA")
        if abs(src_card.width / src_card.height - W / H) < 0.08:
            card = ImageOps.fit(src_card, (W, H), Image.LANCZOS)
        else:  # different shape: show all of it, filling the rest with the graphic's own edge color
            edge = src_card.getpixel((2, 2))
            card = ImageOps.pad(src_card, (W, H), Image.LANCZOS, color=(edge[0], edge[1], edge[2], 255))
        return (np.array(card), max(0.5, float(cfg.get("seconds", 3))), cfg.get("motion", "fade"))

    end_card = load_card(job.get("endCard") or {})
    intro_card = load_card(job.get("introCard") or {})

    def card_at(card, local, entering):
        """A full-screen card mid-transition: fade, slide or a gentle zoom. local runs 0..1 over the move."""
        arr, _, motion = card
        r = max(0.0, min(1.0, local))
        if motion == "slide":
            dy = int((1 - r) * H * 0.12) if entering else int(-(1 - r) * H * 0.12)
            return arr, 0, dy, r
        if motion == "zoom":
            sc = 1.0 + (1 - r) * 0.06
            big = cv2.resize(arr, (int(W * sc), int(H * sc)), interpolation=cv2.INTER_LINEAR)
            ox, oy = (big.shape[1] - W) // 2, (big.shape[0] - H) // 2
            return big[oy:oy + H, ox:ox + W], 0, 0, r
        return arr, 0, 0, r

    out = job["out"]
    enc = subprocess.Popen(
        [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps),
         "-i", "-", *audio_in, "-map", "0:v", *(["-map", "1:a"] if audio_in else []),
         *encoder_args(preview, job.get("codec", "h264"), float(job.get("mbps", 12))), "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", "-shortest", out],
        stdin=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    lyric = Lyric((job.get("lyric") or {}).get("colors"), W, H) if mode == "lyric" else None
    look = job.get("look") or None
    look_t = look_tables(look) if mode != "lyric" else None
    blur_amt_bg = max(0.0, min(1.0, float((look or {}).get("blur", 0) or 0)))
    blur_w = blur_weights(W, H) if blur_amt_bg > 0.01 and mode in ("auto", "manual", "cues") else None
    pops = Popups(job.get("popups"), W, H, theme, (job.get("lyric") or {}).get("colors", ["#D9A441"])[1] if len((job.get("lyric") or {}).get("colors", [])) > 1 else "#D9A441")
    dec = None if lyric else subprocess.Popen(
        [FFMPEG, "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src, "-an",
         "-vf", f"fps={fps}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    size = src_w * src_h * 3
    n = 0
    written = 0
    render_began = time.time()
    thumb = None
    fit = mode in ("fit", "stack3")
    bg_cfg = crop.get("bg") or {"type": "blur"}
    bg_color = np.array([int(str(bg_cfg.get("color", "#000000")).lstrip("#")[i:i + 2], 16) for i in (4, 2, 0)], dtype=np.uint8)  # BGR
    blur_amt = float(bg_cfg.get("blur", 0.6))
    gap = int(float(crop.get("gap", 18)) * W / 1080)
    interp = cv2.INTER_LINEAR if preview else cv2.INTER_CUBIC
    try:
        while True:
            if lyric:
                if written >= int(round(out_len * fps)):
                    break
                frame = None
            else:
                buf = dec.stdout.read(size)
                if len(buf) < size:
                    break
                t = n / fps
                n += 1
                if not in_keep(t, keep):
                    continue
                frame = np.frombuffer(buf, dtype=np.uint8).reshape(src_h, src_w, 3)
            if lyric:
                img = lyric.frame(written / fps)
            elif fit:
                if bg_cfg.get("type") == "color":
                    bg = np.empty((H, W, 3), dtype=np.uint8)
                    bg[:] = bg_color
                else:  # blurred "cover" copy of the video itself
                    cover_w = max(W // 4, int(src_w * (H // 4) / src_h))
                    small = cv2.resize(frame, (cover_w, H // 4), interpolation=cv2.INTER_AREA)
                    xo = (cover_w - W // 4) // 2
                    bg = cv2.GaussianBlur(small[:, xo:xo + W // 4], (0, 0), max(0.5, 14 * blur_amt))
                    bg = (cv2.resize(bg, (W, H)) * (0.9 - 0.25 * blur_amt)).astype(np.uint8)
                    if mode == "stack3":  # same background above and below: mirror the top half down
                        half = H // 2
                        bg[H - half:] = bg[:half][::-1]
                if mode == "stack3":  # the whole frame, three times, stacked
                    ph = int(W * src_h / src_w) // 2 * 2
                    pw = W
                    if 3 * ph + 2 * gap > H:  # square/landscape outputs: shrink panels to fit
                        ph = (H - 2 * gap) // 3 // 2 * 2
                        pw = int(ph * src_w / src_h) // 2 * 2
                    fg = cv2.resize(frame, (pw, ph), interpolation=interp)
                    y0 = (H - (3 * ph + 2 * gap)) // 2
                    x0 = (W - pw) // 2
                    for k in range(3):
                        y = y0 + k * (ph + gap)
                        bg[y:y + ph, x0:x0 + pw] = fg
                else:
                    fg_h = int(W * src_h / src_w)
                    fg = cv2.resize(frame, (W, fg_h), interpolation=interp)
                    y0 = (H - fg_h) // 2
                    bg[y0:y0 + fg_h] = fg
                img = bg
            elif mode == "split":
                # Two speakers: one on top, one below, each cropped from the same shot.
                img = split_frame(frame, src_w, src_h, W, H, split, float(crop.get("gap", 8)), interp)
            else:
                cx = path[min(n - 1, len(path) - 1)] * src_w
                x0 = int(round(cx - crop_w / 2))
                x0 = max(0, min(src_w - crop_w, x0))
                img = cv2.resize(frame[:, x0:x0 + crop_w], (W, H), interpolation=interp)
            # Studio look: lighting and color on the picture itself, before captions and graphics.
            if look_t is not None:
                img = apply_look(img, look_t)
            if blur_w is not None:
                img = apply_blur(img, blur_w, blur_amt_bg)
            t_out = written / fps
            if caps:
                for arr, x, y, op in caps.at(t_out):
                    blend(img, arr, x, y, op)
            for arr, x, y, op in pops.at(t_out):
                blend(img, arr, x, y, op)
            if overlay:
                blend(img, overlay[0], overlay[1], overlay[2], overlay[3])
            if intro_card and t_out < intro_card[1]:
                # Shows from the start, then moves out over its last 0.4 seconds.
                arr, x, y, op = card_at(intro_card, (intro_card[1] - t_out) / 0.4, False)
                blend(img, arr, x, y, op)
            if end_card and t_out >= out_len - end_card[1]:
                arr, x, y, op = card_at(end_card, (t_out - (out_len - end_card[1])) / 0.4, True)
                blend(img, arr, x, y, op)
            enc.stdin.write(img.tobytes())
            written += 1
            if thumb is None and written >= int(min(1.5, out_len / 2) * fps):
                thumb = img.copy()
            if written % 30 == 0:
                progress(30 + 68 * written / max(1, out_len * fps), "Rendering")
                if written % 90 == 0:
                    took = max(0.001, time.time() - render_began)
                    detail("Frames", f"{written:,} of {int(out_len * fps):,}")
                    detail("Render speed", f"{written / took:.0f} frames a second")
        enc.stdin.close()
        err = enc.stderr.read().decode(errors="replace")
        if enc.wait() != 0:
            raise SystemExit(f"Encoder failed: {err[-800:]}")
    finally:
        if dec:
            dec.stdout.close()
            dec.wait()
        for f in tmp.iterdir():
            f.unlink()
        tmp.rmdir()

    if job.get("thumb") and thumb is not None:
        t = cv2.resize(thumb, (360, 640), interpolation=cv2.INTER_AREA)
        cv2.imwrite(job["thumb"], t, [cv2.IMWRITE_JPEG_QUALITY, 86])
    progress(100, "Done")
    print(json.dumps({**info, "frames": written, "length": round(written / fps, 3), "width": W, "height": H}))


if __name__ == "__main__":
    main()
