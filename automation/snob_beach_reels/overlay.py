"""Fixed text/branding overlay — the "Summer Reunion" reference style.

Unlike poster.py (a single grunge promo frame), this overlay is composited on top of *every*
background cut for the reel's entire runtime: headline, subheading, lineup, date, footer
tagline and logo all sit in one constant screen position while the footage underneath hard-cuts.
Only the headline's fill color rotates per cut (see HEADLINE_COLORS) — everything else stays a
constant off-white, matching the reference exactly.

Two layers are rendered separately (`build_static_layer` once, `render_headline` per color) so
video.py can recolor just the headline without re-drawing the rest for every cut.
"""

from __future__ import annotations

from PIL import Image, ImageDraw, ImageFilter

from . import grunge
from .config import BrandConfig, PartyDetails

# Rotated across background cuts by index — same three-way cycle the reference uses
# (white / accent-one / accent-two) chosen here from the brand's existing two accents plus
# off-white rather than introducing a fourth brand color.
HEADLINE_COLOR_KEYS = ["off_white", "magenta", "yellow"]


def headline_color(brand: BrandConfig, index: int) -> str:
    key = HEADLINE_COLOR_KEYS[index % len(HEADLINE_COLOR_KEYS)]
    return getattr(brand.colors, key)


def _soft_shadow_text(
    img: Image.Image,
    xy: tuple[float, float],
    text: str,
    font,
    fill: str,
    align: str = "left",
    shadow_alpha: int = 110,
    blur: float = 3.5,
    line_spacing: int = 0,
) -> None:
    """Clean flat fill + a soft blurred shadow for depth — no hard outline/distress, matching the
    reference's much cleaner modern-poster look (as opposed to poster.py's grunge treatment)."""
    draw = ImageDraw.Draw(img)
    is_multiline = "\n" in text
    bbox_fn = draw.multiline_textbbox if is_multiline else draw.textbbox
    kwargs = {"spacing": line_spacing, "align": align} if is_multiline else {}
    bbox = bbox_fn((0, 0), text, font=font, **kwargs)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x, y = xy
    if align == "center":
        x -= w / 2
    elif align == "right":
        x -= w

    pad = 20
    layer = Image.new("RGBA", (round(w + pad * 2), round(h + pad * 2)), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(layer)
    origin = (pad - bbox[0], pad - bbox[1])
    shadow_fill = (0, 0, 0, shadow_alpha)
    (ldraw.multiline_text if is_multiline else ldraw.text)(
        (origin[0] + 3, origin[1] + 5), text, font=font, fill=shadow_fill, **kwargs
    )
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    # Rebind: filter() returns a new Image, so the draw object (and any method reference taken
    # from it) must be re-created against that new image, not the discarded pre-blur one.
    ldraw = ImageDraw.Draw(layer)
    (ldraw.multiline_text if is_multiline else ldraw.text)(origin, text, font=font, fill=fill, **kwargs)

    img.alpha_composite(layer, (round(x - pad), round(y - pad)))


def build_static_layer(brand: BrandConfig, party: PartyDetails) -> Image.Image:
    """Everything except the headline: subheading, lineup, date, footer, logo. Rendered once and
    reused unchanged under every recolored headline."""
    c = brand.colors
    W, H = brand.canvas.width, brand.canvas.height
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    margin = brand.canvas.margin

    headline_font, headline_lines = _fit_headline(brand, party.event_name, W - margin * 2 - 40)
    headline_block_h = headline_font.size * len(headline_lines) * 1.02
    headline_top = H * 0.24
    subheading_y = headline_top + headline_block_h + 14

    if party.cadence:
        subheading = f"{party.cadence.upper()} AT {brand.name.upper()}"
    else:
        subheading = f"{party.venue_line}".upper()
    sub_font = grunge.load_font(brand.fonts.tracked, 30, variation="SemiBold")
    _soft_shadow_text(img, (margin, subheading_y), subheading, sub_font, c.off_white)

    lineup_y = subheading_y + 90
    if party.dj_lineup:
        lineup_font = grunge.load_font(brand.fonts.tracked, 40, variation="Medium")
        line_gap = 52
        for i, name in enumerate(party.dj_lineup):
            _soft_shadow_text(img, (margin, lineup_y + i * line_gap), name.upper(), lineup_font, c.off_white)

    date_font_big = grunge.load_font(brand.fonts.heavy, 42)
    date_font_small = grunge.load_font(brand.fonts.tracked, 26, variation="Medium")
    date_x = W - margin
    _soft_shadow_text(img, (date_x, lineup_y), party.date.split()[0] if party.date else "", date_font_big, c.off_white, align="right")
    rest_of_date = " ".join(party.date.split()[1:]) if party.date and len(party.date.split()) > 1 else party.date
    _soft_shadow_text(img, (date_x, lineup_y + 52), rest_of_date, date_font_small, c.off_white, align="right")

    footer_font = grunge.load_font(brand.fonts.tracked, 25, variation="Medium")
    footer_y = H * 0.79
    if party.tagline:
        draw = ImageDraw.Draw(img)
        tag_font_wrap = footer_font
        lines = grunge.wrap_to_lines(party.tagline.upper(), tag_font_wrap, W - margin * 2)
        _soft_shadow_text(img, (W / 2, footer_y), "\n".join(lines), footer_font, c.off_white, align="center", line_spacing=6)

    _draw_logo_row(img, brand, margin)

    return img


def _draw_logo_row(img: Image.Image, brand: BrandConfig, margin: int) -> None:
    """logo_path and partner_logo_path render side by side (a collab credit — e.g. WHET as the
    event planner alongside SNOB BEACH as the venue), separated by a thin divider, rather than
    one replacing the other. Falls back to the brand name as styled script text if no logo file
    is configured at all."""
    W, H = brand.canvas.width, brand.canvas.height
    logo_max_h = 130
    logos: list[Image.Image] = []
    for path in (brand.logo_path, brand.partner_logo_path):
        if path and path.exists():
            logo = Image.open(path).convert("RGBA")
            logo.thumbnail((260, logo_max_h))
            logos.append(logo)

    if not logos:
        logo_font = grunge.load_font(brand.fonts.script, 44)
        _soft_shadow_text(img, (W / 2, H - margin - 60), brand.name.title(), logo_font, brand.colors.off_white, align="center")
        return

    gap = 32
    divider_w = 2 if len(logos) > 1 else 0
    total_w = sum(l.width for l in logos) + (gap * 2 + divider_w) * (len(logos) - 1)
    row_h = max(l.height for l in logos)
    x = W / 2 - total_w / 2
    y_bottom = H - margin

    for i, logo in enumerate(logos):
        ly = y_bottom - logo.height
        img.alpha_composite(logo, (round(x), round(ly)))
        x += logo.width
        if i < len(logos) - 1:
            x += gap
            divider = Image.new("RGBA", (divider_w, row_h), (*_hex_rgb(brand.colors.concrete), 160))
            img.alpha_composite(divider, (round(x), round(y_bottom - row_h)))
            x += divider_w + gap


def _hex_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def render_headline(brand: BrandConfig, party: PartyDetails, color: str) -> Image.Image:
    """Just the event-name headline, recolored — fixed position matching build_static_layer's
    reserved headline zone."""
    W, H = brand.canvas.width, brand.canvas.height
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    margin = brand.canvas.margin

    headline_font, headline_lines = _fit_headline(brand, party.event_name, W - margin * 2 - 40)
    headline_top = H * 0.24
    line_h = headline_font.size * 1.02
    baseline_y = headline_top + headline_font.size * 0.82
    _soft_shadow_text(
        img,
        (margin, baseline_y - headline_font.size * 0.82),
        "\n".join(headline_lines),
        headline_font,
        color,
        align="left",
        shadow_alpha=235,
        blur=1.1,
        line_spacing=round(line_h - headline_font.size),
    )
    return img


def compose_frame(brand: BrandConfig, party: PartyDetails, static_layer: Image.Image, color: str) -> Image.Image:
    frame = static_layer.copy()
    frame.alpha_composite(render_headline(brand, party, color))
    return frame


def _fit_headline(brand: BrandConfig, text: str, max_width: int, cap: int = 108, floor: int = 44, max_lines: int = 2):
    upper = text.upper()
    size = cap
    while size > floor:
        font = grunge.load_font(brand.fonts.heavy, size)
        lines = grunge.wrap_to_lines(upper, font, max_width)
        if len(lines) <= max_lines:
            return font, lines
        size -= 4
    font = grunge.load_font(brand.fonts.heavy, floor)
    return font, grunge.wrap_to_lines(upper, font, max_width)
