"""Step 3 — Video Assembly & Transitions.

Two-phase ffmpeg pipeline, both phases run as subprocess calls (no python video library
dependency — ffmpeg is the one binary this whole automation assumes is on PATH):

1. Each still (the original photo, the AI-expanded variations, the poster frame) becomes its
   own short Ken Burns clip via `zoompan` — slow zoom/pan so a static frame reads as motion.
2. The clips are chained with `xfade` crossfades (quick, <0.4s — "quick cuts" energy, not slow
   dissolves) into one continuous reel, then muxed against the prepared audio track.
"""

from __future__ import annotations

import itertools
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import Canvas

# Rotated across clips for visual variety — "quick cuts, zooms" per the brief. `circleopen` and
# `slideleft` read as more energetic than a plain dissolve; `fadeblack` is kept in the mix for a
# hard flash-cut moment (useful right before the poster frame).
TRANSITIONS = ["fade", "slideleft", "circleopen", "fadeblack", "slideright", "fade"]

# Ken Burns motion styles, rotated per clip so the reel doesn't repeat the same zoom every cut.
MOTION_STYLES = ["zoom_in_center", "pan_lr", "zoom_in_pan_up", "pan_rl"]


@dataclass
class Shot:
    image_path: Path
    duration_s: float
    motion: str | None = None  # picked round-robin if None


def _run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg command failed:\n{' '.join(cmd)}\n\n{proc.stderr[-4000:]}")


def _zoompan_expr(motion: str, frames: int) -> tuple[str, str, str]:
    """Returns (zoom_expr, x_expr, y_expr) for ffmpeg's zoompan filter."""
    if motion == "zoom_in_center":
        z = "if(lte(zoom,1.0),1.06,min(zoom+0.0014,1.35))"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"
    elif motion == "zoom_in_pan_up":
        z = "if(lte(zoom,1.0),1.12,min(zoom+0.0016,1.4))"
        x = "iw/2-(iw/zoom/2)"
        y = f"(ih/2-(ih/zoom/2))*(1-0.5*on/{frames})"
    elif motion == "pan_lr":
        z = "1.18"
        x = f"(iw-iw/zoom)*(on/{frames})"
        y = "ih/2-(ih/zoom/2)"
    elif motion == "pan_rl":
        z = "1.18"
        x = f"(iw-iw/zoom)*(1-on/{frames})"
        y = "ih/2-(ih/zoom/2)"
    else:
        raise ValueError(f"Unknown motion style: {motion}")
    return z, x, y


def make_ken_burns_clip(image_path: Path, out_path: Path, duration_s: float, canvas: Canvas, motion: str) -> Path:
    frames = max(round(duration_s * canvas.fps), 2)
    z, x, y = _zoompan_expr(motion, frames)
    # Oversample the source well above target resolution before zoompan crops into it — zoompan
    # samples the *source* pixels per output frame, so an under-scaled source makes the zoomed-in
    # tail visibly soft.
    oversample_w = canvas.width * 3
    oversample_h = canvas.height * 3
    vf = (
        f"scale={oversample_w}:{oversample_h}:force_original_aspect_ratio=increase,"
        f"crop={oversample_w}:{oversample_h},"
        f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={canvas.width}x{canvas.height}:fps={canvas.fps},"
        f"format=yuv420p"
    )
    cmd = [
        "ffmpeg", "-y", "-loop", "1", "-i", str(image_path),
        "-vf", vf,
        "-t", f"{duration_s:.3f}",
        "-an",
        str(out_path),
    ]
    _run(cmd)
    return out_path


def build_clips(shots: list[Shot], work_dir: Path, canvas: Canvas) -> list[tuple[Path, float]]:
    work_dir.mkdir(parents=True, exist_ok=True)
    motions = itertools.cycle(MOTION_STYLES)
    clips: list[tuple[Path, float]] = []
    for i, shot in enumerate(shots):
        motion = shot.motion or next(motions)
        out_path = work_dir / f"clip_{i:02d}.mp4"
        make_ken_burns_clip(shot.image_path, out_path, shot.duration_s, canvas, motion)
        clips.append((out_path, shot.duration_s))
    return clips


def crossfade_concat(clips: list[tuple[Path, float]], out_path: Path, crossfade_s: float) -> float:
    """Chains clips with xfade transitions. Returns the resulting total duration (seconds)."""
    if len(clips) == 1:
        _run(["ffmpeg", "-y", "-i", str(clips[0][0]), "-c", "copy", str(out_path)])
        return clips[0][1]

    inputs: list[str] = []
    for path, _ in clips:
        inputs += ["-i", str(path)]

    filter_parts = []
    label = "0:v"
    running_total = clips[0][1]
    for i in range(1, len(clips)):
        transition = TRANSITIONS[(i - 1) % len(TRANSITIONS)]
        offset = running_total - crossfade_s
        next_label = f"v{i}"
        filter_parts.append(
            f"[{label}][{i}:v]xfade=transition={transition}:duration={crossfade_s:.3f}:offset={offset:.3f}[{next_label}]"
        )
        label = next_label
        running_total = running_total + clips[i][1] - crossfade_s

    filter_complex = ";".join(filter_parts)
    cmd = [
        "ffmpeg", "-y", *inputs,
        "-filter_complex", filter_complex,
        "-map", f"[{label}]",
        "-pix_fmt", "yuv420p",
        str(out_path),
    ]
    _run(cmd)
    return running_total


def mux_audio(video_path: Path, audio_path: Path, out_path: Path) -> Path:
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(audio_path),
        "-map", "0:v", "-map", "1:a",
        "-c:v", "libx264", "-preset", "medium", "-crf", "19",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        str(out_path),
    ]
    _run(cmd)
    return out_path


def assemble_reel(shots: list[Shot], audio_path: Path, out_path: Path, work_dir: Path, canvas: Canvas, crossfade_s: float = 0.35) -> Path:
    clips = build_clips(shots, work_dir, canvas)
    concat_path = work_dir / "concat.mp4"
    crossfade_concat(clips, concat_path, crossfade_s)
    mux_audio(concat_path, audio_path, out_path)
    return out_path
