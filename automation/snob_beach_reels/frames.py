"""Small picture-frame insets — a bordered, shadowed photo card composited onto a background
cut, echoing the reference video's picture-within-picture moments (a second photo/video playing
inside a TV/phone screen within the main shot). No device mockup assets are assumed here — this
renders a generic framed photo card (off-white border, soft drop shadow, slight rotation) rather
than a literal TV/phone bezel, which reads as the same "another picture, inset" idea without
depending on a specific prop photo.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

from .config import BrandConfig


def add_picture_frame(
    base_path: Path,
    inset_path: Path,
    out_path: Path,
    box: tuple[int, int, int, int],
    border: int = 16,
    border_color: str = "#F5F0E6",
    rotation: float = -5,
    shadow_alpha: int = 130,
) -> Path:
    """box = (center_x, center_y, width, height) of the framed card, in base-image pixels."""
    base = Image.open(base_path).convert("RGBA")
    cx, cy, w, h = box

    inset = ImageOps.exif_transpose(Image.open(inset_path)).convert("RGB")
    fitted = ImageOps.fit(inset, (w - border * 2, h - border * 2), method=Image.LANCZOS)

    card = Image.new("RGBA", (w, h), border_color)
    card.paste(fitted, (border, border))

    pad = 44
    layer = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle((pad, pad, pad + w, pad + h), fill=(0, 0, 0, shadow_alpha))
    shadow = shadow.filter(ImageFilter.GaussianBlur(11))
    layer.alpha_composite(shadow)
    layer.alpha_composite(card, (pad, pad))

    layer = layer.rotate(rotation, expand=True, resample=Image.BICUBIC)
    base.alpha_composite(layer, (round(cx - layer.width / 2), round(cy - layer.height / 2)))
    base.convert("RGB").save(out_path)
    return out_path


def safe_inset_box(brand: BrandConfig, cx_ratio: float, width_ratio: float = 0.34, height_ratio: float = 0.205) -> tuple[int, int, int, int]:
    """A box centered horizontally at `cx_ratio` of canvas width, vertically in the band between
    the overlay's lineup block and its footer tagline (see overlay.py's layout) — conservative
    enough to clear a typical (2-4 act) lineup without needing to read overlay.py's exact text
    metrics here. Sized with headroom below the box's rotated corners so it doesn't crowd the
    footer tagline once `add_picture_frame`'s rotation is applied."""
    W, H = brand.canvas.width, brand.canvas.height
    w = round(W * width_ratio)
    h = round(H * height_ratio)
    cx = round(W * cx_ratio)
    cy = round(H * 0.605)
    return cx, cy, w, h
