# WHET × SNOB — Campaign Shot Brief (Higgsfield)

Five shots, generated **separately** (one purpose-built image per beat — never one generic
prompt reused). Every prompt keeps the same grading language so the set reads as one campaign,
shot on one day, graded as one piece: *warm 35mm film, Kodak Portra tones, natural skin, shallow
depth of field, restrained luxury color, no text, no logos.*

Aspect ratio for every shot: **9:16**. Never bake text or logos into the image — the reel's
overlay layer (`campaign_overlay.py`) owns all typography and the locked WHET × SNOB lockup.

These map 1:1 onto the campaign beats: shot 1 → invitation, 2 → atmosphere, 3/4 → energy + hero,
5 → the detail beat / cutaways.

---

## Shot 1 — Establishing (INVITATION beat)

- **Image prompt:** *"Wide cinematic establishing shot of a luxury Marrakech beach club at golden
  hour — turquoise infinity pool, ochre riad architecture, palm shadows across pale stone, warm
  low sun, almost no people, generous empty sky for negative space. Editorial resort photography,
  shot on 35mm film, Kodak Portra 400 tones, soft warm grade, fine grain, no text, no logos."*
- **Lens:** 24–35mm wide, deep-ish focus so the architecture reads.
- **Lighting:** natural golden-hour backlight, long shadows, warm rim on the palms.
- **Camera movement:** slow push-in, eased (matches the `push_in_slow` beat motion).
- **Animation prompt:** *"Very slow cinematic dolly-in, gentle heat-haze shimmer over the pool,
  subtle warm light flicker, 24fps, film grain, no fast zoom."*

## Shot 2 — Luxury guest (ATMOSPHERE beat)

- **Image prompt:** *"Editorial fashion lifestyle photograph of a stylish guest arriving at a
  Marrakech pool club, linen and swimwear, gold jewelry, oversized sunglasses, holding a cocktail,
  soft poolside reflections behind, candid but composed. 35mm film, Kodak Portra tones, natural
  warm skin, shallow depth of field, background softly out of focus, no text, no logos."*
- **Lens:** 50–85mm, wide aperture (f/1.8–f/2.8) for creamy background separation.
- **Lighting:** soft diffused daylight, warm bounce, no harsh flash.
- **Camera movement:** slight lateral drift / parallax (`drift_left`).
- **Animation prompt:** *"Subtle handheld sway, soft parallax between subject and background,
  gentle breathing motion, warm film grain, natural and imperfect, no robotic zoom."*

## Shot 3 — DJ energy (ENERGY beat)

- **Image prompt:** *"Cinematic shot of a DJ behind the decks at a Marrakech beach club as day
  turns to night, backlit by warm sunset and stage light, crowd in soft focus in the foreground
  with raised hands, atmospheric haze and light beams. 35mm film, warm desaturated highlights,
  deep warm shadows, film grain, energetic but premium, no text, no logos."*
- **Lens:** 35–50mm, moderate aperture, subject sharp / crowd soft.
- **Lighting:** backlit silhouette with warm rim, volumetric light beams through haze.
- **Camera movement:** quick controlled drift (`drift_right`), or a snap push on a beat.
- **Animation prompt:** *"Energetic but controlled — subtle handheld push toward the DJ, light
  beams sweeping, haze drifting, slight motion blur on the crowd, on-beat feel, film grain."*

## Shot 4 — Hero campaign frame (HERO beat) ★ the billboard

- **Image prompt:** *"Unforgettable cinematic hero shot — lone DJ silhouette elevated against a
  vast Marrakech sunset, dramatic warm sky, distant crowd and palms below, epic scale, luxury
  lighting, negative space in the upper frame for a large name overlay. Poster-grade composition,
  35mm film, Kodak Portra warmth, rich but restrained grade, film grain, no text, no logos."*
- **Lens:** 85–135mm telephoto compression for that layered, epic look, OR a wide low-angle for
  scale — pick one and commit.
- **Lighting:** full backlight, sun flare, subject reads as pure silhouette.
- **Camera movement:** almost still — a slow settle/pull-back so the frame "lands" (`settle`).
- **Animation prompt:** *"Nearly locked-off, a 2–3% slow pull-back that settles, sun flare
  breathing, one hero moment held long, constant film grain, cinematic 24fps."*

## Shot 5 — Detail / texture (cutaways + DETAIL)

- **Image prompt:** *"Extreme close-up detail at a luxury Marrakech pool club — condensation on a
  cocktail glass, gold jewelry on wet skin, water droplets, ripple of turquoise water, tactile and
  tasteful, no faces. 35mm film macro, Kodak Portra tones, very shallow focus, warm bokeh, film
  grain, no text, no logos."*
- **Lens:** 100mm macro, f/2.8, razor-thin focus plane.
- **Lighting:** warm directional daylight, glinting speculars on glass and metal.
- **Camera movement:** micro slow-motion drift.
- **Animation prompt:** *"Slow-motion macro drift, water droplet falling, light glinting across
  the glass, shallow focus breathing, warm grain, luxurious and unhurried."*

---

## How to run it

1. `models_explore(action:'recommend')` with goal = *"editorial luxury nightlife campaign still,
   Marrakech pool club, 9:16"* to confirm the current best model. Likely `soul_2` (editorial /
   fashion / portrait register) for the guest and hero shots; `nano_banana_pro` for the wide
   establishing / detail shots where 4K crispness matters.
2. `generate_image` once **per shot** (5 calls), `aspect_ratio: "9:16"`, `count: 2-3` so you can
   pick the best frame of each. Use the prompts above near-verbatim.
3. Optional motion: feed each chosen still into `generate_video` (image-to-video) or
   `motion_control` with that shot's **animation prompt** as the motion instruction. Reference the
   still by its returned `media_id` / `job_id` (never a raw URL) in `medias[].value`.
4. Download the 5 stills (and clips, if you made them) and drop them into the reel:

   ```bash
   python3 -m automation.snob_beach_reels.cli --campaign \
     --image shot1_establishing.jpg \
     --image shot2_guest.jpg \
     --image shot3_dj.jpg \
     --image shot4_hero.jpg \
     --image shot5_detail.jpg \
     --event-name "Sunset Sessions" --date "FRIDAY 25 JULY" \
     --dj "DJ KAYO" --dj "MOKY" --dj "SHEF CODES" \
     --hero-name "DJ KAYO" --city "MARRAKECH" \
     --audio your_track.mp3 --out whet_snob_campaign.mp4
   ```

   The pipeline applies the unified grade, the staggered editorial type, the eased motion, and the
   locked logo sign-off automatically. Images are used in beat order; the sign-off never uses a
   photo (it's the black cinematic close).

> Higgsfield's image/video APIs are **not reachable from inside the Claude Code sandbox** (egress
> policy blocks them), so run steps 1–3 from a session/machine with normal network access, or use
> the Higgsfield app directly. Step 4 (the reel assembly) runs anywhere ffmpeg + Python are
> installed.
