#!/usr/bin/env python3
"""
Decode CHR sprite bank (PT0) tiles $3A-$3D and display their pixel patterns.
Also decode shield tiles $29, $2D for comparison.
Sprite bank (PT0) = tile_viewer indices 256-511.
"""

ROM_PATH = "VS. Battle City (1985)(Namco).nes"

def decode_tile(chr_data, tile_idx):
    """Decode one 16-byte 2bpp NES tile -> 8 rows of 8 pixels (0-3)."""
    off = tile_idx * 16
    rows = []
    for row in range(8):
        p0 = chr_data[off + row]
        p1 = chr_data[off + row + 8]
        line = []
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            line.append(c)
        rows.append(line)
    return rows

SHADE = ' .+#'  # color 0-3

def print_tile(label, rows):
    print(f"\n  Tile {label}:")
    for row in rows:
        print('    ' + ''.join(SHADE[c] for c in row))

with open(ROM_PATH, 'rb') as f:
    rom = f.read()

assert rom[:4] == b'NES\x1a'
prg_banks = rom[4]
prg_size  = prg_banks * 16384
chr_off   = 16 + prg_size
chr_banks = rom[5]
chr_size  = chr_banks * 8192
chr_data  = rom[chr_off : chr_off + chr_size]

print(f"CHR ROM: {chr_banks} banks ({chr_size//1024}KB), file offset {chr_off:#x}")
print(f"Sprite bank (PT0) starts at CHR tile 256 = file {chr_off + 256*16:#x}")

# The tile_viewer orders:
# BG bank (PT1): viewer tiles 0-255   -> CHR tiles 0-255   (chr_off + 0*16 to chr_off + 255*16)
# Sprite bank (PT0): viewer 256-511   -> CHR tiles 256-511  (chr_off + 256*16 to chr_off + 511*16)

# In NES PPUCTRL for this game:
# BG at PPU $1000 (PT1) = CHR bank's second 4KB?
# Sprite at PPU $0000 (PT0) = CHR bank's first 4KB?
#
# Looking at extract_tiles.py comment: tile_viewer says
# "tiles 0-255 = PPU $1000 = file $8010 = BG / PT1"
# "tiles 256-511 = PPU $0000 = file $9010 = Sprite / PT0"
#
# For the VS. Battle City ROM with mapper 99:
# The game uses 8x16 sprites (PPUCTRL bit 5=1), so sprite tiles come from PT0 (PPU $0000).
# tile_viewer maps: viewer_idx 256-511 = sprite bank tiles $00-$FF (PPU $0000).
# So sprite tile $3A = viewer 256 + 0x3A = 314.

# In the CHR ROM layout, PT1 (BG) is at the lower 4KB of each 8KB bank,
# and PT0 (sprite) is at the upper 4KB.
# Actually from the file offsets:
# file $8010 = PT1 (BG, viewer 0-255)  -> CHR bytes 0x0000-0x0FFF
# file $9010 = PT0 (sprite, viewer 256-511) -> CHR bytes 0x1000-0x1FFF
# So sprite tile $3A in CHR = CHR index 256+0x3A

sprite_base = 256  # CHR tile index where sprite bank begins (file $9010)

print("\n=== Shield tiles (PT0 sprite, via PlayerShieldDraw $E330) ===")
print("Formula: ADC #$29 with 0 or 4 -> tile $29 or $2D")
for t in [0x28, 0x29, 0x2C, 0x2D]:
    rows = decode_tile(chr_data, sprite_base + t)
    print_tile(f"$PT0:{t:02X} (viewer {sprite_base+t})", rows)

print("\n=== Power-up tiles $80-$9F (PT0 sprite, via PowerUpDraw $E30D) ===")
print("Formula: base = $80 + type*4; 8 types (0-7)")
for t in range(0x80, 0x84):
    rows = decode_tile(chr_data, sprite_base + t)
    print_tile(f"$PT0:{t:02X} (viewer {sprite_base+t})", rows)

print("\n=== Target tiles $3A-$3D (PT0 sprite, viewer 314-317) ===")
for t in range(0x3A, 0x3E):
    rows = decode_tile(chr_data, sprite_base + t)
    non_empty = sum(1 for row in rows for c in row if c != 0)
    print_tile(f"$PT0:{t:02X} (viewer {sprite_base+t}) [{non_empty} non-zero pixels]", rows)

print("\n=== Surrounding tiles for context ($38-$40 range) ===")
for t in range(0x36, 0x42):
    rows = decode_tile(chr_data, sprite_base + t)
    non_empty = sum(1 for row in rows for c in row if c != 0)
    is_blank = non_empty == 0
    print(f"  PT0:${t:02X} (viewer {sprite_base+t}): {'[BLANK]' if is_blank else f'{non_empty} non-zero pixels'}")
