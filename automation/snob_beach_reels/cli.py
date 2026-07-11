"""Command-line entry point.

    python -m automation.snob_beach_reels.cli \\
        --image path/to/photo.jpg \\
        --event-name "All White" \\
        --date "FRIDAY 18 JULY" \\
        --dress-code "All White" \\
        --dj "DJ KAYO" --dj "FRIENDS" \\
        --genre "Afro House" \\
        --audio path/to/track.mp3 \\
        --out output/all_white_reel.mp4
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import replace
from pathlib import Path

from .campaign import generate_campaign_reel
from .config import DEFAULT_BRAND, PartyDetails
from .pipeline import generate_reel


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Generate a branded SNOB BEACH Instagram Reel from one photo + party details.")
    p.add_argument(
        "--image",
        required=True,
        type=Path,
        action="append",
        help="Source photo. Repeatable in --campaign mode (one per beat, ideally the 5 shots from "
        "HIGGSFIELD_BRIEF.md); classic mode uses the first.",
    )
    p.add_argument(
        "--campaign",
        action="store_true",
        help="Luxury 6-beat cinematic mode (invitation→atmosphere→energy→hero→info→sign-off, unified "
        "film grade, editorial type) instead of the flyer-style montage.",
    )
    p.add_argument("--hero-name", default=None, help="Campaign mode: the large editorial name on the hero frame (defaults to first --dj).")
    p.add_argument("--event-name", required=True, help="e.g. 'All White'")
    p.add_argument("--date", required=True, help="Display string, e.g. 'FRIDAY 18 JULY'")
    p.add_argument("--dress-code", default=None)
    p.add_argument("--dj", action="append", default=[], help="Repeatable — one per DJ/act, in lineup order.")
    p.add_argument("--genre", default=None, help="e.g. 'Afro House' — also drives the fallback audio's BPM.")
    p.add_argument("--venue-line", default="RESTAURANT & BEACH CLUB")
    p.add_argument("--city", default="MARRAKECH")
    p.add_argument("--tagline", default="Pool Party Restaurant Club")
    p.add_argument("--cadence", default=None, help="e.g. 'FRIDAYS' — renders as 'FRIDAYS AT SNOB BEACH' under the headline.")
    p.add_argument("--logo", default=None, type=Path, help="Override the default assets/brand/logo.png")
    p.add_argument("--audio", default=None, type=Path, help="Background track (Afro/Deep House). Omit to synthesize one.")
    p.add_argument("--provider", default=None, choices=["replicate", "openai", "none"], help="Image-expansion backend; defaults to $SNOB_BEACH_IMAGE_PROVIDER or 'replicate'.")
    p.add_argument("--variations", type=int, default=4, choices=[2, 3, 4, 5], help="Number of AI-expanded companion shots.")
    p.add_argument("--out", default=None, type=Path, help="Output MP4 path. Defaults into automation/snob_beach_reels/work/<run>/.")
    p.add_argument("--keep-work-dir", action="store_true", help="Keep intermediate clips/variations for debugging.")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)

    brand = DEFAULT_BRAND
    if args.logo:
        brand = replace(brand, logo_path=args.logo)

    party = PartyDetails(
        event_name=args.event_name,
        date=args.date,
        dress_code=args.dress_code,
        dj_lineup=args.dj,
        music_genre=args.genre,
        venue_line=args.venue_line,
        city=args.city,
        tagline=args.tagline,
        cadence=args.cadence,
    )

    if args.campaign:
        out_path = generate_campaign_reel(
            beat_images=args.image,
            party=party,
            brand=brand,
            audio_track=args.audio,
            hero_name=args.hero_name,
            out_path=args.out,
            keep_work_dir=args.keep_work_dir,
        )
    else:
        out_path = generate_reel(
            source_image=args.image[0],
            party=party,
            brand=brand,
            audio_track=args.audio,
            image_provider_name=args.provider,
            variation_count=args.variations,
            out_path=args.out,
            keep_work_dir=args.keep_work_dir,
        )
    print(f"Reel written to: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
