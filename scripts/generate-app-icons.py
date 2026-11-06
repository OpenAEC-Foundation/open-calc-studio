#!/usr/bin/env python3
"""Regenerate application icons from the approved OpenAEC artwork (Pillow)."""
import base64
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "docs/branding/open-calc-studio.png"
source = Image.open(MASTER).convert("RGBA")


def resized(size):
    return source.resize(size, Image.Resampling.LANCZOS)


# Keep the platform-specific dimensions expected by Tauri and mobile launchers.
for path in (ROOT / "src-tauri/icons").rglob("*.png"):
    with Image.open(path) as previous:
        size = previous.size
    resized(size).save(path, optimize=True)

for edge in (192, 512):
    resized((edge, edge)).save(ROOT / f"public/app-icon-{edge}.png", optimize=True)

# Preserve the SVG URLs used throughout the UI and by the browser favicon.
# The embedded PNG preserves the exact approved artwork, without font dependencies.
encoded = base64.b64encode((ROOT / "public/app-icon-512.png").read_bytes()).decode()
svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n'
       '  <title>Open Calc Studio</title>\n'
       f'  <image width="512" height="512" href="data:image/png;base64,{encoded}"/>\n'
       '</svg>\n')
for relative in ("public/app-icon.svg", "src/assets/app-icon.svg"):
    (ROOT / relative).write_text(svg)

resized((256, 256)).save(ROOT / "src-tauri/icons/icon.ico",
                       sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
resized((1024, 1024)).save(ROOT / "src-tauri/icons/icon.icns")
print("Updated browser, UI, desktop and mobile application icons.")
