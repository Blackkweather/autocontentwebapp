"""Reusable grunge/poster-craft primitives: tracked text, torn-paper panels, tape, stamps,
film grain. Kept separate from poster.py's layout/composition logic, mirroring the split between
src/lib/poster/draw-helpers.ts and render.ts in the existing Amaze Live pipeline in this repo.
"""

from __future__ import annotations

import random
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


@lru_cache(maxsize=None)
def load_font(path: Path, size: int, variation: str | None = None) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(path), size)
    if variation:
        try:
            font.set_variation_by_name(variation)
        except Exception:
            pass
    return font


def tracked_text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, tracking: int) -> tuple[int, int]:
    width = 0
    height = 0
    for ch in text:
        bbox = draw.textbbox((0, 0), ch, font=font)
        width += (bbox[2] - bbox[0]) + tracking
        height = max(height, bbox[3] - bbox[1])
    return max(width - tracking, 0), height


def draw_tracked_text(
    img: Image.Image,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: str,
    tracking: int = 4,
    align: str = "left",
    anchor_y: str = "top",
) -> None:
    """Manual letter-spacing — Pillow has no native `tracking`, and every utility line in the
    brand's reference set (KICKER lines, date stamps, corner metadata) relies on wide tracking
    for that editorial feel."""
    draw = ImageDraw.Draw(img)
    width, height = tracked_text_size(draw, text, font, tracking)
    x, y = xy
    if align == "center":
        x -= width / 2
    elif align == "right":
        x -= width
    if anchor_y == "middle":
        y -= height / 2
    cursor = x
    for ch in text:
        draw.text((cursor, y), ch, font=font, fill=fill)
        bbox = draw.textbbox((0, 0), ch, font=font)
        cursor += (bbox[2] - bbox[0]) + tracking


def wrap_to_lines(text: str, font: ImageFont.FreeTypeFont, max_width: int, stroke_width: int = 0) -> list[str]:
    """Greedy word-wrap sized against the actual font metrics (Anton is condensed enough that
    character-count heuristics undershoot badly) — used to stack multi-word event names the way
    the reference posters stack e.g. 'WHET' / 'Opening' rather than shrinking one giant line."""
    scratch = Image.new("L", (10, 10))
    draw = ImageDraw.Draw(scratch)
    words = text.split()
    if not words:
        return [text]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        bbox = draw.textbbox((0, 0), candidate, font=font, stroke_width=stroke_width)
        if bbox[2] - bbox[0] <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def draw_distressed_headline(
    img: Image.Image,
    center: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: str,
    shadow: str,
    outline: str = "#0A0A0A",
    outline_width: int = 6,
    shadow_offset: tuple[int, int] = (10, 10),
    rotation: float = -3.5,
    distress_strength: float = 0.35,
    line_spacing: float = 0.92,
    seed: int | None = None,
) -> None:
    """The WHET/Family Affair headline treatment: bold condensed caps, thick dark outline, a
    second flat color offset behind as a drop shadow (not a soft blur — a hard second copy, per
    the reference set), slight rotation, then a noise mask punched through the fill so it reads
    as spray-stencilled rather than vector-clean. `text` may contain '\\n' for stacked lines."""
    draw = ImageDraw.Draw(img)
    spacing = round(font.size * (line_spacing - 1))
    bbox = draw.multiline_textbbox((0, 0), text, font=font, stroke_width=outline_width, spacing=spacing, align="left")
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    pad = outline_width * 4 + max(abs(shadow_offset[0]), abs(shadow_offset[1])) + 10
    layer = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(layer)
    origin = (pad - bbox[0], pad - bbox[1])

    # hard-offset drop shadow copy
    ldraw.multiline_text(
        (origin[0] + shadow_offset[0], origin[1] + shadow_offset[1]),
        text,
        font=font,
        fill=shadow,
        stroke_width=outline_width,
        stroke_fill=outline,
        spacing=spacing,
        align="left",
    )
    # main fill + outline
    ldraw.multiline_text(origin, text, font=font, fill=fill, stroke_width=outline_width, stroke_fill=outline, spacing=spacing, align="left")

    _punch_distress(layer, strength=distress_strength, seed=seed)

    layer = layer.rotate(rotation, resample=Image.BICUBIC, expand=True)
    paste_x = round(center[0] - layer.width / 2)
    paste_y = round(center[1] - layer.height / 2)
    img.alpha_composite(layer, (paste_x, paste_y))


def _punch_distress(layer: Image.Image, strength: float, seed: int | None) -> None:
    """Multiplies the alpha channel by cloudy noise so text edges look worn/spray-stencilled
    instead of vector-perfect — cheap stand-in for a real grunge-texture brush."""
    rng = np.random.default_rng(seed)
    r, g, b, a = layer.split()
    noise = rng.random((layer.height, layer.width))
    noise_img = Image.fromarray((noise * 255).astype(np.uint8), mode="L")
    noise_img = noise_img.filter(ImageFilter.GaussianBlur(radius=1.4))
    noise_arr = np.asarray(noise_img).astype(np.float32) / 255.0
    keep = 1.0 - strength * (noise_arr < 0.4).astype(np.float32) * (0.4 - noise_arr) / 0.4
    a_arr = np.asarray(a).astype(np.float32) * np.clip(keep, 0.15, 1.0)
    layer.putalpha(Image.fromarray(a_arr.astype(np.uint8), mode="L"))


def torn_panel(photo: Image.Image, size: tuple[int, int], border: int = 16, border_color: str = "#F5F0E6", seed: int | None = None) -> Image.Image:
    """A full-bleed-on-3-sides photo panel with one ragged torn edge (left) and a light paper
    border along the tear — the recurring cutout motif across the WHET reference set. `photo` is
    cropped to cover `size` before the tear is cut into it."""
    w, h = size
    fitted = ImageOps.fit(photo.convert("RGB"), (w, h), method=Image.LANCZOS)

    rng = random.Random(seed)
    step = max(h // 14, 30)
    ys = list(range(0, h + step, step))
    if ys[-1] != h:
        ys.append(h)
    base_x = w * 0.18
    xs = [base_x + rng.uniform(-w * 0.05, w * 0.05) for _ in ys]
    for i in range(1, len(xs) - 1):
        xs[i] = (xs[i - 1] + xs[i] + xs[i + 1]) / 3
    tear_points = list(zip(xs, ys))

    border_points = [(x - border, y) for x, y in tear_points]
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    border_mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(border_mask).polygon(border_points + [(w, h), (w, 0)], fill=255)
    border_layer = Image.new("RGBA", (w, h), border_color)
    canvas.paste(border_layer, (0, 0), border_mask)

    photo_mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(photo_mask).polygon(tear_points + [(w, h), (w, 0)], fill=255)
    canvas.paste(fitted.convert("RGBA"), (0, 0), photo_mask)

    return canvas


def draw_tape(img: Image.Image, center: tuple[float, float], size: tuple[int, int], color: str, rotation: float = -8, alpha: int = 235) -> None:
    """A washi-tape accent rectangle — recurring corner/edge detail in the reference set."""
    w, h = size
    layer = Image.new("RGBA", (w, h), color)
    r, g, b = Image.new("RGB", (1, 1), color).getpixel((0, 0))
    layer.putalpha(alpha)
    layer = layer.rotate(rotation, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(layer, (round(center[0] - layer.width / 2), round(center[1] - layer.height / 2)))


def draw_stamp_badge(
    img: Image.Image,
    center: tuple[float, float],
    radius: int,
    lines: list[str],
    font: ImageFont.FreeTypeFont,
    bg: str,
    fg: str,
    rotation: float = -10,
) -> None:
    """The circular 'OPENING / 18 / JULY' date stamp seen on several reference layouts."""
    d = radius * 2
    layer = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(layer)
    ldraw.ellipse((0, 0, d, d), fill=bg)
    ldraw.ellipse((6, 6, d - 6, d - 6), outline=fg, width=2)

    line_h = radius * 0.34
    total_h = line_h * len(lines)
    y = radius - total_h / 2
    for line in lines:
        bbox = ldraw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        ldraw.text((radius - tw / 2, y), line, font=font, fill=fg)
        y += line_h

    layer = layer.rotate(rotation, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(layer, (round(center[0] - layer.width / 2), round(center[1] - layer.height / 2)))


def film_grain(size: tuple[int, int], amount: float = 14, seed: int | None = None) -> Image.Image:
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, amount, (size[1], size[0])).astype(np.float32)
    gray = np.clip(128 + noise, 0, 255).astype(np.uint8)
    grain = Image.fromarray(gray, mode="L").convert("RGBA")
    r, g, b, a = grain.split()
    a = a.point(lambda _: 40)
    grain.putalpha(a)
    return grain


def apply_vignette(img: Image.Image, strength: float = 0.55) -> None:
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w / 2, h / 2
    dist = np.sqrt(((xx - cx) / (w / 2)) ** 2 + ((yy - cy) / (h / 2)) ** 2)
    mask = np.clip((dist - 0.55) / 0.6, 0, 1) * strength
    alpha = (mask * 255).astype(np.uint8)
    overlay = Image.new("RGBA", (w, h), "#000000")
    overlay.putalpha(Image.fromarray(alpha, mode="L"))
    img.alpha_composite(overlay)


def apply_film_grain(img: Image.Image, amount: float = 14, seed: int | None = None) -> None:
    img.alpha_composite(film_grain(img.size, amount=amount, seed=seed))
