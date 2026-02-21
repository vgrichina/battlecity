#!/usr/bin/env python3
"""
decode_tables.py — Universal struct/table decoder for iNES ROMs.

Usage:
    python3 decode_tables.py <bank> <addr> <count> <format>
    python3 decode_tables.py <bank> <addr> <count> ptr16 [--follow]

Arguments:
    bank    PRG bank number in hex (0-based)
    addr    CPU address in hex (with or without $ prefix)
    count   Number of table entries
    format  One of:
              ptr16     2-byte little-endian pointer; resolves label if known
              u8        1 unsigned byte
              s8        1 signed byte
              u16       2-byte little-endian unsigned int
              u16be     2-byte big-endian unsigned int
              b8        1 byte shown in binary
              hex8      1 byte shown in hex (default also shows decimal)
              struct:<n>:<f,f,...>
                        n-byte struct; fields are u8/s8/u16/ptr16 comma-separated

Options:
    --follow   For ptr16 tables: also disassemble 8 lines at each target address

Examples:
    python3 decode_tables.py 1 E555 20 ptr16
    python3 decode_tables.py 1 D44A 32 u8
    python3 decode_tables.py 1 E529 8 s8
    python3 decode_tables.py 1 E555 10 ptr16 --follow
"""

import sys, os, csv, struct

ROM_FILE    = "VS. Battle City (1985)(Namco).nes"
LABELS_FILE = "labels.csv"

# ---------------------------------------------------------------------------
# ROM loader (shared with dis.py)
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
        prg_start = 16 + (512 if self.has_trainer else 0)
        prg_size  = self.prg_banks * 16384
        self.prg  = raw[prg_start : prg_start + prg_size]

    def cpu_to_prg(self, cpu_addr, bank=None):
        if cpu_addr < 0x8000:
            return None
        if self.mapper in (0, 99):
            if self.prg_banks == 1:
                return (cpu_addr - 0x8000) % 0x4000
            return cpu_addr - 0x8000
        if bank is not None:
            return bank * 0x4000 + (cpu_addr - 0x8000) % 0x4000
        return cpu_addr - 0x8000

    def read_byte(self, cpu_addr, bank=None):
        off = self.cpu_to_prg(cpu_addr, bank)
        if off is None or off >= len(self.prg):
            return None
        return self.prg[off]

    def read_bytes(self, cpu_addr, n, bank=None):
        off = self.cpu_to_prg(cpu_addr, bank)
        if off is None or off + n > len(self.prg):
            return None
        return self.prg[off:off+n]

# ---------------------------------------------------------------------------
# Label loader
# ---------------------------------------------------------------------------

def load_labels(path):
    labels = {}
    if not os.path.exists(path):
        return labels
    with open(path, newline='') as f:
        for row in csv.reader(f):
            if not row or row[0].startswith('#'):
                continue
            if len(row) < 3:
                continue
            b, a, n = row[0].strip(), row[1].strip(), row[2].strip()
            try:
                bank = int(b, 16) if b not in ('', '*') else None
                addr = int(a, 16)
                labels[(bank, addr)] = n
            except ValueError:
                pass
    return labels

def get_label(labels, addr, bank=None):
    return labels.get((bank, addr)) or labels.get((None, addr))

# ---------------------------------------------------------------------------
# Format decoders — each returns (size_in_bytes, formatted_string)
# ---------------------------------------------------------------------------

def fmt_u8(data, pos, _labels, _bank):
    v = data[pos]
    return 1, f'${v:02X}  ({v:3d})'

def fmt_s8(data, pos, _labels, _bank):
    v = data[pos]
    sv = v if v < 128 else v - 256
    return 1, f'${v:02X}  ({sv:+4d})'

def fmt_b8(data, pos, _labels, _bank):
    v = data[pos]
    return 1, f'{v:08b}  (${v:02X})'

def fmt_hex8(data, pos, _labels, _bank):
    v = data[pos]
    return 1, f'${v:02X}  ({v:3d})'

def fmt_u16(data, pos, _labels, _bank):
    lo, hi = data[pos], data[pos+1]
    v = lo | (hi << 8)
    return 2, f'${v:04X}  ({v:5d})'

def fmt_u16be(data, pos, _labels, _bank):
    hi, lo = data[pos], data[pos+1]
    v = (hi << 8) | lo
    return 2, f'${v:04X}  ({v:5d})'

def fmt_ptr16(data, pos, labels, bank):
    lo, hi = data[pos], data[pos+1]
    ptr = lo | (hi << 8)
    lbl = get_label(labels, ptr, bank)
    note = f'  -> {lbl}' if lbl else ''
    return 2, f'${ptr:04X}{note}'

def make_struct_fmt(size, field_names):
    """Build a compound formatter from a list of field type names."""
    field_fmts = []
    for fn in field_names:
        fn = fn.strip()
        if fn == 'u8':    field_fmts.append(('u8',  1, fmt_u8))
        elif fn == 's8':  field_fmts.append(('s8',  1, fmt_s8))
        elif fn == 'u16': field_fmts.append(('u16', 2, fmt_u16))
        elif fn == 'ptr16': field_fmts.append(('ptr16', 2, fmt_ptr16))
        else:             field_fmts.append((fn,    1, fmt_hex8))

    def _struct(data, pos, labels, bank):
        parts = []
        offset = 0
        for fname, fsize, ffmt in field_fmts:
            _, s = ffmt(data, pos + offset, labels, bank)
            parts.append(f'{fname}={s}')
            offset += fsize
        return size, '  '.join(parts)

    return _struct

def get_formatter(fmt_str):
    fmt_str = fmt_str.strip()
    if fmt_str == 'ptr16':  return fmt_ptr16
    if fmt_str == 'u8':     return fmt_u8
    if fmt_str == 's8':     return fmt_s8
    if fmt_str == 'u16':    return fmt_u16
    if fmt_str == 'u16be':  return fmt_u16be
    if fmt_str == 'b8':     return fmt_b8
    if fmt_str == 'hex8':   return fmt_hex8
    if fmt_str.startswith('struct:'):
        parts = fmt_str.split(':', 2)
        if len(parts) == 3:
            size   = int(parts[1])
            fields = parts[2].split(',')
            return make_struct_fmt(size, fields)
    raise ValueError(f"Unknown format: {fmt_str!r}")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_addr(s):
    return int(s.lstrip('$'), 16)

def entry_size(fmt_str):
    """Return entry size in bytes for uniform formats."""
    if fmt_str in ('u8', 's8', 'b8', 'hex8'):  return 1
    if fmt_str in ('ptr16', 'u16', 'u16be'):    return 2
    if fmt_str.startswith('struct:'):
        return int(fmt_str.split(':')[1])
    return 1

def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    if len(args) < 4:
        print("Usage: python3 decode_tables.py <bank> <addr> <count> <format> [--follow]")
        sys.exit(1)

    bank_n  = int(args[0], 16)
    addr    = parse_addr(args[1])
    count   = int(args[2])
    fmt_str = args[3]
    follow  = '--follow' in args

    rom    = NESRom(ROM_FILE)
    labels = load_labels(LABELS_FILE)
    fmt_fn = get_formatter(fmt_str)
    esize  = entry_size(fmt_str)

    print(f'; Table at bank={bank_n} ${addr:04X}  count={count}  format={fmt_str}')
    print()

    cur = addr
    for i in range(count):
        raw = rom.read_bytes(cur, esize + 1, bank_n)   # +1 guard for ptr16
        if raw is None or len(raw) < esize:
            print(f'  [{i:3d}] ${cur:04X}  <out of range>')
            break

        size_used, text = fmt_fn(raw, 0, labels, bank_n)
        print(f'  [{i:3d}] ${cur:04X}  {text}')

        # --follow: disassemble target for ptr16
        if follow and fmt_str == 'ptr16':
            target = raw[0] | (raw[1] << 8)
            try:
                from dis import NESRom as _NR, load_labels as _ll, load_comments as _lc, disassemble
                _rom      = _NR(ROM_FILE)
                _labels   = _ll(LABELS_FILE)
                _comments = _lc("comments.csv")
                print()
                for line in disassemble(_rom, target, bank_n, 6, _labels, _comments):
                    print('      ' + line)
                print()
            except Exception as e:
                print(f'      [disasm error: {e}]')

        cur += size_used

    print()
    print(f'; End of table  (${cur:04X})')

if __name__ == '__main__':
    main()
