# Brand assets

- `logo.png` — SNOB BEACH wordmark (the venue), background keyed to transparent. Sourced from
  the brand's logo artwork, thresholded from its white background.
- `whet_logo.png` — WHET wordmark (the event planner/promoter co-running this party series with
  SNOB BEACH), background keyed to transparent from a flat-grey source graphic. Rendered
  side-by-side with `logo.png` at the bottom of the reel overlay (`overlay._draw_logo_row`) — a
  collab credit, not a replacement.
- `config.DEFAULT_BRAND` picks up both files from this folder automatically if present
  (`logo_path` / `partner_logo_path`). Drop in a replacement PNG (transparent background,
  reasonably tight crop) to change either logo; delete a file (or pass `logo_path=None` /
  `partner_logo_path=None` on a custom `BrandConfig`) to drop that side of the credit. With
  neither present, the overlay falls back to the brand name as styled script text.
