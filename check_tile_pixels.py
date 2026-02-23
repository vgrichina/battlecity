#!/usr/bin/env python3
"""Check what tiles $13 and $14 look like in PT0 and PT1."""
ROM_PATH = "VS. Battle City (1985)(Namco).nes"

def decode_tile(data, offset):
    pixels = []
    for row in range(8):
        p0 = data[offset + row]
        p1 = data[offset + row + 8]
        row_pixels = []
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            row_pixels.append(c)
        pixels.append(row_pixels)
    return pixels

def show_tile(pixels, name):
    chars = ' .+#'
    print(f"  {name}:")
    for row in pixels:
        print('   ' + ''.join(chars[c] for c in row))

with open(ROM_PATH, 'rb') as f:
    rom = f.read()

prg_banks = rom[4]
chr_off = 16 + prg_banks * 16384
chr_data = rom[chr_off:]
print(f"CHR at file offset {chr_off:#x}")

# PT0 = first 4KB of CHR bank 0 (PPU $0000-$0FFF)
# PT1 = second 4KB of CHR bank 0 (PPU $1000-$1FFF)
PT0_OFF = 0
PT1_OFF = 0x1000

for tile_idx in [0x13, 0x14, 0x58, 0x5A]:
    print(f"\nTile ${tile_idx:02X} ({tile_idx}):")
    pt0_pix = decode_tile(chr_data, PT0_OFF + tile_idx * 16)
    pt1_pix = decode_tile(chr_data, PT1_OFF + tile_idx * 16)
    show_tile(pt0_pix, f"PT0 (PNG idx {tile_idx})")
    show_tile(pt1_pix, f"PT1 (PNG idx {tile_idx + 256})")
    same = pt0_pix == pt1_pix
    print(f"  PT0 == PT1: {same}")
