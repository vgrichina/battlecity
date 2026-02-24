#!/usr/bin/env python3
"""Check BG tile $11 pixel data."""
rom = open('VS. Battle City (1985)(Namco).nes', 'rb').read()
prg_banks = rom[4]
chr_off = 16 + prg_banks * 16384
# BG tile $11 is at chr_data[0x11*16 : 0x11*16+16]
offset = 0x11 * 16
tile = rom[chr_off + offset : chr_off + offset + 16]
print('BG tile $11 raw bytes:', ' '.join('%02X' % b for b in tile))
for row in range(8):
    lo = tile[row]; hi = tile[row+8]
    line = ''
    for bit in range(7,-1,-1):
        px = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1)
        line += str(px)
    print('  row %d: %s' % (row, line))
nonzero = sum(1 for row in range(8) for bit in range(7,-1,-1)
              if ((tile[row]>>bit)&1)|(((tile[row+8]>>bit)&1)<<1) != 0)
print('Non-zero pixels: %d' % nonzero)
