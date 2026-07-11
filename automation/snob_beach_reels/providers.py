"""Step 1 — Image Analysis & Expansion.

A pluggable `ImageProvider` interface plus concrete backends. Every backend takes the single
source photo and returns up to 5 new 9:16 frames that should read as "the same shoot, different
angle" (wide crowd shot, DJ silhouette, day-to-night transition, dance-floor detail, poolside
lounge) rather than a generic stock image — see `SCENE_BRIEFS` below for the actual prompts sent.

Swap providers via `SNOB_BEACH_IMAGE_PROVIDER` env var: replicate (default) | openai | none.
`none` (or no API key configured) falls back to `LocalVariationProvider`, which produces
deterministic crop/pan/color-grade variations of the source photo entirely offline — the reel
pipeline always has *something* to cut to, even before an API key is wired up.
"""

from __future__ import annotations

import base64
import time
from abc import ABC, abstractmethod
from pathlib import Path

import requests
from PIL import Image, ImageEnhance, ImageOps

from . import config

# Prompts for the 2-3 companion shots — each one explicitly told to match the source photo's
# color grade/lighting/vibe (not just "a beach club"), per the brief: same aesthetic, different
# angle. Kept short-list rather than configurable per-call: the brand's visual identity shouldn't
# drift call to call.
SCENE_BRIEFS: list[str] = [
    "A wide, high-energy crowd shot at a luxury Marrakech beach club pool party at golden hour, "
    "sun-drenched, palm trees, people dancing and raising hands, cinematic color grade matching "
    "the reference photo exactly — same warmth, contrast, and film-like grain.",
    "A DJ silhouette behind decks at dusk at a luxury Marrakech beach club, moody backlighting, "
    "crowd in soft focus in front, cinematic color grade matching the reference photo exactly — "
    "same warmth, contrast, and film-like grain.",
    "A luxury Marrakech beach club pool at the exact moment of a day-to-night transition — warm "
    "sunset sky fading to string lights and torches, empty loungers in foreground, cinematic "
    "color grade matching the reference photo exactly — same warmth, contrast, and film-like grain.",
    "A close-up, energetic dance-floor detail shot at a luxury Marrakech beach club — raised "
    "hands, clinking glasses, motion blur from movement, shallow depth of field, cinematic color "
    "grade matching the reference photo exactly — same warmth, contrast, and film-like grain.",
    "A wide, golden-hour poolside lounge shot at a luxury Marrakech beach club — daybeds, palm "
    "shade, turquoise pool water, relaxed crowd, cinematic color grade matching the reference "
    "photo exactly — same warmth, contrast, and film-like grain.",
]


class ImageProvider(ABC):
    @abstractmethod
    def generate_variations(self, source_image: Path, out_dir: Path, count: int = 3) -> list[Path]:
        """Return `count` new 9:16 image files in out_dir, styled after source_image."""
        raise NotImplementedError


# ── Replicate (default) ─────────────────────────────────────────────────────────────────────
# Same model family the existing Next.js app uses for its "cinematic" poster variant
# (src/lib/replicate.ts's generateSceneImage / google/nano-banana) — chosen here for the same
# reason: it fuses a real reference photo with a text brief while preserving the source's actual
# look, rather than generating an unrelated image from the prompt alone.
REPLICATE_MODEL = "google/nano-banana"


class ReplicateProvider(ImageProvider):
    def __init__(self, api_token: str | None = None):
        self.api_token = api_token or config.REPLICATE_API_TOKEN
        if not self.api_token:
            raise RuntimeError("REPLICATE_API_TOKEN is not set")

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_token}"}

    def _upload_source(self, source_image: Path) -> str:
        """Replicate's /v1/files endpoint hands back an https URL usable as a model input —
        needed because nano-banana's image_input takes URLs, not raw multipart bytes, and the
        source photo only exists on local disk at this point in the pipeline."""
        with open(source_image, "rb") as fh:
            res = requests.post(
                "https://api.replicate.com/v1/files",
                headers=self._headers(),
                files={"content": (source_image.name, fh, "image/jpeg")},
                timeout=60,
            )
        res.raise_for_status()
        return res.json()["urls"]["get"]

    def _create_prediction(self, prompt: str, image_url: str) -> dict:
        for attempt in range(1, 6):
            res = requests.post(
                f"https://api.replicate.com/v1/models/{REPLICATE_MODEL}/predictions",
                headers={**self._headers(), "Content-Type": "application/json"},
                json={"input": {"prompt": prompt, "image_input": [image_url]}},
                timeout=30,
            )
            if res.ok:
                return res.json()
            if res.status_code == 429 and attempt < 5:
                retry_after = 12
                try:
                    retry_after = max(res.json().get("retry_after", 12), 3) + 1
                except Exception:
                    pass
                time.sleep(retry_after)
                continue
            res.raise_for_status()
        raise RuntimeError("Replicate prediction create failed after retries")

    def _poll(self, prediction_id: str, timeout_s: int = 120) -> dict:
        start = time.time()
        while time.time() - start < timeout_s:
            res = requests.get(
                f"https://api.replicate.com/v1/predictions/{prediction_id}", headers=self._headers(), timeout=30
            )
            res.raise_for_status()
            data = res.json()
            if data["status"] in ("succeeded", "failed", "canceled"):
                return data
            time.sleep(1.5)
        raise TimeoutError("Replicate prediction timed out")

    def generate_variations(self, source_image: Path, out_dir: Path, count: int = 3) -> list[Path]:
        image_url = self._upload_source(source_image)
        out_dir.mkdir(parents=True, exist_ok=True)
        results: list[Path] = []
        for i, brief in enumerate(SCENE_BRIEFS[:count]):
            created = self._create_prediction(brief, image_url)
            finished = self._poll(created["id"])
            if finished["status"] != "succeeded" or not finished.get("output"):
                raise RuntimeError(f"Replicate generation failed: {finished.get('error', 'unknown error')}")
            output_url = finished["output"][0] if isinstance(finished["output"], list) else finished["output"]
            img_res = requests.get(output_url, timeout=60)
            img_res.raise_for_status()
            dest = out_dir / f"variation_{i}.png"
            dest.write_bytes(img_res.content)
            results.append(dest)
        return results


# ── OpenAI (gpt-image-1 edits) ──────────────────────────────────────────────────────────────
class OpenAIProvider(ImageProvider):
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or config.OPENAI_API_KEY
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")

    def generate_variations(self, source_image: Path, out_dir: Path, count: int = 3) -> list[Path]:
        out_dir.mkdir(parents=True, exist_ok=True)
        results: list[Path] = []
        for i, brief in enumerate(SCENE_BRIEFS[:count]):
            with open(source_image, "rb") as fh:
                res = requests.post(
                    "https://api.openai.com/v1/images/edits",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    files={"image": (source_image.name, fh, "image/jpeg")},
                    data={"model": "gpt-image-1", "prompt": brief, "size": "1024x1536", "n": 1},
                    timeout=120,
                )
            res.raise_for_status()
            b64 = res.json()["data"][0]["b64_json"]
            dest = out_dir / f"variation_{i}.png"
            dest.write_bytes(base64.b64decode(b64))
            results.append(dest)
        return results


# ── Runway / Leonardo / Higgsfield — adapter skeletons ──────────────────────────────────────
# Same `ImageProvider` shape as above; not wired into PROVIDERS below because their exact
# request/response contracts should be confirmed against each vendor's current API reference
# before shipping (all three iterate their APIs faster than this file can track). Fill in
# `_endpoint`/`_build_payload` and register in PROVIDERS to enable.
class RunwayProvider(ImageProvider):
    """Runway's image-to-image / reference-conditioned generation. See
    https://docs.dev.runwayml.com/ for the current `image_to_image` (or `text_to_image` with a
    `referenceImages` field) task shape — as of writing it's an async task API: POST to create
    the task, then poll GET .../tasks/{id} for the result, same two-phase shape as Replicate
    above. Set RUNWAY_API_KEY and implement `_create_task`/`_poll` following that pattern."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or config.RUNWAY_API_KEY
        if not self.api_key:
            raise RuntimeError("RUNWAY_API_KEY is not set")

    def generate_variations(self, source_image: Path, out_dir: Path, count: int = 3) -> list[Path]:
        raise NotImplementedError(
            "Confirm Runway's current task-creation payload shape (docs.dev.runwayml.com) before enabling — "
            "then implement the same upload -> create task -> poll -> download flow as ReplicateProvider."
        )


class LeonardoProvider(ImageProvider):
    """Leonardo.Ai's Image Guidance / img2img generation endpoint (POST /generations with an
    `init_image_id` from their upload endpoint). See https://docs.leonardo.ai/reference for the
    current field names before enabling — same shape: upload -> create generation -> poll
    /generations/{id} -> download."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or config.LEONARDO_API_KEY
        if not self.api_key:
            raise RuntimeError("LEONARDO_API_KEY is not set")

    def generate_variations(self, source_image: Path, out_dir: Path, count: int = 3) -> list[Path]:
        raise NotImplementedError(
            "Confirm Leonardo's current /generations payload shape (docs.leonardo.ai) before enabling."
        )


class HiggsfieldProvider(ImageProvider):
    """Higgsfield's image generation / outpaint API. If you're driving this from inside a Claude
    session that already has the Higgsfield MCP connector, the equivalent calls
    (generate_image / outpaint_image) are available as MCP tools directly — no HTTP client
    needed. For a standalone script outside that context, see Higgsfield's API docs for the
    REST equivalent and implement the same upload -> create -> poll -> download flow."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or config.HIGGSFIELD_API_KEY
        if not self.api_key:
            raise RuntimeError("HIGGSFIELD_API_KEY is not set")

    def generate_variations(self, source_image: Path, out_dir: Path, count: int = 3) -> list[Path]:
        raise NotImplementedError("Wire up Higgsfield's current REST API per their docs before enabling.")


# ── Offline fallback — no API key required ──────────────────────────────────────────────────
class LocalVariationProvider(ImageProvider):
    """No external calls. Produces `count` deterministic crop/pan/color-grade variations of the
    source photo so the reel pipeline has multiple frames to cut between even with zero AI
    budget configured. Not a substitute for real scene generation — it's what keeps `pipeline.py`
    runnable out of the box and is what step 3 (video assembly) gets tested against."""

    _GRADES = [
        {"crop": (0.5, 0.32), "zoom": 1.18, "contrast": 1.12, "color": 1.15, "brightness": 1.02},
        {"crop": (0.28, 0.62), "zoom": 1.3, "contrast": 1.2, "color": 0.9, "brightness": 0.88},
        {"crop": (0.72, 0.45), "zoom": 1.22, "contrast": 1.08, "color": 1.05, "brightness": 1.08},
        {"crop": (0.5, 0.75), "zoom": 1.42, "contrast": 1.25, "color": 1.1, "brightness": 0.95},
        {"crop": (0.35, 0.4), "zoom": 1.15, "contrast": 1.05, "color": 1.2, "brightness": 1.1},
    ]

    def generate_variations(self, source_image: Path, out_dir: Path, count: int = 3) -> list[Path]:
        out_dir.mkdir(parents=True, exist_ok=True)
        src = ImageOps.exif_transpose(Image.open(source_image)).convert("RGB")
        results: list[Path] = []
        for i, grade in enumerate(self._GRADES[:count]):
            img = self._apply_grade(src, grade)
            dest = out_dir / f"variation_{i}.png"
            img.save(dest)
            results.append(dest)
        return results

    @staticmethod
    def _apply_grade(src: Image.Image, grade: dict) -> Image.Image:
        w, h = src.size
        target_ratio = 9 / 16
        zoom = grade["zoom"]
        # Crop a 9:16 window sized by zoom, centered at the grade's (cx, cy) fraction of the frame.
        if w / h > target_ratio:
            crop_h = h / zoom
            crop_w = crop_h * target_ratio
        else:
            crop_w = w / zoom
            crop_h = crop_w / target_ratio
        cx, cy = grade["crop"]
        left = min(max(w * cx - crop_w / 2, 0), w - crop_w)
        top = min(max(h * cy - crop_h / 2, 0), h - crop_h)
        img = src.crop((left, top, left + crop_w, top + crop_h))
        img = ImageEnhance.Contrast(img).enhance(grade["contrast"])
        img = ImageEnhance.Color(img).enhance(grade["color"])
        img = ImageEnhance.Brightness(img).enhance(grade["brightness"])
        return img


PROVIDERS: dict[str, type[ImageProvider]] = {
    "replicate": ReplicateProvider,
    "openai": OpenAIProvider,
    "none": LocalVariationProvider,
}


def get_provider(name: str | None = None) -> ImageProvider:
    """Resolve the configured provider, falling back to the offline one if the chosen provider
    has no API key set — the reel pipeline should never hard-fail step 1 just because a key is
    missing during setup."""
    name = (name or config.IMAGE_PROVIDER or "replicate").lower()
    provider_cls = PROVIDERS.get(name, LocalVariationProvider)
    try:
        return provider_cls()
    except RuntimeError:
        return LocalVariationProvider()
