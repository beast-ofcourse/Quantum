"""
convert-icon.py
Convert a 1024x1024 JPG icon (with dark gradient background) into a transparent PNG
plus all required icon sizes/formats for Tauri.

Strategy:
- Threshold-based alpha: any pixel with RGB sum < THRESHOLD becomes fully transparent.
  Pixels above the threshold preserve their RGB and get full opacity.
- Anti-aliased edge softening: pixels within 32 of the threshold get a gradient alpha,
  so the cutout edge looks smooth rather than jagged.

Output files written to src-tauri/icons/:
  icon.png            (1024x1024 RGBA, master)
  32x32.png           (32x32 RGBA)
  128x128.png         (128x128 RGBA)
  128x128@2x.png      (256x256 RGBA)
  icon.ico            (multi-res 16, 32, 48, 64, 128, 256)
  icon.icns           (512x512 ICNS for macOS)
"""

import sys
from pathlib import Path
from PIL import Image

LANCZOS = getattr(getattr(Image, "Resampling", Image), "LANCZOS", 1)

THRESHOLD = 192
SOFT_RANGE = 32

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(r"C:\Users\Bhavin\AppData\Local\Temp\opencode\lucid-Apple.jpg")
ICONS_DIR = PROJECT_ROOT / "src-tauri" / "icons"


def apply_threshold_alpha(rgb_img: Image.Image) -> Image.Image:
    rgba = rgb_img.convert("RGBA")
    raw = rgba.tobytes()
    n = len(raw) // 4
    data: list[tuple[int, int, int, int]] = [
        (raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2], raw[i * 4 + 3]) for i in range(n)
    ]
    out: list[tuple[int, int, int, int]] = []
    for r, g, b, _a in data:
        s = r + g + b
        if s < THRESHOLD:
            out.append((r, g, b, 0))
        elif s >= THRESHOLD + SOFT_RANGE:
            out.append((r, g, b, 255))
        else:
            a = int(255 * (s - THRESHOLD) / SOFT_RANGE)
            out.append((r, g, b, a))
    rgba.putdata(out)
    return rgba


def resize(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    return img.resize(size, LANCZOS)


def main() -> int:
    if not SOURCE.exists():
        print(f"ERROR: source image not found at {SOURCE}", file=sys.stderr)
        return 1
    if not ICONS_DIR.exists():
        print(f"ERROR: icons dir not found at {ICONS_DIR}", file=sys.stderr)
        return 1

    print(f"Loading {SOURCE} ...")
    src = Image.open(SOURCE)
    print(f"  size={src.size} mode={src.mode}")
    if src.size != (1024, 1024):
        print(f"  WARN: expected 1024x1024, got {src.size}; resizing master only")
        src = src.resize((1024, 1024), LANCZOS)

    print("Applying threshold-based transparency ...")
    master = apply_threshold_alpha(src.convert("RGB"))
    print(f"  master RGBA ready, size={master.size}")

    print("Generating icon.png (1024x1024 master) ...")
    master_path = ICONS_DIR / "icon.png"
    master.save(master_path)
    print(f"  WROTE {master_path.relative_to(PROJECT_ROOT)}  ({master_path.stat().st_size / 1024:.1f} KB)")

    sizes_png: list[tuple[str, tuple[int, int]]] = [
        ("32x32.png", (32, 32)),
        ("128x128.png", (128, 128)),
        ("128x128@2x.png", (256, 256)),
    ]
    for name, size in sizes_png:
        p = ICONS_DIR / name
        resize(master, size).save(p)
        print(f"  WROTE {p.relative_to(PROJECT_ROOT)}  ({p.stat().st_size / 1024:.1f} KB)  [{size[0]}x{size[1]}]")

    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    print(f"Generating icon.ico (multi-res: {', '.join(str(s[0]) for s in ico_sizes)}) ...")
    ico_path = ICONS_DIR / "icon.ico"
    master.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"  WROTE {ico_path.relative_to(PROJECT_ROOT)}  ({ico_path.stat().st_size / 1024:.1f} KB)  [{len(ico_sizes)} resolutions]")

    print("Generating icon.icns (512x512) ...")
    icns_path = ICONS_DIR / "icon.icns"
    resize(master, (512, 512)).save(icns_path, format="ICNS")
    print(f"  WROTE {icns_path.relative_to(PROJECT_ROOT)}  ({icns_path.stat().st_size / 1024:.1f} KB)")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
