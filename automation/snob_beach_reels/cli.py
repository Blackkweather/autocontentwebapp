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

from .config import DEFAULT_BRAND, PartyDetails
from .pipeline import generate_reel


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Generate a branded SNOB BEACH Instagram Reel from one photo + party details.")
    p.add_argument("--image", required=True, type=Path, help="Source photo (fashion shot, pool party vibe, DJ shot).")
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
    p.add_argument("--variations", type=int, default=3, choices=[2, 3], help="Number of AI-expanded companion shots.")
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

    out_path = generate_reel(
        source_image=args.image,
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
