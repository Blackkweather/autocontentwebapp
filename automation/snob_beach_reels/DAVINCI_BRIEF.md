# WHET × SNOB — Campaign Shot Brief (DaVinci.ai / Seedance 2.0)

Seedance 2.0 is a **video** model, so each of these generates a short clip (~4-5s) with real
motion — you don't need the separate "animation prompt" step. Generate each shot **separately**
(one clip per beat, never one generic prompt reused). Keep the grading language identical across
all of them so the set cuts together as one campaign shot on one day.

**Every clip:** vertical **9:16**, no text, no logos, no captions burned in (the reel overlay
owns all typography and the locked WHET × SNOB lockup). Consistent look across all: *warm 35mm
film, Kodak Portra tones, natural skin, shallow depth of field, restrained luxury grade, fine
grain.*

Map onto the campaign beats: 1 → invitation, 2 → atmosphere, 3 → energy, 4 → hero, 5 → detail.

---

### Shot 1 — Establishing (INVITATION)
> *Cinematic slow dolly-in over a luxury Marrakech beach club at golden hour — turquoise infinity
> pool, ochre riad architecture, palm-shadow patterns on pale stone, warm low sun, almost empty,
> gentle heat-haze over the water. 35mm film, Kodak Portra 400 warmth, shallow depth of field,
> fine grain, cinematic, no text, no logos, vertical 9:16.*

### Shot 2 — Luxury guest (ATMOSPHERE)
> *Editorial fashion lifestyle — a stylish guest arriving poolside at a Marrakech beach club,
> linen and swimwear, gold jewellery, oversized sunglasses, holding a cocktail, soft handheld
> movement, pool reflections shimmering behind, background beautifully out of focus. 35mm film,
> Kodak Portra tones, natural warm skin, shallow depth of field, no text, no logos, 9:16.*

### Shot 3 — DJ energy (ENERGY)
> *A DJ behind the decks at a Marrakech beach club as day turns to night, backlit by warm sunset
> and stage light, hazy air with sweeping light beams, crowd in soft-focus foreground with raised
> hands, subtle camera push, energetic but premium. 35mm film, warm desaturated highlights, deep
> warm shadows, film grain, no text, no logos, 9:16.*

### Shot 4 — Hero campaign frame (HERO) ★ the billboard
> *Epic hero shot — lone DJ silhouette elevated against a vast Marrakech sunset, dramatic warm
> sky, distant crowd and palms below, sun flare, luxury lighting, the camera almost still with a
> slow settle, negative space in the upper frame. Poster-grade cinematic composition, 35mm film,
> Kodak Portra warmth, film grain, no text, no logos, 9:16.*

### Shot 5 — Detail / texture (DETAIL cutaway)
> *Extreme slow-motion close-up at a luxury Marrakech pool club — condensation on a cocktail
> glass, gold jewellery on wet skin, a water droplet falling, ripple of turquoise water, light
> glinting across glass, no faces. 35mm macro, Kodak Portra tones, very shallow focus, warm bokeh,
> film grain, luxurious and unhurried, no text, no logos, 9:16.*

---

## Then assemble

Download the 5 Seedance clips and drop them straight into the campaign build — the pipeline now
ingests **video clips** as beats (not just stills), keeps their own motion, and lays the graded
editorial type + the fixed WHET × SNOB sign-off on top:

```bash
python3 -m automation.snob_beach_reels.cli --campaign \
  --image shot1_establishing.mp4 \
  --image shot2_guest.mp4 \
  --image shot3_dj.mp4 \
  --image shot4_hero.mp4 \
  --image shot5_detail.mp4 \
  --event-name "Sunset Sessions" --date "FRIDAY 25 JULY" \
  --dj "DJ KAYO" --dj "MOKY" --dj "SHEF CODES" \
  --hero-name "DJ KAYO" --city "MARRAKECH" \
  --audio your_track.mp3 --out whet_snob_campaign.mp4
```

`--image` takes either photos or video clips — mix freely. Clips are used in beat order; the
sign-off never uses footage (it's the black cinematic close). Fewer than 5 clips cycle across the
photographic beats.

> Note: DaVinci.ai / Seedance runs in your browser, and its API isn't reachable from inside this
> automation's sandbox — so generate the clips in the DaVinci app, download them, then run the
> assembly command above wherever you have ffmpeg + Python (or send the clips here and I'll
> assemble them).
