#!/usr/bin/env python3
"""
audit_chr_png.py — Verify chr_pt0.png pixel gray levels and tile grid geometry.

Checks:
1. Exact gray values used for NES color indices 0/1/2/3
2. Whether grayToIdx thresholds (0x2B/0x7F/0xD5) correctly decode them
3. Whether CHR_CELL=9, CHR_BORDER=1 correctly picks tile pixels
4. Samples known non-blank tiles to confirm decoding works
"""

import struct, zlib

PNG_PATH = "tiles/chr_pt0.png"
CHR_CELL = 9
CHR_BORDER = 1

# grayToIdx as in game.js
def grayToIdx(r):
    if r < 0x2B: return 0
    if r < 0x7F: return 1
    if r < 0xD5: return 2
    return 3

def read_png(path):
    """Read PNG, return (width, height, rgb_pixels as flat list of (r,g,b) tuples)."""
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', "Not a PNG"

    width = height = None
    idat_chunks = []
    pos = 8
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        tag = data[pos+4:pos+8]
        chunk_data = data[pos+8:pos+8+length]
        pos += 12 + length

        if tag == b'IHDR':
            width = struct.unpack('>I', chunk_data[0:4])[0]
            height = struct.unpack('>I', chunk_data[4:8])[0]
            bit_depth = chunk_data[8]
            color_type = chunk_data[9]
            assert bit_depth == 8, f"Expected 8-bit depth, got {bit_depth}"
            assert color_type == 2, f"Expected RGB (type 2), got {color_type}"
        elif tag == b'IDAT':
            idat_chunks.append(chunk_data)

    raw = zlib.decompress(b''.join(idat_chunks))

    pixels = []
    stride = 1 + width * 3  # filter byte + RGB per row
    for y in range(height):
        row_start = y * stride + 1  # skip filter byte
        for x in range(width):
            off = row_start + x * 3
            r, g, b = raw[off], raw[off+1], raw[off+2]
            pixels.append((r, g, b))

    return width, height, pixels

def get_pixel(pixels, width, x, y):
    return pixels[y * width + x]

def get_tile_pixels(pixels, width, tile_abs):
    """Get 8x8 pixels for tile tile_abs using CHR_CELL/CHR_BORDER layout."""
    tcol = tile_abs % 32
    trow = tile_abs // 32
    sx = tcol * CHR_CELL + CHR_BORDER
    sy = trow * CHR_CELL + CHR_BORDER
    result = []
    for py in range(8):
        for px in range(8):
            r, g, b = get_pixel(pixels, width, sx + px, sy + py)
            result.append(r)  # use red channel (grayscale, all channels equal)
    return result

def main():
    print(f"Reading {PNG_PATH}...")
    width, height, pixels = read_png(PNG_PATH)
    print(f"Image size: {width}x{height} px")
    print(f"Expected for 512 tiles in 32-wide grid: {32*9+1}x{16*9+1} = 289x145")
    print()

    # --- 1. Verify image dimensions ---
    exp_w = 32 * CHR_CELL + CHR_BORDER
    exp_h = 16 * CHR_CELL + CHR_BORDER
    if width == exp_w and height == exp_h:
        print(f"[PASS] Dimensions {width}x{height} match CHR_CELL={CHR_CELL}, CHR_BORDER={CHR_BORDER}")
    else:
        print(f"[FAIL] Dimensions {width}x{height} != expected {exp_w}x{exp_h}")
    print()

    # --- 2. Check border pixel color ---
    border_r, border_g, border_b = get_pixel(pixels, width, 0, 0)
    print(f"Border pixel (0,0): RGB=({border_r:#04x},{border_g:#04x},{border_b:#04x})")
    border_idx = grayToIdx(border_r)
    print(f"  -> grayToIdx({border_r:#04x}) = {border_idx} (expected 0 to be transparent)")
    if border_idx == 0:
        print("  [PASS] Border maps to idx=0 (transparent)")
    else:
        print("  [WARN] Border does NOT map to transparent idx=0!")
    print()

    # --- 3. Sample ALL unique gray values in the image ---
    unique_vals = {}
    for r, g, b in pixels:
        if r == g == b:
            unique_vals[r] = unique_vals.get(r, 0) + 1
        else:
            key = (r, g, b)
            unique_vals[key] = unique_vals.get(key, 0) + 1

    print("Unique grayscale values in PNG:")
    for v in sorted(k for k in unique_vals if isinstance(k, int)):
        print(f"  gray={v:#04x} ({v:3d})  count={unique_vals[v]:6d}  -> grayToIdx={grayToIdx(v)}")

    non_gray = [k for k in unique_vals if not isinstance(k, int)]
    if non_gray:
        print(f"  Non-grayscale pixels found: {non_gray[:5]}")
    print()

    # --- 4. Check actual extract_tiles.py palette values ---
    expected_palette = [0x00, 0x55, 0xAA, 0xFF]
    print("Extract_tiles.py palette values:")
    for idx, val in enumerate(expected_palette):
        decoded = grayToIdx(val)
        ok = "PASS" if decoded == idx else "FAIL"
        print(f"  palette[{idx}] = {val:#04x} -> grayToIdx={decoded}  [{ok}]")
    print()

    # --- 5. Sample tile 0 (should be blank/all black) ---
    t0 = get_tile_pixels(pixels, width, 0)
    unique_t0 = set(t0)
    print(f"Tile 0 (BG blank): unique gray values = {sorted(unique_t0)}")

    # --- 6. Sample tile 256 (sprite bank, player tank UP) - should be non-blank ---
    # tile 256 = absolute index 256 in chr_pt0.png (row 8, col 0)
    t256 = get_tile_pixels(pixels, width, 256)
    unique_t256 = set(t256)
    indices_t256 = [grayToIdx(v) for v in t256]
    unique_idx_t256 = set(indices_t256)
    print(f"Tile 256 (sprite player UP top-left): unique gray values = {sorted(unique_t256)}")
    print(f"  -> decoded indices: {sorted(unique_idx_t256)}")
    if len(unique_idx_t256) > 1:
        print("  [PASS] Tile 256 has non-trivial content (multiple indices)")
    else:
        print("  [WARN] Tile 256 appears blank (only one index)")

    # Print the actual 8x8 index grid for tile 256
    print("  8x8 index grid for tile 256:")
    for row in range(8):
        row_vals = [grayToIdx(t256[row*8+col]) for col in range(8)]
        print("    " + ''.join(str(v) for v in row_vals))
    print()

    # --- 7. Check tile at known non-blank position: tile 0x80 (power-up helmet, sprite bank = 256+0x80=384) ---
    t384 = get_tile_pixels(pixels, width, 384)
    unique_t384 = set(t384)
    indices_t384 = [grayToIdx(v) for v in t384]
    unique_idx_t384 = set(indices_t384)
    print(f"Tile 384 (sprite 0x80, power-up helmet): unique gray values = {sorted(unique_t384)}")
    print(f"  -> decoded indices: {sorted(unique_idx_t384)}")
    print("  8x8 index grid:")
    for row in range(8):
        row_vals = [grayToIdx(t384[row*8+col]) for col in range(8)]
        print("    " + ''.join(str(v) for v in row_vals))
    print()

    # --- 8. Verify border pixel between tiles 0 and 1 (x=8 is border, x=9 is tile 1 start) ---
    # Row for tiles 0/1 = row 0, y = CHR_BORDER (=1) to CHR_BORDER+8 (=9)
    # tile 0: x = CHR_BORDER (1) to 8
    # border: x = CHR_CELL (9) = 9
    # tile 1: x = CHR_CELL + CHR_BORDER (10) to 17
    border_between = get_pixel(pixels, width, CHR_CELL, CHR_BORDER)
    print(f"Border pixel between tile 0 and 1 (x={CHR_CELL}, y={CHR_BORDER}): RGB={tuple(f'{v:#04x}' for v in border_between)}")

    # --- 9. Summary ---
    print("\n=== SUMMARY ===")
    print(f"PNG gray levels: {sorted(k for k in unique_vals if isinstance(k, int))}")
    extract_palette = [0x00, 0x55, 0xAA, 0xFF]
    all_present = all(v in unique_vals for v in extract_palette if v not in [0x00])  # 0x00 might only be in blank tiles

    actual_vals = sorted(k for k in unique_vals if isinstance(k, int))
    if set(actual_vals).issubset({0x00, 0x55, 0xAA, 0xFF}):
        print("[PASS] All PNG pixels are exact extract_tiles.py palette values")
        print("[PASS] grayToIdx thresholds (0x2B/0x7F/0xD5) correctly decode all levels")
    else:
        unexpected = [v for v in actual_vals if v not in {0x00, 0x55, 0xAA, 0xFF}]
        print(f"[NOTE] Unexpected gray values: {[hex(v) for v in unexpected]}")
        print("       These may come from PNG compression artifacts or color space conversion")
        print("       Check if grayToIdx still maps them correctly:")
        for v in unexpected:
            print(f"         gray={v:#04x} -> grayToIdx={grayToIdx(v)}")

if __name__ == '__main__':
    main()
