#!/usr/bin/env python3
"""Generate ENEMY_TYPE_TABLE JS constant from ROM data.

SpeedTable ($E6A9): 36 entries × 4 bytes = group counts [s0,s1,s2,s3] per stage
EnemyTypeTable ($E5A9): 40 bytes = type byte per (stage*4+slot), but stages 11-35
  read past the 40-byte table into following ROM data.

Logic from EnemySpawn ($E46C):
  slot counts loaded from $8B-$8E (= SpeedTable[($85-1)*4 .. +3])
  type = ROM[$E5A9 + ($85-1)*4 + slot]
  $80=Basic(0), $A0=Fast(1), $C0=Power(2), $E0=Armor(3)
  If type=$E0 → ORA #$03 → $E3 (armor with flicker flag, still type 3 visually)
"""

ROM_FILE = "VS. Battle City (1985)(Namco).nes"
INES_HEADER = 0x10

# Bank 1 always at $C000-$FFFF; file offset = INES_HEADER + 0x4000 + (addr - 0xC000)
def bank1_offset(addr):
    return INES_HEADER + 0x4000 + (addr - 0xC000)

with open(ROM_FILE, "rb") as f:
    rom = f.read()

SPEED_TABLE_ADDR = 0xE6A9
ENEMY_TYPE_TABLE_ADDR = 0xE5A9

# Read SpeedTable: 36 entries × 4 bytes
speed_off = bank1_offset(SPEED_TABLE_ADDR)
speed_table = []
for i in range(36):
    entry = rom[speed_off + i*4 : speed_off + i*4 + 4]
    speed_table.append(list(entry))

# Read 140 bytes starting at EnemyTypeTable (covers all 35 stages + slot 3)
# stage N (1-indexed): index = (N-1)*4 + slot  → max = (35-1)*4+3 = 139
type_off = bank1_offset(ENEMY_TYPE_TABLE_ADDR)
type_bytes = list(rom[type_off : type_off + 140])

# Map type byte to type index
def type_byte_to_idx(b):
    # $80=Basic, $A0=Fast, $C0=Power, $E0 or $E3=Armor
    b &= 0xE0  # mask off lower nibble (ORA #$03 flag)
    return {0x80: 0, 0xA0: 1, 0xC0: 2, 0xE0: 3}.get(b, 0)

# Build per-stage type sequence (20 enemies each)
# Stages 1..35 use SpeedTable entries 0..34 (2P uses entry 35, skip)
stages = []
for stage in range(1, 36):  # stages 1..35
    counts = speed_table[stage - 1]  # 0-indexed
    total = sum(counts)
    assert total == 20, f"Stage {stage} total={total} counts={counts}"

    sequence = []
    for slot in range(4):
        cnt = counts[slot]
        type_idx_raw = (stage - 1) * 4 + slot
        t_byte = type_bytes[type_idx_raw]
        t_idx = type_byte_to_idx(t_byte)
        for _ in range(cnt):
            sequence.append(t_idx)

    assert len(sequence) == 20, f"Stage {stage} len={len(sequence)}"
    stages.append(sequence)

# Print verification table
type_names = ["Basic", "Fast", "Power", "Armor"]
print("Stage | B  F  P  A | Sequence (first 10)")
print("------|-----------|-------------------")
for i, seq in enumerate(stages):
    stage = i + 1
    counts_by_type = [seq.count(t) for t in range(4)]
    first10 = " ".join(str(t) for t in seq[:10])
    print(f"  {stage:2d}  | {counts_by_type[0]:2d} {counts_by_type[1]:2d} {counts_by_type[2]:2d} {counts_by_type[3]:2d} | {first10}")

# Output JS constant
print()
print("// JS constant for game.js:")
print("const ENEMY_TYPE_TABLE = [")
for i, seq in enumerate(stages):
    stage = i + 1
    arr = "[" + ",".join(str(t) for t in seq) + "]"
    print(f"  {arr},  // stage {stage}")
print("];")
