"""Luxury "campaign" reel — a 6-beat cinematic structure, the upgrade over the flyer-style
montage in pipeline.py.

Beats (per the approved creative direction):
    1 INVITATION  — quiet establishing shot, "WHET PRESENTS" only
    2 ATMOSPHERE  — fashion/lifestyle, near-empty overlay
    3 ENERGY      — DJ / crowd / night, minimal type
    4 HERO        — the billboard frame, large editorial artist name
    5 INFORMATION — minimal event card (date / location / line-up)
    6 SIGN-OFF    — black, WHET × SNOB logo lockup only

What makes it read as a campaign rather than a promo: one unified film grade across every beat
(grade.apply_grade), staggered type revealed a beat at a time, eased cinematic motion (no linear
zoompan), heavy negative space, and a deliberate slow→fast→slow arc. None of the old flyer
motifs — no polaroid insets, no duotone gradients, no flat title cards.

Assets: pass one image per beat via `beat_images` (the establishing/atmosphere/energy/hero/detail
shots — ideally the 5 Higgsfield shots from HIGGSFIELD_BRIEF.md). Fewer than 5 cycles; the
sign-off never uses a photo (it's a solid ink frame).
"""

from __future__ import annotations

import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

from . import audio as audio_mod
from . import campaign_overlay as ov
from . import grade
from .config import BrandConfig, DEFAULT_BRAND, PartyDetails, WORK_DIR
from .video import Shot, build_clips, build_overlay_track, composite_overlay, crossfade_concat, mux_audio


@dataclass
class Beat:
    kind: str  # invitation | atmosphere | energy | hero | info | signoff
    seconds: float
    motion: str = "push_in_slow"


# The default arc: ~19s, slow bookends, quick energy in the middle, a held hero frame.
def default_beats() -> list[Beat]:
    return [
        Beat("invitation", 3.0, motion="push_in_slow"),
        Beat("atmosphere", 3.0, motion="drift_left"),
        Beat("energy", 1.6, motion="drift_right"),
        Beat("energy", 1.6, motion="push_in_slow"),
        Beat("hero", 4.2, motion="settle"),
        Beat("info", 2.8, motion="static"),
        Beat("signoff", 3.0, motion="static"),
    ]


def _overlay_for(beat: Beat, brand: BrandConfig, party: PartyDetails, hero_name: str) -> Image.Image:
    if beat.kind == "invitation":
        return ov.invitation(brand)
    if beat.kind == "atmosphere":
        return ov.atmosphere(brand)
    if beat.kind == "energy":
        return ov.atmosphere(brand)  # deliberately empty — footage carries it
    if beat.kind == "hero":
        return ov.hero(brand, hero_name)
    if beat.kind == "info":
        return ov.info_card(brand, party)
    if beat.kind == "signoff":
        return ov.sign_off(brand)
    raise ValueError(f"unknown beat kind: {beat.kind}")


def generate_campaign_reel(
    beat_images: list[Path],
    party: PartyDetails,
    brand: BrandConfig = DEFAULT_BRAND,
    audio_track: Path | None = None,
    hero_name: str | None = None,
    beats: list[Beat] | None = None,
    out_path: Path | None = None,
    keep_work_dir: bool = False,
) -> Path:
    if not beat_images:
        raise ValueError("campaign mode needs at least one source image")
    beat_images = [Path(p) for p in beat_images]
    for p in beat_images:
        if not p.exists():
            raise FileNotFoundError(f"Source image not found: {p}")

    beats = beats or default_beats()
    hero_name = hero_name or (party.dj_lineup[0] if party.dj_lineup else party.event_name)

    run_id = time.strftime("campaign_%Y%m%d_%H%M%S")
    work_dir = WORK_DIR / run_id
    work_dir.mkdir(parents=True, exist_ok=True)
    out_path = Path(out_path) if out_path else work_dir / "whet_snob_campaign.mp4"
    grade_dir = work_dir / "graded"

    # Build the per-beat background frames: every photographic beat is run through the same grade;
    # the sign-off is a solid ink frame (never a photo). Photos are drawn round-robin from the
    # provided images, skipping the sign-off.
    photo_iter = _cycle(beat_images)
    shots: list[Shot] = []
    overlay_frames: list[Image.Image] = []
    for i, beat in enumerate(beats):
        if beat.kind == "signoff":
            bg = grade.solid_frame(brand, grade_dir / f"beat_{i}_signoff.png")
        else:
            bg = grade.apply_grade(next(photo_iter), grade_dir / f"beat_{i}.jpg", brand=brand)
        shots.append(Shot(bg, beat.seconds, motion=beat.motion))
        overlay_frames.append(_overlay_for(beat, brand, party, hero_name))

    crossfade = brand.timing.crossfade_seconds
    n = len(shots)

    # Background montage (eased motion + crossfades), then the staggered overlay track on top.
    clips = build_clips(shots, work_dir / "clips", brand.canvas)
    background_path = work_dir / "background.mp4"
    crossfade_concat(clips, background_path, crossfade)
    total_duration = sum(s.duration_s for s in shots) - (n - 1) * crossfade

    overlay_durations = [s.duration_s - (crossfade if i < n - 1 else 0) for i, s in enumerate(shots)]
    overlay_track = build_overlay_track(overlay_frames, overlay_durations, work_dir / "overlay_track", brand.canvas)
    composited_path = work_dir / "composited.mp4"
    composite_overlay(background_path, overlay_track, composited_path)

    audio_path = audio_mod.prepare_track(audio_track, total_duration, work_dir / "audio.wav", genre=party.music_genre)
    mux_audio(composited_path, audio_path, out_path)

    if not keep_work_dir:
        for sub in ("clips", "overlay_track", "graded"):
            shutil.rmtree(work_dir / sub, ignore_errors=True)
        for p in (background_path, composited_path):
            p.unlink(missing_ok=True)

    return out_path


def _cycle(items: list[Path]):
    i = 0
    while True:
        yield items[i % len(items)]
        i += 1
