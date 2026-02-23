#!/usr/bin/env python3
"""Show what PT0 gameplay tiles look like (the ones game.js actually uses)."""
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
    print()

with open(ROM_PATH, 'rb') as f:
    rom = f.read()

prg_banks = rom[4]
chr_off = 16 + prg_banks * 16384
chr_data = rom[chr_off:]

print("PT0 tiles (as used by game.js tileAbs 0-255):")
for tile_idx, name in [(0x0F, 'Brick quad'), (0x10, 'Steel'), (0x12, 'Water'), (0x13, 'Life icon?'), (0x14, 'Life icon? (game.js uses this)'), (0x20, 'Steel full'), (0x21, 'Ice'), (0x22, 'Trees'), (0x6A, 'Kill icon')]:
    show_tile(decode_tile(chr_data, tile_idx * 16), f"PT0 ${tile_idx:02X} {name}")
