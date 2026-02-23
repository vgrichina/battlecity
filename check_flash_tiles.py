#!/usr/bin/env python3
"""Check CHR tiles $3A-$3D in PT1 for content."""
ROM_PATH = "VS. Battle City (1985)(Namco).nes"

with open(ROM_PATH, 'rb') as f:
    rom = f.read()

# iNES header = 0x10 bytes
# PRG-ROM = 2 * 16KB = 0x8000 bytes → starts at 0x10, ends at 0x800F
# CHR-ROM starts at 0x8010
# First CHR bank (8KB = 0x2000):
#   PT0 ($0000-$0FFF): file 0x8010-0x900F (tiles 0-255)
#   PT1 ($1000-$1FFF): file 0x9010-0x9FFF (tiles 256-511 in PNG, i.e. PNG index 256+T)

CHR_START = 0x8010
PT1_START = CHR_START + 0x1000  # = 0x9010

def decode_tile(data, offset):
    pixels = []
    for row in range(8):
        p0 = data[offset + row]
        p1 = data[offset + row + 8]
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            pixels.append(c)
    return pixels

def nonzero_count(pixels):
    return sum(1 for p in pixels if p != 0)

print("Flash animation tiles $3A-$3D in PT1 (PNG indices 314-317):")
print()
for tile_idx in range(0x3A, 0x3E):
    offset = PT1_START + tile_idx * 16
    pixels = decode_tile(rom, offset)
    nz = nonzero_count(pixels)
    raw = list(rom[offset:offset+16])
    print(f"  Tile ${tile_idx:02X} (PNG {256+tile_idx}): offset=0x{offset:04X}, non-zero pixels={nz}/64")
    # Show ASCII art
    for row in range(8):
        row_pixels = pixels[row*8:(row+1)*8]
        chars = ''.join('.12#'[p] for p in row_pixels)
        print(f"    {chars}")
    print()

# Also check the same tiles in PT0 (they might be different)
PT0_START = CHR_START
print("Same tiles $3A-$3D in PT0 (PNG indices 58-61):")
print()
for tile_idx in range(0x3A, 0x3E):
    offset = PT0_START + tile_idx * 16
    pixels = decode_tile(rom, offset)
    nz = nonzero_count(pixels)
    print(f"  Tile ${tile_idx:02X} (PNG {tile_idx}): offset=0x{offset:04X}, non-zero pixels={nz}/64")
    for row in range(8):
        row_pixels = pixels[row*8:(row+1)*8]
        chars = ''.join('.12#'[p] for p in row_pixels)
        print(f"    {chars}")
    print()
