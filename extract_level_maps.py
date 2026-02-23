#!/usr/bin/env python3
"""Extract all 35 level tile maps from VS. Battle City ROM.

Level data layout:
  - Base address: CPU $F27D (PRG bank 1, file offset 0x4010 + 0x327D = 0x728D)
  - Each stage: 91 bytes = 182 nibbles packed, 14 nibbles per row (13 tiles + 1 skip), 13 rows
  - Stage N (1-based): data at $F27D + 91*(N-1)
  - Total: 35 stages × 91 bytes = 3185 bytes ending at ~$FFEE

Tile types (from $DB79 CHR table):
  0–3:   partial brick (quarter-filled variants; CHR $00/$0F)
  4:     full brick (all 4 CHR = $0F)
  5–8:   partial steel (quarter-filled variants; CHR $10/$20)
  9:     full steel (all 4 CHR = $10)
  10:    water  (CHR $12)
  11:    trees  (CHR $22)
  12:    ice    (CHR $21)
  13–15: empty / open ground (CHR $00)

Grid: 13 metatiles wide × 13 metatiles tall.
Each metatile is 16×16 pixels (2×2 CHR tiles at 8×8 each).
The playfield spans pixel $10–$D0 in X and Y (16–208).
The eagle base is at the bottom-centre (outside the 13×13 interior).
"""

import os
import sys

ROM_FILE = "VS. Battle City (1985)(Namco).nes"
# CPU $F27D is in PRG bank 1 ($C000–$FFFF); file offset = 0x4010 + (0xF27D - 0xC000)
LEVEL_DATA_OFFSET = 0x4010 + (0xF27D - 0xC000)  # = 0x728D
STAGE_SIZE = 91    # bytes per stage (182 nibbles, 14 per row × 13 rows)
NUM_STAGES = 35
COLS = 13
ROWS = 13

# Tile display characters
TILE_CHARS = {
    0:  'b',   # partial brick TL
    1:  'b',   # partial brick TR
    2:  'b',   # partial brick BL
    3:  'b',   # partial brick BR
    4:  'B',   # full brick
    5:  's',   # partial steel TL
    6:  's',   # partial steel TR
    7:  's',   # partial steel BL
    8:  's',   # partial steel BR
    9:  'S',   # full steel
    10: 'W',   # water
    11: 'T',   # trees
    12: 'I',   # ice
    13: '.',   # empty
    14: '.',   # empty
    15: '.',   # empty
}

TILE_NAMES = {
    0: 'brick-TL', 1: 'brick-TR', 2: 'brick-BL', 3: 'brick-BR',
    4: 'BRICK',
    5: 'steel-TL', 6: 'steel-TR', 7: 'steel-BL', 8: 'steel-BR',
    9: 'STEEL',
    10: 'WATER', 11: 'TREES', 12: 'ICE',
    13: 'EMPTY', 14: 'EMPTY', 15: 'EMPTY',
}


def decode_stage(raw: bytes) -> list[list[int]]:
    """Decode 91-byte stage data into 13×13 tile type grid."""
    grid = []
    for row in range(ROWS):
        row_tiles = []
        for col in range(COLS):
            nibble_idx = row * 14 + col  # 14 nibbles per row (13 + 1 skip)
            byte_idx = nibble_idx // 2
            if nibble_idx % 2 == 0:
                t = (raw[byte_idx] >> 4) & 0xF
            else:
                t = raw[byte_idx] & 0xF
            row_tiles.append(t)
        grid.append(row_tiles)
    return grid


def render_grid(grid: list[list[int]], mode: str = 'char') -> str:
    """Render a 13×13 grid as ASCII art or hex."""
    lines = []
    for row in grid:
        if mode == 'hex':
            lines.append(' '.join(f'{t:X}' for t in row))
        else:
            lines.append(''.join(TILE_CHARS.get(t, '?') for t in row))
    return '\n'.join(lines)


def count_tiles(grid: list[list[int]]) -> dict[str, int]:
    """Count tiles by category."""
    counts = {}
    for row in grid:
        for t in row:
            name = TILE_NAMES.get(t, f'type{t}')
            counts[name] = counts.get(name, 0) + 1
    return counts


def main():
    if not os.path.exists(ROM_FILE):
        print(f"ERROR: ROM file not found: {ROM_FILE}", file=sys.stderr)
        sys.exit(1)

    with open(ROM_FILE, 'rb') as f:
        rom = f.read()

    print(f"ROM size: {len(rom)} bytes")
    print(f"Level data base: file offset 0x{LEVEL_DATA_OFFSET:05X} = CPU $F27D")
    print(f"Stages: {NUM_STAGES}, bytes per stage: {STAGE_SIZE}")
    print()

    all_grids = []
    for stage in range(1, NUM_STAGES + 1):
        offset = LEVEL_DATA_OFFSET + STAGE_SIZE * (stage - 1)
        raw = rom[offset:offset + STAGE_SIZE]
        grid = decode_stage(raw)
        all_grids.append(grid)

        counts = count_tiles(grid)
        tile_summary = []
        if counts.get('BRICK', 0) + sum(v for k, v in counts.items() if k.startswith('brick')):
            b = counts.get('BRICK', 0) + sum(v for k, v in counts.items() if k.startswith('brick'))
            tile_summary.append(f"brick={b}")
        if counts.get('STEEL', 0) + sum(v for k, v in counts.items() if k.startswith('steel')):
            s = counts.get('STEEL', 0) + sum(v for k, v in counts.items() if k.startswith('steel'))
            tile_summary.append(f"steel={s}")
        if counts.get('TREES', 0):
            tile_summary.append(f"trees={counts['TREES']}")
        if counts.get('WATER', 0):
            tile_summary.append(f"water={counts['WATER']}")
        if counts.get('ICE', 0):
            tile_summary.append(f"ice={counts['ICE']}")

        print(f"=== STAGE {stage:02d} (offset 0x{offset:05X} = CPU ${offset - 0x4010 + 0xC000:04X}) ===")
        print(f"  Tiles: {', '.join(tile_summary) if tile_summary else 'all empty'}")
        print(render_grid(grid, 'char'))
        print()

    # Also output raw hex dump of each stage's grid
    print()
    print("=== HEX DUMP (all stages, one line per stage row) ===")
    for stage, grid in enumerate(all_grids, 1):
        print(f"Stage {stage:02d}:")
        for row in grid:
            print('  ' + ' '.join(f'{t:X}' for t in row))

    # Output as JS constant for web reimplementation
    print()
    print("=== JS CONSTANT (for web/levels.js) ===")
    print("const LEVEL_MAPS = [")
    for stage, grid in enumerate(all_grids, 1):
        flat = [t for row in grid for t in row]
        print(f"  // Stage {stage}")
        rows_js = []
        for row in grid:
            rows_js.append('    [' + ','.join(str(t) for t in row) + ']')
        print('  [\n' + ',\n'.join(rows_js) + '\n  ]' + (',' if stage < NUM_STAGES else ''))
    print("];")


if __name__ == '__main__':
    main()
