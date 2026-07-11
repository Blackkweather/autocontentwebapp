"""Unified film grade — applied to every beat image in campaign mode so the whole reel reads as
shot and color-graded as one piece, not assembled from unrelated treatments.

The look is a warm, low-contrast "Kodak Portra" register (the film stock fashion/editorial work
is graded to emulate): lifted shadows carrying a faint teal, warm-rolled highlights, gentle
overall desaturation that spares skin warmth, a soft S-curve, and constant fine grain. This
replaces the old flat two-color duotone treatment, which read as a budget filter rather than a
grade.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from .config import BrandConfig


def _tone_curve() -> np.ndarray:
    """256-entry LUT: lifted blacks, soft rolled highlights, gentle mid contrast — the opposite
    of a hard punchy S-curve. Portra's signature is that it never fully clips to black or white."""
    x = np.linspace(0.0, 1.0, 256)
    # lift shadows so nothing sits at pure 0, compress highlights so nothing clips to 255
    black_lift = 0.055
    white_roll = 0.965
    y = black_lift + (white_roll - black_lift) * x
    # subtle S: push midtone contrast a touch without crushing
    y = y + 0.06 * np.sin((x - 0.5) * np.pi)
    return np.clip(y, 0.0, 1.0)


_CURVE = _tone_curve()


def apply_grade(
    image_path: Path,
    out_path: Path,
    brand: BrandConfig | None = None,
    grain_amount: float = 5.0,
    seed: int | None = 11,
) -> Path:
    """Grade `image_path` and write to `out_path`. If `brand` is given, cover-crop to the exact
    canvas size first (so downstream compositing coordinates line up 1:1)."""
    img = ImageOps.exif_transpose(Image.open(image_path)).convert("RGB")
    if brand is not None:
        img = ImageOps.fit(img, (brand.canvas.width, brand.canvas.height), method=Image.LANCZOS)

    arr = np.asarray(img).astype(np.float32) / 255.0

    # 1) tone curve (per channel, same curve)
    idx = np.clip((arr * 255).astype(np.int16), 0, 255)
    arr = _CURVE[idx]

    # 2) split-tone: warm the highlights (more R, slight -B), cool the shadows toward teal.
    #    luma weight decides how "highlight" a pixel is.
    luma = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    hi = np.clip((luma - 0.5) / 0.5, 0.0, 1.0)[..., None]  # 0 in shadows, 1 in highlights
    lo = 1.0 - hi
    warm = np.array([0.045, 0.012, -0.030], dtype=np.float32)   # highlight push
    teal = np.array([-0.030, 0.010, 0.028], dtype=np.float32)   # shadow push
    arr = arr + hi * warm + lo * teal

    # 3) gentle desaturation that spares warmth — pull toward luma, then add a little of the
    #    original red back so skin doesn't go flat.
    desat = 0.12
    gray = luma[..., None]
    arr = arr * (1 - desat) + gray * desat
    arr[..., 0] += 0.015  # tiny global warmth

    arr = np.clip(arr, 0.0, 1.0)

    # 4) fine film grain — luminance noise, constant across the whole frame
    if grain_amount > 0:
        rng = np.random.default_rng(seed)
        noise = rng.normal(0.0, grain_amount / 255.0, arr.shape[:2])[..., None]
        arr = np.clip(arr + noise, 0.0, 1.0)

    out = Image.fromarray((arr * 255).astype(np.uint8), mode="RGB")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path)
    return out_path


def solid_frame(brand: BrandConfig, out_path: Path, color: str | None = None) -> Path:
    """A pure flat frame at canvas size — the black cinematic sign-off ground. Defaults to the
    brand ink (near-black) rather than pure #000 so it sits in the same tonal family as the
    graded footage instead of a harsher pure black."""
    color = color or brand.colors.ink
    img = Image.new("RGB", (brand.canvas.width, brand.canvas.height), color)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    return out_path
