"""Transcribe a 16 kHz mono WAV with word-level timing (faster-whisper). Prints JSON to stdout.

Usage: transcribe.py <wav> [--model small] [--offset 0] [--prompt "names to spell right"]

Progress goes to stderr as "PROGRESS <0-100>" lines. Runs on CUDA when available, otherwise
the CPU with int8 (fine on Apple Silicon). Adapted from VGP Clips scripts/transcribe.py.
"""

import argparse
import json
import sys
import wave


def load_model(name: str):
    from faster_whisper import WhisperModel

    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() > 0:
            return WhisperModel(name, device="cuda", compute_type="float16"), "cuda"
    except Exception:
        pass
    return WhisperModel(name, device="cpu", compute_type="int8"), "cpu"


def load_wav(path: str):
    import numpy as np

    with wave.open(path, "rb") as wav:
        if wav.getframerate() != 16000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise SystemExit("Expected a 16 kHz mono 16-bit WAV.")
        frames = wav.readframes(wav.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("wav")
    parser.add_argument("--model", default="small")
    parser.add_argument("--offset", type=float, default=0.0, help="seconds added to every timestamp")
    parser.add_argument("--prompt", default="")
    parser.add_argument("--language", default="en")
    args = parser.parse_args()

    print("PROGRESS 1 loading model", file=sys.stderr, flush=True)
    model, device = load_model(args.model)
    audio = load_wav(args.wav)
    duration = len(audio) / 16000.0
    segments, info = model.transcribe(
        audio,
        language=args.language or None,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 700},
        initial_prompt=args.prompt or None,
        condition_on_previous_text=False,  # avoids runaway repetition on long services
    )
    words = []
    segs = []
    last = -1
    for segment in segments:
        segs.append({
            "start": round(segment.start + args.offset, 3),
            "end": round(segment.end + args.offset, 3),
            "text": segment.text.strip(),
            "noSpeech": round(segment.no_speech_prob, 3),
        })
        for word in segment.words or []:
            text = word.word.strip()
            if text:
                words.append({
                    "w": text,
                    "start": round(word.start + args.offset, 3),
                    "end": round(word.end + args.offset, 3),
                    "p": round(word.probability, 3),
                })
        pct = int(100 * segment.end / max(duration, 1))
        if pct != last:
            last = pct
            print(f"PROGRESS {pct}", file=sys.stderr, flush=True)

    sys.stdout.reconfigure(encoding="utf-8")
    json.dump({
        "device": device, "model": args.model, "language": info.language,
        "offset": args.offset, "duration": duration, "words": words, "segments": segs,
    }, sys.stdout)


if __name__ == "__main__":
    main()
