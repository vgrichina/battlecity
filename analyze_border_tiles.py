#!/usr/bin/env python3
"""Analyze border-relevant tiles from both CHR BG banks.

ROM clears nametable with tile $FC (not $00). This script dumps tile $FC
and tile $00 from both BG banks to determine what the border looks like
on default (banks 0+1) and alt (banks 2+3) stages.

NES PPU mapping (mapper 99, inverted D2):
  D2=1: bank 0 ($8010) = PT0/sprites, bank 1 ($9010) = PT1/BG
  D2=0: bank 2 ($A010) = PT0/sprites, bank 3 ($B010) = PT1/BG
"""

import sys

ROM_PATH = "VS. Battle City (1985)(Namco).nes"
SHADES = [' ', '░', '▒', '█']

# BG0 palette from ROM $D44A: $0F,$30,$16,$10
# NES colors: $0F=black, $30=white, $16=dark_red, $10=gray
BG0_PAL = ['#000000', '#783C00', '#540400', '#545454']

def decode_tile(rom, file_offset, tile_idx):
    """Decode one 16-byte 2bpp NES tile from ROM file offset."""
    off = file_offset + tile_idx * 16
    pixels = []
    raw = rom[off:off+16]
    for row in range(8):
        p0 = raw[row]
        p1 = raw[row + 8]
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            pixels.append(c)
    return pixels, raw

def dump_tile(rom, file_offset, tile_idx, label):
    pixels, raw = decode_tile(rom, file_offset, tile_idx)
    p0_hex = ' '.join(f'{b:02X}' for b in raw[:8])
    p1_hex = ' '.join(f'{b:02X}' for b in raw[8:])
    nonzero = sum(1 for p in pixels if p != 0)

    print(f"\n  Tile ${'%02X' % tile_idx} — {label}")
    print(f"    plane0: {p0_hex}")
    print(f"    plane1: {p1_hex}")
    print(f"    non-zero pixels: {nonzero}/64")
    print(f"    BG0 colors used: {set(pixels)} → {[BG0_PAL[c] for c in sorted(set(pixels))]}")
    print("    ┌────────────────┐")
    for row in range(8):
        line = ''.join(SHADES[pixels[row*8 + col]] * 2 for col in range(8))
        print(f"    │{line}│")
    print("    └────────────────┘")
    return nonzero

def main():
    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    # BG bank offsets (PT1 = PPU $1000, second 4KB of each 8KB pair)
    bank1_bg_off = 0x9010  # Default stages (D2=1, banks 0+1)
    bank3_bg_off = 0xB010  # Alt stages (D2=0, banks 2+3)

    print("=" * 60)
    print("DEFAULT BANK (1, file $9010) — stages 0-2,4-8,11")
    print("=" * 60)

    for tile_idx in [0x00, 0xFC, 0xFD, 0xFE, 0xFF]:
        dump_tile(rom, bank1_bg_off, tile_idx, f"Bank 1 BG (default)")

    print()
    print("=" * 60)
    print("ALT BANK (3, file $B010) — stages 3,9,10,12,13")
    print("=" * 60)

    for tile_idx in [0x00, 0xFC, 0xFD, 0xFE, 0xFF]:
        dump_tile(rom, bank3_bg_off, tile_idx, f"Bank 3 BG (alt)")

    print()
    print("=" * 60)
    print("COMPARISON SUMMARY")
    print("=" * 60)

    for bank_name, offset in [("Bank 1 (default)", bank1_bg_off), ("Bank 3 (alt)", bank3_bg_off)]:
        px00, _ = decode_tile(rom, offset, 0x00)
        pxFC, _ = decode_tile(rom, offset, 0xFC)
        nz00 = sum(1 for p in px00 if p != 0)
        nzFC = sum(1 for p in pxFC if p != 0)
        print(f"\n  {bank_name}:")
        print(f"    Tile $00: {nz00} non-zero px {'(BLANK)' if nz00 == 0 else '(VISIBLE)'}")
        print(f"    Tile $FC: {nzFC} non-zero px {'(BLANK)' if nzFC == 0 else '(VISIBLE)'}")
        print(f"    Nametable clear uses $FC → border is {'INVISIBLE' if nzFC == 0 else 'VISIBLE'}")

if __name__ == '__main__':
    main()
