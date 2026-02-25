#!/usr/bin/env python3
"""compare_frames.py — Compare NES-accurate reference vs game.js rendering.

Produces:
  output_gfx/ref_enhanced_stage01.png   — NES reference: BG nametable (chr_bg) + eagle OAM (chr_spr)
  output_gfx/gamejs_sim_stage01.png     — game.js simulation: all tiles from BG bank only
  output_gfx/diff_stage01.png           — Pixel diff (red = differs, green = match)

Reference uses separate BG ($A010) and sprite ($B010) pattern tables — NES-accurate.
Game.js sim uses BG bank for everything, matching game.js's current behavior.
Diff categorizes mismatches as intentional (EMPTY tile) vs fixable (eagle sprite bank).
"""

import os, sys, struct, zlib

ROM_PATH = "VS. Battle City (1985)(Namco).nes"
OUT_DIR  = "output_gfx"

# ── NES master palette ───────────────────────────────────────────────────────
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

ROM_PAL_BYTES = [
    [0x0F, 0x17, 0x06, 0x00],  # BG0 brick
    [0x0F, 0x3C, 0x10, 0x12],  # BG1 water
    [0x0F, 0x29, 0x09, 0x0B],  # BG2 trees
    [0x0F, 0x00, 0x10, 0x20],  # BG3 steel/ice
    [0x0F, 0x18, 0x27, 0x38],  # SP0 P1
    [0x0F, 0x0A, 0x1B, 0x3B],  # SP1 P2
    [0x0F, 0x0C, 0x10, 0x20],  # SP2 enemy
    [0x0F, 0x04, 0x16, 0x20],  # SP3 special/eagle
]
ALL_PAL = [[NES_MASTER[c & 0x3F] for c in slot] for slot in ROM_PAL_BYTES]
BG_COLOR = NES_MASTER[0x0F & 0x3F]  # (0,0,0)

# ── Screen constants ─────────────────────────────────────────────────────────
SCR_W, SCR_H = 256, 240
NT_COLS, NT_ROWS = 32, 30
NT_TILES = NT_COLS * NT_ROWS
ATTR_BYTES = 64

# ── Level constants ──────────────────────────────────────────────────────────
LEVEL_OFF = 0x4010 + (0xF27D - 0xC000)
STAGE_SIZE = 91
MAP_COLS, MAP_ROWS = 13, 13
FX, FY = 16, 16  # playfield origin in NES pixels

# ── Tile type mappings ───────────────────────────────────────────────────────
TILE_CHR = {
    0:  [0x00, 0x0F, 0x00, 0x0F],  # BRICK_TL (right-col)
    1:  [0x00, 0x00, 0x0F, 0x0F],  # BRICK_TR (bottom-row)
    2:  [0x0F, 0x00, 0x0F, 0x00],  # BRICK_BL (left-col)
    3:  [0x0F, 0x0F, 0x00, 0x00],  # BRICK_BR (top-row)
    4:  [0x0F, 0x0F, 0x0F, 0x0F],  # BRICK full
    5:  [0x20, 0x10, 0x20, 0x10],  # STEEL_TL
    6:  [0x20, 0x20, 0x10, 0x10],  # STEEL_TR
    7:  [0x10, 0x20, 0x10, 0x20],  # STEEL_BL
    8:  [0x10, 0x10, 0x20, 0x20],  # STEEL_BR
    9:  [0x10, 0x10, 0x10, 0x10],  # STEEL full
    10: [0x12, 0x12, 0x12, 0x12],  # WATER
    11: [0x22, 0x22, 0x22, 0x22],  # TREES
    12: [0x21, 0x21, 0x21, 0x21],  # ICE
}
TILE_PAL = {
    0:0, 1:0, 2:0, 3:0, 4:0,
    5:3, 6:3, 7:3, 8:3, 9:3,
    10:1, 11:2, 12:3,
}

# game.js brick init bits
def brick_init_bits(t):
    if t == 0: return 0b1010  # TR+BR (right col)
    if t == 1: return 0b1100  # BL+BR (bottom row)
    if t == 2: return 0b0101  # TL+BL (left col)
    if t == 3: return 0b0011  # TL+TR (top row)
    if t == 4: return 0b1111
    return 0

# ── CHR decode ───────────────────────────────────────────────────────────────
def decode_tile(data, offset):
    px = []
    for row in range(8):
        lo = data[offset + row]
        hi = data[offset + row + 8]
        for bit in range(7, -1, -1):
            px.append(((lo >> bit) & 1) | (((hi >> bit) & 1) << 1))
    return px

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
class Canvas:
    def __init__(self, w=SCR_W, h=SCR_H, bg=BG_COLOR):
        self.w, self.h = w, h
        self.px = [bg] * (w * h)

    def set(self, x, y, col):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = col

    def draw_tile(self, pix, pal, ox, oy, transparent=False):
        for ty in range(8):
            for tx in range(8):
                ci = pix[ty * 8 + tx]
                if transparent and ci == 0:
                    continue
                self.set(ox + tx, oy + ty, pal[ci])

    def fill_rect(self, x, y, w, h, col):
        for dy in range(h):
            for dx in range(w):
                self.set(x + dx, y + dy, col)

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y * self.w + x]
        return BG_COLOR

    def save(self, path):
        write_png(path, self.w, self.h, self.px)

# ── Level decode ─────────────────────────────────────────────────────────────
def decode_stage(raw):
    grid = []
    for row in range(MAP_ROWS):
        row_tiles = []
        for col in range(MAP_COLS):
            ni = row * 14 + col
            t = (raw[ni // 2] >> 4) & 0xF if ni % 2 == 0 else raw[ni // 2] & 0xF
            row_tiles.append(t)
        grid.append(row_tiles)
    return grid

# ── Attribute table palette lookup ───────────────────────────────────────────
def attr_pal(attr_table, tile_col, tile_row):
    ax = tile_col >> 2
    ay = tile_row >> 2
    idx = ay * 8 + ax
    if idx >= ATTR_BYTES:
        return 0
    byte = attr_table[idx]
    quad = ((tile_row >> 1) & 1) * 2 + ((tile_col >> 1) & 1)
    return (byte >> (quad * 2)) & 3

# ══════════════════════════════════════════════════════════════════════════════
# REFERENCE: render_frame.py logic + eagle walls + eagle BG tiles
# ══════════════════════════════════════════════════════════════════════════════
def build_enhanced_nametable(stage_num, rom):
    """Build nametable with level tiles + eagle walls + eagle BG tiles."""
    off = LEVEL_OFF + STAGE_SIZE * (stage_num - 1)
    grid = decode_stage(rom[off:off + STAGE_SIZE])

    nt = bytearray(NT_TILES)
    attr = bytearray(ATTR_BYTES)

    # Write level tiles
    for mr in range(MAP_ROWS):
        for mc in range(MAP_COLS):
            t = grid[mr][mc]
            chr4 = TILE_CHR.get(t)
            if chr4 is None:
                continue
            pi = TILE_PAL.get(t, 0)
            for si, (dr, dc) in enumerate([(0,0), (0,1), (1,0), (1,1)]):
                tr = mr * 2 + dr + 2
                tc = mc * 2 + dc + 2
                if tr < NT_ROWS and tc < NT_COLS:
                    nt[tr * NT_COLS + tc] = chr4[si]
            tc_base = mc * 2 + 2
            tr_base = mr * 2 + 2
            ax = tc_base >> 2
            ay = tr_base >> 2
            aidx = ay * 8 + ax
            if aidx < ATTR_BYTES:
                quad = (((tr_base >> 1) & 1) << 1) | ((tc_base >> 1) & 1)
                shift = quad * 2
                attr[aidx] = (attr[aidx] & ~(0x03 << shift)) | (pi << shift)

    # Eagle walls (BrickWallInit $C912) — ROM $D22D data
    # Eagle center at NES pixel (0x78, 0xD8) = (120, 216)
    # Nametable tile position: col=120/8=15, row=216/8=27
    ex_tile, ey_tile = 15, 27  # eagle center tile position
    # Wall data (Π shape around eagle):
    # Row 25 (ey_tile-2): [empty, $0F, $0F, $0F, $0F, empty]
    # Row 26 (ey_tile-1): [empty, $0F, C8,  CA,  $0F, empty]
    # Row 27 (ey_tile):   [empty, $0F, C9,  CB,  $0F, empty]
    wall_tile = 0x0F  # brick
    wall_data = [
        # (row_offset, col_offset_from_ex-2, tile)
        # Row 25: top bar
        (-2, -2, wall_tile), (-2, -1, wall_tile), (-2, 0, wall_tile), (-2, 1, wall_tile),
        # Row 26: left + eagle TL/TR + right
        (-1, -2, wall_tile), (-1, -1, 0xC8), (-1, 0, 0xCA), (-1, 1, wall_tile),
        # Row 27: left + eagle BL/BR + right
        (0, -2, wall_tile), (0, -1, 0xC9), (0, 0, 0xCB), (0, 1, wall_tile),
    ]
    for dr, dc, tile in wall_data:
        tr = ey_tile + dr
        tc = ex_tile + dc
        if 0 <= tr < NT_ROWS and 0 <= tc < NT_COLS:
            nt[tr * NT_COLS + tc] = tile

    # Set attribute for eagle wall area (BG0 palette for brick walls)
    # Eagle BG tiles use BG3 palette (via attribute table, same as steel)
    # Actually, in NES game, the eagle area attribute is set to palette 0 (BG0) for walls
    # Eagle BG tiles C8-CB are drawn with whatever palette the attribute table says
    # Let me set the attribute for the eagle area
    for dr, dc, tile in wall_data:
        tr = ey_tile + dr
        tc = ex_tile + dc
        if 0 <= tr < NT_ROWS and 0 <= tc < NT_COLS:
            ax_idx = tc >> 2
            ay_idx = tr >> 2
            aidx = ay_idx * 8 + ax_idx
            if aidx < ATTR_BYTES:
                quad = (((tr >> 1) & 1) << 1) | ((tc >> 1) & 1)
                shift = quad * 2
                pi = 0  # BG0 for brick walls; eagle BG tiles also get BG0 here
                attr[aidx] = (attr[aidx] & ~(0x03 << shift)) | (pi << shift)

    return bytes(nt), bytes(attr), grid

def render_reference(nt_tiles, attr_table, chr_bg, chr_spr):
    """Render BG layer (chr_bg) + eagle OAM sprites (chr_spr) — NES-accurate."""
    canvas = Canvas()
    # 1. BG nametable — uses BG pattern table
    for row in range(NT_ROWS):
        for col in range(NT_COLS):
            tile_idx = nt_tiles[row * NT_COLS + col]
            pal_idx = attr_pal(attr_table, col, row)
            pix = chr_bg[tile_idx]
            pal = ALL_PAL[pal_idx]
            canvas.draw_tile(pix, pal, col * 8, row * 8, transparent=False)

    # 2. Eagle OAM sprites — ROM $E3F2 EagleDrawFull: 4×2 grid of 8×16 entries, SP3
    #    NES 8×16 sprite mode: tile bit 0 selects pattern table (odd→PT1=sprites).
    #    All eagle tiles are odd ($D1,$D3,...) → sprite pattern table.
    #    Tile pair: top = T&0xFE, bot = (T&0xFE)+1, both from sprite bank.
    eagle_pal = ALL_PAL[7]  # SP3
    intact_oam = [0xD1, 0xD3, 0xD5, 0xD7, 0xD9, 0xDB, 0xDD, 0xDF]
    ex, ey = 120, 216  # eagle center
    xs = [ex - 16, ex - 8, ex, ex + 8]
    ys = [ey - 16, ey]
    for row in range(2):
        for col in range(4):
            T = intact_oam[row * 4 + col]
            t_top = T & 0xFE
            t_bot = (T & 0xFE) + 1
            canvas.draw_tile(chr_spr[t_top], eagle_pal, xs[col], ys[row], transparent=True)
            canvas.draw_tile(chr_spr[t_bot], eagle_pal, xs[col], ys[row] + 8, transparent=True)

    return canvas

# ══════════════════════════════════════════════════════════════════════════════
# GAME.JS SIMULATION: replicate game.js drawField + drawTile + drawEagleBase
# ══════════════════════════════════════════════════════════════════════════════
def render_gamejs(stage_grid, chr_bg):
    """Simulate game.js rendering at 1× NES pixel scale.

    Uses chr_bg for ALL tiles (BG and sprites) because game.js maps all tile
    indices to the BG bank rows of chr_all.png — it does not use the sprite bank.
    """
    chr_pt1 = chr_bg  # game.js uses BG bank for everything
    canvas = Canvas(bg=BG_COLOR)  # black background

    # game.js normalizes partial brick types to T.BRICK (4)
    grid = [row[:] for row in stage_grid]
    brick_bits = [[brick_init_bits(t) for t in row] for row in stage_grid]
    for r in range(MAP_ROWS):
        for c in range(MAP_COLS):
            if 0 <= grid[r][c] < 4:
                grid[r][c] = 4

    # game.js drawField(): fillRect black for playfield, then drawBorderTiles, then tiles
    C_FIELD = (0, 0, 0)
    canvas.fill_rect(FX, FY, MAP_COLS * 16, MAP_ROWS * 16 + 8, C_FIELD)

    # game.js drawBorderTiles(): tile $00 with BG0 palette at all border positions
    border_pal = ALL_PAL[0]  # BG0
    # Top 2 rows (rows 0–1, all 32 cols)
    for r in range(2):
        for c in range(32):
            canvas.draw_tile(chr_pt1[0x00], border_pal, c * 8, r * 8, transparent=False)
    # Bottom 2 rows (rows 28–29, all 32 cols)
    for r in range(28, 30):
        for c in range(32):
            canvas.draw_tile(chr_pt1[0x00], border_pal, c * 8, r * 8, transparent=False)
    # Left 2 cols (rows 2–27, cols 0–1)
    for r in range(2, 28):
        for c in range(2):
            canvas.draw_tile(chr_pt1[0x00], border_pal, c * 8, r * 8, transparent=False)
    # Right 4 cols (rows 2–27, cols 28–31)
    for r in range(2, 28):
        for c in range(28, 32):
            canvas.draw_tile(chr_pt1[0x00], border_pal, c * 8, r * 8, transparent=False)

    # game.js drawTile(): each metatile
    for row in range(MAP_ROWS):
        for col in range(MAP_COLS):
            t = grid[row][col]
            px = FX + col * 16
            py = FY + row * 16

            # game.js: fillRect black first, then skip if EMPTY
            canvas.fill_rect(px, py, 16, 16, C_FIELD)
            if t >= 13:
                continue  # empty

            if t == 4:  # BRICK (including normalized partial bricks)
                bits = brick_bits[row][col]
                for q in range(4):
                    tile_idx = 0x0F if (bits & (1 << q)) else 0x00
                    qx = 8 if (q & 1) else 0
                    qy = 8 if q >= 2 else 0
                    pal = ALL_PAL[TILE_PAL[4]]  # BG0
                    canvas.draw_tile(chr_pt1[tile_idx], pal, px + qx, py + qy, transparent=False)
                continue

            chr4 = TILE_CHR.get(t)
            if chr4:
                pi = TILE_PAL.get(t, 0)
                pal = ALL_PAL[pi]
                for si, (dx, dy) in enumerate([(0,0), (8,0), (0,8), (8,8)]):
                    canvas.draw_tile(chr_pt1[chr4[si]], pal, px + dx, py + dy, transparent=False)

    # game.js drawEagleBase(): Π-shaped brick walls + eagle OAM sprites
    ex, ey = 120, 216  # EAGLE position
    # Walls: brick tiles in Π shape
    wall_pal = ALL_PAL[0]  # BG0 for brick
    # Top bar: 4 tiles
    for dx in [-16, -8, 0, 8]:
        canvas.draw_tile(chr_pt1[0x0F], wall_pal, ex + dx, ey - 16, transparent=False)
    # Left leg: 2 tiles
    canvas.draw_tile(chr_pt1[0x0F], wall_pal, ex - 16, ey - 8, transparent=False)
    canvas.draw_tile(chr_pt1[0x0F], wall_pal, ex - 16, ey, transparent=False)
    # Right leg: 2 tiles
    canvas.draw_tile(chr_pt1[0x0F], wall_pal, ex + 8, ey - 8, transparent=False)
    canvas.draw_tile(chr_pt1[0x0F], wall_pal, ex + 8, ey, transparent=False)

    # Eagle: SP3 palette, 4×2 grid of 8×16 OAM entries from PT1/BG bank
    eagle_pal = ALL_PAL[7]  # SP3 palette
    intact_oam = [0xD1, 0xD3, 0xD5, 0xD7, 0xD9, 0xDB, 0xDD, 0xDF]
    xs = [ex - 16, ex - 8, ex, ex + 8]
    ys = [ey - 16, ey]
    for row in range(2):
        for col in range(4):
            T = intact_oam[row * 4 + col]
            t_top = T & 0xFE
            t_bot = (T & 0xFE) + 1
            canvas.draw_tile(chr_pt1[t_top], eagle_pal, xs[col], ys[row], transparent=True)
            canvas.draw_tile(chr_pt1[t_bot], eagle_pal, xs[col], ys[row] + 8, transparent=True)

    return canvas

# ══════════════════════════════════════════════════════════════════════════════
# DIFF
# ══════════════════════════════════════════════════════════════════════════════
def diff_canvases(ref, gjs):
    """Compare two canvases pixel by pixel. Return diff canvas and stats."""
    diff = Canvas(bg=(0, 40, 0))  # dark green = match
    total = 0
    mismatches = 0
    regions = {}  # region_name → count of mismatching pixels

    for y in range(SCR_H):
        for x in range(SCR_W):
            total += 1
            r_col = ref.get(x, y)
            g_col = gjs.get(x, y)
            if r_col != g_col:
                mismatches += 1
                diff.set(x, y, (255, 0, 0))  # red = mismatch

                # Classify region
                in_playfield = (FX <= x < FX + MAP_COLS * 16 and
                                FY <= y < FY + MAP_ROWS * 16)
                in_eagle_area = (104 <= x < 136 and 200 <= y < 232)
                in_border = (12 <= x < 220 and 12 <= y < 236 and not in_playfield and not in_eagle_area)
                in_hud = (x >= 208)

                if in_eagle_area:
                    region = "eagle_area"
                elif in_playfield:
                    region = "playfield"
                elif in_border:
                    region = "border"
                elif in_hud:
                    region = "hud_area"
                else:
                    region = "outer_border"

                regions[region] = regions.get(region, 0) + 1
            else:
                diff.set(x, y, (0, 80, 0))  # green = match

    return diff, total, mismatches, regions

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
def main():
    stage = 1
    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    # Bank pair 0+1 (D2=1 stages incl. stage 1): BG at $9010, sprites at $8010
    chr_bg_data = rom[0x9010:0x9010 + 0x1000]   # 4KB BG pattern table (bank 1 = PT1)
    chr_spr_data = rom[0x8010:0x8010 + 0x1000]  # 4KB sprite pattern table (bank 0 = PT0)
    chr_bg  = [decode_tile(chr_bg_data, i * 16) for i in range(256)]
    chr_spr = [decode_tile(chr_spr_data, i * 16) for i in range(256)]

    os.makedirs(OUT_DIR, exist_ok=True)

    # 1. NES-accurate reference: BG nametable (chr_bg) + eagle OAM sprites (chr_spr)
    nt_data, attr_data, stage_grid = build_enhanced_nametable(stage, rom)
    ref_canvas = render_reference(nt_data, attr_data, chr_bg, chr_spr)
    ref_path = os.path.join(OUT_DIR, f'ref_enhanced_stage{stage:02d}.png')
    ref_canvas.save(ref_path)
    print(f"Reference: {ref_path}")

    # 2. Game.js simulation: uses chr_bg for everything (game.js maps all tile
    #    indices to BG bank rows in chr_all.png, even for OAM sprites)
    gjs_canvas = render_gamejs(stage_grid, chr_bg)
    gjs_path = os.path.join(OUT_DIR, f'gamejs_sim_stage{stage:02d}.png')
    gjs_canvas.save(gjs_path)
    print(f"Game.js sim: {gjs_path}")

    # 3. Diff
    diff_canvas, total, mismatches, regions = diff_canvases(ref_canvas, gjs_canvas)
    diff_path = os.path.join(OUT_DIR, f'diff_stage{stage:02d}.png')
    diff_canvas.save(diff_path)
    print(f"Diff: {diff_path}")
    print(f"\nTotal pixels: {total}")
    print(f"Mismatches:   {mismatches} ({100*mismatches/total:.2f}%)")
    print(f"\nMismatches by region:")
    for region, count in sorted(regions.items(), key=lambda x: -x[1]):
        print(f"  {region:20s}: {count:6d} pixels")

    # 4. Categorize differences
    # "Intentional" = game.js renders EMPTY cells as black vs NES tile $00 glyph
    # "Eagle sprite bank" = game.js uses BG bank for eagle OAM instead of sprite bank
    empty_px = 0
    eagle_sprite_px = 0
    other_px = 0
    eagle_rect = (104, 200, 136, 232)  # x1,y1,x2,y2 of eagle OAM area
    for y in range(SCR_H):
        for x in range(SCR_W):
            if ref_canvas.get(x, y) == gjs_canvas.get(x, y):
                continue
            # Is this in the eagle OAM sprite area?
            if eagle_rect[0] <= x < eagle_rect[2] and eagle_rect[1] <= y < eagle_rect[3]:
                eagle_sprite_px += 1
                continue
            # Is this a playfield EMPTY cell?
            if FX <= x < FX + MAP_COLS * 16 and FY <= y < FY + MAP_ROWS * 16:
                mc = (x - FX) // 16
                mr = (y - FY) // 16
                if stage_grid[mr][mc] >= 13:
                    empty_px += 1
                    continue
            other_px += 1

    print(f"\nDifference breakdown:")
    print(f"  EMPTY tile $00 glyph (NES) vs black (game.js): {empty_px:6d} px")
    print(f"  Eagle OAM sprite bank (NES=PT1) vs BG (game.js): {eagle_sprite_px:6d} px")
    if other_px:
        print(f"  Other / unexpected:                               {other_px:6d} px")
    print(f"\nNotes:")
    print(f"  - EMPTY diff: now 0 with banks 0+1 (bank 1 tile $00 = blank)")
    print(f"    (was 9216 px when using banks 2+3 where tile $00 = \"0\" numeral)")
    print(f"  - Eagle diff: game.js uses BG bank tiles for OAM sprites,")
    print(f"    NES uses sprite pattern table (PT1). Fix: drawCHRTile for")
    print(f"    eagle sprites should offset by +256 to reach sprite bank rows")


if __name__ == '__main__':
    main()
