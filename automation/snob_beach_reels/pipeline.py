"""Orchestrates the full reel: image expansion -> background hard-cut montage (duotone
recolors + AI-expanded angles + a text-only title card) -> a fixed text/branding overlay
composited over the whole runtime -> audio. Matches the "Summer Reunion" reference style: one
constant overlay, color-rotating headline, footage cutting underneath it — see overlay.py and
video.py's overlay-track functions for the mechanics.

`generate_reel` is the whole automation described in the brief; cli.py is a thin
argument-parsing wrapper around it.
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path

from . import audio as audio_mod
from . import frames as frames_mod
from . import overlay as overlay_mod
from . import providers
from . import scenes
from .config import BrandConfig, DEFAULT_BRAND, PartyDetails, WORK_DIR
from .video import Shot, build_clips, composite_overlay, crossfade_concat, build_overlay_track, mux_audio

MOTION_ROTATION = ["zoom_in_center", "pan_lr", "zoom_in_pan_up", "pan_rl"]


def _segment_durations(n_shots: int, title_card_index: int, brand: BrandConfig) -> list[float]:
    """Every shot gets an even hold except the title card, which is shorter (a quick breather
    beat rather than a full cut) — solved so the crossfaded total lands exactly on
    brand.timing.total_seconds."""
    timing = brand.timing
    crossfade_budget = (n_shots - 1) * timing.crossfade_seconds
    n_regular = n_shots - 1
    remaining = timing.total_seconds + crossfade_budget - timing.title_card_seconds
    each = max(remaining / n_regular, 0.9) if n_regular else timing.total_seconds
    return [timing.title_card_seconds if i == title_card_index else each for i in range(n_shots)]


def generate_reel(
    source_image: Path,
    party: PartyDetails,
    brand: BrandConfig = DEFAULT_BRAND,
    audio_track: Path | None = None,
    image_provider_name: str | None = None,
    variation_count: int = 3,
    out_path: Path | None = None,
    keep_work_dir: bool = False,
) -> Path:
    source_image = Path(source_image)
    if not source_image.exists():
        raise FileNotFoundError(f"Source image not found: {source_image}")

    run_id = time.strftime("run_%Y%m%d_%H%M%S")
    work_dir = WORK_DIR / run_id
    work_dir.mkdir(parents=True, exist_ok=True)
    out_path = Path(out_path) if out_path else work_dir / "snob_beach_reel.mp4"

    # Step 1 — image analysis & expansion.
    provider = providers.get_provider(image_provider_name)
    variations_dir = work_dir / "variations"
    variations = provider.generate_variations(source_image, variations_dir, count=variation_count)

    # Background montage: two duotone recolors of the source (the reference's color-cycle beat
    # on one shot), each AI-expanded angle, and one text-only title card (the reference's plain
    # breather cut) — in that narrative order.
    scenes_dir = work_dir / "scenes"
    scenes_dir.mkdir(parents=True, exist_ok=True)
    duotone_a = scenes.duotone(source_image, brand.colors.ink, brand.colors.magenta, scenes_dir / "duotone_a.png", brand=brand)
    duotone_b = scenes.duotone(source_image, brand.colors.ink, brand.colors.yellow, scenes_dir / "duotone_b.png", brand=brand)
    card = scenes.title_card(brand, scenes_dir / "title_card.png")

    # Small picture-frame insets — a second real photo composited as a bordered card onto the
    # duotone cuts, echoing the reference video's picture-within-picture (TV/phone screen)
    # moments. The duotone shots are the ones stripped of their own color, so they're what gets
    # an inset of an actual photo; the AI-expanded shots and title card are full photos/text
    # already and don't need one.
    inset_for_a = source_image  # the real, unfiltered source photo inset over its own duotone
    inset_for_b = variations[0] if variations else source_image
    framed_a = frames_mod.add_picture_frame(
        duotone_a, inset_for_a, scenes_dir / "framed_a.png",
        box=frames_mod.safe_inset_box(brand, cx_ratio=0.68), rotation=-6,
    )
    framed_b = frames_mod.add_picture_frame(
        duotone_b, inset_for_b, scenes_dir / "framed_b.png",
        box=frames_mod.safe_inset_box(brand, cx_ratio=0.32), rotation=5,
    )

    background_images = [framed_a, framed_b, *variations]
    title_card_index = len(background_images)  # appended after the photo cuts, before any trailing variations
    background_images.append(card)

    n_shots = len(background_images)
    durations = _segment_durations(n_shots, title_card_index, brand)
    motions = [
        "static" if i == title_card_index else MOTION_ROTATION[i % len(MOTION_ROTATION)] for i in range(n_shots)
    ]
    shots = [Shot(img, dur, motion=motion) for img, dur, motion in zip(background_images, durations, motions)]

    # Step 3a — background-only montage (Ken Burns / static cuts, hard crossfades between them).
    clips = build_clips(shots, work_dir / "clips", brand.canvas)
    background_path = work_dir / "background.mp4"
    crossfade_concat(clips, background_path, brand.timing.crossfade_seconds)
    total_duration = sum(d for d in durations) - (n_shots - 1) * brand.timing.crossfade_seconds

    # Step 2 — the fixed text/branding overlay, recolored per cut, composited over the whole
    # background montage (never moves, matches every cut's duration/order above).
    static_layer = overlay_mod.build_static_layer(brand, party)
    overlay_frames = [
        overlay_mod.compose_frame(brand, party, static_layer, overlay_mod.headline_color(brand, i))
        for i in range(n_shots)
    ]
    overlay_durations = [d - (brand.timing.crossfade_seconds if i < n_shots - 1 else 0) for i, d in enumerate(durations)]
    overlay_track = build_overlay_track(overlay_frames, overlay_durations, work_dir / "overlay_track", brand.canvas)
    composited_path = work_dir / "composited.mp4"
    composite_overlay(background_path, overlay_track, composited_path)

    # Step 4 — audio, trimmed/looped or synthesized to the reel's actual duration.
    audio_path = audio_mod.prepare_track(audio_track, total_duration, work_dir / "audio.wav", genre=party.music_genre)
    mux_audio(composited_path, audio_path, out_path)

    if not keep_work_dir:
        shutil.rmtree(work_dir / "clips", ignore_errors=True)
        shutil.rmtree(variations_dir, ignore_errors=True)
        shutil.rmtree(work_dir / "overlay_track", ignore_errors=True)
        shutil.rmtree(scenes_dir, ignore_errors=True)
        for p in (background_path, composited_path):
            p.unlink(missing_ok=True)

    return out_path
