#!/usr/bin/env python3
"""
xref.py — Find all references to a CPU address in the PRG-ROM.

Scans for JMP abs, JSR abs, JMP ind, branch (REL) instructions, and
absolute/indexed load/store operands that target the given address.

Usage:
    python xref.py <addr> [--bank B]

    addr     — target CPU address (hex, with or without $)
    --bank B — restrict search to PRG bank B (hex)

Examples:
    python xref.py $8123
    python xref.py C010 --bank 1
"""

import sys
import struct

ROM_FILE = "battlecity_famicom.nes"

# Instruction lengths by addressing mode (for context display)
ABS_MODES  = {'ABS', 'ABX', 'ABY', 'IND'}
REL_MODES  = {'REL'}

from instruction_set import OPCODES

def load_prg(path=None):
    with open(path or ROM_FILE, 'rb') as f:
        raw = f.read()
    if raw[:4] != b'NES\x1a':
        raise ValueError("Not iNES")
    prg_banks   = raw[4]
    has_trainer = bool(raw[6] & 0x04)
    prg_start   = 16 + (512 if has_trainer else 0)
    prg_size    = prg_banks * 16384
    return raw[prg_start:prg_start + prg_size], prg_banks

def prg_to_cpu(off, prg_banks):
    if prg_banks == 1:
        return 0x8000 + (off % 0x4000)
    return 0x8000 + off

def cpu_to_prg(addr, prg_banks):
    if addr < 0x8000:
        return None
    if prg_banks == 1:
        return (addr - 0x8000) % 0x4000
    return addr - 0x8000

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    rom_file = None
    if '--rom' in args:
        idx = args.index('--rom')
        rom_file = args[idx + 1]
        args = args[:idx] + args[idx + 2:]

    target_str = args[0].lstrip('$')
    target = int(target_str, 16)
    filter_bank = None
    i = 1
    while i < len(args):
        if args[i] == '--bank' and i+1 < len(args):
            filter_bank = int(args[i+1], 16); i += 2
        else:
            i += 1

    prg, prg_banks = load_prg(rom_file)

    from dis import load_labels, load_comments
    labels   = load_labels("labels.csv")
    comments = load_comments("labels.csv")

    def lbl(addr, bank=None):
        k = (bank, addr)
        k2 = (None, addr)
        entry = labels.get(k) or labels.get(k2)
        return entry[0] if entry else f'${addr:04X}'

    print(f"Cross-references to {lbl(target)} (${target:04X})")
    print()

    hits = []

    for off in range(len(prg) - 2):
        byte = prg[off]
        mnemonic, mode, length, cycles = OPCODES[byte][:4]
        bank = off // 0x4000
        if filter_bank is not None and bank != filter_bank:
            continue

        cpu = prg_to_cpu(off, prg_banks)

        if mode in ABS_MODES and length == 3:
            operand_addr = prg[off+1] | (prg[off+2] << 8)
            if operand_addr == target:
                hits.append((off, cpu, bank, mnemonic, mode, operand_addr))

        elif mode in REL_MODES and length == 2:
            raw_off = prg[off+1]
            rel = raw_off if raw_off < 128 else raw_off - 256
            branch_target = (cpu + 2 + rel) & 0xFFFF
            if branch_target == target:
                hits.append((off, cpu, bank, mnemonic, mode, branch_target))

    if not hits:
        print("  (no references found)")
    else:
        print(f"  {len(hits)} reference(s):\n")
        for off, cpu, bank, mne, mode, operand in hits:
            caller_lbl = lbl(cpu, bank)
            cmt = comments.get((bank, cpu)) or comments.get((None, cpu)) or ''
            cmt_str = f'  ; {cmt}' if cmt else ''
            raw_bytes = ' '.join(f'{b:02X}' for b in prg[off:off+3])
            print(f"  ${cpu:04X}  [{raw_bytes}]  {mne} {lbl(operand)}{cmt_str}  (bank {bank})")

if __name__ == '__main__':
    main()
