#!/usr/bin/env python3
"""Dump BG terrain tiles as ASCII art to verify CHR data correctness."""
import sys

ROM = "VS. Battle City (1985)(Namco).nes"
BG_BASE = 0x8010  # file offset for BG bank (tiles 0-255)
SP_BASE = 0x9010  # file offset for sprite bank (tiles 256-511)

with open(ROM, 'rb') as f:
    data = f.read()

tiles_to_check = [0x00, 0x0F, 0x10, 0x12, 0x20, 0x21, 0x22]

for tile_idx in tiles_to_check:
    for bank_name, base in [("BG", BG_BASE), ("SP", SP_BASE)]:
        off = base + tile_idx * 16
        raw = data[off:off+16]
        rows = []
        for y in range(8):
            p0 = raw[y]
            p1 = raw[y+8]
            row = ''
            for b in range(7, -1, -1):
                c = ((p0 >> b) & 1) | (((p1 >> b) & 1) << 1)
                row += '.123'[c]
            rows.append(row)
        nonblank = sum(1 for r in rows if r != '........')
        print(f"Tile 0x{tile_idx:02X} [{bank_name}] @ file 0x{off:05X}: {nonblank}/8 rows non-blank")
        for r in rows:
            print(f"  {r}")
        print()
