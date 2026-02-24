#!/usr/bin/env python3
"""compare_render.py — Compare ROM-accurate rendering vs game.js rendering for stage 1.

Generates:
  1. ROM-accurate BG reference (render_frame.py logic) — already at output_gfx/frame_stage01.png
  2. game.js-equivalent BG render using chr_all.png tile sheet + game.js palette/logic
  3. Diff image highlighting pixel differences
  4. Text report of all discrepancies
"""

import os, sys, struct, zlib

ROM_PATH = "VS. Battle City (1985)(Namco).nes"
CHR_PNG  = "tiles/chr_all.png"
OUT_DIR  = "output_gfx"

# ── NES master palette (NTSC) — same as render_frame.py ──────────────────────
NES_MASTER = [
    (84,84,84),    (0,30,116),    (8,16,144),    (48,0,136),
    (68,0,100),    (92,0,48),     (84,4,0),      (60,24,0),
    (32,42,0),     (8,58,0),      (0,64,0),      (0,60,0),
    (0,50,60),     (0,0,0),       (0,0,0),        (0,0,0),
    (152,150,152), (8,76,196),    (48,50,236),   (92,30,228),
    (136,20,176),  (160,20,100),  (152,34,32),   (120,60,0),
    (84,90,0),     (40,114,0),    (8,124,0),     (0,118,40),
    (0,102,120),   (0,0,0),       (0,0,0),        (0,0,0),
    (236,238,236), (76,154,236),  (120,124,236), (176,98,236),
    (228,84,236),  (236,88,180),  (236,106,100), (212,136,32),
    (160,170,0),   (116,196,0),   (76,208,32),   (56,204,108),
    (56,180,204),  (60,60,60),    (0,0,0),        (0,0,0),
    (236,238,236), (168,204,236), (188,188,236), (212,178,236),
    (236,174,236), (236,174,212), (236,180,176), (228,196,144),
    (204,210,120), (180,222,120), (168,226,144), (152,226,180),
    (160,214,228), (160,162,160), (0,0,0),        (0,0,0),
]

# ROM palette data ($D44A)
ROM_PAL_BYTES = [
    [0x0F, 0x17, 0x06, 0x00],  # BG0 brick
    [0x0F, 0x3C, 0x10, 0x12],  # BG1 water
    [0x0F, 0x29, 0x09, 0x0B],  # BG2 trees
    [0x0F, 0x00, 0x10, 0x20],  # BG3 steel/ice
    [0x0F, 0x18, 0x27, 0x38],  # SP0 player 1
    [0x0F, 0x0A, 0x1B, 0x3B],  # SP1 player 2
    [0x0F, 0x0C, 0x10, 0x20],  # SP2 enemy grey
    [0x0F, 0x04, 0x16, 0x20],  # SP3 spawn/eagle
]
ROM_PAL = [[NES_MASTER[c & 0x3F] for c in slot] for slot in ROM_PAL_BYTES]

# game.js NES_PAL (hex strings → RGB tuples)
def hex2rgb(h):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))

JS_PAL = [
    [hex2rgb(c) for c in ['#000000','#783C00','#540400','#545454']],  # BG0
    [hex2rgb(c) for c in ['#000000','#A0D6E4','#989698','#3032EC']],  # BG1
    [hex2rgb(c) for c in ['#000000','#74C400','#083A00','#003C00']],  # BG2
    [hex2rgb(c) for c in ['#000000','#545454','#989698','#ECEEEC']],  # BG3
    [hex2rgb(c) for c in ['#000000','#545A00','#D48820','#CCD278']],  # SP0
    [hex2rgb(c) for c in ['#000000','#004000','#007628','#98E2B4']],  # SP1
    [hex2rgb(c) for c in ['#000000','#00323C','#989698','#ECEEEC']],  # SP2
    [hex2rgb(c) for c in ['#000000','#440064','#982220','#ECEEEC']],  # SP3
]

# ── Check palette match ──────────────────────────────────────────────────────
print("=== PALETTE COMPARISON ===")
pal_diffs = []
for i in range(8):
    for j in range(4):
        rom_c = ROM_PAL[i][j]
        js_c  = JS_PAL[i][j]
        if rom_c != js_c:
            pal_diffs.append((i, j, rom_c, js_c))
            print(f"  MISMATCH pal[{i}][{j}]: ROM={rom_c} JS={js_c}")
if not pal_diffs:
    print("  All 32 palette entries match perfectly.")

# ── Level data ────────────────────────────────────────────────────────────────
LEVEL_OFF  = 0x4010 + (0xF27D - 0xC000)
STAGE_SIZE = 91
MAP_COLS   = 13
MAP_ROWS   = 13

def decode_stage(raw):
    grid = []
    for row in range(MAP_ROWS):
        row_tiles = []
        for col in range(MAP_COLS):
            ni = row * 14 + col
            t  = (raw[ni // 2] >> 4) & 0xF if ni % 2 == 0 else raw[ni // 2] & 0xF
            row_tiles.append(t)
        grid.append(row_tiles)
    return grid

# ── CHR tile decoding (ROM 2bpp) ──────────────────────────────────────────────
def decode_tile_2bpp(data, offset):
    px = []
    for row in range(8):
        lo = data[offset + row]
        hi = data[offset + row + 8]
        for bit in range(7, -1, -1):
            px.append(((lo >> bit) & 1) | (((hi >> bit) & 1) << 1))
    return px

# ── CHR tile decoding from chr_all.png (game.js method) ──────────────────────
def read_png_pixels(path):
    """Read a PNG file and return (width, height, pixel_data) where pixel_data is flat RGBA."""
    import png
    reader = png.Reader(filename=path)
    w, h, rows, info = reader.asRGBA8()
    pixels = []
    for row in rows:
        pixels.extend(row)
    return w, h, pixels

def gray_to_idx(r):
    """game.js grayToIdx mapping."""
    if r < 0x2B: return 0
    if r < 0x7F: return 1
    if r < 0xD5: return 2
    return 3

# ── Tile CHR tables (same as render_frame.py and game.js) ────────────────────
TILE_CHR = {
    0:  [0x00, 0x0F, 0x00, 0x0F],  # BRICK_TL
    1:  [0x00, 0x00, 0x0F, 0x0F],  # BRICK_TR
    2:  [0x0F, 0x00, 0x0F, 0x00],  # BRICK_BL
    3:  [0x0F, 0x0F, 0x00, 0x00],  # BRICK_BR
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
TILE_PAL_IDX = {
    0:0, 1:0, 2:0, 3:0, 4:0,
    5:3, 6:3, 7:3, 8:3, 9:3,
    10:1, 11:2, 12:3,
}

# ── PNG writer ────────────────────────────────────────────────────────────────
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

# ── Canvas class ──────────────────────────────────────────────────────────────
class Canvas:
    def __init__(self, w, h, bg=(0,0,0)):
        self.w, self.h = w, h
        self.px = [bg] * (w * h)

    def set(self, x, y, col):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = col

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y * self.w + x]
        return (0, 0, 0)

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

    def save(self, path):
        write_png(path, self.w, self.h, self.px)


def main():
    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    # Load CHR from ROM
    prg_banks = rom[4]
    chr_off = 16 + prg_banks * 16384
    chr_data = rom[chr_off : chr_off + 16384]
    # PT1 = BG tiles (0x0000-0x0FFF in CHR data)
    rom_bg_tiles = [decode_tile_2bpp(chr_data, i * 16) for i in range(256)]

    # Load chr_all.png and decode tiles using game.js method
    try:
        import png
    except ImportError:
        print("Installing pypng...")
        os.system("pip install pypng")
        import png

    reader = png.Reader(filename=CHR_PNG)
    w, h, rows_iter, info = reader.asRGBA8()
    png_pixels = []
    for row in rows_iter:
        png_pixels.append(list(row))

    CHR_CELL = 9
    CHR_BORDER = 1

    def get_png_tile(tile_abs):
        """Extract 8x8 tile from chr_all.png using game.js logic."""
        tcol = tile_abs % 32
        trow = tile_abs // 32
        sx = tcol * CHR_CELL + CHR_BORDER
        sy = trow * CHR_CELL + CHR_BORDER
        pix = []
        for py in range(8):
            for px in range(8):
                if sy + py < len(png_pixels):
                    row_data = png_pixels[sy + py]
                    off = (sx + px) * 4
                    r = row_data[off] if off < len(row_data) else 0
                else:
                    r = 0
                pix.append(gray_to_idx(r))
        return pix

    # Decode stage 1
    off = LEVEL_OFF + STAGE_SIZE * 0  # stage 1
    grid = decode_stage(rom[off : off + STAGE_SIZE])

    FX, FY = 16, 16
    META = 16

    # ── Render 1: ROM-accurate BG (same as render_frame.py synthetic) ──────
    rom_canvas = Canvas(256, 240, bg=(0,0,0))

    # Attribute table for palette lookup
    attr = bytearray(64)
    nt_tiles = bytearray(960)

    for mr in range(MAP_ROWS):
        for mc in range(MAP_COLS):
            t = grid[mr][mc]
            chr4 = TILE_CHR.get(t)
            if chr4 is None:
                continue
            pi = TILE_PAL_IDX.get(t, 0)
            for si, (dr, dc) in enumerate([(0,0),(0,1),(1,0),(1,1)]):
                tr = mr * 2 + dr + 2
                tc = mc * 2 + dc + 2
                if tr < 30 and tc < 32:
                    nt_tiles[tr * 32 + tc] = chr4[si]
            tc_base = mc * 2 + 2
            tr_base = mr * 2 + 2
            ax = tc_base >> 2
            ay = tr_base >> 2
            aidx = ay * 8 + ax
            if aidx < 64:
                quad = (((tr_base >> 1) & 1) << 1) | ((tc_base >> 1) & 1)
                shift = quad * 2
                attr[aidx] = (attr[aidx] & ~(0x03 << shift)) | (pi << shift)

    # Render full nametable (ROM-accurate)
    for row in range(30):
        for col in range(32):
            tile_idx = nt_tiles[row * 32 + col]
            # Attribute table lookup
            ax = col >> 2
            ay = row >> 2
            aidx = ay * 8 + ax
            byte = attr[aidx] if aidx < 64 else 0
            quad = ((row >> 1) & 1) * 2 + ((col >> 1) & 1)
            pal_idx = (byte >> (quad * 2)) & 3
            pix = rom_bg_tiles[tile_idx]
            pal = ROM_PAL[pal_idx]
            rom_canvas.draw_tile(pix, pal, col * 8, row * 8, transparent=False)

    # Add eagle walls (brick Π shape at eagle pos 120,216)
    ex, ey = 120, 216
    brick_tile = rom_bg_tiles[0x0F]
    brick_pal = ROM_PAL[0]  # BG0
    # Top bar
    for dx in [-16, -8, 0, 8]:
        rom_canvas.draw_tile(brick_tile, brick_pal, ex + dx, ey - 16, transparent=False)
    # Left leg
    rom_canvas.draw_tile(brick_tile, brick_pal, ex - 16, ey - 8, transparent=False)
    rom_canvas.draw_tile(brick_tile, brick_pal, ex - 16, ey, transparent=False)
    # Right leg
    rom_canvas.draw_tile(brick_tile, brick_pal, ex + 8, ey - 8, transparent=False)
    rom_canvas.draw_tile(brick_tile, brick_pal, ex + 8, ey, transparent=False)

    # Eagle BG tiles ($C8/$CA/$C9/$CB)
    # Row 26: C8 at (ex-8, ey-8), CA at (ex, ey-8)
    # Row 27: C9 at (ex-8, ey),   CB at (ex, ey)
    # These use SP3 palette (palette 7) as they're drawn as sprites, but the BG
    # nametable also has the eagle tiles. For BG rendering they use attribute table.
    # Actually in the ROM the eagle body tiles are written to the nametable by
    # BrickWallInit and rendered with whatever attribute palette applies there.
    # The eagle center is at nametable (col 15, row 26) = attr block (3, 6), but
    # the eagle is also overlaid by sprites. For BG reference we'll draw them.
    eagle_bg_positions = [
        (0xC8, ex - 8, ey - 8),  # TL
        (0xCA, ex,     ey - 8),  # TR
        (0xC9, ex - 8, ey),      # BL
        (0xCB, ex,     ey),      # BR
    ]
    for tile_idx, tx, ty in eagle_bg_positions:
        # These tiles use whatever BG palette the attribute table assigns.
        # At this position, attribute table assigns palette from the brick walls (BG0).
        # But the eagle tiles themselves should use... let's check the attribute table.
        tcol = tx // 8
        trow = ty // 8
        ax = tcol >> 2
        ay = trow >> 2
        aidx = ay * 8 + ax
        byte = attr[aidx] if aidx < 64 else 0
        quad = ((trow >> 1) & 1) * 2 + ((tcol >> 1) & 1)
        pal_i = (byte >> (quad * 2)) & 3
        rom_canvas.draw_tile(rom_bg_tiles[tile_idx], ROM_PAL[pal_i], tx, ty, transparent=False)

    os.makedirs(OUT_DIR, exist_ok=True)
    rom_canvas.save(os.path.join(OUT_DIR, 'compare_rom.png'))
    print(f"\nROM-accurate BG saved to {OUT_DIR}/compare_rom.png")

    # ── Render 2: game.js-equivalent BG ──────────────────────────────────────
    # game.js differences:
    # 1. Background/field color: C.FIELD = '#080808' = (8,8,8) instead of (0,0,0)
    # 2. Border: C.BORDER = '#404040' rectangle around field
    # 3. Canvas is NES_W=292 wide (256+36 for HUD)
    # 4. Uses chr_all.png grayscale → palette index mapping
    # 5. Only draws 13×13 playfield + eagle area (not full nametable)

    JS_FIELD = (8, 8, 8)      # C.FIELD '#080808'
    JS_BORDER = (64, 64, 64)  # C.BORDER '#404040'
    JS_BG = (0, 0, 0)         # C.BG '#000000' (canvas background outside field)

    # Render at 256×240 for comparison (ignore the 36px HUD extension)
    js_canvas = Canvas(256, 240, bg=JS_BG)

    # Draw border and field (drawField lines 1146-1147)
    js_canvas.fill_rect(FX - 4, FY - 4, MAP_COLS * META + 8, MAP_ROWS * META + 8 + 8, JS_BORDER)
    js_canvas.fill_rect(FX, FY, MAP_COLS * META, MAP_ROWS * META + 8, JS_FIELD)

    # Draw tiles using chr_all.png tiles + game.js palette
    for mr in range(MAP_ROWS):
        for mc in range(MAP_COLS):
            t = grid[mr][mc]
            px_x = FX + mc * META
            px_y = FY + mr * META

            # game.js drawTile: always fills with C.FIELD first
            js_canvas.fill_rect(px_x, px_y, META, META, JS_FIELD)

            if t == 13 or t > 13:
                continue  # empty

            chr4 = TILE_CHR.get(t)
            if chr4 is None:
                continue

            pi = TILE_PAL_IDX.get(t, 0)
            pal = JS_PAL[pi]

            # For brick types (0-4), game.js uses brickBits logic
            # Initial brickBits: for BRICK (4), all bits set (0xF); for partial types, specific bits
            if t <= 4:
                # Compute initial brickBits
                if t == 4:
                    bits = 0xF  # all 4 quadrants
                elif t == 0:  # BRICK_TL: only TL quadrant present? No...
                    # TILE_CHR[0] = [0x00, 0x0F, 0x00, 0x0F] — right col half
                    # In game.js, brickBits tracks which quadrants are solid brick
                    # For BRICK_TL (type 0): only tiles at positions 1,3 are $0F (solid)
                    bits = 0b1010  # bit1=TR, bit3=BR
                elif t == 1:  # BRICK_TR: bottom row
                    bits = 0b1100  # bit2=BL, bit3=BR
                elif t == 2:  # BRICK_BL: left col
                    bits = 0b0101  # bit0=TL, bit2=BL
                elif t == 3:  # BRICK_BR: top row
                    bits = 0b0011  # bit0=TL, bit1=TR
                else:
                    bits = 0xF

                for q in range(4):
                    tile_idx = 0x0F if (bits & (1 << q)) else 0x00
                    qx = 8 if (q & 1) else 0
                    qy = 8 if q >= 2 else 0
                    png_pix = get_png_tile(tile_idx)
                    js_canvas.draw_tile(png_pix, pal, px_x + qx, px_y + qy)
            else:
                # Non-brick: draw 4 sub-tiles
                for si, (dr, dc) in enumerate([(0,0),(0,1),(1,0),(1,1)]):
                    png_pix = get_png_tile(chr4[si])
                    js_canvas.draw_tile(png_pix, pal, px_x + dc * 8, px_y + dr * 8)

    # Draw eagle walls (same as ROM but using PNG tiles and game.js palette)
    brick_png_pix = get_png_tile(0x0F)
    js_brick_pal = JS_PAL[0]
    for dx in [-16, -8, 0, 8]:
        js_canvas.draw_tile(brick_png_pix, js_brick_pal, ex + dx, ey - 16)
    js_canvas.draw_tile(brick_png_pix, js_brick_pal, ex - 16, ey - 8)
    js_canvas.draw_tile(brick_png_pix, js_brick_pal, ex - 16, ey)
    js_canvas.draw_tile(brick_png_pix, js_brick_pal, ex + 8, ey - 8)
    js_canvas.draw_tile(brick_png_pix, js_brick_pal, ex + 8, ey)

    # Eagle BG tiles — game.js draws these as sprites, not BG tiles.
    # So the BG area behind the eagle in game.js is just C.FIELD.
    # ROM renders eagle BG tiles $C8-$CB in the nametable.
    # This is a deliberate difference — game.js draws eagle as sprites on top.

    js_canvas.save(os.path.join(OUT_DIR, 'compare_gamejs.png'))
    print(f"game.js-equivalent BG saved to {OUT_DIR}/compare_gamejs.png")

    # ── Pixel diff ────────────────────────────────────────────────────────────
    diff_canvas = Canvas(256, 240, bg=(0, 0, 0))
    diff_count = 0
    region_diffs = {
        'playfield_tiles': 0,       # 13×13 metatile area: (16,16)-(224,224)
        'playfield_bg': 0,          # empty tiles within playfield
        'border_area': 0,           # (12,12)-(228,228) minus playfield
        'outside_playfield': 0,     # everything outside the border area
        'eagle_area': 0,            # eagle walls + body area
    }

    for y in range(240):
        for x in range(256):
            rom_px = rom_canvas.get(x, y)
            js_px = js_canvas.get(x, y)
            if rom_px != js_px:
                diff_count += 1
                # Highlight diff in red (or green if only one channel differs)
                diff_canvas.set(x, y, (255, 0, 0))

                # Categorize
                in_playfield = (FX <= x < FX + MAP_COLS * META and
                                FY <= y < FY + MAP_ROWS * META)
                in_border = (FX - 4 <= x < FX + MAP_COLS * META + 4 and
                             FY - 4 <= y < FY + MAP_ROWS * META + 4 + 8)
                in_eagle = (ex - 16 <= x < ex + 16 and ey - 16 <= y < ey + 8)

                if in_eagle:
                    region_diffs['eagle_area'] += 1
                elif in_playfield:
                    # Check if this pixel is in a tile area or empty background
                    mc = (x - FX) // META
                    mr = (y - FY) // META
                    if 0 <= mr < MAP_ROWS and 0 <= mc < MAP_COLS:
                        t = grid[mr][mc]
                        if t == 13:
                            region_diffs['playfield_bg'] += 1
                        else:
                            region_diffs['playfield_tiles'] += 1
                    else:
                        region_diffs['playfield_bg'] += 1
                elif in_border:
                    region_diffs['border_area'] += 1
                else:
                    region_diffs['outside_playfield'] += 1
            else:
                # Same pixel — show dim version
                diff_canvas.set(x, y, (rom_px[0] // 4, rom_px[1] // 4, rom_px[2] // 4))

    diff_canvas.save(os.path.join(OUT_DIR, 'compare_diff.png'))
    print(f"Diff image saved to {OUT_DIR}/compare_diff.png")

    print(f"\n=== PIXEL DIFF SUMMARY ===")
    print(f"Total different pixels: {diff_count} / {256*240} ({100*diff_count/(256*240):.1f}%)")
    for region, count in sorted(region_diffs.items(), key=lambda x: -x[1]):
        if count > 0:
            print(f"  {region}: {count} pixels")

    # ── Detailed analysis of specific discrepancies ───────────────────────────
    print(f"\n=== DETAILED DISCREPANCIES ===")

    # 1. Check C.FIELD vs NES black
    print(f"\n1. BACKGROUND COLOR:")
    print(f"   ROM: (0,0,0) = NES $0F pure black")
    print(f"   JS:  (8,8,8) = C.FIELD '#080808'")
    print(f"   Impact: All empty tiles and playfield background are (8,8,8) instead of (0,0,0)")

    # 2. Border
    print(f"\n2. BORDER DECORATION:")
    print(f"   ROM: No visible border; nametable tiles outside playfield are tile $00 with BG palette")
    print(f"   JS:  Gray (#404040) border rectangle drawn by drawField()")
    print(f"   Impact: {region_diffs['border_area']} pixels affected in border area")

    # 3. Outside playfield
    print(f"\n3. NAMETABLE AREA OUTSIDE PLAYFIELD:")
    print(f"   ROM: Full 32×30 nametable rendered (tile $00 with per-attribute palettes)")
    print(f"   JS:  Only 13×13 playfield drawn; rest is canvas background (0,0,0)")
    print(f"   Impact: {region_diffs['outside_playfield']} pixels affected")

    # 4. Check tile rendering accuracy in playfield
    if region_diffs['playfield_tiles'] > 0:
        print(f"\n4. PLAYFIELD TILE RENDERING:")
        print(f"   {region_diffs['playfield_tiles']} pixels differ in non-empty tile areas!")
        # Sample some differing pixels
        samples = 0
        for y in range(FY, FY + MAP_ROWS * META):
            for x in range(FX, FX + MAP_COLS * META):
                mc = (x - FX) // META
                mr = (y - FY) // META
                if 0 <= mr < MAP_ROWS and 0 <= mc < MAP_COLS:
                    t = grid[mr][mc]
                    if t != 13:
                        rom_px = rom_canvas.get(x, y)
                        js_px = js_canvas.get(x, y)
                        if rom_px != js_px and samples < 10:
                            print(f"   Sample: tile type {t} at metatile({mc},{mr}) pixel({x},{y}): ROM={rom_px} JS={js_px}")
                            samples += 1
    else:
        print(f"\n4. PLAYFIELD TILE RENDERING: All non-empty tile pixels match!")

    # 5. Eagle area
    if region_diffs['eagle_area'] > 0:
        print(f"\n5. EAGLE AREA:")
        print(f"   {region_diffs['eagle_area']} pixels differ in eagle/wall area")
        print(f"   ROM renders eagle BG tiles ($C8-$CB) in nametable; JS draws eagle as sprites only")

    # 6. Check tile $00 rendering between ROM and PNG
    print(f"\n6. TILE $00 (MORTAR PATTERN) COMPARISON:")
    rom_t0 = rom_bg_tiles[0]
    png_t0 = get_png_tile(0)
    t0_match = (rom_t0 == png_t0)
    print(f"   ROM 2bpp tile $00 palette indices == chr_all.png grayscale-decoded tile $00: {t0_match}")
    if not t0_match:
        for py in range(8):
            rom_row = rom_t0[py*8:(py+1)*8]
            png_row = png_t0[py*8:(py+1)*8]
            if rom_row != png_row:
                print(f"   Row {py}: ROM={rom_row} PNG={png_row}")

    # 7. Spot-check a few important tiles
    print(f"\n7. CHR TILE DATA COMPARISON (ROM vs chr_all.png):")
    important_tiles = [0x00, 0x0F, 0x10, 0x12, 0x20, 0x21, 0x22]
    tile_names = {0x00: 'mortar', 0x0F: 'brick', 0x10: 'steel', 0x12: 'water',
                  0x20: 'steel_border', 0x21: 'ice', 0x22: 'trees'}
    all_match = True
    for ti in important_tiles:
        rom_t = rom_bg_tiles[ti]
        png_t = get_png_tile(ti)
        match = (rom_t == png_t)
        if not match:
            all_match = False
            print(f"   MISMATCH tile ${ti:02X} ({tile_names.get(ti, '?')})")
            for py in range(8):
                rom_row = rom_t[py*8:(py+1)*8]
                png_row = png_t[py*8:(py+1)*8]
                if rom_row != png_row:
                    print(f"     Row {py}: ROM={rom_row} PNG={png_row}")
    if all_match:
        print(f"   All {len(important_tiles)} important BG tiles match perfectly.")

    # 8. Check brickBits initialization for partial brick types
    print(f"\n8. BRICK PARTIAL TYPE HANDLING:")
    # In game.js, check how brickBits is initialized
    # ROM TILE_CHR defines which sub-tiles are solid ($0F) vs mortar ($00)
    # game.js uses brickBits bitmask per quadrant
    for t in range(5):
        chr4 = TILE_CHR[t]
        # Determine which quadrants have tile $0F (solid brick)
        bits_from_chr = 0
        for q in range(4):
            if chr4[q] == 0x0F:
                bits_from_chr |= (1 << q)
        # Compare with game.js brickBits initialization
        if t == 4:
            js_bits = 0xF
        elif t == 0:
            js_bits = 0b1010
        elif t == 1:
            js_bits = 0b1100
        elif t == 2:
            js_bits = 0b0101
        elif t == 3:
            js_bits = 0b0011

        match = bits_from_chr == js_bits
        print(f"   Type {t} ({['BRICK_TL','BRICK_TR','BRICK_BL','BRICK_BR','BRICK'][t]}): "
              f"CHR→bits=0b{bits_from_chr:04b} JS→bits=0b{js_bits:04b} {'✓' if match else 'MISMATCH!'}")

    print("\n=== DONE ===")


if __name__ == '__main__':
    main()
