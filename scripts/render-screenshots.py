"""
Render three static PNG screenshots of the wisp-agentdiff TUI for the README.

Frame 1 — opening (all agents pending, viewing 'auth')
Frame 2 — after decisions (4 approved, 1 reverted; viewing the rogue 'db')
Frame 3 — conflict view (api vs db both touched src/db/pool.ts)

Catppuccin Mocha palette to match the chosen Ink theme.

No external services, no vhs.  Uses Cascadia Mono (Windows 11) — it has
✓ and the box-drawing glyphs.  ✗ and ⚠ fall back to ASCII X / !.

Layout invariant: every frame line is exactly INNER_W + 2 cells wide so the
left and right window borders align in a perfect column.
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
WIN_BG = (17, 17, 27)

# Fixed inner width — number of cells between the two │ borders.
# Increase if a content line ever overflows; render will raise rather than truncate.
INNER_W = 66


@dataclass
class Span:
    text: str
    color: tuple[int, int, int] = FG
    bold: bool = False


def load_font(size: int = 18, bold: bool = False) -> ImageFont.FreeTypeFont:
    # Cascadia Mono covers ✓ and the box-drawing glyphs.
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
    bbox = FONT.getbbox("M")
    return bbox[2] - bbox[0], bbox[3] - bbox[1] + 6


CELL_W, CELL_H = measure_cell()


def render_frame(lines: list[list[Span]], title: str) -> Image.Image:
    cols = max(sum(len(s.text) for s in line) for line in lines)
    rows = len(lines)
    pad_x, pad_y = 24, 56
    chrome_h = 36
    width = cols * CELL_W + pad_x * 2
    height = rows * CELL_H + pad_y * 2 + chrome_h

    img = Image.new("RGB", (width, height), WIN_BG)
    draw = ImageDraw.Draw(img)

    # macOS-style title bar
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

    body_top = chrome_h
    draw.rectangle((0, body_top, width, height), fill=BG)

    y = body_top + pad_y - 16
    for line in lines:
        x = pad_x
        for span in line:
            font = FONT_BOLD if span.bold else FONT
            draw.text((x, y), span.text, fill=span.color, font=font)
            x += len(span.text) * CELL_W
        y += CELL_H

    return img


def s(text: str, color: tuple[int, int, int] = FG, bold: bool = False) -> Span:
    return Span(text, color, bold)


# ─────────────────────────────────────────────────────────────────────────
# Width-safe line builders.  Every line produced by these helpers is exactly
# INNER_W + 2 cells wide so the left/right window borders stack perfectly.
# ─────────────────────────────────────────────────────────────────────────


def _measure(spans: list[Span]) -> int:
    return sum(len(sp.text) for sp in spans)


def fline(*content: Span) -> list[Span]:
    """Frame line: │ <content> <auto-pad> │"""
    inner = list(content)
    used = _measure(inner)
    if used > INNER_W:
        raise ValueError(f"fline content {used} > INNER_W={INNER_W}: {''.join(c.text for c in inner)!r}")
    pad = INNER_W - used
    if pad:
        inner.append(s(" " * pad))
    return [s("│", ACCENT), *inner, s("│", ACCENT)]


def top(label: str) -> list[Span]:
    """┌─ <label> ─────…─┐  with the label embedded near the start."""
    chunk = f"─ {label} "
    if len(chunk) > INNER_W:
        raise ValueError(f"top label too long: {chunk!r}")
    fill = "─" * (INNER_W - len(chunk))
    return [s("┌", ACCENT), s(chunk + fill, ACCENT), s("┐", ACCENT)]


def divider() -> list[Span]:
    return [s("├", ACCENT), s("─" * INNER_W, ACCENT), s("┤", ACCENT)]


def bottom() -> list[Span]:
    return [s("└", ACCENT), s("─" * INNER_W, ACCENT), s("┘", ACCENT)]


def hotkey_bar() -> list[Span]:
    return fline(
        s(" "),
        s("[a]", ACCENT, bold=True), s("pprove ", MUTED),
        s("[r]", ACCENT, bold=True), s("evert ", MUTED),
        s("[n]", ACCENT, bold=True), s("ext ", MUTED),
        s("[p]", ACCENT, bold=True), s("rev ", MUTED),
        s("[c]", ACCENT, bold=True), s("onflict ", MUTED),
        s("[m]", ACCENT, bold=True), s("erge ", MUTED),
        s("[j/k] ", MUTED),
        s("[q]", ACCENT, bold=True),
    )


# ─────────────────────────────────────────────────────────────────────────
# Frame data
# ─────────────────────────────────────────────────────────────────────────


def frame_opening() -> list[list[Span]]:
    return [
        top("wisp-agentdiff ─ 5 agents"),
        fline(
            s(" "),
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
        ),
        divider(),
        fline(s(" 2 files  +6 -1 · 1,240 tok  12 tools · branch agent-auth", MUTED)),
        fline(s(" line 1–14 of 14 · 2 files · +6 -1", MUTED)),
        fline(s(" ── modified  src/auth/session.ts", ACCENT)),
        fline(s(" @@ -1,5 +1,9 @@", YELLOW)),
        fline(s("   export interface Session {")),
        fline(s("     id: string;")),
        fline(s(" +   userId: string;", GREEN)),
        fline(s(" +   createdAt: Date;", GREEN)),
        fline(s(" +   expiresAt: Date;", GREEN)),
        fline(s("   }")),
        fline(),
        fline(s(" + export function rotateToken(s: Session): Session {", GREEN)),
        fline(s(" +   return { ...s };", GREEN)),
        fline(s(" + }", GREEN)),
        divider(),
        hotkey_bar(),
        bottom(),
    ]


def frame_after_decisions() -> list[list[Span]]:
    return [
        top("wisp-agentdiff ─ 5 agents"),
        fline(
            s("   "),
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
        ),
        divider(),
        fline(
            s(" 4 files  +18 -8 · 3,420 tok  29 tools · branch agent-db ", MUTED),
            s("!1", YELLOW, bold=True),
        ),
        fline(s(" line 1–14 of 14 · 4 files · +18 -8", MUTED)),
        fline(s(" ── modified  src/db/pool.ts", ACCENT)),
        fline(s(" @@ -1,20 +1,40 @@", YELLOW)),
        fline(s(" - export class Pool {", RED)),
        fline(s(" -   constructor(opts: Opts) {", RED)),
        fline(s(" -     this.url = opts.url;", RED)),
        fline(s(" + // Complete rewrite — switched to a custom retry loop", GREEN)),
        fline(s(" + // and removed timeout config. (rogue agent.)", GREEN)),
        fline(s(" + export class Pool {", GREEN)),
        fline(s(" +   constructor(opts: Opts) {", GREEN)),
        fline(s(" +     this.url = String(opts.url);", GREEN)),
        fline(s(" +     this.client = unsafeMakeClient(opts);", GREEN)),
        fline(s(" +   }", GREEN)),
        divider(),
        hotkey_bar(),
        bottom(),
    ]


def frame_conflict() -> list[list[Span]]:
    return [
        top("wisp-agentdiff ─ 5 agents"),
        fline(
            s("   "),
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
        ),
        divider(),
        fline(s(" 1 conflicting file · viewing 1/1", YELLOW)),
        fline(s(" ── src/db/pool.ts", ACCENT)),
        fline(),
        fline(s(" api ", ACCENT, bold=True), s("(modified · +2 -0)", MUTED)),
        fline(s(" @@ -22,7 +22,9 @@ export class Pool {", YELLOW)),
        fline(s(" branch wisp-agentdiff/agent-api", MUTED)),
        fline(),
        fline(s(" db  ", ACCENT, bold=True), s("(modified · +9 -3)", MUTED)),
        fline(s(" @@ -1,20 +1,40 @@", YELLOW)),
        fline(s(" branch wisp-agentdiff/agent-db", MUTED)),
        fline(),
        fline(s(" press [c] to return · revert one of the conflicting agents", MUTED)),
        divider(),
        hotkey_bar(),
        bottom(),
    ]


def main() -> int:
    frames = [
        ("screenshot-1-opening.png", frame_opening, "wisp-agentdiff review — opening"),
        ("screenshot-2-decisions.png", frame_after_decisions, "wisp-agentdiff review — after a a r a a"),
        ("screenshot-3-conflict.png", frame_conflict, "wisp-agentdiff review — conflict view"),
    ]
    OUT.mkdir(parents=True, exist_ok=True)
    for filename, builder, title in frames:
        lines = builder()
        # Sanity-check: every line must have the same total cell count.
        widths = {sum(len(s.text) for s in line) for line in lines}
        if len(widths) != 1:
            raise AssertionError(f"{filename}: inconsistent widths {sorted(widths)}")
        img = render_frame(lines, title)
        out_path = OUT / filename
        img.save(out_path, "PNG", optimize=True)
        print(f"wrote {out_path.name}: {img.size}, {out_path.stat().st_size // 1024} KiB, all lines {widths.pop()} cells wide")
    return 0


if __name__ == "__main__":
    sys.exit(main())
