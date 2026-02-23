#!/usr/bin/env python3
"""Analyze specific tile regions in chr_pt0.png to verify tank sprite layout."""
import struct, zlib

PNG_PATH = "tiles/chr_pt0.png"

# PNG constants
def read_png_rgb(path):
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos = 8
    chunks = {}
    while pos < len(data):
        length = struct.unpack_from('>I', data, pos)[0]
        tag = data[pos+4:pos+8]
        body = data[pos+8:pos+8+length]
        chunks.setdefault(tag, []).append(body)
        pos += 12 + length
    ihdr = chunks[b'IHDR'][0]
    w, h, bpp, ctype = struct.unpack_from('>IIBB', ihdr)
    print(f"PNG: {w}x{h}, bit_depth={bpp}, color_type={ctype}")
    raw_data = zlib.decompress(b''.join(chunks[b'IDAT']))
    bpp_bytes = 3 if ctype == 2 else 4  # RGB or RGBA
    rows = []
    stride = w * bpp_bytes + 1
    for y in range(h):
        ftype = raw_data[y * stride]
        row_bytes = raw_data[y * stride + 1: y * stride + 1 + w * bpp_bytes]
        row = []
        prev = [0] * bpp_bytes
        for x in range(w):
            px = list(row_bytes[x*bpp_bytes:(x+1)*bpp_bytes])
            if ftype == 1:  # Sub
                px = [(px[i] + prev[i]) & 0xFF for i in range(bpp_bytes)]
            elif ftype == 2:  # Up
                if y > 0:
                    up = rows[y-1][x]
                    px = [(px[i] + up[i]) & 0xFF for i in range(bpp_bytes)]
            row.append(px)
            prev = px
        rows.append(row)
    return w, h, rows

CELL = 9
BORDER = 1

def get_tile_color_indices(rows, tile_idx):
    """Extract 8x8 pixel data for tile at given index."""
    col = tile_idx % 32
    row = tile_idx // 32
    ox = col * CELL + BORDER
    oy = row * CELL + BORDER
    pixels = []
    for y in range(8):
        for x in range(8):
            px = rows[oy + y][ox + x]
            pixels.append(tuple(px[:3]))
    return pixels

PALETTE = [
    (0x00, 0x00, 0x00),   # 0 black
    (0x55, 0x55, 0x55),   # 1 dark gray
    (0xAA, 0xAA, 0xAA),   # 2 light gray
    (0xFF, 0xFF, 0xFF),   # 3 white
    (0x20, 0x20, 0x20),   # background
]

def rgb_to_idx(rgb):
    for i, c in enumerate(PALETTE):
        if tuple(rgb) == c:
            return i
    return -1

def tile_summary(rows, tile_idx):
    pixels = get_tile_color_indices(rows, tile_idx)
    idxs = [rgb_to_idx(p) for p in pixels]
    unique = set(idxs)
    has_content = unique != {0} and unique != {4}
    non_bg = [i for i in idxs if i not in (0, 4)]
    return has_content, unique, non_bg

def ascii_tile(rows, tile_idx):
    pixels = get_tile_color_indices(rows, tile_idx)
    chars = ['.', '+', '#', '@', ' ']
    lines = []
    for row in range(8):
        line = ''
        for col in range(8):
            rgb = pixels[row*8 + col]
            i = rgb_to_idx(rgb)
            line += chars[i] if 0 <= i < len(chars) else '?'
        lines.append(line)
    return lines

w, h, rows = read_png_rgb(PNG_PATH)

print("\n=== Player Tank Tiles (sprite bank, PNG index 256+$00 to 256+$1F) ===")
print("Expected: 4 directions × 2 anim frames, 8x16 halves (top/bottom)")
print("dir offsets: up=$00, left=$08, down=$10, right=$18")
for t in range(0x00, 0x20):
    idx = 256 + t
    has, unique, nz = tile_summary(rows, idx)
    status = "CONTENT" if has else "empty"
    dir_name = ["UP-L","UP-R","?","?","?","?","?","?","LFT-L","LFT-R","?","?","?","?","?","?","DN-L","DN-R","?","?","?","?","?","?","RGT-L","RGT-R","?","?","?","?","?","?"][t] if t < 0x20 else "?"
    print(f"  PNG[{idx:3d}] T=$00+{t:02X} ({dir_name:6s}): {status} vals={sorted(unique)}")

print("\n=== Enemy Tier 0 base $80 (PNG 256+$80 to 256+$9F) ===")
for t in range(0x80, 0xA0):
    idx = 256 + t
    has, unique, nz = tile_summary(rows, idx)
    if has:
        print(f"  PNG[{idx:3d}] T=${t:02X}: CONTENT vals={sorted(unique)}")
    else:
        print(f"  PNG[{idx:3d}] T=${t:02X}: empty")

print("\n=== Enemy Tier 1 base $A0 (PNG 256+$A0 to 256+$BF) ===")
for t in range(0xA0, 0xC0):
    idx = 256 + t
    has, unique, nz = tile_summary(rows, idx)
    status = "CONTENT" if has else "empty"
    print(f"  PNG[{idx:3d}] T=${t:02X}: {status}")

print("\n=== Enemy Tier 2 base $C0 (PNG 256+$C0 to 256+$DF) ===")
for t in range(0xC0, 0xE0):
    idx = 256 + t
    has, unique, nz = tile_summary(rows, idx)
    status = "CONTENT" if has else "empty"
    print(f"  PNG[{idx:3d}] T=${t:02X}: {status}")

print("\n=== Enemy Tier 3 base $E0 (PNG 256+$E0 to 256+$FF) ===")
for t in range(0xE0, 0x100):
    idx = 256 + t
    has, unique, nz = tile_summary(rows, idx)
    status = "CONTENT" if has else "empty"
    print(f"  PNG[{idx:3d}] T=${t:02X}: {status}")

# ASCII art of first player tank tile
print("\n=== ASCII art: player UP anim0 (T=$00, PNG index 256) ===")
lines = ascii_tile(rows, 256)
for l in lines:
    print(f"  |{l}|")

print("\n=== ASCII art: player UP anim0 bottom half (T=$10, PNG index 272) ===")
lines = ascii_tile(rows, 272)
for l in lines:
    print(f"  |{l}|")

print("\n=== ASCII art: player LEFT anim0 (T=$08, PNG index 264) ===")
lines = ascii_tile(rows, 264)
for l in lines:
    print(f"  |{l}|")

print("\n=== ASCII art: player DOWN anim0 (T=$10, PNG index 272) ===")
lines = ascii_tile(rows, 272)
for l in lines:
    print(f"  |{l}|")
