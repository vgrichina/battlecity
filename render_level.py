#!/usr/bin/env python3
"""render_level.py — Render Battle City level maps as PNG.

Decodes all 35 stage maps from ROM ($F27D), renders each as a pixel-art PNG
using the actual CHR tile graphics (from chr_pt0.png) with ROM NES palettes.

Each stage preview includes:
  - 2-tile (16px NES = 32px canvas) black border on all sides
  - 13×13 metatile playfield grid
  - Intact eagle (2×2 metatiles = 32×32 NES px) at metatile (col=5, row=13),
    centred at the bottom of the field (matching NES eagle position $78,$D8)

Output: output_gfx/levels/stage_NN.png  (one per stage, 480×544 canvas)
        output_gfx/levels/all_stages.png (all 35 in a 7×5 grid)
"""

import os
import struct
import zlib

ROM_PATH  = "VS. Battle City (1985)(Namco).nes"
OUT_DIR   = "output_gfx/levels"

# ── Level data constants ────────────────────────────────────────────────────
# CPU $F27D = PRG bank 1 ($C000–$FFFF); file offset = 0x4010 + ($F27D - $C000)
LEVEL_DATA_OFFSET = 0x4010 + (0xF27D - 0xC000)  # = 0x728D
STAGE_SIZE = 91    # bytes per stage (182 nibbles, 14 per row × 13 rows)
NUM_STAGES = 35
COLS = 13
ROWS = 13

# ── Tile type constants (matches game.js T.* enum) ───────────────────────────
T_BRICK_TL = 0; T_BRICK_TR = 1; T_BRICK_BL = 2; T_BRICK_BR = 3; T_BRICK = 4
T_STEEL_TL = 5; T_STEEL_TR = 6; T_STEEL_BL = 7; T_STEEL_BR = 8; T_STEEL = 9
T_WATER = 10; T_TREES = 11; T_ICE = 12
T_EMPTY = 13

# ── CHR tile indices for each metatile type (4 sub-tiles: TL,TR,BL,BR) ──────
# Directly from ROM TileCHRTable ($DB79), dumped with decode_tables.py.
# Tile $00 = empty (transparent/BG); tile $0F = solid brick sub-tile.
# Partial brick types 0-3 are half-walls: each has exactly 2 sub-tiles filled:
#   Type 0 (right col):  TR+BR = $0F, TL+BL = $00
#   Type 1 (bot row):    BL+BR = $0F, TL+TR = $00
#   Type 2 (left col):   TL+BL = $0F, TR+BR = $00
#   Type 3 (top row):    TL+TR = $0F, BL+BR = $00
TILE_CHR = {
    T_BRICK_TL: [0x00,0x0F,0x00,0x0F],  # ROM $DB79: right-col half-brick
    T_BRICK_TR: [0x00,0x00,0x0F,0x0F],  # ROM $DB7D: bottom-row half-brick
    T_BRICK_BL: [0x0F,0x00,0x0F,0x00],  # ROM $DB81: left-col half-brick
    T_BRICK_BR: [0x0F,0x0F,0x00,0x00],  # ROM $DB85: top-row half-brick
    T_BRICK:    [0x0F,0x0F,0x0F,0x0F],  # ROM $DB89: full brick
    T_STEEL_TL: [0x20,0x10,0x20,0x10],  # ROM $DB8D
    T_STEEL_TR: [0x20,0x20,0x10,0x10],  # ROM $DB91
    T_STEEL_BL: [0x10,0x20,0x10,0x20],  # ROM $DB95
    T_STEEL_BR: [0x10,0x10,0x20,0x20],  # ROM $DB99
    T_STEEL:    [0x10,0x10,0x10,0x10],  # ROM $DB9D
    T_WATER:    [0x12,0x12,0x12,0x12],  # ROM $DBA1
    T_TREES:    [0x22,0x22,0x22,0x22],  # ROM $DBA5
    T_ICE:      [0x21,0x21,0x21,0x21],  # ROM $DBA9
}

# Palette index per tile type (0–3 → BG0–BG3)
# From ROM TileAttrTable ($DB69): types 0-4=pal0(brick), 5-9=pal3(steel),
# 10=pal1(water), 11=pal2(trees), 12=pal3(ice)
TILE_PAL = {
    T_BRICK_TL:0, T_BRICK_TR:0, T_BRICK_BL:0, T_BRICK_BR:0, T_BRICK:0,
    T_STEEL_TL:3, T_STEEL_TR:3, T_STEEL_BL:3, T_STEEL_BR:3, T_STEEL:3,
    T_WATER:1, T_TREES:2, T_ICE:3,
}  # matches game.js TILE_PAL = [0,0,0,0,0, 3,3,3,3,3, 1,2,3]

# ── NES master palette (NTSC) ────────────────────────────────────────────────
NES_MASTER = [
    (84,84,84),    (0,30,116),    (8,16,144),    (48,0,136),
    (68,0,100),    (92,0,48),     (84,4,0),      (60,24,0),
    (32,42,0),     (8,58,0),      (0,64,0),      (0,60,0),
    (0,50,60),     (0,0,0),       (0,0,0),       (0,0,0),
    (152,150,152), (8,76,196),    (48,50,236),   (92,30,228),
    (136,20,176),  (160,20,100),  (152,34,32),   (120,60,0),
    (84,90,0),     (40,114,0),    (8,124,0),     (0,118,40),
    (0,102,120),   (0,0,0),       (0,0,0),       (0,0,0),
    (236,238,236), (76,154,236),  (120,124,236), (176,98,236),
    (228,84,236),  (236,88,180),  (236,106,100), (212,136,32),
    (160,170,0),   (116,196,0),   (76,208,32),   (56,204,108),
    (56,180,204),  (60,60,60),    (0,0,0),       (0,0,0),
    (236,238,236), (168,204,236), (188,188,236), (212,178,236),
    (236,174,236), (236,174,212), (236,180,176), (228,196,144),
    (204,210,120), (180,222,120), (168,226,144), (152,226,180),
    (160,214,228), (160,162,160), (0,0,0),       (0,0,0),
]

# ROM PaletteData ($D44A): 8 sub-palettes × 4 NES color indices
ROM_PAL_BYTES = [
    [0x0F, 0x17, 0x06, 0x00],  # BG0 brick
    [0x0F, 0x3C, 0x10, 0x12],  # BG1 water
    [0x0F, 0x29, 0x09, 0x0B],  # BG2 trees (note: water uses BG1, trees uses BG2 in ROM)
    [0x0F, 0x00, 0x10, 0x20],  # BG3 steel/ice
    # Sprite palettes (needed for eagle SP3)
    [0x0F, 0x18, 0x27, 0x38],  # SP0 P1 yellow
    [0x0F, 0x0A, 0x1B, 0x3B],  # SP1 P2 green
    [0x0F, 0x0C, 0x10, 0x20],  # SP2 enemy grey
    [0x0F, 0x04, 0x16, 0x20],  # SP3 special/eagle ($EagleStateUpdate $E386: $04=3)
]
# Convert to RGB tuples
ALL_PALETTES = [[NES_MASTER[c & 0x3F] for c in slot] for slot in ROM_PAL_BYTES]
BG_PALETTES = ALL_PALETTES[:4]
EAGLE_PAL   = ALL_PALETTES[7]  # SP3

# Background fill color = palette[0][0] = universal BG = NES $0F = black
BG_COLOR = NES_MASTER[0x0F & 0x3F]   # (0,0,0)

# ── CHR tile decode ──────────────────────────────────────────────────────────
def decode_tile(data, offset):
    """Decode one 16-byte 2bpp NES tile → 64 palette indices (0–3)."""
    pixels = []
    for row in range(8):
        p0 = data[offset + row]
        p1 = data[offset + row + 8]
        for bit in range(7, -1, -1):
            pixels.append(((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1))
    return pixels

# ── Level decode ─────────────────────────────────────────────────────────────
def decode_stage(raw):
    """Decode 91-byte stage data → 13×13 list of tile type ints."""
    grid = []
    for row in range(ROWS):
        row_tiles = []
        for col in range(COLS):
            ni = row * 14 + col
            t = (raw[ni // 2] >> 4) & 0xF if ni % 2 == 0 else raw[ni // 2] & 0xF
            row_tiles.append(t)
        grid.append(row_tiles)
    return grid

# ── PNG writer ───────────────────────────────────────────────────────────────
def write_png(path, width, height, rgb_pixels):
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            r, g, b = rgb_pixels[y * width + x]
            raw += bytes([r, g, b])
    data = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)

# ── Eagle constants ──────────────────────────────────────────────────────────
# Intact eagle: 4×4 CHR tile grid (each tile 8×8 NES px → total 32×32 NES px)
# ROM EagleDrawIntact ($E3E2): 4 OAM calls (8×16 mode, PT1/BG bank, palette SP3)
# OAM tile byte T → top half = T&$FE, bottom half = (T&$FE)+1
# Row 1 OAM: $D1,$D3,$D5,$D7 → BG tiles [$D0,$D1,$D2,$D3,$D4,$D5,$D6,$D7]
# Row 2 OAM: $D9,$DB,$DD,$DF → BG tiles [$D8,$D9,$DA,$DB,$DC,$DD,$DE,$DF]
EAGLE_INTACT_TILES = [
    [0xD0, 0xD2, 0xD4, 0xD6],   # top halves of top OAM row (y+0..7)
    [0xD1, 0xD3, 0xD5, 0xD7],   # bottom halves of top OAM row (y+8..15)
    [0xD8, 0xDA, 0xDC, 0xDE],   # top halves of bottom OAM row (y+16..23)
    [0xD9, 0xDB, 0xDD, 0xDF],   # bottom halves of bottom OAM row (y+24..31)
]
EAGLE_METATILE_COL = 5   # 0-indexed, gives eagle x-centre = col 6 of 13-col grid
EAGLE_METATILE_ROW = 13  # just below the 13-row grid (rows 0-12)

# ── Canvas ───────────────────────────────────────────────────────────────────
SCALE = 2   # 2× zoom (each NES pixel → 2×2 canvas pixels)

class Canvas:
    def __init__(self, w, h, bg=BG_COLOR):
        self.w, self.h = w, h
        self.px = [bg] * (w * h)

    def set(self, x, y, col):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = col

    def draw_tile(self, tile_pix, pal, ox, oy, transparent=False):
        """Draw decoded 8×8 tile at (ox, oy), scaled by SCALE."""
        for ty in range(8):
            for tx in range(8):
                ci = tile_pix[ty * 8 + tx]
                if transparent and ci == 0:
                    continue
                col = pal[ci]
                for sy in range(SCALE):
                    for sx in range(SCALE):
                        self.set(ox + tx * SCALE + sx, oy + ty * SCALE + sy, col)

    def save(self, path):
        write_png(path, self.w, self.h, self.px)

# ── Level renderer ───────────────────────────────────────────────────────────
# Playfield: 13×13 metatiles × 16 NES px each = 208×208 NES px
FIELD_PX   = COLS * 16 * SCALE          # 416 canvas px (grid only)
BORDER_PX  = 16 * SCALE                 # 32 canvas px (2 NES tiles)
EAGLE_AREA = 2 * 16 * SCALE             # 64 canvas px (2 metatile rows for eagle)
CANVAS_W   = FIELD_PX + 2 * BORDER_PX  # 480  (border + grid + border)
CANVAS_H   = FIELD_PX + 2 * BORDER_PX + EAGLE_AREA  # 544  (+ 2 rows for eagle + bottom border)


def draw_eagle(c, chr_tiles):
    """Draw the intact eagle (32×32 NES px = 64×64 canvas px) at metatile (col=5, row=13).

    The eagle is rendered as a 4×4 grid of BG-bank CHR tiles (PT1, no +256 offset)
    with the SP3 palette ($0F/$04/$16/$20 = black/purple/red/white).
    Metatile (col=5, row=13) puts the 2-metatile-wide eagle centred at column 6
    of the 13-column field, just below the last row of level tiles.
    """
    ox = BORDER_PX + EAGLE_METATILE_COL * 16 * SCALE   # canvas x of TL corner
    oy = BORDER_PX + EAGLE_METATILE_ROW * 16 * SCALE   # canvas y of TL corner
    for tr, tile_row in enumerate(EAGLE_INTACT_TILES):
        for tc, tile_idx in enumerate(tile_row):
            c.draw_tile(chr_tiles[tile_idx], EAGLE_PAL,
                        ox + tc * 8 * SCALE,
                        oy + tr * 8 * SCALE,
                        transparent=True)


def render_stage(grid, chr_tiles):
    """Render one stage → Canvas of size CANVAS_W × CANVAS_H (480×544).

    Includes 2-tile (32px canvas) black border on all sides and intact eagle
    at metatile (col=5, row=13) below the 13×13 grid.
    """
    c = Canvas(CANVAS_W, CANVAS_H)
    for row in range(ROWS):
        for col in range(COLS):
            t = grid[row][col]
            ox = BORDER_PX + col * 16 * SCALE
            oy = BORDER_PX + row * 16 * SCALE
            _draw_metatile(c, t, ox, oy, chr_tiles)
    draw_eagle(c, chr_tiles)
    return c

def _draw_metatile(c, t, ox, oy, chr_tiles):
    """Draw one 16×16 metatile at canvas offset (ox, oy).
    Uses ROM TileCHRTable directly for all types.  Tile $00 = transparent.
    """
    if t >= T_EMPTY:
        return  # empty — leave background

    chr4 = TILE_CHR.get(t)
    if chr4 is None:
        return

    pal_idx = TILE_PAL.get(t, 0)
    pal     = BG_PALETTES[pal_idx]

    # 2×2 sub-tiles: TL, TR, BL, BR (in NES pixel order)
    positions = [(0,0), (8,0), (0,8), (8,8)]
    for i, (dx, dy) in enumerate(positions):
        tile_idx = chr4[i]
        c.draw_tile(chr_tiles[tile_idx], pal, ox + dx * SCALE, oy + dy * SCALE)

# ── Main ─────────────────────────────────────────────────────────────────────
def parse_stages(args):
    """Parse stage list from CLI args.
    Accepts: integers (1-35), ranges (3-7), or 'all'.
    Returns sorted list of 1-based stage numbers.
    """
    if not args or args == ['all']:
        return list(range(1, NUM_STAGES + 1))
    stages = set()
    for tok in args:
        if '-' in tok:
            lo, hi = tok.split('-', 1)
            stages.update(range(int(lo), int(hi) + 1))
        else:
            stages.add(int(tok))
    return sorted(s for s in stages if 1 <= s <= NUM_STAGES)


def main():
    import sys
    stages = parse_stages(sys.argv[1:])
    render_sheet = (stages == list(range(1, NUM_STAGES + 1)))

    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    # Decode CHR tiles from bank pair 1 (mapper banks 2+3, $A010): stage 1 gameplay
    chr_off   = 0xA010
    chr_data  = rom[chr_off : chr_off + 0x2000]  # 8KB
    chr_tiles = [decode_tile(chr_data, i * 16) for i in range(len(chr_data) // 16)]
    print(f"Decoded {len(chr_tiles)} CHR tiles  |  rendering stages: {stages}")

    os.makedirs(OUT_DIR, exist_ok=True)

    # Decode and render requested stages
    rendered = {}
    for s in stages:
        off = LEVEL_DATA_OFFSET + STAGE_SIZE * (s - 1)
        grid = decode_stage(rom[off:off + STAGE_SIZE])
        c = render_stage(grid, chr_tiles)
        path = os.path.join(OUT_DIR, f"stage_{s:02d}.png")
        c.save(path)
        rendered[s] = (c, grid)
        print(f"  wrote {path}")

    # All-stages sheet only when rendering the full set
    if render_sheet:
        SHEET_COLS = 7
        PAD = 4
        CELL_W = CANVAS_W + PAD
        CELL_H = CANVAS_H + PAD
        SHEET_ROWS = (NUM_STAGES + SHEET_COLS - 1) // SHEET_COLS
        sheet_w = SHEET_COLS * CELL_W + PAD
        sheet_h = SHEET_ROWS * CELL_H + PAD

        sheet = Canvas(sheet_w, sheet_h, bg=(20, 20, 20))
        for s, (stage_c, _) in rendered.items():
            sc = (s - 1) % SHEET_COLS
            sr = (s - 1) // SHEET_COLS
            ox = sc * CELL_W + PAD
            oy = sr * CELL_H + PAD
            for py in range(CANVAS_H):
                for px in range(CANVAS_W):
                    sheet.set(ox + px, oy + py, stage_c.px[py * CANVAS_W + px])

        sheet_path = os.path.join(OUT_DIR, "all_stages.png")
        sheet.save(sheet_path)
        print(f"  wrote {sheet_path}  ({sheet_w}×{sheet_h})")


if __name__ == '__main__':
    main()
