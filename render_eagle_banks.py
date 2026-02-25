#!/usr/bin/env python3
"""Render eagle composite (tiles $D0-$DF) from each of the 4 CHR banks as a PNG."""
import png, os

ROM = 'VS. Battle City (1985)(Namco).nes'
rom = open(ROM, 'rb').read()

# SP3 palette approximation: black, purple, red, white
pal_colors = [
    (0, 0, 0),
    (136, 20, 176),
    (228, 0, 88),
    (252, 252, 252),
]

def decode_tile(bank_data, tile_idx):
    off = tile_idx * 16
    rows = []
    for r in range(8):
        p0 = bank_data[off + r]
        p1 = bank_data[off + r + 8]
        row = []
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            row.append(c)
        rows.append(row)
    return rows

def render_eagle(bank_data, filename):
    oam_tiles = [0xD1, 0xD3, 0xD5, 0xD7, 0xD9, 0xDB, 0xDD, 0xDF]
    SCALE = 8
    width = 32 * SCALE
    height = 32 * SCALE
    rows_out = []
    for py in range(32):
        row_pixels = []
        outer_row = 0 if py < 16 else 1
        local_y = py - outer_row * 16
        for col in range(4):
            T = oam_tiles[outer_row * 4 + col]
            if local_y < 8:
                tile_idx = T & 0xFE
                tile_row = local_y
            else:
                tile_idx = (T & 0xFE) + 1
                tile_row = local_y - 8
            tile = decode_tile(bank_data, tile_idx)
            for px in range(8):
                cidx = tile[tile_row][px]
                r, g, b = pal_colors[cidx]
                for _ in range(SCALE):
                    row_pixels.extend([r, g, b])
        for _ in range(SCALE):
            rows_out.append(row_pixels)
    w = png.Writer(width=width, height=height, greyscale=False)
    with open(filename, 'wb') as f:
        w.write(f, rows_out)
    print(f'Wrote {filename}')

os.makedirs('output_gfx', exist_ok=True)
for bnum, off, name in [(0, 0x8010, 'Bank0_spr'), (1, 0x9010, 'Bank1_BG'), (2, 0xA010, 'Bank2'), (3, 0xB010, 'Bank3')]:
    data = rom[off:off + 0x1000]
    render_eagle(data, f'output_gfx/eagle_{name}.png')
