#!/usr/bin/env python3
"""render_level.py — Render Battle City level maps as PNG.

Decodes all 35 stage maps from ROM ($F27D), renders each as a pixel-art PNG
using the actual CHR tile graphics (from chr_pt0.png) with ROM NES palettes.

Output: output_gfx/levels/stage_NN.png  (one per stage)
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
# From ROM TileCHRTable ($DB79); matches game.js TILE_CHR
TILE_CHR = {
    T_STEEL_TL: [0x20,0x10,0x20,0x10],
    T_STEEL_TR: [0x20,0x20,0x10,0x10],
    T_STEEL_BL: [0x10,0x20,0x10,0x20],
    T_STEEL_BR: [0x10,0x10,0x20,0x20],
    T_STEEL:    [0x10,0x10,0x10,0x10],
    T_WATER:    [0x12,0x12,0x12,0x12],
    T_TREES:    [0x22,0x22,0x22,0x22],
    T_ICE:      [0x21,0x21,0x21,0x21],
}
BRICK_QUAD = [0x0F, 0x0F, 0x0F, 0x0F]   # all 4 sub-tiles for full brick

# BG sub-tile bitmask for partial brick types (which quarters to draw)
BRICK_BITS = {T_BRICK_TL: 0b0001, T_BRICK_TR: 0b0010,
              T_BRICK_BL: 0b0100, T_BRICK_BR: 0b1000, T_BRICK: 0b1111}

# Palette index per tile type (0–3=BG0–BG3); matches game.js TILE_PAL
# [BRICK_TL..BRICK=0, STEEL_TL..STEEL=3, WATER=1, TREES=2, ICE=3]
TILE_PAL = {
    T_BRICK_TL:0, T_BRICK_TR:0, T_BRICK_BL:0, T_BRICK_BR:0, T_BRICK:0,
    T_STEEL_TL:3, T_STEEL_TR:3, T_STEEL_BL:3, T_STEEL_BR:3, T_STEEL:3,
    T_WATER:1, T_TREES:2, T_ICE:3,
}

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
]
# Convert to RGB tuples
BG_PALETTES = [[NES_MASTER[c & 0x3F] for c in slot] for slot in ROM_PAL_BYTES]

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
FIELD_PX = COLS * 16 * SCALE   # canvas pixels

def render_stage(grid, chr_tiles):
    """Render one 13×13 grid → Canvas of size FIELD_PX × FIELD_PX."""
    c = Canvas(FIELD_PX, FIELD_PX)
    for row in range(ROWS):
        for col in range(COLS):
            t = grid[row][col]
            ox = col * 16 * SCALE
            oy = row * 16 * SCALE
            _draw_metatile(c, t, ox, oy, chr_tiles)
    return c

def _draw_metatile(c, t, ox, oy, chr_tiles):
    """Draw one 16×16 metatile at canvas offset (ox, oy)."""
    if t >= T_EMPTY:
        return  # empty — leave background

    pal_idx = TILE_PAL.get(t, 0)
    pal = BG_PALETTES[pal_idx]

    if t in BRICK_BITS:
        # Brick: draw only the present sub-tile quadrants
        bits = BRICK_BITS[t]
        offsets = [(0,0), (8,0), (0,8), (8,8)]  # TL, TR, BL, BR in NES px
        for q in range(4):
            if bits & (1 << q):
                qox = ox + offsets[q][0] * SCALE
                qoy = oy + offsets[q][1] * SCALE
                c.draw_tile(chr_tiles[BRICK_QUAD[q]], pal, qox, qoy)
        return

    chr4 = TILE_CHR.get(t)
    if chr4 is None:
        return

    # 2×2 sub-tiles: TL, TR, BL, BR
    positions = [(0,0), (8,0), (0,8), (8,8)]
    for i, (dx, dy) in enumerate(positions):
        tile_idx = chr4[i]
        c.draw_tile(chr_tiles[tile_idx], pal, ox + dx * SCALE, oy + dy * SCALE)

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    # Decode CHR tiles
    prg_banks = rom[4]
    chr_off   = 16 + prg_banks * 16384
    chr_data  = rom[chr_off : chr_off + 16384]
    total_tiles = len(chr_data) // 16
    chr_tiles = [decode_tile(chr_data, i * 16) for i in range(total_tiles)]
    print(f"Decoded {total_tiles} CHR tiles from file offset 0x{chr_off:05X}")

    # Decode levels
    all_grids = []
    for s in range(NUM_STAGES):
        off = LEVEL_DATA_OFFSET + STAGE_SIZE * s
        all_grids.append(decode_stage(rom[off:off + STAGE_SIZE]))
    print(f"Decoded {NUM_STAGES} stage maps from file offset 0x{LEVEL_DATA_OFFSET:05X}")

    os.makedirs(OUT_DIR, exist_ok=True)

    # Individual stage PNGs
    for s, grid in enumerate(all_grids, 1):
        c = render_stage(grid, chr_tiles)
        path = os.path.join(OUT_DIR, f"stage_{s:02d}.png")
        c.save(path)

    print(f"  wrote {NUM_STAGES} individual stage PNGs to {OUT_DIR}/")

    # All-stages sheet: 7 columns × 5 rows
    SHEET_COLS = 7
    SHEET_ROWS = (NUM_STAGES + SHEET_COLS - 1) // SHEET_COLS
    PAD = 4
    CELL = FIELD_PX + PAD
    sheet_w = SHEET_COLS * CELL + PAD
    sheet_h = SHEET_ROWS * CELL + PAD

    sheet = Canvas(sheet_w, sheet_h, bg=(20, 20, 20))
    for s, grid in enumerate(all_grids):
        col = s % SHEET_COLS
        row = s // SHEET_COLS
        ox = col * CELL + PAD
        oy = row * CELL + PAD
        stage_c = render_stage(grid, chr_tiles)
        # Copy into sheet
        for py in range(FIELD_PX):
            for px in range(FIELD_PX):
                sheet.set(ox + px, oy + py, stage_c.px[py * FIELD_PX + px])

    sheet_path = os.path.join(OUT_DIR, "all_stages.png")
    sheet.save(sheet_path)
    print(f"  wrote {sheet_path}  ({sheet_w}×{sheet_h})")

if __name__ == '__main__':
    main()
