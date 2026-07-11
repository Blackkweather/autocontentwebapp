"""Downloads the OFL-licensed fonts this package needs instead of committing them — same
rationale as scripts/fetch-assets.mjs for the main Next.js app: keeps the repo/binary payload
small. Idempotent: skips any file already present. Run once after cloning:

    python3 -m automation.snob_beach_reels.fetch_assets
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

from .config import FONTS_DIR

ASSETS = [
    ("https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf", FONTS_DIR / "Anton-Regular.ttf"),
    (
        "https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf",
        FONTS_DIR / "ArchivoBlack-Regular.ttf",
    ),
    ("https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf", FONTS_DIR / "Oswald-Bold.ttf"),
    (
        "https://raw.githubusercontent.com/google/fonts/main/ofl/caveatbrush/CaveatBrush-Regular.ttf",
        FONTS_DIR / "CaveatBrush-Regular.ttf",
    ),
    (
        "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",
        FONTS_DIR / "PlayfairDisplay.ttf",
    ),
    (
        "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf",
        FONTS_DIR / "PlayfairDisplay-Italic.ttf",
    ),
]


def fetch_all() -> None:
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    for url, dest in ASSETS:
        if dest.exists():
            print(f"[fetch-assets] skip (already present): {dest.name}")
            continue
        print(f"[fetch-assets] downloading {dest.name} ...")
        urllib.request.urlretrieve(url, dest)
        print(f"[fetch-assets] saved {dest.name}")


if __name__ == "__main__":
    fetch_all()
