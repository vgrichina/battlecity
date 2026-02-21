#!/usr/bin/env python3
"""
dis.py — Targeted 6502 disassembler for iNES ROMs.

Usage:
    python dis.py <addr> [lines]
    python dis.py <bank>:<addr> [lines]

    addr   — CPU address in hex, with or without $ prefix  (e.g. $8000 or 8000)
    bank   — PRG bank number in hex (0-based); ignored for mapper 0 (inferred from addr)
    lines  — number of instructions to disassemble (default 30)

Examples:
    python dis.py $FFFA 6         # dump interrupt vectors region
    python dis.py $8000 40        # first 40 instructions of PRG bank 0
    python dis.py 1:8000 20       # bank 1, address $8000

Reads:
    labels.csv    bank,addr,name
    comments.csv  bank,addr,comment
"""

import sys
import csv
import os
import struct

from instruction_set import decode, format_operand, OPCODES

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ROM_FILE = "VS. Battle City (1985)(Namco).nes"
LABELS_FILE   = "labels.csv"
COMMENTS_FILE = "comments.csv"

# ---------------------------------------------------------------------------
# iNES ROM loader
# ---------------------------------------------------------------------------

class NESRom:
    def __init__(self, path):
        with open(path, 'rb') as f:
            raw = f.read()

        if raw[:4] != b'NES\x1a':
            raise ValueError("Not a valid iNES ROM")

        self.prg_banks   = raw[4]
        self.chr_banks   = raw[5]
        flags6           = raw[6]
        flags7           = raw[7]
        self.mapper      = ((flags6 >> 4) & 0xF) | (flags7 & 0xF0)
        self.has_trainer = bool(flags6 & 0x04)
        self.mirroring   = 'V' if (flags6 & 0x01) else 'H'
        self.vs_system   = bool(flags7 & 0x01)

        prg_start = 16 + (512 if self.has_trainer else 0)
        prg_size  = self.prg_banks * 16384
        chr_start = prg_start + prg_size
        chr_size  = self.chr_banks * 8192

        self.prg = raw[prg_start : prg_start + prg_size]
        self.chr = raw[chr_start : chr_start + chr_size]
        self.raw = raw

        # Interrupt vectors (last 6 bytes of last PRG bank)
        v = self.prg[-6:]
        self.vec_nmi, self.vec_reset, self.vec_irq = struct.unpack_from('<HHH', v)

    def cpu_to_file_offset(self, cpu_addr, bank=None):
        """
        Convert a CPU address ($8000-$FFFF) to a byte offset into self.prg.

        For mapper 0:
          1 PRG bank  (16 KB) -> both $8000-$BFFF and $C000-$FFFF mirror bank 0
          2 PRG banks (32 KB) -> $8000-$BFFF = bank 0, $C000-$FFFF = bank 1

        For other mappers with an explicit bank argument, map accordingly.
        Returns None if address is not in PRG-ROM range.
        """
        if cpu_addr < 0x8000:
            return None

        if self.mapper in (0, 99):
            # Mapper 0 (NROM) and Mapper 99 (VS. System): linear 32KB mapping.
            # 1 PRG bank (16 KB): mirror at both $8000 and $C000.
            # 2 PRG banks (32 KB): flat $8000-$FFFF -> offset 0x0000-0x7FFF.
            if self.prg_banks == 1:
                return (cpu_addr - 0x8000) % 0x4000
            else:
                return cpu_addr - 0x8000
        else:
            # Generic: if bank given, use it directly
            if bank is not None:
                bank_offset = bank * 0x4000
                in_bank     = cpu_addr - 0x8000
                return bank_offset + (in_bank % 0x4000)
            # Fallback: treat like 32KB linear
            return cpu_addr - 0x8000

    def info(self):
        lines = [
            f"ROM: {ROM_FILE}",
            f"PRG-ROM: {self.prg_banks} x 16 KB = {len(self.prg)} bytes",
            f"CHR-ROM: {self.chr_banks} x  8 KB = {len(self.chr)} bytes",
            f"Mapper:  {self.mapper}",
            f"Mirror:  {self.mirroring}   VS-System: {self.vs_system}",
            f"NMI:   ${self.vec_nmi:04X}",
            f"RESET: ${self.vec_reset:04X}",
            f"IRQ:   ${self.vec_irq:04X}",
        ]
        return '\n'.join(lines)

# ---------------------------------------------------------------------------
# Knowledge file loaders
# ---------------------------------------------------------------------------

def load_labels(path):
    """Return dict: (bank, addr_int) -> name.  bank=None means any bank."""
    labels = {}
    if not os.path.exists(path):
        return labels
    with open(path, newline='') as f:
        for row in csv.reader(f):
            if not row or row[0].startswith('#'):
                continue
            if len(row) < 3:
                continue
            bank_s, addr_s, name = row[0].strip(), row[1].strip(), row[2].strip()
            try:
                bank = int(bank_s, 16) if bank_s not in ('', '*') else None
                addr = int(addr_s, 16)
                labels[(bank, addr)] = name
            except ValueError:
                pass
    return labels

def load_comments(path):
    """Return dict: (bank, addr_int) -> comment."""
    comments = {}
    if not os.path.exists(path):
        return comments
    with open(path, newline='') as f:
        for row in csv.reader(f):
            if not row or row[0].startswith('#'):
                continue
            if len(row) < 3:
                continue
            bank_s, addr_s, comment = row[0].strip(), row[1].strip(), row[2].strip()
            try:
                bank = int(bank_s, 16) if bank_s not in ('', '*') else None
                addr = int(addr_s, 16)
                comments[(bank, addr)] = comment
            except ValueError:
                pass
    return comments

def resolve_label(labels, bank, addr):
    """Look up label for (bank, addr), falling back to (None, addr)."""
    return labels.get((bank, addr)) or labels.get((None, addr))

def make_label_resolver(labels, bank):
    """Return a function addr->name suitable for format_operand."""
    def resolver(addr):
        return resolve_label(labels, bank, addr)
    return resolver

# ---------------------------------------------------------------------------
# Disassembler core
# ---------------------------------------------------------------------------

def disassemble(rom, cpu_start, bank, n_lines, labels, comments):
    """
    Disassemble `n_lines` instructions starting at CPU address `cpu_start`
    in the given PRG `bank`.

    Yields formatted strings.
    """
    addr   = cpu_start
    label_res = {a: n for (b, a), n in labels.items()
                 if b is None or b == bank}

    for _ in range(n_lines):
        file_off = rom.cpu_to_file_offset(addr, bank)
        if file_off is None or file_off >= len(rom.prg):
            yield f"  ${addr:04X}  ; <out of PRG range>"
            break

        # Label line
        lbl = resolve_label(labels, bank, addr)
        if lbl:
            yield f"\n{lbl}:"

        # Comment line
        cmt = comments.get((bank, addr)) or comments.get((None, addr))

        # Decode
        mnemonic, mode, length, cycles, operand = decode(rom.prg, file_off)

        # Bytes field
        byte_str = ' '.join(f'{b:02X}' for b in rom.prg[file_off:file_off+length])

        # Operand string
        next_addr = addr + length
        op_str = format_operand(mode, operand, next_addr, label_res)

        # Format line
        cmt_str = f'  ; {cmt}' if cmt else ''
        line = f'  ${addr:04X}  {byte_str:<8}  {mnemonic} {op_str}{cmt_str}'
        yield line

        addr += length
        if addr > 0xFFFF:
            break

# ---------------------------------------------------------------------------
# ROM info / header dump
# ---------------------------------------------------------------------------

def cmd_info(rom):
    print(rom.info())

# ---------------------------------------------------------------------------
# Argument parsing & main
# ---------------------------------------------------------------------------

def parse_addr(s):
    """Parse '$ABCD', 'ABCD', 'AB:CD' style into (bank_or_None, addr)."""
    s = s.lstrip('$')
    if ':' in s:
        b, a = s.split(':', 1)
        return int(b.lstrip('$'), 16), int(a.lstrip('$'), 16)
    return None, int(s, 16)

def main():
    args = sys.argv[1:]

    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    rom = NESRom(ROM_FILE)

    if args[0] in ('info', '--info'):
        cmd_info(rom)
        sys.exit(0)

    labels   = load_labels(LABELS_FILE)
    comments = load_comments(COMMENTS_FILE)

    bank_arg, addr = parse_addr(args[0])
    n_lines = int(args[1]) if len(args) > 1 else 30

    # Infer bank from address if not given
    if bank_arg is None:
        if rom.mapper in (0, 99):
            if rom.prg_banks == 1:
                bank_arg = 0
            else:
                bank_arg = 0 if addr < 0xC000 else 1
        else:
            bank_arg = 0

    print(f'; bank={bank_arg}  addr=${addr:04X}  lines={n_lines}  mapper={rom.mapper}')
    print()
    for line in disassemble(rom, addr, bank_arg, n_lines, labels, comments):
        print(line)

if __name__ == '__main__':
    main()
