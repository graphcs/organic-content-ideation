#!/usr/bin/env python3
"""
Enrichment worker: opening frames -> visual hook, audio -> spoken hook + transcript.

Reads the same SQLite file the UI and the CLI use, fills in whatever the harvester
could not get from the feed payload, and writes it back. Posts a human has edited
are skipped, because a human edit outranks anything re-extraction has to say.

Two deliberate choices:

  * Frames go to Claude vision rather than Tesseract. Instagram text overlays are
    stylised, animated and often low-contrast over video, which is exactly where
    classical OCR falls apart. A vision model also describes what is happening in
    the shot, which is half of why a hook works and something OCR cannot give you.

  * Music-only clips are detected and marked rather than transcribed into nonsense.
    The Loom hits this case ("if we listen to it, it's just music, so we don't need
    that"), and the interface has to say "music only" instead of going blank.

Usage:  python3 scraper/enrich.py [--limit 10] [--force]
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path

DB_PATH = Path("data.db")
FRAME_OFFSETS = (0.0, 0.5, 1.0)

VISION_PROMPT = (
    "This is the opening frame of an Instagram reel. "
    "Return JSON with two keys: `text`, the exact on-screen text verbatim including its "
    "capitalisation, or null if there is none; and `scene`, one short sentence describing "
    "what is physically happening in the shot. Return only the JSON object."
)


@dataclass
class Enrichment:
    visual: str | None
    audio: str | None
    audio_state: str  # "speech" | "music" | "silent" | "unknown"
    body: str | None


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, capture_output=True)


def fetch_video(url: str, dest: Path) -> bool:
    """Instagram CDN URLs are signed and short-lived. A stale one is not an error."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as res, dest.open("wb") as out:
            out.write(res.read())
        return dest.stat().st_size > 0
    except Exception as err:  # noqa: BLE001 — any failure here means "skip this post"
        print(f"    could not fetch video: {err}")
        return False


def extract_frames(video: Path, workdir: Path) -> list[Path]:
    frames = []
    for i, offset in enumerate(FRAME_OFFSETS):
        out = workdir / f"frame{i}.jpg"
        try:
            run(["ffmpeg", "-y", "-ss", str(offset), "-i", str(video), "-frames:v", "1", "-q:v", "3", str(out)])
            if out.exists() and out.stat().st_size > 0:
                frames.append(out)
        except subprocess.CalledProcessError:
            pass  # clip shorter than the offset
    return frames


def read_visual_hook(frames: list[Path]) -> str | None:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key or not frames:
        return None

    try:
        import anthropic
    except ImportError:
        print("    anthropic package not installed — skipping visual hook")
        return None

    client = anthropic.Anthropic(api_key=key)
    content: list[dict] = [{"type": "text", "text": VISION_PROMPT}]
    for frame in frames[:2]:
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64.b64encode(frame.read_bytes()).decode(),
                },
            }
        )

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": content}],
        )
        raw = msg.content[0].text.strip()
        raw = raw[raw.find("{") : raw.rfind("}") + 1]
        return json.loads(raw).get("text") or None
    except Exception as err:  # noqa: BLE001
        print(f"    vision call failed: {err}")
        return None


def transcribe(video: Path, workdir: Path) -> tuple[str | None, str, str | None]:
    """Returns (first spoken line, audio_state, full transcript)."""
    wav = workdir / "audio.wav"
    try:
        run(["ffmpeg", "-y", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000", str(wav)])
    except subprocess.CalledProcessError:
        return None, "silent", None

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("    faster-whisper not installed — skipping audio hook")
        return None, "unknown", None

    model = WhisperModel(os.environ.get("WHISPER_MODEL", "base.en"), compute_type="int8")
    segments, _ = model.transcribe(str(wav), vad_filter=True)
    segments = list(segments)

    # A music bed with no speech produces either nothing or a couple of very
    # low-confidence fragments. Both are "music", not a transcript.
    speech = [s for s in segments if getattr(s, "no_speech_prob", 0.0) < 0.6 and s.text.strip()]
    if not speech:
        return None, "music", None

    text = " ".join(s.text.strip() for s in speech)
    first = speech[0].text.strip()
    return first, "speech", text


def enrich_video(url: str) -> Enrichment:
    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        video = workdir / "clip.mp4"
        if not fetch_video(url, video):
            return Enrichment(None, None, "unknown", None)

        visual = read_visual_hook(extract_frames(video, workdir))
        audio, state, body = transcribe(video, workdir)
        return Enrichment(visual, audio, state, body)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--force", action="store_true", help="re-extract posts that already have hooks")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print("No data.db. Run `npm run db:push && npm run seed` first.")
        return 1

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    rows = db.execute(
        """
        SELECT p.id, p.shortcode, p.videoUrl, h.visual, h.editedByUser
        FROM Post p LEFT JOIN Hook h ON h.postId = p.id
        WHERE p.videoUrl IS NOT NULL AND p.videoUrl != ''
          AND COALESCE(h.editedByUser, 0) = 0
        LIMIT ?
        """,
        (args.limit,),
    ).fetchall()

    todo = [r for r in rows if args.force or not r["visual"]]
    if not todo:
        print("Nothing to enrich. Every post with a video already has hooks.")
        return 0

    print(f"Enriching {len(todo)} posts…")
    for row in todo:
        print(f"  {row['shortcode']}")
        result = enrich_video(row["videoUrl"])
        db.execute(
            """
            INSERT INTO Hook (id, postId, visual, audio, audioState, body, editedByUser, extractedAt, updatedAt)
            VALUES (lower(hex(randomblob(12))), ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
            ON CONFLICT(postId) DO UPDATE SET
              visual = excluded.visual,
              audio = excluded.audio,
              audioState = excluded.audioState,
              body = excluded.body,
              extractedAt = excluded.extractedAt,
              updatedAt = excluded.updatedAt
            """,
            (row["id"], result.visual, result.audio, result.audio_state, result.body),
        )
        db.commit()
        print(f"    visual: {result.visual or '—'}")
        print(f"    audio:  {result.audio_state}")

    db.close()
    print("\nDone. Refresh the app.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
