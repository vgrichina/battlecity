#!/usr/bin/env python3
"""Check CHR tile content for bullet explosion tiles $B0-$B7."""
ROM = "VS. Battle City (1985)(Namco).nes"
with open(ROM, 'rb') as f:
    rom = f.read()

# CHR start: ROM has 2 PRG banks (32KB), CHR at $8010
prg_banks = rom[4]
chr_off = 16 + prg_banks * 16384
chr_data = rom[chr_off : chr_off + 16384]

# BG/PT1 bank: chr_data[0x0000-0x0FFF], sprite/PT0: chr_data[0x1000-0x1FFF]
# Tile $B0 in BG bank: offset 0xB0 * 16 = 0xB00

def tile_nonzero(tile_idx, bank_off=0):
    off = bank_off + tile_idx * 16
    data = chr_data[off:off+16]
    return any(b != 0 for b in data), data.hex()

print("BG bank tiles $B0-$B7 (bullet explosion):")
for t in range(0xB0, 0xB8):
    has_data, hexstr = tile_nonzero(t, 0)
    print(f"  Tile ${t:02X}: {'HAS DATA' if has_data else 'BLANK   '} | {hexstr}")

print()
print("Sprite bank tiles (at +256) for reference — $84-$8F entity explosion:")
for t in range(0x84, 0x90):
    has_data, hexstr = tile_nonzero(t, 0x1000)
    print(f"  Tile ${t:02X} (spr): {'HAS DATA' if has_data else 'BLANK   '} | {hexstr}")
