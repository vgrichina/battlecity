#!/usr/bin/env python3
"""Check gameplay BG tiles: are they in PT0 or PT1?"""
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

def nonzero_pct(pixels):
    total = sum(1 for row in pixels for c in row if c > 0)
    return total / 64 * 100

with open(ROM_PATH, 'rb') as f:
    rom = f.read()

prg_banks = rom[4]
chr_off = 16 + prg_banks * 16384
chr_data = rom[chr_off:]

# PPUCTRL $B0 → BG from $1000 (PT1), sprites from PT0/$1000 (8×16 mode)
# PT0 = PPU $0000-$0FFF = file offset 0x0000 in CHR
# PT1 = PPU $1000-$1FFF = file offset 0x1000 in CHR

# Known BG tiles from game.js TILE_CHR:
# Steel: 0x10, 0x20  Water: 0x12  Trees: 0x22  Ice: 0x21  Brick: 0x0F
# HUD: tile $13 (life icon), $58 (P1 label), $5A (P2 label), $6A (kill icon)

known_tiles = {
    0x0F: 'Brick quad',
    0x10: 'Steel partial',
    0x12: 'Water',
    0x20: 'Steel full',
    0x21: 'Ice',
    0x22: 'Trees',
    0x13: 'Life icon',
    0x58: 'P1 label (I)',
    0x5A: 'P2 label (II)',
    0x6A: 'Kill icon tank',
    0x11: 'Blank/space (kill-counter erase)',
}

print("Tile analysis: non-zero pixel % in PT0 vs PT1")
print("=" * 60)
for tile_idx, name in sorted(known_tiles.items()):
    pt0_pix = decode_tile(chr_data, tile_idx * 16)
    pt1_pix = decode_tile(chr_data, 0x1000 + tile_idx * 16)
    pt0_pct = nonzero_pct(pt0_pix)
    pt1_pct = nonzero_pct(pt1_pix)
    same = pt0_pix == pt1_pix
    print(f"  ${tile_idx:02X} {name:25s}: PT0={pt0_pct:5.1f}%  PT1={pt1_pct:5.1f}%  same={same}")

print()
print("Showing key tiles in PT1 (BG bank per PPUCTRL $B0):")
for tile_idx, name in [(0x0F, 'Brick'), (0x10, 'Steel'), (0x12, 'Water'), (0x6A, 'Kill icon'), (0x13, 'Life icon'), (0x58, 'P1 label')]:
    pt1_pix = decode_tile(chr_data, 0x1000 + tile_idx * 16)
    show_tile(pt1_pix, f"PT1 ${tile_idx:02X} {name}")
    print()
