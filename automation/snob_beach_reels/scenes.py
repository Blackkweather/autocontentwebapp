"""Background-cut helpers for the fixed-overlay reel style: duotone recolors of the source
photo (the reference's teal/orange color-cycle beat on the same shot) and a text-only "title
card" cut (the reference's plain dark breather beat partway through).
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps

from . import grunge
from .config import BrandConfig


def duotone(
    image_path: Path,
    shadow_hex: str,
    highlight_hex: str,
    out_path: Path,
    brand: BrandConfig | None = None,
    mid_hex: str | None = None,
) -> Path:
    """`brand`, if given, cover-crops the result to the canvas's exact pixel size first. Needed
    whenever a picture-frame inset (frames.py) is going to be composited onto this image
    afterwards — that inset is positioned in canvas coordinates, and ffmpeg's own later
    scale/crop pass (video.make_static_clip et al.) would otherwise shift or re-crop it relative
    to those coordinates since the source photo's own aspect ratio is rarely 9:16.

    `mid_hex`, if given, makes this a tri-tone gradient map (shadow -> mid -> highlight) instead
    of a plain two-color duotone — used for the "sunset" treatment that runs both brand accents
    through one recolor rather than picking just one."""
    src = ImageOps.exif_transpose(Image.open(image_path)).convert("L")
    src = ImageOps.autocontrast(src, cutoff=1)
    colorized = ImageOps.colorize(src, black=shadow_hex, white=highlight_hex, mid=mid_hex)
    if brand is not None:
        colorized = ImageOps.fit(colorized, (brand.canvas.width, brand.canvas.height), method=Image.LANCZOS)
    colorized.save(out_path)
    return out_path


def title_card(brand: BrandConfig, out_path: Path, seed: int | None = 5) -> Path:
    """Flat dark ground with the brand's grain/vignette texture, no photo — the reel's one
    text-only beat, matching the reference's plain-color breather cut."""
    W, H = brand.canvas.width, brand.canvas.height
    img = Image.new("RGBA", (W, H), brand.colors.ink)
    grunge.apply_film_grain(img, amount=9, seed=seed)
    grunge.apply_vignette(img, strength=0.35)
    img.convert("RGB").save(out_path)
    return out_path
