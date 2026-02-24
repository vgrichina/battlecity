#!/usr/bin/env python3
"""
analyze_chr_banks.py — Extract both CHR bank pairs and compare key tiles.

Bank pair 0+1 (bit 2 = 0): BG = $8010 (4KB), Sprites = $9010 (4KB)
Bank pair 2+3 (bit 2 = 1): BG = $A010 (4KB), Sprites = $B010 (4KB)

Outputs:
  output_gfx/chr_bank01.png  — bank pair 0+1 (BG 256 tiles + Sprite 256 tiles)
  output_gfx/chr_bank23.png  — bank pair 2+3 (BG 256 tiles + Sprite 256 tiles)
  output_gfx/chr_compare.png — side-by-side key tiles from both banks

Key tiles to compare:
  BG  $00       — tile 0 (mortar/char pattern)
  BG  $0F       — brick
  BG  $10       — steel
  BG  $D0-$DF   — eagle (16 tiles)
  SPR $00-$1F   — player tanks (32 tiles)
  SPR $80-$97   — power-ups (24 tiles)
"""

import os
import struct
import zlib
import sys

ROM_PATH = "VS. Battle City (1985)(Namco).nes"
OUT_DIR  = "output_gfx"

PALETTE = [
    (0x00, 0x00, 0x00),
    (0x55, 0x55, 0x55),
    (0xAA, 0xAA, 0xAA),
    (0xFF, 0xFF, 0xFF),
]

TILE_SZ = 8
BORDER  = 1


def write_png(path, width, height, rgb_pixels):
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)
    magic = b'\x89PNG\r\n\x1a\n'
    ihdr  = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            r, g, b = rgb_pixels[y * width + x]
            raw += bytes([r, g, b])
    idat = chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    iend = chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(magic + ihdr + idat + iend)
    print(f"  wrote {path}  ({width}x{height})")


def decode_tile(data, offset):
    pixels = []
    for row in range(8):
        p0 = data[offset + row]
        p1 = data[offset + row + 8]
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            pixels.append(c)
    return pixels


def make_tile_sheet(tiles, cols, bg=(0x20, 0x20, 0x20)):
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


def tile_is_blank(tile_pixels):
    return all(c == 0 for c in tile_pixels)


def tiles_identical(t1, t2):
    return t1 == t2


def main():
    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    assert rom[:4] == b'NES\x1a', "Not a valid iNES ROM"
    prg_banks = rom[4]
    chr_off   = 16 + prg_banks * 16384
    chr_data  = rom[chr_off:]

    # Bank pair 0+1: BG at chr_off+0x0000, Sprites at chr_off+0x1000
    # Bank pair 2+3: BG at chr_off+0x2000, Sprites at chr_off+0x3000
    bg01   = [decode_tile(chr_data, i * 16)          for i in range(256)]  # BG bank 0
    spr01  = [decode_tile(chr_data, 0x1000 + i * 16) for i in range(256)]  # Sprite bank 1
    bg23   = [decode_tile(chr_data, 0x2000 + i * 16) for i in range(256)]  # BG bank 2
    spr23  = [decode_tile(chr_data, 0x3000 + i * 16) for i in range(256)]  # Sprite bank 3

    os.makedirs(OUT_DIR, exist_ok=True)

    # Output full sheets for each bank pair (BG + Sprites, 16 cols each half)
    print("Bank pair 0+1 (stages 3,9,10,12,13):")
    w, h, img = make_tile_sheet(bg01 + spr01, 16)
    write_png(os.path.join(OUT_DIR, "chr_bank01.png"), w, h, img)

    print("Bank pair 2+3 (stages 0,1,2,4,5,6,7,8,11 — standard gameplay):")
    w, h, img = make_tile_sheet(bg23 + spr23, 16)
    write_png(os.path.join(OUT_DIR, "chr_bank23.png"), w, h, img)

    # Compare key tiles
    print("\n=== KEY TILE COMPARISON ===\n")

    def compare_tile(label, bank01_tile, bank23_tile, idx):
        same = tiles_identical(bank01_tile, bank23_tile)
        b01_blank = tile_is_blank(bank01_tile)
        b23_blank = tile_is_blank(bank23_tile)
        status = "SAME" if same else "DIFFERENT"
        extra = ""
        if b01_blank:
            extra += " [bank01=BLANK]"
        if b23_blank:
            extra += " [bank23=BLANK]"
        print(f"  {label} ${idx:02X}: {status}{extra}")
        return same

    print("--- BG tiles ---")
    compare_tile("BG ", bg01[0x00], bg23[0x00], 0x00)
    compare_tile("BG ", bg01[0x0F], bg23[0x0F], 0x0F)
    compare_tile("BG ", bg01[0x10], bg23[0x10], 0x10)

    # Eagle tiles $D0-$DF
    eagle_same = 0
    for i in range(0xD0, 0xE0):
        if tiles_identical(bg01[i], bg23[i]):
            eagle_same += 1
    print(f"  BG  $D0-$DF (eagle): {eagle_same}/16 identical")

    # Full BG comparison
    bg_same = sum(1 for i in range(256) if tiles_identical(bg01[i], bg23[i]))
    bg01_blank = sum(1 for i in range(256) if tile_is_blank(bg01[i]))
    bg23_blank = sum(1 for i in range(256) if tile_is_blank(bg23[i]))
    print(f"  BG  total: {bg_same}/256 identical, bank01 has {bg01_blank} blank, bank23 has {bg23_blank} blank")

    print("\n--- Sprite tiles ---")
    # Player tanks $00-$1F
    tank_same = 0
    for i in range(0x00, 0x20):
        if tiles_identical(spr01[i], spr23[i]):
            tank_same += 1
    print(f"  SPR $00-$1F (player tanks): {tank_same}/32 identical")

    # Power-ups $80-$97
    pup_same = 0
    for i in range(0x80, 0x98):
        if tiles_identical(spr01[i], spr23[i]):
            pup_same += 1
    print(f"  SPR $80-$97 (power-ups): {pup_same}/24 identical")

    # Full sprite comparison
    spr_same = sum(1 for i in range(256) if tiles_identical(spr01[i], spr23[i]))
    spr01_blank = sum(1 for i in range(256) if tile_is_blank(spr01[i]))
    spr23_blank = sum(1 for i in range(256) if tile_is_blank(spr23[i]))
    print(f"  SPR total: {spr_same}/256 identical, bank01 has {spr01_blank} blank, bank23 has {spr23_blank} blank")

    # Print specific hex for tile $00 in both banks
    print("\n--- Tile $00 hex (BG) ---")
    for label, off in [("Bank 0", 0), ("Bank 2", 0x2000)]:
        p0 = chr_data[off:off+8].hex()
        p1 = chr_data[off+8:off+16].hex()
        print(f"  {label}: p0={p0}  p1={p1}")

    # Print key terrain tiles hex
    print("\n--- Tile $0F hex (brick, BG) ---")
    for label, base in [("Bank 0", 0), ("Bank 2", 0x2000)]:
        off = base + 0x0F * 16
        p0 = chr_data[off:off+8].hex()
        p1 = chr_data[off+8:off+16].hex()
        print(f"  {label}: p0={p0}  p1={p1}")

    print("\n--- Tile $10 hex (steel, BG) ---")
    for label, base in [("Bank 0", 0), ("Bank 2", 0x2000)]:
        off = base + 0x10 * 16
        p0 = chr_data[off:off+8].hex()
        p1 = chr_data[off+8:off+16].hex()
        print(f"  {label}: p0={p0}  p1={p1}")

    # Build side-by-side comparison image for key tiles
    key_bg_indices  = [0x00, 0x0F, 0x10] + list(range(0xD0, 0xE0))
    key_spr_indices = list(range(0x00, 0x20)) + list(range(0x80, 0x98))

    left_tiles  = [bg01[i] for i in key_bg_indices] + [spr01[i] for i in key_spr_indices]
    right_tiles = [bg23[i] for i in key_bg_indices] + [spr23[i] for i in key_spr_indices]

    n = len(left_tiles)
    cols = 16
    rows_needed = (n + cols - 1) // cols
    cell = TILE_SZ + BORDER

    gap = 4
    panel_w = cols * cell + BORDER
    total_w = panel_w * 2 + gap
    total_h = rows_needed * cell + BORDER

    bg_color = (0x20, 0x20, 0x20)
    gap_color = (0x80, 0x00, 0x00)

    img = [bg_color] * (total_w * total_h)

    for y in range(total_h):
        for x in range(panel_w, panel_w + gap):
            img[y * total_w + x] = gap_color

    for ti, tile_pixels in enumerate(left_tiles):
        tx = ti % cols
        ty = ti // cols
        ox = tx * cell + BORDER
        oy = ty * cell + BORDER
        for py in range(8):
            for px in range(8):
                cidx = tile_pixels[py * 8 + px]
                img[(oy + py) * total_w + (ox + px)] = PALETTE[cidx]

    x_offset = panel_w + gap
    for ti, tile_pixels in enumerate(right_tiles):
        tx = ti % cols
        ty = ti // cols
        ox = x_offset + tx * cell + BORDER
        oy = ty * cell + BORDER
        for py in range(8):
            for px in range(8):
                cidx = tile_pixels[py * 8 + px]
                img[(oy + py) * total_w + (ox + px)] = PALETTE[cidx]

    print(f"\nKey tile comparison image (left=bank01, right=bank23):")
    print(f"  Row 0: BG $00, $0F, $10 then $D0-$DF (eagle)")
    print(f"  Next rows: SPR $00-$1F (tanks), $80-$97 (power-ups)")
    write_png(os.path.join(OUT_DIR, "chr_compare.png"), total_w, total_h, img)

    print("\nDone.")


if __name__ == '__main__':
    main()
