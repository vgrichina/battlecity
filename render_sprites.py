#!/usr/bin/env python3
"""render_sprites.py — Render Battle City game element sprite sheet with ROM-exact NES palette.

Decodes CHR tiles directly from ROM, applies PaletteData ($D44A), and outputs
output_gfx/sprite_test.png as a visual sanity check for tile/palette correctness.

Layout (each group separated by a 4-px colored bar — legend printed to stdout):
  Group 0 (red bar)    : Player tanks — 4 star levels × 4 dirs (SP0, SP1 side by side)
  Group 1 (cyan bar)   : Enemy tanks  — 4 types × 4 dirs (SP2, flashing=SP3)
  Group 2 (green bar)  : Spawn animation — 8 unique frames (8×16 BG tiles $A0-$AE)
  Group 3 (yellow bar) : Eagle intact + damaged (4×2 grid of 8×16 BG tiles)
  Group 4 (magenta bar): Bullet explosion — 4 dirs (8×8 BG tiles $B0-$B7)
  Group 5 (blue bar)   : Power-up sprites — 6 types (16×16 sprite bank $80-$97)
  Group 6 (orange bar) : HUD tiles — $6A, $79, $7B, $7D, $7F (BG bank)
"""

import os
import struct
import zlib

ROM_PATH = "VS. Battle City (1985)(Namco).nes"
OUT_PATH = "output_gfx/sprite_test.png"

# ---------------------------------------------------------------------------
# NES master palette (standard NTSC)
# ---------------------------------------------------------------------------
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

# ROM PaletteData $D44A: 8 palette slots × 4 NES color indices
ROM_PAL_BYTES = [
    [0x0F, 0x17, 0x06, 0x00],  # BG0 brick
    [0x0F, 0x3C, 0x10, 0x12],  # BG1 trees
    [0x0F, 0x29, 0x09, 0x0B],  # BG2 water
    [0x0F, 0x00, 0x10, 0x20],  # BG3 steel/ice
    [0x0F, 0x18, 0x27, 0x38],  # SP0 P1 yellow
    [0x0F, 0x0A, 0x1B, 0x3B],  # SP1 P2 green
    [0x0F, 0x0C, 0x10, 0x20],  # SP2 enemy grey
    [0x0F, 0x04, 0x16, 0x20],  # SP3 power-up / special
]
NES_PAL = [[NES_MASTER[c & 0x3F] for c in slot] for slot in ROM_PAL_BYTES]

# Compare vs current game.js NES_PAL
GAMEJS_PAL_HEX = [
    ['#000000','#8A4600','#7B0E00','#626262'],
    ['#000000','#B3F9E1','#ABABAB','#424DC6'],
    ['#000000','#84CC00','#1E5200','#006A18'],
    ['#000000','#626262','#ABABAB','#FFFFFF'],
    ['#000000','#616300','#F48F25','#F0E070'],
    ['#000000','#006000','#008F38','#B2FCBA'],
    ['#000000','#005E52','#ABABAB','#FFFFFF'],
    ['#000000','#730D68','#AF2B1C','#FFFFFF'],
]
PAL_NAMES = ['BG0-brick','BG1-trees','BG2-water','BG3-steel',
             'SP0-P1yel','SP1-P2grn','SP2-enemy','SP3-spcl']

# ---------------------------------------------------------------------------
# CHR tile decoding
# ---------------------------------------------------------------------------
def decode_tile(data, offset):
    """Decode one 16-byte 2bpp NES tile → 64 palette indices (0-3)."""
    pixels = []
    for row in range(8):
        p0 = data[offset + row]
        p1 = data[offset + row + 8]
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            pixels.append(c)
    return pixels

# ---------------------------------------------------------------------------
# PNG writer (stdlib only)
# ---------------------------------------------------------------------------
def write_png(path, width, height, rgb_pixels):
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)
    magic = b'\x89PNG\r\n\x1a\n'
    ihdr  = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            r, g, b = rgb_pixels[y * width + x]
            raw += bytes([r, g, b])
    idat = chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    iend = chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(magic + ihdr + idat + iend)
    print(f"  wrote {path}  ({width}x{height})")

# ---------------------------------------------------------------------------
# Canvas compositor
# ---------------------------------------------------------------------------
SCALE = 2   # 2× zoom
PAD   = 4   # px between groups
BGCOL = (30, 30, 30)   # canvas background

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [BGCOL] * (w * h)

    def set(self, x, y, col):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = col

    def fill_rect(self, x, y, w, h, col):
        for dy in range(h):
            for dx in range(w):
                self.set(x + dx, y + dy, col)

    def draw_tile(self, tile_pixels, pal, px, py, transparent=False):
        """Draw an 8×8 tile (scaled by SCALE) at pixel (px, py)."""
        for ty in range(8):
            for tx in range(8):
                cidx = tile_pixels[ty * 8 + tx]
                if transparent and cidx == 0:
                    continue
                col = pal[cidx]
                for sy in range(SCALE):
                    for sx in range(SCALE):
                        self.set(px + tx * SCALE + sx, py + ty * SCALE + sy, col)

    def draw_tile16(self, tiles, tl_idx, tr_idx, bl_idx, br_idx, pal, px, py, transparent=True):
        """Draw a 16×16 sprite from 4 tile indices (TL, TR, BL, BR)."""
        T8 = 8 * SCALE
        self.draw_tile(tiles[tl_idx], pal, px,      py,      transparent)
        self.draw_tile(tiles[tr_idx], pal, px + T8, py,      transparent)
        self.draw_tile(tiles[bl_idx], pal, px,      py + T8, transparent)
        self.draw_tile(tiles[br_idx], pal, px + T8, py + T8, transparent)

    def separator(self, y, h, col):
        self.fill_rect(0, y, self.w, h, col)

    def save(self, path):
        write_png(path, self.w, self.h, self.px)

# ---------------------------------------------------------------------------
# Layout helpers
# ---------------------------------------------------------------------------
T8  = 8 * SCALE   # 8 NES px scaled
T16 = 16 * SCALE  # 16 NES px scaled
SEP_H = 4         # separator bar height

def compute_height(groups):
    """groups = list of (row_count, tile_h_px) tuples."""
    h = PAD
    for nrows, tile_h in groups:
        h += nrows * tile_h + PAD + SEP_H + PAD
    return h

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    with open(ROM_PATH, 'rb') as f:
        rom = f.read()
    assert rom[:4] == b'NES\x1a'

    # Bank pair 1 (mapper banks 2+3, file $A010): correct for stage 1 gameplay
    chr_off   = 0xA010
    chr_data  = rom[chr_off : chr_off + 0x2000]  # 8KB: BG + sprite tiles

    total_tiles = len(chr_data) // 16
    tiles = [decode_tile(chr_data, i * 16) for i in range(total_tiles)]
    # tiles[0..255]   = BG bank
    # tiles[256..511] = Sprite bank

    print(f"Decoded {total_tiles} tiles from CHR-ROM (file offset {chr_off:#x})")

    # ── Palette diff report ──────────────────────────────────────────────
    print("\n=== NES_PAL comparison: ROM $D44A vs game.js hardcoded ===")
    for si in range(8):
        rom_rgb  = NES_PAL[si]
        js_hexes = GAMEJS_PAL_HEX[si]
        diffs = []
        for ci in range(4):
            rr,rg,rb = rom_rgb[ci]
            jh = js_hexes[ci]
            jr = int(jh[1:3],16); jg = int(jh[3:5],16); jb = int(jh[5:7],16)
            if (rr,rg,rb) != (jr,jg,jb):
                diffs.append(f"  [{ci}] ROM=({rr},{rg},{rb}) JS=({jr},{jg},{jb})")
        tag = "OK  " if not diffs else "DIFF"
        print(f"  {tag} {PAL_NAMES[si]}")
        for d in diffs:
            print(d)

    # ── Tank tile summary ────────────────────────────────────────────────
    print("\n=== Tank tile groups (sprite bank = tile+256) ===")
    print("  Player star levels: $00,$20,$40,$60 (base in sprite bank)")
    for sl, name in enumerate(['star0','star1','star2','star3']):
        base = sl * 0x20
        print(f"    {name} (${base:02X}): tile {256+base}  dirs: UP={256+base+0} R={256+base+8} D={256+base+16} L={256+base+24}")
    print("  Enemy types: $80,$A0,$C0,$E0 (base in sprite bank)")
    for tp, name in enumerate(['Basic','Fast','Power','Armor']):
        base = 0x80 + tp * 0x20
        print(f"    type{tp} {name} (${base:02X}): tile {256+base}  dirs: UP={256+base+0} R={256+base+8} D={256+base+16} L={256+base+24}")

    # ── Canvas layout ────────────────────────────────────────────────────
    # Group 0: Player tanks  4 star levels × 4 dirs  → 16 tanks wide, 1 row per palette
    #   Two sub-rows: SP0 (P1) and SP1 (P2)
    # Group 1: Enemy tanks   4 types × 4 dirs         → 16 tanks wide, 1 row (SP2)
    # Group 2: Spawn anim    8 unique frames × 8×16   → 8 sprites wide
    # Group 3: Eagle         intact + damaged (4 cols × 2 rows × 8×16)
    # Group 4: Bullet expl   4 dirs                   → 4 tiles wide (8×8)
    # Group 5: Power-ups     6 types (16×16)
    # Group 6: HUD tiles     $6A + $79/$7B/$7D/$7F

    CANVAS_W = max(
        (16 * T16) + PAD * 2,   # group 0/1: 16 tanks × 16px
        (8 * (T8 + 2)) + PAD * 2,  # group 2: spawn
        (4 * (T8 + 2) * 2) + PAD * 2,  # group 3: eagle
        (6 * T16) + PAD * 2,    # group 5: power-ups
    )

    # Compute total height
    groups_h = [
        2 * T16,   # group 0: 2 sub-rows (SP0, SP1) × 16px
        T16,       # group 1: enemies
        16 * SCALE,  # group 2: spawn (8×16 each)
        16 * SCALE,  # group 3: eagle
        T8,          # group 4: bullet expl (8×8)
        T16,         # group 5: power-ups
        T8,          # group 6: HUD tiles
    ]
    total_h = PAD
    for gh in groups_h:
        total_h += SEP_H + PAD + gh + PAD
    total_h += PAD

    CANVAS_W = 16 * T16 + PAD * 4
    c = Canvas(CANVAS_W, total_h)
    c.fill_rect(0, 0, CANVAS_W, total_h, BGCOL)

    SEP_COLS = [
        (200, 50,  50),   # red    — player
        (50,  200, 200),  # cyan   — enemies
        (50,  200,  50),  # green  — spawn
        (220, 220,  50),  # yellow — eagle
        (200,  50, 200),  # magenta— bullet expl
        (50,   80, 200),  # blue   — power-ups
        (220, 150,  50),  # orange — HUD
    ]

    cy = PAD
    def next_group(gi, label):
        nonlocal cy
        c.separator(cy, SEP_H, SEP_COLS[gi])
        cy += SEP_H + PAD
        print(f"  Group {gi}: {label}  (y={cy})")

    # ── Group 0: Player tanks ────────────────────────────────────────────
    next_group(0, "Player tanks (SP0=P1 yellow, SP1=P2 green)  4 star levels × 4 dirs")
    DIR_ORDER = [0, 1, 2, 3]   # UP, RIGHT, DOWN, LEFT
    STAR_LEVELS = [0, 0x20, 0x40, 0x60]
    for pal_idx, pal_name in [(4, 'SP0-P1'), (5, 'SP1-P2')]:
        x = PAD
        for star_level in STAR_LEVELS:
            for d in DIR_ORDER:
                base = star_level + d * 8
                T = 256 + base        # sprite bank
                # 16×16 tank: tiles T, T+2, T+1, T+3 → TL, TR, BL, BR
                c.draw_tile16(tiles, T, T+2, T+1, T+3, NES_PAL[pal_idx], x, cy, transparent=True)
                x += T16 + 2
        cy += T16 + 2
    cy += PAD

    # ── Group 1: Enemy tanks ─────────────────────────────────────────────
    next_group(1, "Enemy tanks (SP2=grey)  4 types × 4 dirs")
    ENEMY_BASES = [0x80, 0xA0, 0xC0, 0xE0]
    ENEMY_NAMES = ['Basic','Fast','Power','Armor']
    x = PAD
    for etype, base in enumerate(ENEMY_BASES):
        for d in DIR_ORDER:
            tbase = base + d * 8
            T = 256 + tbase
            c.draw_tile16(tiles, T, T+2, T+1, T+3, NES_PAL[6], x, cy, transparent=True)
            x += T16 + 2
    cy += T16 + PAD

    # ── Group 2: Spawn animation ─────────────────────────────────────────
    next_group(2, "Spawn animation (SP0, BG bank $A0-$AE, 8×16 each, 8 unique frames)")
    # SPAWN_SEQ = [$A1,$A3,$A5,$A7,$A9,$AB,$AD,$AF] unique frames (triangle wave)
    spawn_unique = [0xA0, 0xA2, 0xA4, 0xA6, 0xA8, 0xAA, 0xAC, 0xAE]
    x = PAD
    for T in spawn_unique:
        # 8×16: top tile = T, bottom tile = T+1; palette SP3 (ROM DrawShootSprite $E0BF: $04=3)
        c.draw_tile(tiles[T],   NES_PAL[7], x, cy,      transparent=True)
        c.draw_tile(tiles[T+1], NES_PAL[7], x, cy + T8, transparent=True)
        x += T8 + 4
    cy += 16 * SCALE + PAD

    # ── Group 3: Eagle ───────────────────────────────────────────────────
    next_group(3, "Eagle intact (SP2, BG bank $D0-$DF 4×2 8×16) + damaged ($E0-$EF)")
    # Intact: [0xD1,0xD5,0xD9,0xDD, 0xD3,0xD7,0xDB,0xDF]  (T & 0xFE means $D0,$D4,$D8,$DC / $D2,$D6,$DA,$DE)
    # Wait — game.js uses T & 0xFE where T comes from oamTiles array with values like 0xD1.
    # So T & 0xFE = $D0. Then bottom = T & 0xFE + 1 = $D1.
    # So: intact top row: $D0,$D4,$D8,$DC  intact bottom row: $D2,$D6,$DA,$DE (each 8×16)
    # That means:
    #   col0: top=$D0,bot=$D1  col1: top=$D4,bot=$D5  col2: top=$D8,bot=$D9  col3: top=$DC,bot=$DD
    #   row2 col0: top=$D2,bot=$D3  col1: top=$D6,bot=$D7  col2: top=$DA,bot=$DB  col3: top=$DE,bot=$DF
    # Similarly damaged: col0 row0: $E0/$E1, col1 row0: $E4/$E5, etc.
    # But wait, game.js says:
    #   intactTiles  = [0xD1,0xD5,0xD9,0xDD, 0xD3,0xD7,0xDB,0xDF]
    # And:
    #   const T = oamTiles[row * 4 + col];
    #   drawCHRTile(T & 0xFE,       ..., ys[row])
    #   drawCHRTile((T & 0xFE) + 1, ..., ys[row] + 8)
    # So for row=0,col=0: T=0xD1, T&0xFE=0xD0, top=$D0, bot=$D1
    # xs = [ex-16, ex-8, ex, ex+8],  ys = [ey-16, ey]
    # Full 32×16 eagle = 4 cols × 2 rows of 8×16:
    #   row0: col0=($D0/$D1), col1=($D4/$D5), col2=($D8/$D9), col3=($DC/$DD)
    #   row1: col0=($D2/$D3), col1=($D6/$D7), col2=($DA/$DB), col3=($DE/$DF)
    x_eagle = PAD
    # Intact eagle
    # Row-major order per REVERSE.md: [D1,D3,D5,D7, D9,DB,DD,DF] = row0 then row1
    # Palette SP3 (ROM EagleStateUpdate $E386: $04=3 before all eagle draw handlers)
    intact_oam  = [0xD1,0xD3,0xD5,0xD7, 0xD9,0xDB,0xDD,0xDF]
    damaged_oam = [0xE1,0xE3,0xE5,0xE7, 0xE9,0xEB,0xED,0xEF]
    for label, oam_list, xoff in [('intact', intact_oam, 0), ('damaged', damaged_oam, 4*T8+8)]:
        ex = x_eagle + xoff
        for row in range(2):
            for col in range(4):
                T = oam_list[row * 4 + col]
                top_tile = T & 0xFE
                bot_tile = (T & 0xFE) + 1
                px = ex + col * T8
                py = cy + row * 8 * SCALE
                c.draw_tile(tiles[top_tile], NES_PAL[7], px, py,      transparent=True)
                c.draw_tile(tiles[bot_tile], NES_PAL[7], px, py + T8, transparent=True)
    cy += 16 * SCALE + PAD

    # ── Group 4: Bullet explosion ────────────────────────────────────────
    next_group(4, "Bullet explosion (SP0, BG bank $B0-$B7, 4 dirs 8×8 each)")
    # ROM $E1AF: T = ($B1 + dir*2) & $FE → $B0,$B2,$B4,$B6 for dirs 0-3
    x = PAD
    # Palette SP2 (ROM BulletExplode $E1AF: $04=2)
    for d in range(4):
        T = (0xB1 + d * 2) & 0xFE
        c.draw_tile(tiles[T], NES_PAL[6], x, cy, transparent=True)
        x += T8 + 4
    cy += T8 + PAD

    # ── Group 5: Power-up sprites ────────────────────────────────────────
    next_group(5, "Power-up sprites (SP2, sprite bank $80-$97, 6 types 16×16)")
    # ROM $E30D PowerUpDraw: $04=2 → SP2; tile=$81+type*4 (odd→PT0/sprite bank)
    # DrawTank renders: TL=base, TR=base+2, BL=base+1, BR=base+3 (tile order [T,T+2,T+1,T+3])
    PU_NAMES = ['Helmet','Timer','Shovel','Star','Grenade','1-Up']
    x = PAD
    for ptype in range(6):
        base = 0x80 + ptype * 4
        T = 256 + base   # sprite bank (PT0: even tile, bit0=0)
        # Correct draw order per ROM: TL=T, TR=T+2, BL=T+1, BR=T+3
        c.draw_tile16(tiles, T, T+2, T+1, T+3, NES_PAL[6], x, cy, transparent=True)
        x += T16 + 4
    cy += T16 + PAD

    # ── Group 6: HUD tiles ───────────────────────────────────────────────
    next_group(6, "HUD tiles (BG bank): $6A=enemy icon (BG3); $78/$7A/$7C/$7E=tank (BG3)")
    hud_tiles = [0x6A, 0x78, 0x7A, 0x7C, 0x7E]
    x = PAD
    for T in hud_tiles:
        c.draw_tile(tiles[T], NES_PAL[3], x, cy, transparent=False)
        x += T8 + 4
    cy += T8 + PAD

    # ── Save ─────────────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    c.save(OUT_PATH)

    # ── palette RGB values ────────────────────────────────────────────────
    print("\n=== ROM-derived NES_PAL RGB values for game.js ===")
    for si, slot in enumerate(NES_PAL):
        hexes = [f"'#{r:02X}{g:02X}{b:02X}'" for r,g,b in slot]
        print(f"  [{', '.join(hexes)}],  // {PAL_NAMES[si]}")

    print("\nDone. Open output_gfx/sprite_test.png to verify.")


if __name__ == '__main__':
    main()
