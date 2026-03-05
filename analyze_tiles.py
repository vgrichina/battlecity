#!/usr/bin/env python3
"""
analyze_tiles.py — Dump specific CHR ROM tiles as ASCII art and hex.
Examines BG (PT1) tiles by index to identify content.

Usage:
  python analyze_tiles.py [tile_start] [tile_end]
  python analyze_tiles.py 0x5E 0x6C    # tiles $5E through $6B
"""
import sys

ROM_PATH    = "battlecity_famicom.nes"
CHR_PT0_OFF = 0x4010   # sprites (PT0)
CHR_PT1_OFF = 0x5010   # BG      (PT1)

SHADE = ' .:X'   # palette index 0-3 as ASCII

def decode_tile(data, tile_idx):
    """Decode one 16-byte 2bpp NES tile -> list of 64 palette indices (row-major)."""
    off = tile_idx * 16
    pixels = []
    for row in range(8):
        p0 = data[off + row]
        p1 = data[off + row + 8]
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            pixels.append(c)
    return pixels

def tile_ascii(pixels):
    return [''.join(SHADE[pixels[r*8+c]] for c in range(8)) for r in range(8)]

def main():
    # Parse args
    args = sys.argv[1:]
    if len(args) >= 2:
        t_start = int(args[0], 0)
        t_end   = int(args[1], 0)
    elif len(args) == 1:
        t_start = int(args[0], 0)
        t_end   = t_start + 1
    else:
        # Default: examine the tiles mentioned in REVERSE.md task
        t_start = 0x5E
        t_end   = 0x6C   # inclusive end = $6B

    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    pt1 = rom[CHR_PT1_OFF : CHR_PT1_OFF + 0x1000]   # BG tiles 0–255
    pt0 = rom[CHR_PT0_OFF : CHR_PT0_OFF + 0x1000]   # sprite tiles 0–255

    print(f"Examining BG (PT1) tiles ${t_start:02X}–${t_end-1:02X}")
    print("=" * 60)

    tiles = []
    for idx in range(t_start, t_end):
        pix = decode_tile(pt1, idx)
        tiles.append((idx, pix))

    # Print 4 tiles per row as side-by-side ASCII blocks
    COLS = 4
    for row_start in range(0, len(tiles), COLS):
        row_tiles = tiles[row_start:row_start + COLS]
        # Header line: tile indices
        headers = [f"  Tile ${t[0]:02X}   " for t in row_tiles]
        print('  '.join(headers))
        # 8 pixel rows
        for py in range(8):
            parts = []
            for idx, pix in row_tiles:
                parts.append(''.join(SHADE[pix[py*8+c]] for c in range(8)))
            print('  '.join(parts))
        # Hex dump line
        for idx, pix in row_tiles:
            off = idx * 16
            p0 = pt1[off:off+8].hex()
            p1 = pt1[off+8:off+16].hex()
            print(f"  ${idx:02X} p0={p0} p1={p1}")
        print()

    # Also dump a range of sprite tiles for comparison
    print()
    print(f"Examining Sprite (PT0) tiles ${t_start:02X}–${t_end-1:02X}")
    print("=" * 60)
    sprite_tiles = []
    for idx in range(t_start, t_end):
        pix = decode_tile(pt0, idx)
        sprite_tiles.append((idx, pix))

    for row_start in range(0, len(sprite_tiles), COLS):
        row_tiles = sprite_tiles[row_start:row_start + COLS]
        headers = [f"  SPR ${t[0]:02X}  " for t in row_tiles]
        print('  '.join(headers))
        for py in range(8):
            parts = []
            for idx, pix in row_tiles:
                parts.append(''.join(SHADE[pix[py*8+c]] for c in range(8)))
            print('  '.join(parts))
        print()

    # Extra: dump tiles $00-$0F for reference (common chars / blanks)
    print()
    print("Reference: BG tiles $00–$0F")
    print("=" * 60)
    ref_tiles = [(i, decode_tile(pt1, i)) for i in range(0x10)]
    for row_start in range(0, len(ref_tiles), COLS):
        row_tiles = ref_tiles[row_start:row_start + COLS]
        headers = [f"  Tile ${t[0]:02X}   " for t in row_tiles]
        print('  '.join(headers))
        for py in range(8):
            parts = []
            for idx, pix in row_tiles:
                parts.append(''.join(SHADE[pix[py*8+c]] for c in range(8)))
            print('  '.join(parts))
        print()

    # Dump all 256 BG tiles that are NON-BLANK (non-zero) with tile number
    print()
    print("Non-blank BG (PT1) tiles summary:")
    non_blank = []
    for idx in range(256):
        off = idx * 16
        raw = pt1[off:off+16]
        if any(b != 0 for b in raw):
            non_blank.append(idx)
    print(f"  {len(non_blank)} non-blank tiles: " + ' '.join(f'${i:02X}' for i in non_blank))

if __name__ == '__main__':
    main()
