#!/usr/bin/env python3
"""Check BG tile $00 pixel data."""
rom = open('VS. Battle City (1985)(Namco).nes', 'rb').read()
prg_banks = rom[4]
chr_off = 16 + prg_banks * 16384
# BG tile 0 is at chr_data[0:16] (PT1 = BG bank)
tile = rom[chr_off:chr_off+16]
print('BG tile $00 raw bytes:', ' '.join(f'{b:02X}' for b in tile))
for row in range(8):
    lo = tile[row]; hi = tile[row+8]
    line = ''
    for bit in range(7,-1,-1):
        px = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1)
        line += str(px)
    print(f'  row {row}: {line}')
nonzero = sum(1 for row in range(8) for bit in range(7,-1,-1)
              if ((tile[row]>>bit)&1)|(((tile[row+8]>>bit)&1)<<1) != 0)
print(f'Non-zero pixels: {nonzero}')
