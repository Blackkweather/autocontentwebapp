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

from PIL import Image

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


def make_static_clip(image_path: Path, out_path: Path, duration_s: float, canvas: Canvas) -> Path:
    """No zoom/pan — a plain cover-cropped still held for the clip's duration. Used for the
    title-card cut and any background shot that should read as a still photo rather than motion,
    matching how static the reference's cuts mostly are (no aggressive Ken Burns)."""
    # xfade requires every input to share the same timebase — fps must be pinned explicitly here
    # (zoompan already bakes fps into its own filter for the Ken Burns clips; a plain scale/crop
    # chain has no framerate opinion of its own and would otherwise default to 25fps and break
    # crossfade_concat's xfade chain with a timebase mismatch).
    vf = f"scale={canvas.width}:{canvas.height}:force_original_aspect_ratio=increase,crop={canvas.width}:{canvas.height},fps={canvas.fps},format=yuv420p"
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
        if motion == "static":
            make_static_clip(shot.image_path, out_path, shot.duration_s, canvas)
        else:
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


# ── Fixed overlay compositing (the "Summer Reunion" reference style) ───────────────────────
# The background reel above (Ken Burns / static cuts + crossfades) plays underneath one
# constant text/branding layer for its entire runtime — see overlay.py for why that layer needs
# to change color at cut boundaries without moving. `build_overlay_track` renders each segment's
# recolored frame as a lossless-alpha QuickTime clip (qtrle — h264/mp4 has no alpha channel) and
# concatenates them; `composite_overlay` then lays that track over the background video with
# ffmpeg's `overlay` filter.
def build_overlay_track(frames: list[Image.Image], durations: list[float], work_dir: Path, canvas: Canvas) -> Path:
    if len(frames) != len(durations):
        raise ValueError("frames and durations must be the same length")
    work_dir.mkdir(parents=True, exist_ok=True)
    segment_paths: list[Path] = []
    for i, (frame, duration) in enumerate(zip(frames, durations)):
        png_path = work_dir / f"overlay_{i:02d}.png"
        frame.save(png_path)
        mov_path = work_dir / f"overlay_{i:02d}.mov"
        cmd = [
            "ffmpeg", "-y", "-loop", "1", "-i", str(png_path),
            "-t", f"{duration:.3f}",
            "-c:v", "qtrle", "-pix_fmt", "argb",
            "-r", str(canvas.fps),
            str(mov_path),
        ]
        _run(cmd)
        segment_paths.append(mov_path)

    if len(segment_paths) == 1:
        return segment_paths[0]

    list_file = work_dir / "overlay_concat.txt"
    list_file.write_text("".join(f"file '{p.resolve()}'\n" for p in segment_paths))
    track_path = work_dir / "overlay_track.mov"
    cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c:v", "qtrle", "-pix_fmt", "argb",
        str(track_path),
    ]
    _run(cmd)
    return track_path


def composite_overlay(background_path: Path, overlay_track_path: Path, out_path: Path) -> Path:
    cmd = [
        "ffmpeg", "-y",
        "-i", str(background_path),
        "-i", str(overlay_track_path),
        "-filter_complex", "[0:v][1:v]overlay=0:0:shortest=1[v]",
        "-map", "[v]",
        "-pix_fmt", "yuv420p",
        str(out_path),
    ]
    _run(cmd)
    return out_path
