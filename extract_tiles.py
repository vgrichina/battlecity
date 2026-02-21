#!/usr/bin/env python3
"""
extract_tiles.py — Decode NES CHR-ROM tiles from Battle City ROM.

NES 2bpp tile format:
  Each tile = 16 bytes: 8 bytes plane-0 + 8 bytes plane-1
  Pixel color index (0-3) = bit from plane0 | (bit from plane1 << 1)
  Bit 7 of each byte = leftmost pixel (pixel x=0)

CHR-ROM layout (16KB total, two 8KB banks):
  Bank 0 ($0000-$1FFF PPU)  = first  8KB of CHR = file offset 0x8010
  Bank 1 ($2000-$3FFF PPU)  = second 8KB of CHR = file offset 0xA010
  PPU ctrl $88: sprites at $1000, BG at $0000
    -> sprites = second half of each bank? need to check in-game
  So: tiles 0-255  (file $8010-$8FFF) = BG pattern table 0
      tiles 256-511 (file $9010-$9FFF) = sprite pattern table 0
      tiles 512-767 (file $A010-$AFFF) = BG pattern table 1 (if banked)
      tiles 768-1023(file $B010-$BFFF) = sprite pattern table 1

Output: tiles/chr_all.png   — all 1024 tiles in 32×32 grid
        tiles/chr_pt0.png   — pattern table 0 (tiles 0-511) 32×16
        tiles/chr_pt1.png   — pattern table 1 (tiles 512-1023) 32×16
"""

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


def main():
    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    # Parse iNES header
    assert rom[:4] == b'NES\x1a', "Not a valid iNES ROM"
    prg_banks = rom[4]   # 16KB units
    chr_banks = rom[5]   # 8KB units
    prg_size  = prg_banks * 16384
    chr_off   = 16 + prg_size
    chr_size  = chr_banks * 8192
    chr_data  = rom[chr_off:chr_off + chr_size]

    print(f"ROM: {len(rom):#x} bytes")
    print(f"PRG: {prg_banks} banks ({prg_size//1024}KB), CHR: {chr_banks} banks ({chr_size//1024}KB)")
    print(f"CHR-ROM: file offset {chr_off:#x}, size {chr_size:#x}")

    total_tiles = chr_size // 16
    print(f"Total tiles: {total_tiles}")

    # Decode all tiles
    all_tiles = []
    for i in range(total_tiles):
        all_tiles.append(decode_tile(chr_data, i * 16))

    os.makedirs(OUT_DIR, exist_ok=True)

    # Full sheet: all tiles in a 32-wide grid
    print("\nGenerating tile sheets...")
    w, h, img = make_tile_sheet(all_tiles, TILES_W)
    write_png(os.path.join(OUT_DIR, "chr_all.png"), w, h, img)

    # Pattern table 0 (first 512 tiles = first 8KB of CHR)
    pt0 = all_tiles[:512]
    w, h, img = make_tile_sheet(pt0, TILES_W)
    write_png(os.path.join(OUT_DIR, "chr_pt0.png"), w, h, img)

    # Pattern table 1 (second 512 tiles = second 8KB of CHR)
    pt1 = all_tiles[512:]
    w, h, img = make_tile_sheet(pt1, TILES_W)
    write_png(os.path.join(OUT_DIR, "chr_pt1.png"), w, h, img)

    # Also dump first few tile hex values for cross-referencing
    print("\nFirst 8 tiles (hex plane0 / plane1):")
    for i in range(8):
        off = i * 16
        p0 = chr_data[off:off+8].hex()
        p1 = chr_data[off+8:off+16].hex()
        print(f"  tile {i:3d}: p0={p0}  p1={p1}")

    print("\nDone. Check tiles/ directory.")


if __name__ == '__main__':
    main()
