# SNOB BEACH — Instagram Reel automation

Turns one photo + a few party details into a branded, cinematic 1080×1920 MP4 reel in the
dark/moody, magenta-and-yellow, torn-paper "nightlife promoter" aesthetic (Family Affair
Dubai / WHET-style mood board).

Standalone Python tool — separate from the Next.js poster pipeline elsewhere in this repo
(`src/lib/poster/`, which generates static event posters for a different brand/product). This
package doesn't touch that app's code path; it's invoked as its own CLI or imported as a library.

## Pipeline

| Step | Module | What it does |
|---|---|---|
| 1. Image analysis & expansion | `providers.py` | Sends your source photo + brief to an AI image model, gets back 2-3 companion shots (wide crowd, DJ silhouette, day-to-night) styled to match the original's color grade. |
| 2. Dynamic text overlay | `poster.py` + `grunge.py` | Renders the branded promo poster frame: torn-paper photo panel, distressed magenta/yellow headline, date stamp, dress code / DJ lineup, logo. |
| 3. Video assembly & transitions | `video.py` | Ken-Burns zoom/pan on every still (ffmpeg `zoompan`), crossfade-chained (`xfade`) into one reel. |
| 4. Audio | `audio.py` | Trims/loops/fades a track you supply, or synthesizes a copyright-free four-on-the-floor loop at the genre's BPM if you don't have one yet. |
| Orchestration | `pipeline.py` / `cli.py` | Wires 1-4 into one call / one command. |

Output: a 1080×1920, ~13s, H.264 + AAC MP4, ready to upload to Reels.

## Setup

```bash
cd automation/snob_beach_reels
pip install -r requirements.txt
python3 -m automation.snob_beach_reels.fetch_assets   # downloads the OFL fonts (run from repo root)
```

You also need **ffmpeg** on PATH (`apt install ffmpeg` / `brew install ffmpeg`) — step 3 shells
out to it directly, there's no bundled binary.

Copy `.env.example` to `.env` in this directory and fill in whichever image-provider key you're
using (see below). Everything else has a sane default.

## Usage

```bash
# from the repo root
python3 -m automation.snob_beach_reels.cli \
  --image path/to/photo.jpg \
  --event-name "All White" \
  --date "FRIDAY 18 JULY" \
  --dress-code "All White" \
  --dj "DJ KAYO" --dj "FRIENDS" \
  --genre "Afro House" \
  --audio path/to/track.mp3 \
  --out output/all_white_reel.mp4
```

Omit `--audio` to get a synthesized club-vibe loop instead. Run `--help` for the full flag list
(venue line, city, tagline, logo override, provider choice, variation count).

As a library:

```python
from pathlib import Path
from automation.snob_beach_reels import generate_reel, PartyDetails

party = PartyDetails(
    event_name="All White",
    date="FRIDAY 18 JULY",
    dress_code="All White",
    dj_lineup=["DJ KAYO", "FRIENDS"],
    music_genre="Afro House",
)
out_path = generate_reel(Path("photo.jpg"), party, out_path=Path("output/reel.mp4"))
```

## Swapping the image-expansion API

Set `SNOB_BEACH_IMAGE_PROVIDER` (env var or `.env`) to one of:

- **`replicate`** (default) — `google/nano-banana`, the same model the main app's cinematic
  poster variant uses (`src/lib/replicate.ts`). ~$0.03-0.04/image. Needs `REPLICATE_API_TOKEN`.
- **`openai`** — `gpt-image-1` via `/v1/images/edits`. Needs `OPENAI_API_KEY`.
- **`none`** — no API calls. Deterministic offline crop/pan/color-grade variations of your source
  photo (`LocalVariationProvider`). What the pipeline falls back to automatically if the chosen
  provider has no key configured, so it always runs even before you've picked an AI vendor.

To wire up **Runway**, **Leonardo**, or **Higgsfield** instead: `providers.py` has adapter
skeletons for all three (`RunwayProvider`, `LeonardoProvider`, `HiggsfieldProvider`) implementing
the same `ImageProvider` interface as the working `ReplicateProvider`/`OpenAIProvider`. Each has a
docstring pointing at that vendor's current API reference — confirm the exact
upload/create/poll/download field names against their docs (all three iterate faster than a
static file can track), fill in `generate_variations`, and register the class in `PROVIDERS` at
the bottom of the file. If you're already inside a Claude session with the Higgsfield MCP
connector attached, you can also just call its `generate_image`/`outpaint_image` tools directly
instead of going through this script at all.

## Brand assets

See `assets/brand/README.md` for the logo, and `config.py`'s `Colors`/`Fonts`/`Canvas`/
`ReelTiming` dataclasses for every other configurable brand parameter (magenta/yellow hex values,
canvas size, reel length, crossfade duration, etc.) — all in one place, nothing hardcoded in the
render code.

## Notes / limitations

- Beat-sync is a BPM lookup by genre (`audio.GENRE_BPM`) driving cut-point snapping, not full
  audio onset detection — accurate enough to land cuts on the beat without pulling in a heavy
  audio-analysis dependency (librosa/essentia). Swap in real onset detection in `audio.py` if you
  need tighter sync against a specific track.
- The synthesized fallback track is a plain kick/hat/sub-bass loop — a placeholder to keep the
  pipeline runnable with zero audio budget, not a substitute for a real Afro/Deep House track.
- `providers.LocalVariationProvider`'s offline "variations" are crop/color-grade transforms of
  your one source photo, not new AI-generated angles — good enough to test steps 2-4 without
  spending API credits, not a substitute for step 1 actually running.
