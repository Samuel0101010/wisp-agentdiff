"""
Render three static PNG screenshots of the wisp-agentdiff TUI for the README.

Frame 1 — opening (all agents pending, viewing 'auth')
Frame 2 — after decisions (4 approved, 1 reverted; viewing the rogue 'db')
Frame 3 — conflict view (api vs db both touched src/db/pool.ts)

Catppuccin Mocha palette to match the chosen Ink theme.

No external services, no vhs.  Uses Consolas (ships with Windows) for the
monospace face.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "assets"

# Catppuccin Mocha
BG = (30, 30, 46)
FG = (205, 214, 244)
ACCENT = (137, 220, 235)
GREEN = (166, 227, 161)
RED = (243, 139, 168)
YELLOW = (249, 226, 175)
MUTED = (108, 112, 134)
BORDER = (69, 71, 90)
WIN_BG = (17, 17, 27)


@dataclass
class Span:
    text: str
    color: tuple[int, int, int] = FG
    bold: bool = False


def load_font(size: int = 18, bold: bool = False) -> ImageFont.FreeTypeFont:
    # Cascadia Mono covers ✓ ✗ ⚠ ▍ and the box-drawing glyphs we use.
    # Consolas is the second choice — wider availability but missing ✓ ✗ ▍ ⚠.
    candidates = [
        r"C:\Windows\Fonts\CascadiaMono.ttf",
        r"C:\Windows\Fonts\CascadiaCode.ttf",
        r"C:\Windows\Fonts\consolab.ttf" if bold else r"C:\Windows\Fonts\consola.ttf",
        "/Library/Fonts/Menlo.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


FONT = load_font(18)
FONT_BOLD = load_font(18, bold=True)


def measure_cell() -> tuple[int, int]:
    """Width and height of a single character cell in the chosen monospace font."""
    bbox = FONT.getbbox("M")
    return bbox[2] - bbox[0], bbox[3] - bbox[1] + 6


CELL_W, CELL_H = measure_cell()


def render_frame(lines: list[list[Span]], title: str) -> Image.Image:
    # Determine canvas size from the widest visible line and the number of lines.
    cols = max(sum(len(s.text) for s in line) for line in lines)
    rows = len(lines)

    pad_x, pad_y = 24, 56
    chrome_h = 36  # macOS-style title bar
    inner_w = cols * CELL_W
    inner_h = rows * CELL_H
    width = inner_w + pad_x * 2
    height = inner_h + pad_y * 2 + chrome_h

    img = Image.new("RGB", (width, height), WIN_BG)
    draw = ImageDraw.Draw(img)

    # Window chrome
    draw.rectangle((0, 0, width, chrome_h), fill=(24, 24, 37))
    for i, color in enumerate([(243, 139, 168), (249, 226, 175), (166, 227, 161)]):
        cx = 22 + i * 22
        cy = chrome_h // 2
        draw.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), fill=color)
    tbox = FONT.getbbox(title)
    draw.text(
        ((width - (tbox[2] - tbox[0])) // 2, chrome_h // 2 - (tbox[3] - tbox[1]) // 2 - 2),
        title,
        fill=MUTED,
        font=FONT,
    )

    # Terminal body
    body_top = chrome_h
    draw.rectangle((0, body_top, width, height), fill=BG)

    # Render each line
    y = body_top + pad_y - 16
    for line in lines:
        x = pad_x
        for span in line:
            font = FONT_BOLD if span.bold else FONT
            draw.text((x, y), span.text, fill=span.color, font=font)
            x += len(span.text) * CELL_W
        y += CELL_H

    return img


# ─────────────────────────────────────────────────────────────────────────
# Frame data — each line is a list of Span(text, color, bold)
# Spans are concatenated so we keep proportional widths via fixed cell.
# ─────────────────────────────────────────────────────────────────────────


def line(*spans: Span) -> list[Span]:
    return list(spans)


def s(text: str, color: tuple[int, int, int] = FG, bold: bool = False) -> Span:
    return Span(text, color, bold)


def frame_opening() -> list[list[Span]]:
    return [
        line(s("┌─ wisp-agentdiff ─ 5 agents ─────────────────────────────────────┐", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("▍1. auth ", ACCENT, bold=True),
            s("·  ", MUTED),
            s("2. api ", MUTED),
            s("·  ", MUTED),
            s("3. db ", MUTED),
            s("·  ", MUTED),
            s("4. tests ", MUTED),
            s("·  ", MUTED),
            s("5. docs ", MUTED),
            s("·", MUTED),
            s("        │", ACCENT),
        ),
        line(s("├─────────────────────────────────────────────────────────────────┤", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("2 files  +6 -1 · 1,240 tok  12 tools · branch agent-auth        ", MUTED),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("line 1–14 of 14 · 2 files · +6 -1                               ", MUTED),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("── modified  src/auth/session.ts                                 ", ACCENT),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("@@ -1,5 +1,9 @@                                                  ", YELLOW),
            s("│", ACCENT),
        ),
        line(s("│   export interface Session {                                     │", ACCENT)),
        line(s("│     id: string;                                                 │", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("+   userId: string;                                              ", GREEN),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+   createdAt: Date;                                             ", GREEN),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+   expiresAt: Date;                                             ", GREEN),
            s("│", ACCENT),
        ),
        line(s("│   }                                                             │", ACCENT)),
        line(s("│                                                                 │", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("+ export function rotateToken(s: Session): Session {             ", GREEN),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+   return { ...s };                                             ", GREEN),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+ }                                                              ", GREEN),
            s("│", ACCENT),
        ),
        line(s("├─────────────────────────────────────────────────────────────────┤", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("[a]", ACCENT, bold=True),
            s("pprove ", MUTED),
            s("[r]", ACCENT, bold=True),
            s("evert ", MUTED),
            s("[n]", ACCENT, bold=True),
            s("ext ", MUTED),
            s("[p]", ACCENT, bold=True),
            s("rev ", MUTED),
            s("[c]", ACCENT, bold=True),
            s("onflict ", MUTED),
            s("[m]", ACCENT, bold=True),
            s("erge ", MUTED),
            s("[j/k] ", MUTED),
            s("[q]", ACCENT, bold=True),
            s("   ", MUTED),
            s("│", ACCENT),
        ),
        line(s("└─────────────────────────────────────────────────────────────────┘", ACCENT)),
    ]


def frame_after_decisions() -> list[list[Span]]:
    return [
        line(s("┌─ wisp-agentdiff ─ 5 agents ─────────────────────────────────────┐", ACCENT)),
        line(
            s("│   ", ACCENT),
            s("1. auth ", MUTED),
            s("✓", GREEN, bold=True),
            s("  ", MUTED),
            s("2. api ", MUTED),
            s("✓", GREEN, bold=True),
            s("  ", MUTED),
            s("▍3. db ", ACCENT, bold=True),
            s("X", RED, bold=True),
            s("  ", MUTED),
            s("4. tests ", MUTED),
            s("✓", GREEN, bold=True),
            s("  ", MUTED),
            s("5. docs ", MUTED),
            s("✓", GREEN, bold=True),
            s("   │", ACCENT),
        ),
        line(s("├─────────────────────────────────────────────────────────────────┤", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("4 files  +18 -8 · 3,420 tok  29 tools · branch agent-db ", MUTED),
            s("!1 ", YELLOW, bold=True),
            s("   │", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("line 1–14 of 14 · 4 files · +18 -8                              ", MUTED),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("── modified  src/db/pool.ts                                      ", ACCENT),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("@@ -1,20 +1,40 @@                                                ", YELLOW),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("- export class Pool {                                            ", RED),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("-   constructor(opts: Opts) {                                    ", RED),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("-     this.url = opts.url;                                       ", RED),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+ // Complete rewrite — switched to a custom retry loop          ", GREEN),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+ // and removed timeout config. (this is the rogue agent.)      ", GREEN),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+ export class Pool {                                            ", GREEN),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+   constructor(opts: Opts) {                                    ", GREEN),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+     this.url = String(opts.url);                               ", GREEN),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+     this.client = unsafeMakeClient(opts);                      ", GREEN),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("+   }                                                            ", GREEN),
            s("│", ACCENT),
        ),
        line(s("├─────────────────────────────────────────────────────────────────┤", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("[a]", ACCENT, bold=True),
            s("pprove ", MUTED),
            s("[r]", ACCENT, bold=True),
            s("evert ", MUTED),
            s("[n]", ACCENT, bold=True),
            s("ext ", MUTED),
            s("[p]", ACCENT, bold=True),
            s("rev ", MUTED),
            s("[c]", ACCENT, bold=True),
            s("onflict ", MUTED),
            s("[m]", ACCENT, bold=True),
            s("erge ", MUTED),
            s("[j/k] ", MUTED),
            s("[q]", ACCENT, bold=True),
            s("   ", MUTED),
            s("│", ACCENT),
        ),
        line(s("└─────────────────────────────────────────────────────────────────┘", ACCENT)),
    ]


def frame_conflict() -> list[list[Span]]:
    return [
        line(s("┌─ wisp-agentdiff ─ 5 agents ─────────────────────────────────────┐", ACCENT)),
        line(
            s("│   ", ACCENT),
            s("1. auth ", MUTED),
            s("✓", GREEN, bold=True),
            s("  ", MUTED),
            s("2. api ", MUTED),
            s("✓", GREEN, bold=True),
            s("  ", MUTED),
            s("▍3. db ", ACCENT, bold=True),
            s("X", RED, bold=True),
            s("  ", MUTED),
            s("4. tests ", MUTED),
            s("✓", GREEN, bold=True),
            s("  ", MUTED),
            s("5. docs ", MUTED),
            s("✓", GREEN, bold=True),
            s("   │", ACCENT),
        ),
        line(s("├─────────────────────────────────────────────────────────────────┤", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("1 conflicting file · viewing 1/1                                ", YELLOW),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("── src/db/pool.ts                                                ", ACCENT),
            s("│", ACCENT),
        ),
        line(s("│                                                                 │", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("api ", ACCENT, bold=True),
            s("(modified · +2 -0)                                          ", MUTED),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("@@ -22,7 +22,9 @@ export class Pool {                            ", YELLOW),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("branch wisp-agentdiff/agent-api                                  ", MUTED),
            s("│", ACCENT),
        ),
        line(s("│                                                                 │", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("db  ", ACCENT, bold=True),
            s("(modified · +9 -3)                                          ", MUTED),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("@@ -1,20 +1,40 @@                                                ", YELLOW),
            s("│", ACCENT),
        ),
        line(
            s("│ ", ACCENT),
            s("branch wisp-agentdiff/agent-db                                   ", MUTED),
            s("│", ACCENT),
        ),
        line(s("│                                                                 │", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("press [c] to return · revert one of the conflicting agents       ", MUTED),
            s("│", ACCENT),
        ),
        line(s("├─────────────────────────────────────────────────────────────────┤", ACCENT)),
        line(
            s("│ ", ACCENT),
            s("[a]", ACCENT, bold=True),
            s("pprove ", MUTED),
            s("[r]", ACCENT, bold=True),
            s("evert ", MUTED),
            s("[n]", ACCENT, bold=True),
            s("ext ", MUTED),
            s("[p]", ACCENT, bold=True),
            s("rev ", MUTED),
            s("[c]", ACCENT, bold=True),
            s("onflict ", MUTED),
            s("[m]", ACCENT, bold=True),
            s("erge ", MUTED),
            s("[j/k] ", MUTED),
            s("[q]", ACCENT, bold=True),
            s("   ", MUTED),
            s("│", ACCENT),
        ),
        line(s("└─────────────────────────────────────────────────────────────────┘", ACCENT)),
    ]


def main() -> int:
    frames = [
        ("screenshot-1-opening.png", frame_opening, "wisp-agentdiff review — opening"),
        ("screenshot-2-decisions.png", frame_after_decisions, "wisp-agentdiff review — after a a r a a"),
        ("screenshot-3-conflict.png", frame_conflict, "wisp-agentdiff review — conflict view"),
    ]
    OUT.mkdir(parents=True, exist_ok=True)
    for filename, builder, title in frames:
        img = render_frame(builder(), title)
        out_path = OUT / filename
        img.save(out_path, "PNG", optimize=True)
        print(f"wrote {out_path.name}: {img.size}, {out_path.stat().st_size // 1024} KiB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
