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
    """Tuned to read as quick hard cuts under a static overlay (see overlay.py), not slow
    Ken-Burns dissolves — short per-shot hold, near-zero crossfade. total_seconds is sized for
    the default ~8-shot montage (3 duotone/framed cuts + 4 AI-expanded angles + 1 title card,
    see pipeline.py) at roughly a 2.1s-per-cut pace — the pipeline's duration solver spreads
    whatever shot count it actually builds across this total, so a different variation_count
    just makes cuts a little faster/slower rather than breaking anything."""

    total_seconds: float = 16.0
    shot_seconds: float = 2.1  # nominal hold per background cut before the next hard cut
    title_card_seconds: float = 1.3  # the text-only "breather" cut holds shorter
    crossfade_seconds: float = 0.15
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
    cadence: str | None = None  # e.g. "FRIDAYS" — renders as "{cadence} AT {brand.name}" under the headline


@dataclass(frozen=True)
class BrandConfig:
    name: str = "SNOB BEACH"
    colors: Colors = field(default_factory=Colors)
    fonts: Fonts = field(default_factory=Fonts)
    canvas: Canvas = field(default_factory=Canvas)
    timing: ReelTiming = field(default_factory=ReelTiming)
    logo_path: Path | None = None  # venue logo, PNG with transparency — see assets/brand/README.md
    partner_logo_path: Path | None = None  # co-presenter logo (e.g. the event planner/promoter),
    # rendered side-by-side with logo_path rather than replacing it — WHET x SNOB BEACH is a
    # collab: WHET is the event planner/manager, SNOB BEACH the venue, both credited together.


def _asset_if_exists(name: str) -> Path | None:
    path = BRAND_DIR / name
    return path if path.exists() else None


DEFAULT_BRAND = BrandConfig(
    logo_path=_asset_if_exists("logo.png"),
    partner_logo_path=_asset_if_exists("whet_logo.png"),
)

# ── External API configuration (env-driven, never hardcoded) ──────────────────────────────────
REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
RUNWAY_API_KEY = os.environ.get("RUNWAY_API_KEY", "")
LEONARDO_API_KEY = os.environ.get("LEONARDO_API_KEY", "")
HIGGSFIELD_API_KEY = os.environ.get("HIGGSFIELD_API_KEY", "")
IMAGE_PROVIDER = os.environ.get("SNOB_BEACH_IMAGE_PROVIDER", "replicate")  # replicate | openai | none
