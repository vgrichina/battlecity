#!/usr/bin/env python3
"""
extract_tiles.py — Decode NES CHR-ROM tiles from Battle City (Famicom) ROM.

NES 2bpp tile format:
  Each tile = 16 bytes: 8 bytes plane-0 + 8 bytes plane-1
  Pixel color index (0-3) = bit from plane0 | (bit from plane1 << 1)
  Bit 7 of each byte = leftmost pixel (pixel x=0)

Famicom CHR-ROM layout (8KB, mapper 0 — no bank switching):
  File offset 0x4010 (after 16-byte header + 16KB PRG)
  PT0 ($0000–$0FFF, file 0x4010–0x500F): sprite tiles 0–255
  PT1 ($1000–$1FFF, file 0x5010–0x600F): BG tiles 0–255
  PPUCTRL=$B0: bit4=1 → BG uses PT1, sprites use PT0

Output: tiles/chr_all.png     — 512 tiles (32×16): rows 0-7=BG(PT1), rows 8-15=sprites(PT0)
        tiles/chr_bg.png      — BG tiles 0-255 from PT1
        tiles/chr_sprites.png — sprite tiles 0-255 from PT0

Usage:
  python extract_tiles.py
"""

import os
import struct
import zlib

ROM_PATH = "battlecity_famicom.nes"
OUT_DIR  = "tiles"

# Famicom CHR-ROM file offsets (header=16, PRG=16KB)
CHR_PT0_OFF = 0x4010   # sprites (PT0, $0000-$0FFF)
CHR_PT1_OFF = 0x5010   # BG      (PT1, $1000-$1FFF)

# Grayscale palette: color index -> (R, G, B)
PALETTE = [
    (0x00, 0x00, 0x00),   # 0 black
    (0x55, 0x55, 0x55),   # 1 dark gray
    (0xAA, 0xAA, 0xAA),   # 2 light gray
    (0xFF, 0xFF, 0xFF),   # 3 white
]

TILES_W = 32   # tiles per row in output image
BORDER  = 1    # pixel border between tiles


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


def extract_tiles(rom, out_dir):
    """Extract BG (PT1) and sprite (PT0) tiles from Famicom CHR-ROM."""
    pt1_data = rom[CHR_PT1_OFF:CHR_PT1_OFF + 0x1000]  # BG tiles
    pt0_data = rom[CHR_PT0_OFF:CHR_PT0_OFF + 0x1000]  # sprite tiles

    print(f"PT1 (BG):      @ {CHR_PT1_OFF:#06x}")
    print(f"PT0 (sprites): @ {CHR_PT0_OFF:#06x}")

    bg_tiles     = [decode_tile(pt1_data, i * 16) for i in range(256)]
    sprite_tiles = [decode_tile(pt0_data, i * 16) for i in range(256)]

    w, h, img = make_tile_sheet(bg_tiles + sprite_tiles, TILES_W)
    write_png(os.path.join(out_dir, "chr_all.png"), w, h, img)

    w, h, img = make_tile_sheet(bg_tiles, TILES_W)
    write_png(os.path.join(out_dir, "chr_bg.png"), w, h, img)

    w, h, img = make_tile_sheet(sprite_tiles, TILES_W)
    write_png(os.path.join(out_dir, "chr_sprites.png"), w, h, img)

    print("\nFirst 8 BG (PT1) tiles:")
    for i in range(8):
        off = i * 16
        print(f"  tile {i:3d}: p0={pt1_data[off:off+8].hex()}  p1={pt1_data[off+8:off+16].hex()}")


def main():
    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    assert rom[:4] == b'NES\x1a', "Not a valid iNES ROM"
    prg_banks = rom[4]
    chr_banks = rom[5]
    print(f"ROM: {len(rom):#x} bytes  PRG: {prg_banks*16}KB  CHR: {chr_banks*8}KB")

    os.makedirs(OUT_DIR, exist_ok=True)
    extract_tiles(rom, OUT_DIR)
    print("\nDone. Check tiles/ directory.")


if __name__ == '__main__':
    main()
