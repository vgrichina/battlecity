#!/usr/bin/env python3
"""compare_frames.py — Compare render_frame.py reference vs game.js rendering.

Produces:
  output_gfx/ref_enhanced_stage01.png   — Enhanced reference (nametable + eagle walls + eagle BG tiles)
  output_gfx/gamejs_sim_stage01.png     — Simulated game.js output (256×240 crop)
  output_gfx/diff_stage01.png           — Pixel diff (red = differs, green = match)

Reports all pixel-level discrepancies between the two.
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

def render_reference(nt_tiles, attr_table, chr_pt1):
    """Render BG layer + eagle OAM sprites (full NES frame)."""
    canvas = Canvas()
    # 1. BG nametable
    for row in range(NT_ROWS):
        for col in range(NT_COLS):
            tile_idx = nt_tiles[row * NT_COLS + col]
            pal_idx = attr_pal(attr_table, col, row)
            pix = chr_pt1[tile_idx]
            pal = ALL_PAL[pal_idx]
            canvas.draw_tile(pix, pal, col * 8, row * 8, transparent=False)

    # 2. Eagle OAM sprites — ROM $E3F2 EagleDrawFull: 4×2 grid of 8×16 entries, SP3
    #    row0 OAM_Y=200: col104→$D1, col112→$D3, col120→$D5, col128→$D7
    #    row1 OAM_Y=216: col104→$D9, col112→$DB, col120→$DD, col128→$DF
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
            canvas.draw_tile(chr_pt1[t_top], eagle_pal, xs[col], ys[row], transparent=True)
            canvas.draw_tile(chr_pt1[t_bot], eagle_pal, xs[col], ys[row] + 8, transparent=True)

    return canvas

# ══════════════════════════════════════════════════════════════════════════════
# GAME.JS SIMULATION: replicate game.js drawField + drawTile + drawEagleBase
# ══════════════════════════════════════════════════════════════════════════════
def render_gamejs(stage_grid, chr_pt1):
    """Simulate game.js rendering at 1× NES pixel scale (matches current game.js)."""
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

    prg_banks = rom[4]
    chr_off = 16 + prg_banks * 16384
    chr_data = rom[chr_off:chr_off + 16384]
    chr_pt1 = [decode_tile(chr_data, i * 16) for i in range(256)]

    os.makedirs(OUT_DIR, exist_ok=True)

    # 1. Enhanced reference (nametable + eagle walls)
    nt_data, attr_data, stage_grid = build_enhanced_nametable(stage, rom)
    ref_canvas = render_reference(nt_data, attr_data, chr_pt1)
    ref_path = os.path.join(OUT_DIR, f'ref_enhanced_stage{stage:02d}.png')
    ref_canvas.save(ref_path)
    print(f"Reference: {ref_path}")

    # 2. Game.js simulation
    gjs_canvas = render_gamejs(stage_grid, chr_pt1)
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

    # 4. Detailed analysis: sample some mismatching pixels
    print(f"\nSample mismatching pixels (first 20):")
    count = 0
    for y in range(SCR_H):
        for x in range(SCR_W):
            if ref_canvas.get(x, y) != gjs_canvas.get(x, y):
                r = ref_canvas.get(x, y)
                g = gjs_canvas.get(x, y)
                print(f"  ({x:3d},{y:3d}): ref={r} gjs={g}")
                count += 1
                if count >= 20:
                    break
        if count >= 20:
            break

    # 5. Check playfield-only discrepancies (most important)
    pf_mismatches = 0
    pf_details = {}
    for y in range(FY, FY + MAP_ROWS * 16):
        for x in range(FX, FX + MAP_COLS * 16):
            r = ref_canvas.get(x, y)
            g = gjs_canvas.get(x, y)
            if r != g:
                pf_mismatches += 1
                # Determine which metatile
                mc = (x - FX) // 16
                mr = (y - FY) // 16
                key = (mr, mc)
                if key not in pf_details:
                    pf_details[key] = {'count': 0, 'tile_type': stage_grid[mr][mc]}
                pf_details[key]['count'] += 1

    print(f"\nPlayfield-only mismatches: {pf_mismatches}")
    if pf_details:
        print("  Mismatching metatiles:")
        for (mr, mc), info in sorted(pf_details.items()):
            print(f"    metatile ({mc},{mr}) type={info['tile_type']}: {info['count']} pixels differ")


if __name__ == '__main__':
    main()
