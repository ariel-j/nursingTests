"""Transcribes media/ videos to words with times and confidence, for scripts/captions.mjs.

    python scripts/transcribe.py <out-dir> <video under media/>...

Writes <out-dir>/<hash of the path>.json = {"video": <path under media/>, "words": [{start, end, word, probability}]}.
Uses ivrit.ai's Hebrew Whisper model (downloaded from Hugging Face on first run) through
faster-whisper, on the CPU (scripts/requirements-captions.txt). A terms.md in the subject or topic
folder primes the model with its terms. Only the deploy workflow needs this.
"""
import hashlib
import json
import os
import sys
from pathlib import Path

from faster_whisper import WhisperModel

# WHISPER_MODEL may point at a local copy of the model instead.
MODEL = os.environ.get("WHISPER_MODEL", "ivrit-ai/whisper-large-v3-turbo-ct2")
MEDIA = Path(__file__).resolve().parent.parent / "media"


def terms(video):
    """The terms.md text of the video's subject folder and topic folder (headings and notes dropped)."""
    parts = Path(video).parts[:-1]
    lines = []
    for depth in range(1, len(parts) + 1):
        f = MEDIA.joinpath(*parts[:depth], "terms.md")
        if f.is_file():
            lines += [l.strip() for l in f.read_text(encoding="utf-8").splitlines() if any("\u0590" <= c <= "\u05ff" for c in l)]
    return " ".join(lines) or None


def main(out_dir, videos):
    """Transcribes each video; one that fails is reported and skipped. Returns the exit code."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    failed = 0
    for video in videos:
        try:
            segments, info = model.transcribe(
                str(MEDIA / video), language="he", word_timestamps=True, vad_filter=True, beam_size=5,
                initial_prompt=terms(video),
            )
            words = [
                {"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word, "probability": round(w.probability, 3)}
                for s in segments
                for w in s.words
            ]
        except Exception as err:  # a broken file: the others still get captions
            print(f"media/{video}: transcription failed: {err}", file=sys.stderr, flush=True)
            failed += 1
            continue
        name = hashlib.sha1(video.encode()).hexdigest()[:12]
        (out / f"{name}.json").write_text(json.dumps({"video": video, "words": words}, ensure_ascii=False), encoding="utf-8")
        print(f"media/{video}: {len(words)} words, {info.duration:.0f}s", file=sys.stderr, flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2:]))
