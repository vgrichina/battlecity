#!/usr/bin/env python3
"""dump_tiles.py — ASCII art viewer for Battle City CHR tiles.

Decodes NES 2bpp tiles from the ROM and renders them as ASCII art so tile
pixel patterns can be inspected without any GUI tools.

Usage:
    python dump_tiles.py --tile 0x0F 0x10 0x12    # BG bank tiles (default)
    python dump_tiles.py --tile 0x0F --bank spr   # sprite bank tiles
    python dump_tiles.py --all-terrain            # all terrain tile types
    python dump_tiles.py --range 0 31             # tiles 0–31 from BG bank

Output per tile:
    - Tile index and bank
    - Raw hex bytes (16 bytes: plane0 rows 0–7, plane1 rows 0–7)
    - 8×8 ASCII art using ' ░▒█' for color indices 0–3 (2× width for readability)
"""

import sys
import argparse

ROM_PATH = "VS. Battle City (1985)(Namco).nes"

# ASCII shading: color index 0 = background (space), 1–3 = increasing fill
SHADES = [' ', '░', '▒', '█']
# Fallback for terminals without unicode block chars
SHADES_ASCII = ['.', '+', '#', '@']


def load_chr_banks(rom_path):
    with open(rom_path, 'rb') as f:
        rom = f.read()
    prg_banks = rom[4]
    chr_off = 16 + prg_banks * 16384   # = 0x8010 for 32KB PRG
    chr_data = rom[chr_off : chr_off + 16384]
    print(f"ROM: {len(rom)} bytes  |  PRG banks: {prg_banks}  |  CHR offset: 0x{chr_off:04X}  |  CHR size: {len(chr_data)} bytes")
    # BG  bank: chr_data[0x0000–0x0FFF]  = PPU PT1 ($1000–$1FFF), tiles 0–255
    # SPR bank: chr_data[0x1000–0x1FFF]  = PPU PT0 ($0000–$0FFF), tiles 256–511
    bg_bank  = chr_data[0x0000:0x1000]
    spr_bank = chr_data[0x1000:0x2000]
    return bg_bank, spr_bank


def decode_tile(bank_data, tile_idx):
    """Decode one 16-byte 2bpp NES tile → 64 palette indices (0–3).

    NES 2bpp format (16 bytes per tile):
      bytes  0– 7: bitplane 0 (LSB of pixel color index), one byte per row
      bytes  8–15: bitplane 1 (MSB of pixel color index), one byte per row
      Each byte: bit 7 = leftmost pixel, bit 0 = rightmost pixel.
    """
    offset = tile_idx * 16
    pixels = []
    for row in range(8):
        p0 = bank_data[offset + row]       # plane 0 (low bit)
        p1 = bank_data[offset + row + 8]   # plane 1 (high bit)
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            pixels.append(c)
    return pixels


def dump_tile(bank_data, tile_idx, bank_name, use_unicode=True):
    offset = tile_idx * 16
    raw = bank_data[offset : offset + 16]
    pixels = decode_tile(bank_data, tile_idx)
    shades = SHADES if use_unicode else SHADES_ASCII

    print(f"Tile 0x{tile_idx:02X} ({tile_idx})  bank={bank_name}  offset=0x{offset:04X}")
    # Hex dump: plane0 then plane1
    p0_hex = ' '.join(f'{b:02X}' for b in raw[:8])
    p1_hex = ' '.join(f'{b:02X}' for b in raw[8:])
    print(f"  plane0: {p0_hex}")
    print(f"  plane1: {p1_hex}")
    # Non-zero pixel count
    nonzero = sum(1 for p in pixels if p != 0)
    print(f"  non-zero pixels: {nonzero}/64")
    # ASCII art (2× width so 8×8 tile renders as 16×8 chars)
    print("  ┌────────────────┐")
    for row in range(8):
        line = ''.join(shades[pixels[row*8 + col]] * 2 for col in range(8))
        print(f"  │{line}│")
    print("  └────────────────┘")
    print()


# Known terrain tile indices in the BG bank
TERRAIN_TILES = {
    0x00: 'empty/transparent',
    0x0F: 'brick half (solid)',
    0x10: 'steel half (filled)',
    0x11: 'steel half (open, alt)',
    0x12: 'water',
    0x20: 'steel half (open)',
    0x21: 'ice',
    0x22: 'trees',
}


def main():
    ap = argparse.ArgumentParser(description='ASCII art viewer for Battle City CHR tiles')
    ap.add_argument('--tile', nargs='+', help='Tile index(es) in hex or decimal')
    ap.add_argument('--bank', choices=['bg', 'spr'], default='bg',
                    help='CHR bank: bg (BG/PT1, default) or spr (sprite/PT0)')
    ap.add_argument('--range', nargs=2, type=lambda x: int(x, 0), metavar=('LO', 'HI'),
                    help='Dump tiles LO..HI inclusive')
    ap.add_argument('--all-terrain', action='store_true',
                    help='Dump all known terrain tiles from BG bank')
    ap.add_argument('--ascii', action='store_true',
                    help='Use ASCII fallback chars (.+#@) instead of unicode block chars')
    args = ap.parse_args()

    bg_bank, spr_bank = load_chr_banks(ROM_PATH)
    print()

    bank_data = bg_bank if args.bank == 'bg' else spr_bank
    bank_name = 'BG/PT1' if args.bank == 'bg' else 'SPR/PT0'
    use_unicode = not args.ascii

    if args.all_terrain:
        print("=== All terrain tiles (BG bank) ===\n")
        for idx, desc in sorted(TERRAIN_TILES.items()):
            print(f"--- {desc} ---")
            dump_tile(bg_bank, idx, 'BG/PT1', use_unicode)
        return

    indices = []
    if args.range:
        lo, hi = args.range
        indices = list(range(lo, hi + 1))
    if args.tile:
        for t in args.tile:
            indices.append(int(t, 0))

    if not indices:
        ap.print_help()
        print("\nExample: python dump_tiles.py --tile 0x0F 0x12 0x22")
        print("Example: python dump_tiles.py --all-terrain")
        sys.exit(0)

    for idx in indices:
        if idx < 0 or idx > 255:
            print(f"Warning: tile 0x{idx:02X} out of range for {bank_name} (0–255)")
            continue
        dump_tile(bank_data, idx, bank_name, use_unicode)


if __name__ == '__main__':
    main()
