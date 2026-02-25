#!/usr/bin/env python3
"""Extract all 28 NES APU sound sequences from ROM and output as JS arrays."""

import sys

ROM_PATH = 'VS. Battle City (1985)(Namco).nes'

# Sound sequence pointer table at $EEA3 (28 x 2-byte LE pointers)
PTR_TABLE_ADDR = 0xEEA3
NUM_SLOTS = 28

# NES pitch table at $EE8B (12 x 2 bytes)
PITCH_TABLE_ADDR = 0xEE8B

def rom_to_file(addr):
    """Convert bank 1 ($C000-$FFFF) address to file offset."""
    return addr - 0xC000 + 0x4010 + 0x4000  # iNES header + PRG bank 0 + bank 1 start
    # Actually: PRG is 32KB (2 banks), starts at file offset 0x10
    # Bank 0: $8000-$BFFF -> file $10 - $400F
    # Bank 1: $C000-$FFFF -> file $4010 - $800F
    # So addr in $C000-$FFFF: file = addr - $C000 + $4010

def main():
    with open(ROM_PATH, 'rb') as f:
        rom = f.read()

    # Read pointer table
    ptrs = []
    for i in range(NUM_SLOTS):
        off = rom_to_file(PTR_TABLE_ADDR + i * 2)
        lo = rom[off]
        hi = rom[off + 1]
        addr = (hi << 8) | lo
        ptrs.append(addr)

    # Read pitch table
    pitch_data = []
    for i in range(12):
        off = rom_to_file(PITCH_TABLE_ADDR + i * 2)
        hi = rom[off]  # FD byte
        lo = rom[off + 1]  # FE byte
        period = ((hi & 7) << 8) | lo
        pitch_data.append(period)

    print("// NES APU pitch table (12 notes, A1-G#2 base octave)")
    print("// period = value >> octave; freq = 1789773 / (16 * (period + 1))")
    print(f"const NES_PITCH = [{', '.join(str(p) for p in pitch_data)}];")
    print()

    # For each slot, read sequence data until $E8 (STOP) command
    # Sequences can contain loops, so we read up to a max length
    print("// Sound sequence data for 28 slots")
    print("// Format: [header...] [commands...] ending with $E8 (STOP)")
    print("const SOUND_SEQ = [")

    for slot in range(NUM_SLOTS):
        addr = ptrs[slot]
        # Read bytes until we find $E8 (STOP command at byte level)
        # But $E8 can also appear as a parameter byte, so we need to parse properly
        # For simplicity, just read up to 80 bytes or until we find $E8 as a command
        data = []
        off = rom_to_file(addr)

        # Read header first
        ch = rom[off]  # channel_select
        data.append(ch)

        # Header size depends on channel
        hdr_size = 5 if ch == 4 else 4  # noise channel has extra byte
        for j in range(1, hdr_size):
            data.append(rom[off + j])

        # Now read command stream
        pos = hdr_size
        max_bytes = 80
        while pos < max_bytes:
            b = rom[off + pos]
            data.append(b)
            pos += 1

            if b == 0xE8:  # STOP
                break
            elif b in (0xE9, 0xEA, 0xEB, 0xEC, 0xED, 0xEE):  # 1-param cmds
                data.append(rom[off + pos])
                pos += 1
            elif b in (0xF0, 0xF1, 0xF2):  # loop cmds: 2 params
                data.append(rom[off + pos])
                data.append(rom[off + pos + 1])
                pos += 2
            elif b in (0xF3, 0xF4, 0xF5, 0xF6, 0xF7):  # skip
                data.append(rom[off + pos])
                pos += 1
            # $00-$5F (note), $60 (hold), $61-$E7 (duration), $EF (loop-reset) = single byte

        hex_str = ','.join(f'0x{b:02X}' for b in data)
        print(f"  /* slot {slot:2d} ${addr:04X} */ [{hex_str}],")

    print("];")

if __name__ == '__main__':
    main()
