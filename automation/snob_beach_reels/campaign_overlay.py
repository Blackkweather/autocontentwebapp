"""Per-beat editorial overlays for the luxury "campaign" reel (campaign.py).

Unlike overlay.py — which paints one dense information layer across the whole runtime — each beat
here gets its own sparse, purpose-built overlay so type is revealed in stages: a whisper-quiet
invitation, near-empty atmosphere/energy beats, one large editorial hero name, a minimal event
card, and a black sign-off carrying only the locked WHET × SNOB logo lockup. Restraint and
negative space are the point; this is the opposite of the flyer-density overlay.
"""

from __future__ import annotations

from PIL import Image, ImageDraw, ImageFilter

from . import grunge
from .config import BrandConfig, PartyDetails


def _hex_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _tracked(
    img: Image.Image,
    xy: tuple[float, float],
    text: str,
    font,
    fill: str,
    tracking: int,
    align: str = "center",
    shadow: bool = True,
) -> None:
    """Letter-spaced caps with an optional soft legibility shadow. Wide tracking + thin weight is
    the whole luxury-type move here, so tracking is always explicit."""
    if shadow:
        shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        grunge.draw_tracked_text(shadow_layer, (xy[0] + 2, xy[1] + 3), text, font, "#000000", tracking=tracking, align=align)
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(6))
        # knock the shadow back so it reads as depth, not a second copy
        r, g, b, a = shadow_layer.split()
        a = a.point(lambda v: int(v * 0.55))
        shadow_layer.putalpha(a)
        img.alpha_composite(shadow_layer)
    grunge.draw_tracked_text(img, xy, text, font, fill, tracking=tracking, align=align)


def _hairline(img: Image.Image, cx: float, y: float, half_width: float, color: str, alpha: int = 210) -> None:
    draw = ImageDraw.Draw(img)
    draw.line([(cx - half_width, y), (cx + half_width, y)], fill=(*_hex_rgb(color), alpha), width=2)


# ── Beat overlays ──────────────────────────────────────────────────────────────────────────
def invitation(brand: BrandConfig) -> Image.Image:
    """FRAME 1 — quiet invitation. 'WHET PRESENTS', centered, wide tracking, a thin gold rule,
    everything else empty."""
    W, H = brand.canvas.width, brand.canvas.height
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c = brand.colors
    font = grunge.load_font(brand.fonts.tracked, 34, variation="Medium")
    _tracked(img, (W / 2, H * 0.5 - 30), f"{brand.partner_name} PRESENTS", font, c.off_white, tracking=14)
    _hairline(img, W / 2, H * 0.5 + 40, 70, c.gold)
    return img


def atmosphere(brand: BrandConfig, word: str | None = None) -> Image.Image:
    """FRAME 2/3 — near-empty. Optionally a single Playfair-italic accent word, low and small, so
    the photography carries the beat. Default: nothing at all (maximum breathing room)."""
    W, H = brand.canvas.width, brand.canvas.height
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if word:
        font = grunge.load_font(brand.fonts.serif_italic, 64)
        _tracked(img, (W / 2, H * 0.78), word, font, brand.colors.off_white, tracking=2)
    return img


def hero(brand: BrandConfig, name: str) -> Image.Image:
    """FRAME 4 — the billboard. One large editorial name, lower-left, with a small tracked kicker
    and a Playfair-italic accent above it. This is the frame that should be the poster."""
    W, H = brand.canvas.width, brand.canvas.height
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c = brand.colors
    margin = brand.canvas.margin

    kicker_font = grunge.load_font(brand.fonts.tracked, 26, variation="Medium")
    _tracked(img, (margin, H * 0.60), "LIVE AT SNOB BEACH", kicker_font, c.off_white, tracking=8, align="left")

    accent_font = grunge.load_font(brand.fonts.serif_italic, 70)
    _tracked(img, (margin, H * 0.635), "presents", accent_font, c.gold, tracking=1, align="left")

    name_font, name_lines = _fit_name(brand, name.upper(), W - margin * 2)
    line_h = name_font.size * 0.98
    y = H * 0.72
    # big editorial name, hard crisp shadow for weight
    shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_layer)
    for i, line in enumerate(name_lines):
        sdraw.text((margin + 4, y + i * line_h + 5), line, font=name_font, fill=(0, 0, 0, 220))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(2))
    img.alpha_composite(shadow_layer)
    draw = ImageDraw.Draw(img)
    for i, line in enumerate(name_lines):
        draw.text((margin, y + i * line_h), line, font=name_font, fill=c.off_white)
    return img


def info_card(brand: BrandConfig, party: PartyDetails) -> Image.Image:
    """FRAME 5 — minimal event card. Date / location / artists, centered, tracked, thin rules,
    generous vertical rhythm. No headline, no logos, no decoration."""
    W, H = brand.canvas.width, brand.canvas.height
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c = brand.colors

    label_font = grunge.load_font(brand.fonts.tracked, 20, variation="Medium")
    value_font = grunge.load_font(brand.fonts.tracked, 34, variation="SemiBold")

    location = f"{brand.name} · {party.city.upper()}"
    artists = " · ".join(a.upper() for a in party.dj_lineup) if party.dj_lineup else ""
    rows = [
        ("DATE", party.date.upper()),
        ("LOCATION", location),
    ]
    if artists:
        rows.append(("LINE-UP", artists))

    block_h = len(rows) * 150
    y = (H - block_h) / 2 + 40
    for label, value in rows:
        _tracked(img, (W / 2, y), label, label_font, c.gold, tracking=6)
        _tracked(img, (W / 2, y + 34), value, value_font, c.off_white, tracking=4)
        _hairline(img, W / 2, y + 108, 40, c.concrete, alpha=120)
        y += 150
    return img


def sign_off(brand: BrandConfig) -> Image.Image:
    """FRAME 6 — black cinematic close. The locked WHET × SNOB lockup, bottom center, with
    generous breathing room, a soft shadow, and a thin gold rule above. Nothing else."""
    return draw_logo_lockup(brand, Image.new("RGBA", (brand.canvas.width, brand.canvas.height), (0, 0, 0, 0)), premium=True)


def draw_logo_lockup(brand: BrandConfig, img: Image.Image, premium: bool = True) -> Image.Image:
    """Both locked logos side by side, bottom center. The logo *assets* are never altered — only
    the framing around them (padding, shadow, a hairline rule) is treated. `premium` adds more
    breathing room and the gold rule (used on the sign-off); otherwise it's a tighter footer."""
    W, H = brand.canvas.width, brand.canvas.height
    c = brand.colors
    logo_max_h = 128 if premium else 108
    logos: list[Image.Image] = []
    for path in (brand.logo_path, brand.partner_logo_path):
        if path and path.exists():
            logo = Image.open(path).convert("RGBA")
            logo.thumbnail((300, logo_max_h))
            logos.append(logo)
    if not logos:
        return img

    gap = 44 if premium else 30
    divider_w = 2 if len(logos) > 1 else 0
    total_w = sum(l.width for l in logos) + (gap * 2 + divider_w) * (len(logos) - 1)
    row_h = max(l.height for l in logos)
    # generous bottom breathing room
    y_bottom = H - (int(H * 0.11) if premium else brand.canvas.margin)
    x = W / 2 - total_w / 2

    if premium:
        _hairline(img, W / 2, y_bottom - row_h - 46, 50, c.gold, alpha=200)

    # soft shadow behind the whole lockup
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sx = x
    for i, logo in enumerate(logos):
        alpha = logo.split()[-1].point(lambda v: int(v * 0.5))
        blk = Image.new("RGBA", logo.size, (0, 0, 0, 0))
        blk.putalpha(alpha)
        shadow.alpha_composite(blk, (round(sx + 3), round(y_bottom - logo.height + 5)))
        sx += logo.width + (gap * 2 + divider_w if i < len(logos) - 1 else 0)
    shadow = shadow.filter(ImageFilter.GaussianBlur(9))
    img.alpha_composite(shadow)

    for i, logo in enumerate(logos):
        img.alpha_composite(logo, (round(x), round(y_bottom - logo.height)))
        x += logo.width
        if i < len(logos) - 1:
            x += gap
            div = Image.new("RGBA", (divider_w, row_h), (*_hex_rgb(c.concrete), 150))
            img.alpha_composite(div, (round(x), round(y_bottom - row_h)))
            x += divider_w + gap
    return img


def _fit_name(brand: BrandConfig, text: str, max_width: int, cap: int = 190, floor: int = 80):
    scratch = Image.new("L", (10, 10))
    draw = ImageDraw.Draw(scratch)
    size = cap
    while size > floor:
        font = grunge.load_font(brand.fonts.display, size)
        if draw.textbbox((0, 0), text, font=font)[2] <= max_width:
            return font, [text]
        size -= 4
    # wrap to two lines at the floor size
    font = grunge.load_font(brand.fonts.display, floor)
    return font, grunge.wrap_to_lines(text, font, max_width)
