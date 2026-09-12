"""
Enrichment worker: opening frames -> visual hook, audio -> spoken hook + transcript.

ffmpeg pulls frames at 0.0s / 0.5s / 1.0s and strips the audio track. Frames go to
Claude vision rather than classical OCR because Instagram text overlays are stylised,
animated and often low-contrast, which is exactly where Tesseract fails; a vision
model also reports what is physically happening in the shot.

Music-only clips are detected and marked rather than transcribed into nonsense —
the Loom hits this case at 2:50, and the UI needs to say "music only", not go blank.

Status: skeleton. See PLAN.md section 5.
"""

from dataclasses import dataclass


@dataclass
class Enrichment:
    visual: str | None
    audio: str | None
    audio_state: str  # "speech" | "music" | "silent" | "unknown"
    body: str | None


def enrich(video_path: str) -> Enrichment:
    # TODO(milestone 4):
    #   1. ffmpeg -ss {0.0,0.5,1.0} -frames:v 1  -> opening frames
    #   2. Claude vision over the frames -> visual hook text + scene description
    #   3. ffmpeg -vn -> wav; faster-whisper -> segments
    #   4. no segments or no_speech_prob high -> audio_state "music"/"silent"
    #   5. first segment -> audio hook; full text -> body
    raise NotImplementedError("Milestone 4.")
