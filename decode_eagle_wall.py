#!/usr/bin/env python3
"""Decode eagle wall positions from stage nibble data to verify EAGLE_WALL geometry."""
import struct

ROM_PATH = 'battlecity.nes'
STAGE_DATA_OFFSET = 0x10 + (0xF07A - 0x8000)  # header=16 + PRG offset
STAGE_SIZE = 0x5B  # 91 bytes per stage
NUM_STAGES = 36

NIBBLE_MAP = {0xD: 'E', 4: 'B', 1: '1', 3: '3', 8: '8', 9: '9', 0: '0'}

with open(ROM_PATH, 'rb') as f:
    prg = f.read()

def decode_stage_grid(stage_idx):
    base = STAGE_DATA_OFFSET + stage_idx * STAGE_SIZE
    data = prg[base:base + STAGE_SIZE]
    grid = []
    for row in range(13):
        cells = []
        for col in range(13):
            byte_idx = row * 7 + col // 2
            byte = data[byte_idx]
            if col % 2 == 0:
                nib = (byte >> 4) & 0xF
            else:
                nib = byte & 0xF
            cells.append(nib)
        grid.append(cells)
    return grid

EAGLE_WALL_POS = [(11,5),(11,6),(11,7),(12,5),(12,7)]

print("=== Eagle wall cell nibble values across all 35 stages ===")
print(f"{'Stage':>6} | {'r11c5':>5} {'r11c6':>5} {'r11c7':>5} {'r12c5':>5} {'r12c7':>5} | All empty?")
print("-" * 65)
for s in range(35):
    grid = decode_stage_grid(s)
    vals = [grid[r][c] for r,c in EAGLE_WALL_POS]
    all_empty = all(v == 0xD for v in vals)
    nibs = [hex(v) for v in vals]
    print(f"  {s+1:3d}  | {nibs[0]:>5} {nibs[1]:>5} {nibs[2]:>5} {nibs[3]:>5} {nibs[4]:>5} | {'YES' if all_empty else 'NO <--'}")

print()
print("=== Stage 1 full grid ===")
grid = decode_stage_grid(0)
for row in range(13):
    row_str = ' '.join(f'{v:X}' for v in grid[row])
    print(f"Row {row:2d}: {row_str}")
print()
print("EAGLE_WALL positions: row=11 cols=5,6,7  /  row=12 cols=5,7")
print("Eagle center (row=12, col=6):")
print(f"  row=12, col=6: nibble={hex(grid[12][6])}")
