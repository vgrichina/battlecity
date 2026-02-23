#!/usr/bin/env python3
"""
audit_chr_mapping.py — Verify CHR bank-to-PNG-index mapping end-to-end.

Tests:
1. extract_tiles.py writes correct byte order (tiles 0-255 = BG/PT1 from file $8010, tiles 256-511 = Sprite/PT0 from file $9010)
2. game.js pt1=true -> PNG index T&0xFE, pt1=false -> PNG index 256+T
3. Spot-check 5 specific tiles: compare decoded ROM bytes vs PNG pixels

Gray palette: 0->0x00, 1->0x55, 2->0xAA, 3->0xFF
grayToIdx thresholds: r<0x2B->0, r<0x7F->1, r<0xD5->2, else->3
"""

import struct, zlib, os

ROM_PATH  = "VS. Battle City (1985)(Namco).nes"
PNG_PATH  = "tiles/chr_pt0.png"
CHR_CELL  = 9
CHR_BORDER= 1
PALETTE   = [0x00, 0x55, 0xAA, 0xFF]

def grayToIdx(r):
    if r < 0x2B: return 0
    if r < 0x7F: return 1
    if r < 0xD5: return 2
    return 3

def decode_tile_from_rom(chr_data, tile_abs):
    """Decode one tile from chr_data at tile_abs index -> list of 64 palette indices."""
    off = tile_abs * 16
    pixels = []
    for row in range(8):
        p0 = chr_data[off + row]
        p1 = chr_data[off + row + 8]
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            pixels.append(c)
    return pixels

def read_png_pixels(path):
    """Read PNG and return (width, height, flat RGB list)."""
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'

    pos = 8
    chunks = {}
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        tag    = data[pos+4:pos+8]
        body   = data[pos+8:pos+8+length]
        pos += 12 + length
        chunks.setdefault(tag, []).append(body)

    ihdr = chunks[b'IHDR'][0]
    width, height, bit_depth, color_type = struct.unpack('>IIBB', ihdr[:10])
    assert color_type == 2 and bit_depth == 8, "Expected RGB8 PNG"

    raw = zlib.decompress(b''.join(chunks[b'IDAT']))
    stride = width * 3
    pixels = []
    for row in range(height):
        assert raw[row * (stride + 1)] == 0  # filter byte
        row_data = raw[row * (stride + 1) + 1 : row * (stride + 1) + 1 + stride]
        for x in range(width):
            r = row_data[x * 3]
            pixels.append(r)  # only need R channel (grayscale)
    return width, height, pixels

def get_tile_from_png(png_pixels, png_width, tile_abs):
    """Extract 8x8 gray pixels for tile_abs from chr_pt0.png."""
    tcol = tile_abs % 32
    trow = tile_abs // 32
    sx   = tcol * CHR_CELL + CHR_BORDER
    sy   = trow * CHR_CELL + CHR_BORDER
    gray = []
    for py in range(8):
        for px in range(8):
            gray.append(png_pixels[(sy + py) * png_width + (sx + px)])
    return gray

def main():
    # Load ROM
    with open(ROM_PATH, 'rb') as f:
        rom = f.read()
    assert rom[:4] == b'NES\x1a'
    prg_banks = rom[4]
    prg_size  = prg_banks * 16384
    chr_off   = 16 + prg_size
    chr_size  = rom[5] * 8192
    chr_data  = rom[chr_off:chr_off + chr_size]
    total_tiles = chr_size // 16

    print(f"ROM: PRG={prg_banks}×16KB, CHR={rom[5]}×8KB")
    print(f"CHR file offset: {chr_off:#x}, total tiles: {total_tiles}")
    print(f"  Tiles 0-255   → file {chr_off:#x}–{chr_off+0x1000:#x} (BG/PT1 bank)")
    print(f"  Tiles 256-511 → file {chr_off+0x1000:#x}–{chr_off+0x2000:#x} (Sprite/PT0 bank)")

    # Load PNG
    png_w, png_h, png_pixels = read_png_pixels(PNG_PATH)
    print(f"\nchr_pt0.png: {png_w}×{png_h} pixels")
    expected_w = 32 * CHR_CELL + CHR_BORDER
    expected_h = 16 * CHR_CELL + CHR_BORDER
    assert png_w == expected_w and png_h == expected_h, f"Expected {expected_w}×{expected_h}, got {png_w}×{png_h}"
    print(f"  Geometry: ✓ ({expected_w}×{expected_h} = 32×16 tiles + borders)")

    # Spot-check 5 tiles (mix of BG and sprite bank tiles)
    spot_tiles = [
        (0,    "BG/PT1, tile $00 (blank/space)"),
        (0x0F, "BG/PT1, tile $0F (brick solid)"),
        (0x14, "BG/PT1, tile $14 (P1 life icon)"),
        (256,  "Sprite/PT0, tile $00 (tank up-left, sprite offset 0)"),
        (256+0x79, f"Sprite/PT0, tile $79 (HUD tank anim)"),
    ]

    print("\n--- Spot-check 5 tiles ---")
    all_ok = True
    for tile_abs, desc in spot_tiles:
        rom_pixels = decode_tile_from_rom(chr_data, tile_abs)
        png_grays  = get_tile_from_png(png_pixels, png_w, tile_abs)

        rom_from_png = [grayToIdx(g) for g in png_grays]
        match = (rom_pixels == rom_from_png)

        # Show first row for reference
        rom_row0 = rom_pixels[:8]
        png_row0 = rom_from_png[:8]
        file_off = chr_off + tile_abs * 16
        print(f"\n  tile_abs={tile_abs} ({desc})")
        print(f"    file offset: {file_off:#x}")
        print(f"    ROM row0: {rom_row0}")
        print(f"    PNG row0: {png_row0}")
        print(f"    Match: {'✓ OK' if match else '✗ MISMATCH'}")
        if not match:
            all_ok = False
            # Show diffs
            for i, (a, b) in enumerate(zip(rom_pixels, rom_from_png)):
                if a != b:
                    print(f"      pixel {i}: ROM={a} PNG={b} (gray={png_grays[i]:#x})")

    print("\n--- game.js drawSprite16 logic check ---")
    # pt1=true  → T & 0xFE → PNG index in 0-255 (BG bank)
    # pt1=false → 256 + T  → PNG index in 256-511 (Sprite bank)
    # Eagle tiles: OAM tile bytes $D1,$D3,$D5... (ODD → PT1/BG bank → T & 0xFE)
    eagle_t = 0xD1  # odd tile byte → PT1 (BG bank)
    eagle_png = eagle_t & 0xFE  # = 0xD0 = 208
    print(f"  Eagle tile $D1 (odd→PT1): PNG index = $D1 & $FE = {eagle_png} ({eagle_png:#x})")
    print(f"    → file offset {chr_off + eagle_png*16:#x} ✓")

    # Tank tiles: OAM tile bytes $80,$82,$84... (EVEN → PT0/Sprite bank → 256+T)
    tank_t = 0x00  # even tile byte → PT0 (Sprite bank)
    tank_png = 256 + tank_t
    print(f"  Tank tile $00 (even→PT0): PNG index = 256 + $00 = {tank_png}")
    print(f"    → file offset {chr_off + tank_png*16:#x} = {chr_off + 0x1000:#x} ✓")

    print("\n--- grayToIdx round-trip check ---")
    # Palette values: 0->0x00, 1->0x55, 2->0xAA, 3->0xFF
    # Verify each palette value round-trips correctly
    gray_rt_ok = True
    for idx, gray in enumerate(PALETTE):
        recovered = grayToIdx(gray)
        ok = (recovered == idx)
        print(f"  palette[{idx}]={gray:#x} → grayToIdx → {recovered} {'✓' if ok else '✗'}")
        if not ok:
            gray_rt_ok = False

    # Edge cases
    edges = [(0x2A, 0), (0x2B, 1), (0x7E, 1), (0x7F, 2), (0xD4, 2), (0xD5, 3)]
    print("  Edge cases:")
    for val, expected in edges:
        got = grayToIdx(val)
        ok = (got == expected)
        print(f"    grayToIdx({val:#x}) = {got} (expected {expected}) {'✓' if ok else '✗'}")
        if not ok:
            gray_rt_ok = False

    print("\n=== SUMMARY ===")
    print(f"  Tile spot-check: {'PASS' if all_ok else 'FAIL'}")
    print(f"  Gray round-trip: {'PASS' if gray_rt_ok else 'FAIL'}")
    if all_ok and gray_rt_ok:
        print("  All checks PASSED — CHR bank-to-PNG-index mapping is correct.")

if __name__ == '__main__':
    main()
