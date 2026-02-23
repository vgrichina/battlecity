#!/usr/bin/env python3
"""render_frame.py — Pixel-perfect NES frame renderer for Battle City.

Renders one full 256×240 NES frame from:
  • Nametable shadow  $0400–$07FF (960 tile-indices + 64 attribute bytes)
  • OAM sprite buffer $0200–$02FF (64 sprites × 4 bytes: Y, tile, attr, X)

Data sources:
  --ram <file>    2048-byte CPU-RAM dump ($0000–$07FF; e.g. from FCEUX debugger)
  (default)       Synthetic test frame built from Stage N level data in the ROM

Usage:
    python render_frame.py                        # Stage 1 synthetic frame
    python render_frame.py --stage N              # Stage N synthetic frame
    python render_frame.py --ram ram_dump.bin     # From emulator RAM dump
    python render_frame.py --ram ram.bin --out f.png

NMI draw loop (ROM $D300) — summary:
    $D308  STA $2001 = $06          disable rendering during NMI
    $D30B  JSR $D352                read coin/controller inputs
    $D312  STA $2001 = $1E          enable rendering (sprites+BG, left-col clip)
    $D317  STA $2003 = $00          OAM start address
    $D31E  STA $4014 = $02          DMA: copy $0200–$02FF → PPU OAM (64 sprites)
    $D321  LDA $2002                reset PPU address latch
    $D324  JSR $D96D                flush PPU nametable queue ($0180 buffer)
    $D327  LDA $50 / ORA $B0        PPU_CTRL: nametable select + flags
    $D330  STA $2005 (twice)        scroll X=0, scroll Y=$4F
    $D338  JSR $D68A                read joystick
    $D33B  JSR $EC23                main game-logic update tick
    $D33E  JSR $DB22                hide overflow sprites (Y←$F0)
    $D341  INC $0B                  frame counter

PPU queue ($0180, pointer $0C):
    Written by PPUQueueTiles ($D6D3) throughout the game loop.
    Format: hi_ppu_addr, lo_ppu_addr, tile_bytes…, $FF  (end=$FF $FF)
    Flushed to $2006/$2007 by $D96D during NMI.
    Simultaneously, each tile is shadow-written to CPU RAM $0400–$07FF
    (using the raw 0x04–0x07 hi-byte before adding $1C to get the PPU $20–$23).

Nametable shadow layout (CPU RAM $0400–$07FF, 1024 bytes):
    $0400–$07BF  960 bytes: 32×30 tile indices (row-major, row 0 first)
    $07C0–$07FF   64 bytes: attribute table (4×4-tile blocks, 8×8 grid)
    Same logical layout as NES PPU nametable 0 ($2000–$23FF).

CHR bank mapping (file offset $8010, 16 KB total):
    chr_data[0x0000–0x0FFF]  = PPU PT1 ($1000–$1FFF): BG  tiles 0–255
    chr_data[0x1000–0x1FFF]  = PPU PT0 ($0000–$0FFF): Sprite tiles 0–255
    (Confirmed: ROM $D44A palette, git session 14 audit)
"""

import os, sys, struct, zlib, argparse

ROM_PATH = "VS. Battle City (1985)(Namco).nes"
OUT_DIR  = "output_gfx"

# ── NES master palette (NTSC) ─────────────────────────────────────────────────
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

# ROM PaletteData $D44A — 8 palette slots × 4 NES colour indices
# BG0–BG3 (indices 0–3) ; SP0–SP3 (indices 4–7)
ROM_PAL_BYTES = [
    [0x0F, 0x17, 0x06, 0x00],  # BG0 brick  (red/tan)
    [0x0F, 0x3C, 0x10, 0x12],  # BG1 water  (blue)
    [0x0F, 0x29, 0x09, 0x0B],  # BG2 trees  (green)
    [0x0F, 0x00, 0x10, 0x20],  # BG3 steel/ice (grey/white)
    [0x0F, 0x18, 0x27, 0x38],  # SP0 player 1 (yellow)
    [0x0F, 0x0A, 0x1B, 0x3B],  # SP1 player 2 (green)
    [0x0F, 0x0C, 0x10, 0x20],  # SP2 enemy grey
    [0x0F, 0x04, 0x16, 0x20],  # SP3 spawn/eagle/power-up
]
ALL_PAL = [[NES_MASTER[c & 0x3F] for c in slot] for slot in ROM_PAL_BYTES]

# Universal BG colour = palette[0][0] = NES $0F = black
BG_COLOR = NES_MASTER[0x0F & 0x3F]

# ── Screen / nametable constants ──────────────────────────────────────────────
SCR_W, SCR_H   = 256, 240     # NES visible screen in pixels
NT_COLS        = 32           # nametable tile columns
NT_ROWS        = 30           # nametable tile rows
NT_TILES       = NT_COLS * NT_ROWS   # 960
ATTR_BYTES     = 64
NT_SIZE        = NT_TILES + ATTR_BYTES   # 1024

# ── CHR tile decoding ─────────────────────────────────────────────────────────
def decode_tile(data, offset):
    """Decode 16-byte 2bpp NES tile → list of 64 palette-index pixels (0–3)."""
    px = []
    for row in range(8):
        lo = data[offset + row]
        hi = data[offset + row + 8]
        for bit in range(7, -1, -1):
            px.append(((lo >> bit) & 1) | (((hi >> bit) & 1) << 1))
    return px

def flip_h(pix):
    """Flip tile horizontally."""
    out = []
    for r in range(8):
        out += pix[r*8 : r*8+8][::-1]
    return out

def flip_v(pix):
    """Flip tile vertically."""
    out = []
    for r in range(7, -1, -1):
        out += pix[r*8 : r*8+8]
    return out

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

# ── Canvas (1× NES pixels — exact PPU output) ────────────────────────────────
class Canvas:
    def __init__(self, w=SCR_W, h=SCR_H, bg=BG_COLOR):
        self.w, self.h = w, h
        self.px = [bg] * (w * h)

    def set(self, x, y, col):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = col

    def draw_tile(self, pix, pal, ox, oy, transparent=True):
        for ty in range(8):
            for tx in range(8):
                ci = pix[ty * 8 + tx]
                if transparent and ci == 0:
                    continue
                self.set(ox + tx, oy + ty, pal[ci])

    def save(self, path):
        write_png(path, self.w, self.h, self.px)

# ── Attribute-table palette lookup ───────────────────────────────────────────
def attr_pal(attr_table, tile_col, tile_row):
    """Return BG palette index (0–3) for tile at (tile_col, tile_row).

    NES attribute byte covers 4×4 tiles (2×2 metatile area):
      bits [1:0] = top-left  2×2 tiles
      bits [3:2] = top-right 2×2 tiles
      bits [5:4] = bot-left  2×2 tiles
      bits [7:6] = bot-right 2×2 tiles
    """
    ax   = tile_col >> 2
    ay   = tile_row >> 2
    idx  = ay * 8 + ax
    if idx >= ATTR_BYTES:
        return 0
    byte = attr_table[idx]
    quad = ((tile_row >> 1) & 1) * 2 + ((tile_col >> 1) & 1)
    return (byte >> (quad * 2)) & 3

# ── Background layer ──────────────────────────────────────────────────────────
def render_bg(canvas, nt_tiles, attr_table, chr_pt1):
    """Draw 32×30 BG tiles from the nametable shadow using PT1 CHR tiles."""
    for row in range(NT_ROWS):
        for col in range(NT_COLS):
            tile_idx = nt_tiles[row * NT_COLS + col]
            pal_idx  = attr_pal(attr_table, col, row)
            pix      = chr_pt1[tile_idx]
            pal      = ALL_PAL[pal_idx]      # BG palettes 0–3
            canvas.draw_tile(pix, pal, col * 8, row * 8, transparent=False)

# ── Sprite layer ──────────────────────────────────────────────────────────────
def render_sprites(canvas, oam, chr_pt0, behind_bg):
    """Draw 64 OAM sprites.

    NES rendering order: sprite 63 drawn first (lowest priority), sprite 0 last
    (highest priority).  Sprites with priority bit (attr bit 5) appear behind BG.
    Two passes are needed:
      Pass 1 (behind_bg=True):  draw priority sprites, then draw BG on top.
      Pass 2 (behind_bg=False): draw normal sprites on top of BG.

    OAM entry format (4 bytes at $0200 + i*4):
      [0] Y position   — sprite rendered at Y+1
      [1] tile index   — index into PT0 sprite bank (0–255)
      [2] attributes   — [7]=flip_v [6]=flip_h [5]=priority [1:0]=palette(+4)
      [3] X position
    """
    for i in range(63, -1, -1):          # iterate reverse: sprite 0 ends on top
        base   = i * 4
        spy    = oam[base + 0]
        tile   = oam[base + 1]
        attr   = oam[base + 2]
        spx    = oam[base + 3]

        if spy >= 0xEF:                  # Y ≥ $EF → sprite hidden below screen
            continue

        sp_y     = (spy + 1) & 0xFF      # NES: sprite appears 1 row below Y byte
        priority = bool(attr & 0x20)     # True = behind background tiles
        if priority != behind_bg:
            continue

        pal_idx  = (attr & 0x03) + 4     # palette 4–7 = SP0–SP3
        pix      = list(chr_pt0[tile])
        if attr & 0x40:
            pix = flip_h(pix)
        if attr & 0x80:
            pix = flip_v(pix)
        canvas.draw_tile(pix, ALL_PAL[pal_idx], spx, sp_y)

# ── Render a complete frame ───────────────────────────────────────────────────
def render_frame(nt_tiles, attr_table, oam, chr_pt1, chr_pt0):
    """Render one 256×240 frame: behind-BG sprites → BG → front sprites."""
    canvas = Canvas()
    render_sprites(canvas, oam, chr_pt0, behind_bg=True)
    render_bg(canvas, nt_tiles, attr_table, chr_pt1)
    render_sprites(canvas, oam, chr_pt0, behind_bg=False)
    return canvas

# ── Synthetic frame from stage level data ────────────────────────────────────
# Tile type → 2×2 sub-tile CHR indices [TL, TR, BL, BR]  (BG bank)
# Source: ROM TileCHRTable ($DB79)
TILE_CHR = {
    0:  [0x00, 0x0F, 0x00, 0x0F],  # BRICK_TL  (right-col half)
    1:  [0x00, 0x00, 0x0F, 0x0F],  # BRICK_TR  (bot-row half)
    2:  [0x0F, 0x00, 0x0F, 0x00],  # BRICK_BL  (left-col half)
    3:  [0x0F, 0x0F, 0x00, 0x00],  # BRICK_BR  (top-row half)
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
# Tile type → BG palette index (0–3)
# Source: ROM TileAttrTable ($DB69)
TILE_PAL = {
    0:0, 1:0, 2:0, 3:0, 4:0,    # brick: BG0
    5:3, 6:3, 7:3, 8:3, 9:3,    # steel: BG3
    10:1, 11:2, 12:3,             # water:BG1  trees:BG2  ice:BG3
}

LEVEL_OFF  = 0x4010 + (0xF27D - 0xC000)   # = 0x728D, stage data in PRG bank 1
STAGE_SIZE = 91
NUM_STAGES = 35
MAP_COLS   = 13
MAP_ROWS   = 13

def decode_stage(raw):
    """Decode 91-byte stage data → 13×13 list of tile-type nibbles."""
    grid = []
    for row in range(MAP_ROWS):
        row_tiles = []
        for col in range(MAP_COLS):
            ni = row * 14 + col
            t  = (raw[ni // 2] >> 4) & 0xF if ni % 2 == 0 else raw[ni // 2] & 0xF
            row_tiles.append(t)
        grid.append(row_tiles)
    return grid

def build_nametable_from_stage(stage_num, rom):
    """Build nametable (960 bytes) + attribute table (64 bytes) for stage N.

    Battle City playfield: 13×13 metatiles × 16 px = 208×208 px.
    Each metatile → 2×2 BG tiles (8×8 px each).
    The playfield starts at the top-left of the screen (tile col=0, row=0).
    HUD occupies the right portion (tile cols 26–31) — left as black here.
    """
    off  = LEVEL_OFF + STAGE_SIZE * (stage_num - 1)
    grid = decode_stage(rom[off : off + STAGE_SIZE])

    nt   = bytearray(NT_TILES)    # 960 tile indices, default 0x00 (black)
    attr = bytearray(ATTR_BYTES)  # 64 attribute bytes

    for mr in range(MAP_ROWS):
        for mc in range(MAP_COLS):
            t    = grid[mr][mc]
            chr4 = TILE_CHR.get(t)
            if chr4 is None:
                continue          # empty tile (type 13) — leave as tile 0x00
            pi = TILE_PAL.get(t, 0)

            # Write 4 sub-tiles into nametable
            # Sub-tile order: TL=(0,0) TR=(0,1) BL=(1,0) BR=(1,1) → indices 0-3
            for si, (dr, dc) in enumerate([(0, 0), (0, 1), (1, 0), (1, 1)]):
                tr = mr * 2 + dr
                tc = mc * 2 + dc
                if tr < NT_ROWS and tc < NT_COLS:
                    nt[tr * NT_COLS + tc] = chr4[si]

            # Write palette to attribute table
            # Attribute block = (mc>>1, mr>>1); quadrant within block = metatile position
            ax   = mc >> 1
            ay   = mr >> 1
            aidx = ay * 8 + ax
            if aidx < ATTR_BYTES:
                # quad 0=TL 1=TR 2=BL 3=BR within the 4×4-tile attr block
                quad = ((mr & 1) << 1) | (mc & 1)
                shift = quad * 2
                attr[aidx] = (attr[aidx] & ~(0x03 << shift)) | (pi << shift)

    return bytes(nt), bytes(attr)

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(
        description='Render a Battle City NES frame to PNG')
    ap.add_argument('--ram',   help='2048-byte CPU RAM dump ($0000–$07FF)')
    ap.add_argument('--stage', type=int, default=1,
                    help='Stage number for synthetic frame (default: 1)')
    ap.add_argument('--out',   default=None, help='Output PNG path')
    args = ap.parse_args()

    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    # Load and split CHR data
    prg_banks = rom[4]
    chr_off   = 16 + prg_banks * 16384
    chr_data  = rom[chr_off : chr_off + 16384]

    # PT1 (BG tiles 0–255):    chr_data[0x0000–0x0FFF]  = PPU $1000–$1FFF
    # PT0 (sprite tiles 0–255): chr_data[0x1000–0x1FFF]  = PPU $0000–$0FFF
    chr_pt1 = [decode_tile(chr_data, i * 16)          for i in range(256)]
    chr_pt0 = [decode_tile(chr_data, 0x1000 + i * 16) for i in range(256)]

    if args.ram:
        with open(args.ram, 'rb') as f:
            ram = bytearray(f.read())
        if len(ram) < 0x800:
            sys.exit(f'RAM dump too small: {len(ram)} bytes (need 2048)')
        oam_data  = ram[0x200 : 0x300]    # $0200–$02FF: OAM (64 sprites × 4 B)
        nt_data   = ram[0x400 : 0x7C0]    # $0400–$07BF: nametable tile indices
        attr_data = ram[0x7C0 : 0x800]    # $07C0–$07FF: attribute table
        out_path  = args.out or os.path.join(OUT_DIR, 'frame_dump.png')
        title     = f'RAM dump frame  (ram={args.ram})'
    else:
        stage = max(1, min(NUM_STAGES, args.stage))
        nt_data, attr_data = build_nametable_from_stage(stage, rom)
        oam_data  = bytes([0xF0, 0x00, 0x00, 0x00] * 64)  # all sprites hidden
        out_path  = args.out or os.path.join(OUT_DIR, f'frame_stage{stage:02d}.png')
        title     = f'Synthetic Stage {stage}'

    canvas = render_frame(nt_data, attr_data, oam_data, chr_pt1, chr_pt0)
    os.makedirs(OUT_DIR, exist_ok=True)
    canvas.save(out_path)
    print(f'render_frame.py: {title} → {out_path}  ({SCR_W}×{SCR_H})')

if __name__ == '__main__':
    main()
