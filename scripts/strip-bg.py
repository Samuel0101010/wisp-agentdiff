"""
One-shot brand-asset cleanup:
- wisp-logo.png  : uniform dark background -> color-key by corner sample
- wisp-figure.png: gradient/photo background -> ML strip via rembg
Both then auto-crop to the alpha bounding box and save optimized RGBA PNG.
"""

import io
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "docs" / "assets"


def sample_bg(im: Image.Image) -> tuple[int, int, int]:
    """Average the four corners of the image to get the background color."""
    w, h = im.size
    cs = [im.getpixel((1, 1)), im.getpixel((w - 2, 1)), im.getpixel((1, h - 2)), im.getpixel((w - 2, h - 2))]
    cs = [c[:3] if isinstance(c, tuple) else (c, c, c) for c in cs]
    r = sum(c[0] for c in cs) // 4
    g = sum(c[1] for c in cs) // 4
    b = sum(c[2] for c in cs) // 4
    return r, g, b


def color_key(im: Image.Image, bg: tuple[int, int, int], tol: int) -> Image.Image:
    """Soft alpha: distance-to-bg → alpha ramp inside the tolerance band."""
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    br, bg_, bb = bg
    inner = tol  # below this → fully transparent
    outer = tol + 40  # above this → fully opaque; between → ramp
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            d = ((r - br) ** 2 + (g - bg_) ** 2 + (b - bb) ** 2) ** 0.5
            if d <= inner:
                px[x, y] = (r, g, b, 0)
            elif d >= outer:
                px[x, y] = (r, g, b, 255)
            else:
                # linear ramp
                a = int(255 * (d - inner) / (outer - inner))
                px[x, y] = (r, g, b, a)
    return rgba


def trim(im: Image.Image, pad: int = 4) -> Image.Image:
    bbox = im.getbbox()
    if bbox is None:
        return im
    x0, y0, x1, y1 = bbox
    w, h = im.size
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(w, x1 + pad)
    y1 = min(h, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def downscale(im: Image.Image, max_w: int) -> Image.Image:
    w, h = im.size
    if w <= max_w:
        return im
    new_h = int(h * (max_w / w))
    return im.resize((max_w, new_h), Image.LANCZOS)


def process_logo(src: Path, dst: Path) -> None:
    print(f"[logo] loading {src.name} …")
    im = Image.open(src).convert("RGB")
    bg = sample_bg(im)
    print(f"[logo] background sampled: rgb{bg}")
    im_rgba = color_key(im, bg, tol=60)
    im_rgba = trim(im_rgba, pad=12)
    im_rgba = downscale(im_rgba, max_w=1600)
    im_rgba.save(dst, "PNG", optimize=True)
    print(f"[logo] saved {dst.name}: {im_rgba.size}, {dst.stat().st_size // 1024} KiB")


def process_figure(src: Path, dst: Path) -> None:
    import rembg

    print(f"[figure] loading {src.name} …")
    with open(src, "rb") as f:
        data = f.read()
    print("[figure] running rembg (first call downloads the u2net model) …")
    out = rembg.remove(data)
    im = Image.open(io.BytesIO(out)).convert("RGBA")
    im = trim(im, pad=8)
    im = downscale(im, max_w=600)
    # Quantize the alpha-tagged image to keep file size in line with
    # the orchestrator's ~650 KiB figure. Adaptive palette + alpha.
    quant = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    quant.save(dst, "PNG", optimize=True)
    print(f"[figure] saved {dst.name}: {im.size}, {dst.stat().st_size // 1024} KiB")


def main() -> int:
    logo = ASSETS / "wisp-logo.png"
    figure = ASSETS / "wisp-figure.png"
    if not logo.exists() or not figure.exists():
        print(f"missing assets in {ASSETS}", file=sys.stderr)
        return 1
    process_logo(logo, logo)
    process_figure(figure, figure)
    return 0


if __name__ == "__main__":
    sys.exit(main())
