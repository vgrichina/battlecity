#!/usr/bin/env python3
"""
extract_tiles.py — Decode NES CHR-ROM tiles from Battle City ROM.

NES 2bpp tile format:
  Each tile = 16 bytes: 8 bytes plane-0 + 8 bytes plane-1
  Pixel color index (0-3) = bit from plane0 | (bit from plane1 << 1)
  Bit 7 of each byte = leftmost pixel (pixel x=0)

CHR-ROM layout (16KB total, two 8KB bank pairs):
  Bank pair 0 (mapper banks 0+1): file offset 0x8010, 8KB
    BG tiles   0-255  (file $8010-$8FFF, PPU $0000-$0FFF)
    Sprite tiles 0-255 (file $9010-$9FFF, PPU $1000-$1FFF)
  Bank pair 1 (mapper banks 2+3): file offset 0xA010, 8KB
    BG tiles   0-255  (file $A010-$AFFF, PPU $0000-$0FFF)
    Sprite tiles 0-255 (file $B010-$BFFF, PPU $1000-$1FFF)

  StageFlagsTable selects bank pair per stage via $4016 bit 2:
    Bank pair 1 (banks 2+3): stages 0,1,2,4,5,6,7,8,11
    Bank pair 0 (banks 0+1): stages 3,9,10,12,13

  Default: bank pair 1 (banks 2+3) — used for stage 1 gameplay.

Output: tiles/chr_all.png     — all 512 tiles from selected bank pair (32x16)
        tiles/chr_bg.png      — BG tiles 0-255 (32x8)
        tiles/chr_sprites.png — sprite tiles 0-255 (32x8)

Usage:
  python extract_tiles.py             # default: bank pair 1 (banks 2+3)
  python extract_tiles.py --bank 0    # bank pair 0 (banks 0+1)
  python extract_tiles.py --bank 1    # bank pair 1 (banks 2+3)
  python extract_tiles.py --all       # extract all 1024 tiles (both pairs)
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

# File offsets for each bank pair (after 16-byte iNES header + PRG)
# PRG = 2 x 16KB = 32KB, so CHR starts at 0x8010
BANK_PAIR_OFFSETS = {
    0: 0x8010,  # banks 0+1: BG at $8010, sprites at $9010
    1: 0xA010,  # banks 2+3: BG at $A010, sprites at $B010
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


def extract_bank_pair(rom, bank_pair, out_dir):
    """Extract tiles from one 8KB bank pair (256 BG + 256 sprite tiles)."""
    chr_off = BANK_PAIR_OFFSETS[bank_pair]
    chr_data = rom[chr_off:chr_off + 0x2000]  # 8KB

    bank_names = {0: "0+1", 1: "2+3"}
    print(f"\nBank pair {bank_pair} (mapper banks {bank_names[bank_pair]})")
    print(f"  File offset: {chr_off:#06x} - {chr_off + 0x2000 - 1:#06x}")

    # Decode all 512 tiles (256 BG + 256 sprite)
    all_tiles = []
    for i in range(512):
        all_tiles.append(decode_tile(chr_data, i * 16))

    bg_tiles = all_tiles[:256]
    sprite_tiles = all_tiles[256:]

    # Full sheet: all 512 tiles in 32-wide grid
    w, h, img = make_tile_sheet(all_tiles, TILES_W)
    write_png(os.path.join(out_dir, "chr_all.png"), w, h, img)

    # BG tiles (first 256 = PPU $0000-$0FFF)
    w, h, img = make_tile_sheet(bg_tiles, TILES_W)
    write_png(os.path.join(out_dir, "chr_bg.png"), w, h, img)

    # Sprite tiles (second 256 = PPU $1000-$1FFF)
    w, h, img = make_tile_sheet(sprite_tiles, TILES_W)
    write_png(os.path.join(out_dir, "chr_sprites.png"), w, h, img)

    # Dump first few tile hex values for cross-referencing
    print(f"\n  First 8 BG tiles (hex plane0 / plane1):")
    for i in range(8):
        off = i * 16
        p0 = chr_data[off:off+8].hex()
        p1 = chr_data[off+8:off+16].hex()
        print(f"    tile {i:3d}: p0={p0}  p1={p1}")


def extract_all(rom, out_dir):
    """Extract all 1024 tiles from both bank pairs."""
    chr_off = BANK_PAIR_OFFSETS[0]
    chr_data = rom[chr_off:chr_off + 0x4000]  # 16KB

    print(f"\nAll CHR-ROM: file offset {chr_off:#06x} - {chr_off + 0x4000 - 1:#06x}")

    all_tiles = []
    for i in range(1024):
        all_tiles.append(decode_tile(chr_data, i * 16))

    # Full sheet: all 1024 tiles
    w, h, img = make_tile_sheet(all_tiles, TILES_W)
    write_png(os.path.join(out_dir, "chr_all_banks.png"), w, h, img)

    # Bank pair 0
    w, h, img = make_tile_sheet(all_tiles[:512], TILES_W)
    write_png(os.path.join(out_dir, "chr_bank01.png"), w, h, img)

    # Bank pair 1
    w, h, img = make_tile_sheet(all_tiles[512:], TILES_W)
    write_png(os.path.join(out_dir, "chr_bank23.png"), w, h, img)


def main():
    parser = argparse.ArgumentParser(description="Extract NES CHR-ROM tiles from Battle City ROM")
    parser.add_argument('--bank', type=int, default=1, choices=[0, 1],
                        help='Bank pair to extract: 0=banks 0+1 ($8010), 1=banks 2+3 ($A010, default)')
    parser.add_argument('--all', action='store_true',
                        help='Extract all tiles from both bank pairs')
    args = parser.parse_args()

    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    # Parse iNES header
    assert rom[:4] == b'NES\x1a', "Not a valid iNES ROM"
    prg_banks = rom[4]   # 16KB units
    chr_banks = rom[5]   # 8KB units
    prg_size  = prg_banks * 16384
    chr_size  = chr_banks * 8192

    print(f"ROM: {len(rom):#x} bytes")
    print(f"PRG: {prg_banks} banks ({prg_size//1024}KB), CHR: {chr_banks} banks ({chr_size//1024}KB)")

    os.makedirs(OUT_DIR, exist_ok=True)

    if args.all:
        extract_all(rom, OUT_DIR)
    else:
        extract_bank_pair(rom, args.bank, OUT_DIR)

    print("\nDone. Check tiles/ directory.")


if __name__ == '__main__':
    main()
