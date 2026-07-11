"""Step 2 — Dynamic Text Overlay.

Builds the branded promotional poster frame: SNOB BEACH logo/kicker, the event name in the
grunge magenta/yellow headline treatment, party details (date, dress code, DJ lineup, genre),
over a torn-paper photo panel — the recurring collage motif across the reference mood board
(dark text column butted against a ragged-edge full-bleed photo).

This frame becomes one of the cuts in the final reel (see video.py) — typically the opening or
closing hold, since it's the one shot that's pure information rather than motion footage.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from . import grunge
from .config import BrandConfig, PartyDetails


def build_poster(brand: BrandConfig, party: PartyDetails, source_image: Path) -> Image.Image:
    c = brand.colors
    canvas = brand.canvas
    W, H = canvas.width, canvas.height

    img = Image.new("RGBA", (W, H), c.ink)

    # ── Torn photo panel: full canvas, ragged tear leaves a dark column on the left for copy ──
    photo = Image.open(source_image)
    panel = grunge.torn_panel(photo, (W, H), border=18, border_color=c.off_white, seed=7)
    img.alpha_composite(panel)

    dark_col_w = round(W * 0.30)

    # extra scrim over the dark column so text never fights photo detail bleeding through the tear
    scrim = Image.new("RGBA", (dark_col_w + 40, H), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(scrim)
    for x in range(scrim.width):
        alpha = int(210 * (1 - x / scrim.width) ** 1.4)
        sdraw.line([(x, 0), (x, H)], fill=(*_hex_rgb(c.ink), alpha))
    img.alpha_composite(scrim, (0, 0))

    # bottom scrim across full width so the utility block reads over photo too
    bottom = Image.new("RGBA", (W, 520), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(bottom)
    for y in range(bottom.height):
        alpha = int(225 * (y / bottom.height) ** 1.6)
        bdraw.line([(0, y), (W, y)], fill=(*_hex_rgb(c.ink), alpha))
    img.alpha_composite(bottom, (0, H - bottom.height))

    margin = canvas.margin

    # ── Kicker / logo ──
    kicker_font = grunge.load_font(brand.fonts.tracked, 22, variation="Bold")
    grunge.draw_tracked_text(img, (margin, 64), f"{brand.name} PRESENTS", kicker_font, c.off_white, tracking=6)

    if brand.logo_path and brand.logo_path.exists():
        logo = Image.open(brand.logo_path).convert("RGBA")
        logo.thumbnail((dark_col_w - margin, 180))
        img.alpha_composite(logo, (margin, 100))

    # ── Date stamp badge, upper right over the photo ──
    stamp_font = grunge.load_font(brand.fonts.heavy, 26)
    grunge.draw_stamp_badge(
        img,
        center=(W - margin - 90, margin + 120),
        radius=92,
        lines=["OPENING", party.date],
        font=stamp_font,
        bg=c.magenta,
        fg=c.off_white,
        rotation=-12,
    )

    # ── Headline: event name, stacked, magenta-on-yellow, in the dark column ──
    headline_font, headline_lines = _fit_headline(brand, party.event_name, dark_col_w - margin - 10)
    headline_center_y = H * 0.42
    grunge.draw_distressed_headline(
        img,
        center=(margin + (dark_col_w - margin) / 2, headline_center_y),
        text="\n".join(headline_lines),
        font=headline_font,
        fill=c.magenta,
        shadow=c.yellow,
        outline=c.ink,
        rotation=-4,
        seed=3,
    )
    headline_font_size = headline_font.size
    headline_block_h = headline_font_size * len(headline_lines) * 0.92

    genre_y = headline_center_y + headline_block_h / 2 + 20
    if party.music_genre:
        script_font = grunge.load_font(brand.fonts.script, 52)
        grunge.draw_tracked_text(
            img,
            (margin + 6, genre_y),
            party.music_genre,
            script_font,
            c.off_white,
            tracking=0,
        )
        genre_y += 60

    # ── Utility block: dress code / DJ lineup, in the dark column ──
    util_font = grunge.load_font(brand.fonts.tracked, 21, variation="SemiBold")
    util_y = max(H * 0.66, genre_y + 30)
    line_gap = 34
    if party.dress_code:
        grunge.draw_tracked_text(img, (margin, util_y), "DRESS CODE", util_font, c.yellow, tracking=3)
        grunge.draw_tracked_text(img, (margin, util_y + line_gap), party.dress_code.upper(), util_font, c.off_white, tracking=3)
        util_y += line_gap * 2.1
    if party.dj_lineup:
        grunge.draw_tracked_text(img, (margin, util_y), "MUSIC BY", util_font, c.yellow, tracking=3)
        for name in party.dj_lineup:
            util_y += line_gap
            grunge.draw_tracked_text(img, (margin, util_y), name.upper(), util_font, c.off_white, tracking=3)

    # ── Tape accent at the tear seam ──
    grunge.draw_tape(img, (dark_col_w - 10, H * 0.18), (150, 46), c.magenta, rotation=-8)

    # ── Footer: venue / city, full width over bottom scrim ──
    footer_font = grunge.load_font(brand.fonts.tracked, 24, variation="Bold")
    footer_y = H - 96
    grunge.draw_tracked_text(img, (W / 2, footer_y), f"{party.venue_line} — {party.city.upper()}", footer_font, c.off_white, tracking=4, align="center")
    if party.tagline:
        tagline_font = grunge.load_font(brand.fonts.tracked, 18, variation="Regular")
        grunge.draw_tracked_text(img, (W / 2, footer_y + 34), party.tagline.upper(), tagline_font, c.concrete, tracking=4, align="center")

    grunge.apply_vignette(img, strength=0.4)
    grunge.apply_film_grain(img, amount=10, seed=11)

    return img.convert("RGB")


def _hex_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _fit_headline(brand: BrandConfig, text: str, max_width: int, cap: int = 132, floor: int = 46, max_lines: int = 3):
    """Largest display size (capped) at which the (possibly word-wrapped) headline fits both
    max_width per line and a sane line count — condensed Anton stacks 2-3 short words well, but
    an unbounded line count would run the headline off the bottom of the dark column."""
    upper = text.upper()
    size = cap
    while size > floor:
        font = grunge.load_font(brand.fonts.display, size)
        lines = grunge.wrap_to_lines(upper, font, max_width, stroke_width=6)
        if len(lines) <= max_lines:
            return font, lines
        size -= 4
    font = grunge.load_font(brand.fonts.display, floor)
    return font, grunge.wrap_to_lines(upper, font, max_width, stroke_width=6)
