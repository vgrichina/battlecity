#!/usr/bin/env python3
"""
extract_tiles.py — Decode NES CHR-ROM tiles from Battle City ROM.

NES 2bpp tile format:
  Each tile = 16 bytes: 8 bytes plane-0 + 8 bytes plane-1
  Pixel color index (0-3) = bit from plane0 | (bit from plane1 << 1)
  Bit 7 of each byte = leftmost pixel (pixel x=0)

CHR-ROM layout (16KB = 4 × 4KB banks):
  Mapper 99 (VS System): $4016 D2 selects 8KB CHR bank (INVERTED polarity).
  PPUCTRL = $B0: bit4=1 → BG uses PT1 ($1000), bit3=0 → sprites use PT0 ($0000).
  8×16 sprite mode (bit5=1): EVEN OAM tile → PT0, ODD OAM tile → PT1.

  D2 polarity (CONFIRMED by tile content + compare_frames.py diff):
    D2=1 → banks 0+1: PT0=bank0($8010)=sprites, PT1=bank1($9010)=BG
    D2=0 → banks 2+3: PT0=bank2($A010)=sprites, PT1=bank3($B010)=BG

  StageFlagsTable ($80B6, 14 bytes): $04,$04,$04,$00,$04,$04,$04,$04,$04,$00,$00,$04,$00,$00
    D2=1 ($04): stages 0,1,2,4,5,6,7,8,11 → banks 0+1 (BG=$9010, spr=$8010)
    D2=0 ($00): stages 3,9,10,12,13        → banks 2+3 (BG=$B010, spr=$A010)

  Proof: bank 1 tile $00 = blank (required for empty BG). Banks 2/3 tile $00 = "0" numeral.
  Switching to banks 0+1 eliminates 9216px EMPTY tile diff in compare_frames.py.

Output: tiles/chr_all.png     — 512 tiles (32x16): rows 0-7 = BG (PT1), rows 8-15 = sprites (PT0)
        tiles/chr_bg.png      — BG tiles 0-255 from PT1
        tiles/chr_sprites.png — sprite tiles 0-255 from PT0

Usage:
  python extract_tiles.py                   # default: D2=1 (banks 0+1, stage 1)
  python extract_tiles.py --stages 'D2=0'   # banks 2+3 (stages 3,9,10,12,13)
  python extract_tiles.py --all             # extract all 1024 tiles (both pairs)
"""

import argparse
import os
import struct
import zlib

ROM_PATH = "VS. Battle City (1985)(Namco).nes"
OUT_DIR  = "tiles"

# Grayscale palette: color index -> (R, G, B)
# 0=black(transparent bg), 1=dark, 2=medium, 3=white
PALETTE = [
    (0x00, 0x00, 0x00),   # 0 transparent/black
    (0x55, 0x55, 0x55),   # 1 dark gray
    (0xAA, 0xAA, 0xAA),   # 2 light gray
    (0xFF, 0xFF, 0xFF),   # 3 white
]

TILE_SZ  = 8    # pixels per tile dimension
TILES_W  = 32   # tiles per row in output image
BORDER   = 1    # pixel border between tiles

# 4KB CHR bank file offsets (after 16-byte iNES header + 32KB PRG)
CHR_BANK_OFFSETS = [0x8010, 0x9010, 0xA010, 0xB010]  # banks 0-3

# Mapper 99 bank select: $4016 D2 selects 8KB CHR bank (ACTIVE-HIGH = banks 0+1!)
# StageFlagsTable ($80B6) sets D2 bit in $4016 writes.
# Polarity CONFIRMED by tile content: D2=1 → CHR $0000-$1FFF (banks 0+1).
#   D2=1 ($04) stages 0,1,2,4-8,11: PT0=bank0($8010), PT1=bank1($9010)
#   D2=0 ($00) stages 3,9,10,12:    PT0=bank2($A010), PT1=bank3($B010)
STAGE_BANKS = {
    # stage_group: (PT1_bank_idx, PT0_bank_idx)  — PT1=BG, PT0=sprites
    'D2=1': (1, 0),  # stages 0,1,2,4-8,11 → BG=$9010, spr=$8010
    'D2=0': (3, 2),  # stages 3,9,10,12    → BG=$B010, spr=$A010
}


def write_png(path, width, height, rgb_pixels):
    """Write RGB pixel list to PNG using only stdlib."""
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    magic = b'\x89PNG\r\n\x1a\n'
    ihdr  = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))

    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter=None
        for x in range(width):
            r, g, b = rgb_pixels[y * width + x]
            raw += bytes([r, g, b])

    idat = chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    iend = chunk(b'IEND', b'')

    with open(path, 'wb') as f:
        f.write(magic + ihdr + idat + iend)
    print(f"  wrote {path}  ({width}x{height})")


def decode_tile(data, offset):
    """Decode one 16-byte 2bpp NES tile -> list of 64 palette indices."""
    pixels = []
    for row in range(8):
        p0 = data[offset + row]
        p1 = data[offset + row + 8]
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            pixels.append(c)
    return pixels


def make_tile_sheet(tiles, cols, bg=(0x20, 0x20, 0x20)):
    """
    Compose a list of decoded tiles (each 64 palette indices) into a pixel grid.
    tiles: list of 64-element lists
    cols:  number of tile columns
    bg:    background fill colour for borders
    Returns (width, height, rgb_pixel_list)
    """
    rows   = (len(tiles) + cols - 1) // cols
    cell   = TILE_SZ + BORDER
    width  = cols * cell + BORDER
    height = rows * cell + BORDER

    img = [bg] * (width * height)

    for ti, tile_pixels in enumerate(tiles):
        tx = ti % cols
        ty = ti // cols
        ox = tx * cell + BORDER
        oy = ty * cell + BORDER
        for py in range(8):
            for px in range(8):
                cidx = tile_pixels[py * 8 + px]
                img[(oy + py) * width + (ox + px)] = PALETTE[cidx]

    return width, height, img


def extract_stage_tiles(rom, stage_group, out_dir):
    """Extract tiles for a stage group using correct mapper 99 bank mapping.

    Mapper 99: D2/D3 of $4016 independently select 4KB CHR banks for PT0/PT1.
    PPUCTRL $B0: bit4=1 → BG reads PT1 ($1000), sprites read PT0 ($0000).
    Output: BG (PT1) as tiles 0-255, sprites (PT0) as tiles 256-511.
    game.js: drawCHRTile(N) for BG, drawCHRTile(256+T) for sprite bank.
    """
    pt1_bank, pt0_bank = STAGE_BANKS[stage_group]
    pt1_off = CHR_BANK_OFFSETS[pt1_bank]
    pt0_off = CHR_BANK_OFFSETS[pt0_bank]
    pt1_data = rom[pt1_off:pt1_off + 0x1000]
    pt0_data = rom[pt0_off:pt0_off + 0x1000]

    print(f"\nStage group {stage_group}")
    print(f"  PT1 (BG):      bank {pt1_bank} @ {pt1_off:#06x}")
    print(f"  PT0 (sprites): bank {pt0_bank} @ {pt0_off:#06x}")

    bg_tiles = [decode_tile(pt1_data, i * 16) for i in range(256)]
    sprite_tiles = [decode_tile(pt0_data, i * 16) for i in range(256)]
    all_tiles = bg_tiles + sprite_tiles

    # Use suffix for alternate bank pair; default pair keeps backward-compatible name
    suffix = '' if stage_group == 'D2=1' else '_alt'

    w, h, img = make_tile_sheet(all_tiles, TILES_W)
    write_png(os.path.join(out_dir, f"chr_all{suffix}.png"), w, h, img)

    w, h, img = make_tile_sheet(bg_tiles, TILES_W)
    write_png(os.path.join(out_dir, f"chr_bg{suffix}.png"), w, h, img)

    w, h, img = make_tile_sheet(sprite_tiles, TILES_W)
    write_png(os.path.join(out_dir, f"chr_sprites{suffix}.png"), w, h, img)

    print(f"\n  First 8 BG (PT1) tiles (hex plane0 / plane1):")
    for i in range(8):
        off = i * 16
        p0 = pt1_data[off:off+8].hex()
        p1 = pt1_data[off+8:off+16].hex()
        print(f"    tile {i:3d}: p0={p0}  p1={p1}")


def extract_all(rom, out_dir):
    """Extract all 1024 tiles from all 4 CHR banks."""
    all_tiles = []
    for bank_off in CHR_BANK_OFFSETS:
        data = rom[bank_off:bank_off + 0x1000]
        for i in range(256):
            all_tiles.append(decode_tile(data, i * 16))

    print(f"\nAll CHR-ROM: 4 banks × 256 tiles = 1024 tiles")
    w, h, img = make_tile_sheet(all_tiles, TILES_W)
    write_png(os.path.join(out_dir, "chr_all_banks.png"), w, h, img)


def main():
    parser = argparse.ArgumentParser(description="Extract NES CHR-ROM tiles from Battle City ROM")
    parser.add_argument('--stages', default='D2=1', choices=['D2=1', 'D2=0'],
                        help='Stage group: D2=1 (stages 0-2,4-8,11, default) or D2=0 (stages 3,9,10,12)')
    parser.add_argument('--all', action='store_true',
                        help='Extract all 1024 tiles from all 4 banks')
    args = parser.parse_args()

    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    assert rom[:4] == b'NES\x1a', "Not a valid iNES ROM"
    prg_banks = rom[4]
    chr_banks = rom[5]
    print(f"ROM: {len(rom):#x} bytes")
    print(f"PRG: {prg_banks} banks ({prg_banks*16}KB), CHR: {chr_banks} banks ({chr_banks*8}KB)")

    os.makedirs(OUT_DIR, exist_ok=True)

    if args.all:
        extract_all(rom, OUT_DIR)
    else:
        extract_stage_tiles(rom, args.stages, OUT_DIR)

    print("\nDone. Check tiles/ directory.")


if __name__ == '__main__':
    main()
