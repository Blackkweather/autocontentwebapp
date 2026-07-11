"""SNOB BEACH Instagram Reel automation.

See README.md in this directory for setup and usage. `pipeline.generate_reel` is the main
entry point; `cli.py` wraps it for command-line use.
"""

from .config import BrandConfig, DEFAULT_BRAND, PartyDetails
from .pipeline import generate_reel

__all__ = ["generate_reel", "BrandConfig", "DEFAULT_BRAND", "PartyDetails"]
