# Brand assets

- `logo.png` — SNOB BEACH wordmark, background keyed to transparent. Already included (sourced
  from the brand's logo artwork, thresholded from its white background — see the git history of
  this file for the exact conversion if you need to redo it from a new source file).
- Drop a replacement PNG here (transparent background, reasonably tight crop) to change the logo
  used by every generated poster/reel — `config.DEFAULT_BRAND` picks up `logo.png` in this
  folder automatically if present, otherwise posters fall back to a text-only kicker line.
