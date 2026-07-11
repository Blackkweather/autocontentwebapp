"""Step 4 — Audio Integration.

Two paths, both landing on the same output contract (a WAV/AAC-ready audio file trimmed to the
reel's exact duration with fade in/out):

1. `prepare_track` — caller supplies an Afro House / Deep House track; ffmpeg trims (or loops,
   if the track is shorter than the reel) and fades it.
2. `synth_club_loop` — no track supplied: a small numpy synthesizer renders a four-on-the-floor
   kick/bass/hat loop at the genre's BPM as a copyright-free stand-in. Not a substitute for a
   real track — it exists so the pipeline never blocks on "no music yet".

`beat_grid` gives video.py cut points aligned to bar boundaries (every 2 beats) so clip changes
land on the beat instead of at arbitrary offsets — a lightweight stand-in for full onset-based
beat-matching (which would pull in librosa/essentia; a genre BPM lookup covers the brief's "sync
the cuts to the beat" without that dependency weight).
"""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import numpy as np

GENRE_BPM = {
    "afro house": 122,
    "afrohouse": 122,
    "amapiano": 112,
    "deep house": 124,
    "deephouse": 124,
    "house": 126,
    "tech house": 126,
    "techno": 128,
}
DEFAULT_BPM = 124
SAMPLE_RATE = 44100


def bpm_for_genre(genre: str | None) -> int:
    if not genre:
        return DEFAULT_BPM
    return GENRE_BPM.get(genre.strip().lower(), DEFAULT_BPM)


def beat_grid(duration_s: float, bpm: int, beats_per_bar: int = 2) -> list[float]:
    """Timestamps (seconds) of every `beats_per_bar`-th beat, up to duration_s — the candidate
    cut points a beat-synced edit should snap to."""
    beat_s = 60.0 / bpm
    bar_s = beat_s * beats_per_bar
    points = []
    t = 0.0
    while t < duration_s:
        points.append(round(t, 3))
        t += bar_s
    return points


def snap_to_beat(target_s: float, grid: list[float]) -> float:
    """Nearest beat-grid timestamp to a target cut time, floored at one bar so no clip collapses
    to ~0 length."""
    if not grid:
        return target_s
    nearest = min(grid, key=lambda g: abs(g - target_s))
    return max(nearest, grid[1] if len(grid) > 1 else nearest)


def prepare_track(source: Path | None, duration_s: float, out_path: Path, genre: str | None = None) -> Path:
    if source and Path(source).exists():
        return _trim_or_loop_track(Path(source), duration_s, out_path)
    return synth_club_loop(duration_s, bpm_for_genre(genre), out_path)


def _trim_or_loop_track(source: Path, duration_s: float, out_path: Path) -> Path:
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(source)],
        capture_output=True,
        text=True,
        check=True,
    )
    src_duration = float(probe.stdout.strip() or 0)
    fade_out_start = max(duration_s - 0.6, 0)

    if src_duration and src_duration < duration_s:
        # Loop the track (stream_loop -1 + explicit -t cap) rather than a hard cut-and-repeat —
        # avoids an audible seam if the source itself already loops cleanly at its own boundary.
        cmd = [
            "ffmpeg", "-y", "-stream_loop", "-1", "-i", str(source),
            "-t", f"{duration_s:.3f}",
            "-af", f"afade=t=in:st=0:d=0.6,afade=t=out:st={fade_out_start:.3f}:d=0.6",
            "-ar", str(SAMPLE_RATE), "-ac", "2",
            str(out_path),
        ]
    else:
        cmd = [
            "ffmpeg", "-y", "-i", str(source),
            "-t", f"{duration_s:.3f}",
            "-af", f"afade=t=in:st=0:d=0.6,afade=t=out:st={fade_out_start:.3f}:d=0.6",
            "-ar", str(SAMPLE_RATE), "-ac", "2",
            str(out_path),
        ]
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path


def synth_club_loop(duration_s: float, bpm: int, out_path: Path, seed: int | None = 7) -> Path:
    """Procedural four-on-the-floor loop: sine sub-bass kick, filtered noise hats, a simple
    off-beat bass tone. Deliberately minimal (no melodic sampling — that's what risks sounding
    like an existing track) — a clean, license-free bed to cut picture against until a real
    track is dropped in."""
    rng = np.random.default_rng(seed)
    n = int(duration_s * SAMPLE_RATE)
    t = np.arange(n) / SAMPLE_RATE
    mix = np.zeros(n, dtype=np.float64)

    beat_s = 60.0 / bpm
    n_beats = int(duration_s / beat_s) + 1

    for i in range(n_beats):
        beat_t = i * beat_s
        # Kick on every beat: pitched-down sine with fast amplitude decay.
        mix += _kick(t, beat_t, freq=58, decay=0.18)
        # Closed hat on the off-beat (every half beat).
        mix += _hat(t, beat_t + beat_s / 2, rng, decay=0.05)
        # Sub-bass note on beats 1 and 3 of every bar (every other beat), root + fifth alternating.
        if i % 4 in (0, 2):
            freq = 55 if i % 8 < 4 else 82.4
            mix += _bass(t, beat_t, freq=freq, dur=beat_s * 0.9, decay=0.22)

    # gentle limiter
    peak = np.max(np.abs(mix)) or 1.0
    mix = (mix / peak) * 0.82

    fade_n = int(0.6 * SAMPLE_RATE)
    if n > fade_n * 2:
        fade_in = np.linspace(0, 1, fade_n)
        fade_out = np.linspace(1, 0, fade_n)
        mix[:fade_n] *= fade_in
        mix[-fade_n:] *= fade_out

    stereo = np.stack([mix, mix], axis=1)
    pcm = np.clip(stereo * 32767, -32768, 32767).astype(np.int16)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())
    return out_path


def _kick(t: np.ndarray, onset: float, freq: float, decay: float) -> np.ndarray:
    local = t - onset
    env = np.where(local >= 0, np.exp(-local / decay), 0.0)
    pitch_env = np.where(local >= 0, np.exp(-local / (decay * 0.25)), 0.0)
    inst_freq = freq * (1 + 3 * pitch_env)
    phase = 2 * np.pi * np.cumsum(inst_freq) / SAMPLE_RATE
    return 0.9 * env * np.sin(phase) * (local >= 0) * (local < decay * 6)


def _hat(t: np.ndarray, onset: float, rng: np.random.Generator, decay: float) -> np.ndarray:
    local = t - onset
    window = (local >= 0) & (local < decay * 6)
    env = np.where(window, np.exp(-np.clip(local, 0, None) / decay), 0.0)
    noise = rng.uniform(-1, 1, size=t.shape)
    return 0.18 * env * noise * window


def _bass(t: np.ndarray, onset: float, freq: float, dur: float, decay: float) -> np.ndarray:
    local = t - onset
    window = (local >= 0) & (local < dur)
    env = np.where(window, np.exp(-np.clip(local, 0, None) / decay), 0.0)
    tone = np.sin(2 * np.pi * freq * np.clip(local, 0, None)) + 0.4 * np.sin(2 * np.pi * freq * 2 * np.clip(local, 0, None))
    return 0.35 * env * tone * window
