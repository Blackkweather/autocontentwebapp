"""Orchestrates the four steps end to end: image expansion -> text-overlay poster frame ->
Ken-Burns + crossfade video assembly -> audio. One function, `generate_reel`, is the whole
automation described in the brief; cli.py is a thin argument-parsing wrapper around it.
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path

from . import audio as audio_mod
from . import providers
from .config import BrandConfig, DEFAULT_BRAND, PartyDetails, WORK_DIR
from .poster import build_poster
from .video import Shot, assemble_reel


def _shot_durations(n_non_poster: int, brand: BrandConfig) -> tuple[float, float]:
    """Solves for (poster_duration, each_non_poster_duration) so that, after crossfades eat into
    the total, the reel lands exactly on brand.timing.total_seconds."""
    timing = brand.timing
    n_shots = n_non_poster + 1
    crossfade_budget = (n_shots - 1) * timing.crossfade_seconds
    poster_duration = timing.poster_hold_seconds
    remaining = timing.total_seconds + crossfade_budget - poster_duration
    each = max(remaining / n_non_poster, 0.8)
    return poster_duration, each


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

    # Step 2 — dynamic text overlay (the branded poster frame).
    poster_img = build_poster(brand, party, source_image)
    poster_path = work_dir / "poster.png"
    poster_img.save(poster_path)

    # Step 3 — shot list: original hook, then each AI-expanded angle, then the poster as the
    # closing CTA card (all event info lands as the reel's last, longest-held frame).
    non_poster_images = [source_image, *variations]
    poster_duration, each_duration = _shot_durations(len(non_poster_images), brand)
    shots = [Shot(img, each_duration) for img in non_poster_images]
    shots.append(Shot(poster_path, poster_duration, motion="zoom_in_center"))

    total_duration = sum(s.duration_s for s in shots) - (len(shots) - 1) * brand.timing.crossfade_seconds

    # Step 4 — audio, trimmed/looped or synthesized to the reel's actual duration.
    audio_path = audio_mod.prepare_track(audio_track, total_duration, work_dir / "audio.wav", genre=party.music_genre)

    assemble_reel(shots, audio_path, out_path, work_dir / "clips", brand.canvas, crossfade_s=brand.timing.crossfade_seconds)

    if not keep_work_dir:
        shutil.rmtree(work_dir / "clips", ignore_errors=True)
        shutil.rmtree(variations_dir, ignore_errors=True)

    return out_path
