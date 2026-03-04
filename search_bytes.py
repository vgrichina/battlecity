#!/usr/bin/env python3
"""
search_bytes.py — Byte-pattern search across the PRG-ROM of the iNES ROM.

Usage:
    python search_bytes.py <hex_pattern> [--context N] [--disasm]

    hex_pattern  — hex string of bytes to find, e.g. "A9 00 85" or "A90085"
    --context N  — show N raw bytes before and after each match (default 4)
    --disasm     — disassemble context bytes after each match

Examples:
    python search_bytes.py A90085
    python search_bytes.py "4C 00 80" --context 8 --disasm
"""

import sys
import os
import re

ROM_FILE = "battlecity_famicom.nes"

def load_rom_prg(path=None):
    with open(path or ROM_FILE, 'rb') as f:
        raw = f.read()
    if raw[:4] != b'NES\x1a':
        raise ValueError("Not an iNES ROM")
    prg_banks = raw[4]
    has_trainer = bool(raw[6] & 0x04)
    prg_start = 16 + (512 if has_trainer else 0)
    prg_size = prg_banks * 16384
    return raw[prg_start:prg_start + prg_size], prg_banks

def prg_offset_to_cpu(offset, prg_banks):
    """Convert PRG-ROM file offset to CPU address (mapper 0 assumption)."""
    if prg_banks == 1:
        return 0x8000 + (offset % 0x4000)
    return 0x8000 + offset

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    # strip --rom before positional parsing
    rom_file = None
    if '--rom' in args:
        idx = args.index('--rom')
        rom_file = args[idx + 1]
        args = args[:idx] + args[idx + 2:]

    pattern_str = args[0].replace(' ', '')
    try:
        pattern = bytes.fromhex(pattern_str)
    except ValueError:
        print(f"Invalid hex pattern: {args[0]}")
        sys.exit(1)

    context   = 4
    do_disasm = False
    i = 1
    while i < len(args):
        if args[i] == '--context' and i + 1 < len(args):
            context = int(args[i+1]); i += 2
        elif args[i] == '--disasm':
            do_disasm = True; i += 1
        else:
            i += 1

    prg, prg_banks = load_rom_prg(rom_file)

    matches = []
    pos = 0
    while True:
        idx = prg.find(pattern, pos)
        if idx == -1:
            break
        matches.append(idx)
        pos = idx + 1

    print(f"Pattern: {pattern.hex().upper()}  ({len(pattern)} bytes)")
    print(f"Found {len(matches)} match(es) in PRG-ROM")
    print()

    for off in matches:
        cpu = prg_offset_to_cpu(off, prg_banks)
        bank = off // 0x4000
        start = max(0, off - context)
        end   = min(len(prg), off + len(pattern) + context)
        region = prg[start:end]

        hex_parts = []
        for j, b in enumerate(region):
            abs_off = start + j
            if off <= abs_off < off + len(pattern):
                hex_parts.append(f'[{b:02X}]')
            else:
                hex_parts.append(f'{b:02X}')
        hex_str = ' '.join(hex_parts)

        print(f"  PRG offset 0x{off:05X}  CPU ${cpu:04X}  bank {bank}")
        print(f"    {hex_str}")

        if do_disasm:
            from dis import NESRom, load_labels, load_comments, disassemble
            try:
                rom = NESRom(rom_file or ROM_FILE)
                labels   = load_labels("labels.csv")
                comments = load_comments("comments.csv")
                print()
                for line in disassemble(rom, cpu, bank, 8, labels, comments):
                    print('    ' + line)
            except Exception as e:
                print(f'    [disasm error: {e}]')
        print()

if __name__ == '__main__':
    main()
