"""SNOB BEACH brand system — colors, fonts, canvas geometry, event input shape.

Mirrors the pattern used by the existing Amaze Live poster pipeline
(src/lib/poster/brand.ts): one place that owns the brand's visual vocabulary
so every render step (poster, reel frames) draws from the same constants
instead of hardcoding values inline.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
FONTS_DIR = ASSETS / "fonts"
BRAND_DIR = ASSETS / "brand"
WORK_DIR = ROOT / "work"

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:
    pass  # python-dotenv is a convenience, not a hard requirement — env vars still work via export


@dataclass(frozen=True)
class Colors:
    """5% gold-rule-style discipline: ink is the dominant ground, magenta/yellow are the two
    accent hits, off-white is body text. Sampled off the WHET/Family Affair reference set —
    near-black ground, hot magenta headline, mustard-gold second accent, never both at once
    on the same line of type."""

    ink: str = "#0A0A0A"  # near-black ground
    ink_soft: str = "#151312"  # panel/card ground, one step off pure black
    magenta: str = "#F2116B"  # primary accent — headline fill / tape / stamps
    yellow: str = "#F4C51E"  # secondary accent — date, highlight lines, alt headline fill
    off_white: str = "#F5F0E6"  # body copy, script accents
    concrete: str = "#9A958C"  # muted utility text


@dataclass(frozen=True)
class Fonts:
    display: Path = FONTS_DIR / "Anton-Regular.ttf"  # headline — WHET / event name
    heavy: Path = FONTS_DIR / "ArchivoBlack-Regular.ttf"  # secondary headline / tags / badges
    tracked: Path = FONTS_DIR / "Oswald-Bold.ttf"  # small tracked caps utility lines (variable font)
    script: Path = FONTS_DIR / "CaveatBrush-Regular.ttf"  # "Opening", signature line accent


@dataclass(frozen=True)
class Canvas:
    # Instagram Reels native frame.
    width: int = 1080
    height: int = 1920
    fps: int = 30

    @property
    def margin(self) -> int:
        return round(self.width * 0.07)


@dataclass(frozen=True)
class ReelTiming:
    total_seconds: float = 13.0
    clip_seconds: float = 1.8  # per-shot hold before the next crossfade
    poster_hold_seconds: float = 2.6  # the branded text-overlay frame holds longer
    crossfade_seconds: float = 0.35
    audio_fade_seconds: float = 0.6


@dataclass
class PartyDetails:
    """The free-text 'party rules' input, structured. Only event_name is required — everything
    else renders conditionally so a sparse input still produces a clean poster."""

    event_name: str
    date: str  # display string, e.g. "FRIDAY 18 JULY" — caller formats, we don't parse dates here
    dress_code: str | None = None
    dj_lineup: list[str] = field(default_factory=list)
    music_genre: str | None = None
    venue_line: str = "RESTAURANT & BEACH CLUB"
    city: str = "MARRAKECH"
    tagline: str | None = None  # e.g. "POOL PARTY RESTAURANT CLUB" kicker under the logo


@dataclass(frozen=True)
class BrandConfig:
    name: str = "SNOB BEACH"
    colors: Colors = field(default_factory=Colors)
    fonts: Fonts = field(default_factory=Fonts)
    canvas: Canvas = field(default_factory=Canvas)
    timing: ReelTiming = field(default_factory=ReelTiming)
    logo_path: Path | None = None  # PNG with transparency, see assets/brand/README.md


DEFAULT_BRAND = BrandConfig(logo_path=(BRAND_DIR / "logo.png") if (BRAND_DIR / "logo.png").exists() else None)

# ── External API configuration (env-driven, never hardcoded) ──────────────────────────────────
REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
RUNWAY_API_KEY = os.environ.get("RUNWAY_API_KEY", "")
LEONARDO_API_KEY = os.environ.get("LEONARDO_API_KEY", "")
HIGGSFIELD_API_KEY = os.environ.get("HIGGSFIELD_API_KEY", "")
IMAGE_PROVIDER = os.environ.get("SNOB_BEACH_IMAGE_PROVIDER", "replicate")  # replicate | openai | none
