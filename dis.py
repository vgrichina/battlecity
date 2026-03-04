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
    """Return dict: (bank, addr_int) -> (name, dtype).  bank=None means any bank.
    dtype defaults to 'code' when the 4th column is absent or empty."""
    labels = {}
    if not os.path.exists(path):
        return labels
    with open(path, newline='') as f:
        for row in csv.reader(f):
            if not row or row[0].startswith('#'):
                continue
            if len(row) < 3:
                continue
            bank_s = row[0].strip()
            addr_s = row[1].strip()
            name   = row[2].strip()
            dtype  = row[3].strip() if len(row) >= 4 and row[3].strip() else 'code'
            try:
                bank = int(bank_s, 16) if bank_s not in ('', '*') else None
                addr = int(addr_s, 16)
                labels[(bank, addr)] = (name, dtype)
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
    """Look up (name, dtype) for (bank, addr), falling back to (None, addr). Returns (name, dtype) or None."""
    return labels.get((bank, addr)) or labels.get((None, addr))

def resolve_name(labels, bank, addr):
    """Return just the label name string, or None."""
    entry = resolve_label(labels, bank, addr)
    return entry[0] if entry else None

def make_label_resolver(labels, bank):
    """Return a function addr->name suitable for format_operand."""
    def resolver(addr):
        return resolve_name(labels, bank, addr)
    return resolver

# ---------------------------------------------------------------------------
# Tile character decoder (for data/string dumps)
# ---------------------------------------------------------------------------

def decode_tile_char(b):
    """Map a Battle City BG tile index to a printable character for display."""
    if b == 0xFF: return '↵'
    if b in (0x20, 0x6B): return ' '   # space / blank spacer tile
    if 0x30 <= b <= 0x39: return chr(b) # digits 0-9
    if 0x41 <= b <= 0x5A: return chr(b) # letters A-Z
    if b == 0x5B: return '['
    if b == 0x5D: return ']'
    if b == 0x5E: return '①'           # P1 icon
    if b == 0x5F: return '②'           # P2 icon
    return f'\\{b:02X}'

# ---------------------------------------------------------------------------
# Data dump modes
# ---------------------------------------------------------------------------

def dump_data(rom, cpu_start, bank, n_lines, dtype, labels, comments):
    """
    Yield formatted dump lines for a data region.
    n_lines controls how many rows/entries to output.

    Formats by dtype:
      data/string    — one FF-terminated tile string per line, decoded
      data/ptr       — one 2-byte LE pointer per line, label-resolved
      data/table:N   — N bytes per entry, one entry per line with [idx] annotation
      data/table     — 8 bytes per row, raw hex (no entry width known)
      data/seq       — 8 bytes per row, raw hex (music/sound sequences)
      data (etc.)    — 8 bytes per row, raw hex
    """
    addr = cpu_start

    if dtype == 'data/string':
        for _ in range(n_lines):
            file_off = rom.cpu_to_file_offset(addr, bank)
            if file_off is None or file_off >= len(rom.prg):
                break
            row_addr = addr
            raw = []
            while file_off < len(rom.prg):
                b = rom.prg[file_off]
                raw.append(b)
                file_off += 1
                addr += 1
                if b == 0xFF:
                    break
            hex_part  = ' '.join(f'{b:02X}' for b in raw)
            char_part = ''.join(decode_tile_char(b) for b in raw)
            cmt = comments.get((bank, row_addr)) or comments.get((None, row_addr))
            cmt_str = f'  ; {cmt}' if cmt else ''
            yield f'  ${row_addr:04X}  {hex_part:<36}  "{char_part}"{cmt_str}'

    elif dtype == 'data/ptr':
        for idx in range(n_lines):
            file_off = rom.cpu_to_file_offset(addr, bank)
            if file_off is None or file_off + 1 >= len(rom.prg):
                break
            lo  = rom.prg[file_off]
            hi  = rom.prg[file_off + 1]
            ptr = (hi << 8) | lo
            tgt = resolve_name(labels, bank, ptr) or f'${ptr:04X}'
            cmt = comments.get((bank, addr)) or comments.get((None, addr))
            cmt_str = f'  ; {cmt}' if cmt else ''
            yield f'  ${addr:04X}  {lo:02X} {hi:02X}  [{idx:3d}] .ptr {tgt}{cmt_str}'
            addr += 2

    elif dtype.startswith('data/table:'):
        # Subtype: entry width in bytes, one entry per line with index
        try:
            entry_width = int(dtype.split(':')[1])
        except (IndexError, ValueError):
            entry_width = 1
        for idx in range(n_lines):
            file_off = rom.cpu_to_file_offset(addr, bank)
            if file_off is None or file_off >= len(rom.prg):
                break
            row = rom.prg[file_off:file_off + entry_width]
            if not row:
                break
            hex_part = ' '.join(f'{b:02X}' for b in row)
            # Scalar annotation for 1- and 2-byte entries
            if entry_width == 1:
                scalar = f'= {row[0]:3d} / ${row[0]:02X}'
            elif entry_width == 2:
                val = row[0] | (row[1] << 8)
                lbl_name = resolve_name(labels, bank, val)
                scalar = lbl_name if lbl_name else f'= {val:5d} / ${val:04X}'
            else:
                scalar = ''
            cmt = comments.get((bank, addr)) or comments.get((None, addr))
            cmt_str = f'  ; {cmt}' if cmt else (f'  ; {scalar}' if scalar else '')
            yield f'  ${addr:04X}  {hex_part:<{entry_width*3}}  [{idx:3d}]{cmt_str}'
            addr += entry_width

    else:
        # Generic hex dump: 8 bytes per row
        cols = 8
        for _ in range(n_lines):
            file_off = rom.cpu_to_file_offset(addr, bank)
            if file_off is None or file_off >= len(rom.prg):
                break
            row = rom.prg[file_off:file_off + cols]
            if not row:
                break
            hex_part = ' '.join(f'{b:02X}' for b in row)
            cmt = comments.get((bank, addr)) or comments.get((None, addr))
            cmt_str = f'  ; {cmt}' if cmt else ''
            yield f'  ${addr:04X}  {hex_part:<32}{cmt_str}'
            addr += len(row)

# ---------------------------------------------------------------------------
# Disassembler core
# ---------------------------------------------------------------------------

def disassemble(rom, cpu_start, bank, n_lines, labels, comments):
    """
    Disassemble `n_lines` instructions starting at CPU address `cpu_start`.
    If the start address carries a non-code data label, delegates to dump_data()
    with the appropriate format instead of disassembling.
    """
    # Check if start address is a data label — if so, dump instead of disassemble
    start_lbl = resolve_label(labels, bank, cpu_start)
    if start_lbl and start_lbl[1] != 'code':
        name, dtype = start_lbl
        yield f'\n{name}:  ; [{dtype}]'
        yield from dump_data(rom, cpu_start, bank, n_lines, dtype, labels, comments)
        return

    addr      = cpu_start
    label_res = {a: entry[0] for (b, a), entry in labels.items()
                 if b is None or b == bank}

    for lines_done in range(n_lines):
        file_off = rom.cpu_to_file_offset(addr, bank)
        if file_off is None or file_off >= len(rom.prg):
            yield f"  ${addr:04X}  ; <out of PRG range>"
            break

        # Label line (mid-stream: switch to data dump for non-code labels)
        lbl = resolve_label(labels, bank, addr)
        if lbl:
            name, dtype = lbl
            if dtype != 'code':
                yield f"\n{name}:  ; [{dtype}]"
                yield from dump_data(rom, addr, bank, n_lines - lines_done, dtype, labels, comments)
                return
            yield f"\n{name}:"

        # Comment
        cmt = comments.get((bank, addr)) or comments.get((None, addr))

        # Decode instruction
        mnemonic, mode, length, cycles, operand = decode(rom.prg, file_off)

        byte_str = ' '.join(f'{b:02X}' for b in rom.prg[file_off:file_off+length])
        next_addr = addr + length
        op_str    = format_operand(mode, operand, next_addr, label_res)

        cmt_str = f'  ; {cmt}' if cmt else ''
        yield f'  ${addr:04X}  {byte_str:<8}  {mnemonic} {op_str}{cmt_str}'

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
