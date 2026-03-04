#!/usr/bin/env python3
"""Dump ROM string data for title screen text elements."""
import sys

rom = open('battlecity_famicom.nes', 'rb').read()

# Famicom: $C000-$FFFF → file offset = addr - 0xC000 + 0x0010 (header=16, PRG=16KB)
# Also: $8000-$BFFF → same physical bytes (mirror) → addr - 0x8000 + 0x0010
addrs = [
    ('D280', 0xD280, 'title screen strings start'),
    ('D299', 0xD299, '"BATTLE" sprite string'),
    ('D2A0', 0xD2A0, '"CITY" sprite string'),
    ('D2C6', 0xD2C6, '"1 PLAYER" menu option'),
    ('D2CF', 0xD2CF, '"2 PLAYERS" menu option'),
    ('D2EB', 0xD2EB, '"CONSTRUCTION" menu option'),
    ('D2F8', 0xD2F8, '"@1980 1985 NAMCO LTD"'),
]

# NES Battle City tile → char mapping
def tile_to_char(b):
    if b == 0xFF: return '|END|'
    if b == 0x24: return ' '
    if 0x00 <= b <= 0x09: return str(b)
    if 0x0A <= b <= 0x23: return chr(b - 0x0A + ord('A'))
    if b == 0x51: return '\u00A9'  # copyright ©
    if b == 0x53: return '.'
    if b == 0x54: return '-'
    if b == 0x57: return '\u24C5'  # circled P
    return '[%02X]' % b

for name, addr, desc in addrs:
    base = 0xC000 if addr >= 0xC000 else 0x8000
    off = addr - base + 0x0010
    data = rom[off:off+30]
    hexstr = ' '.join('%02X' % b for b in data)
    chars = []
    for b in data:
        c = tile_to_char(b)
        chars.append(c)
        if b == 0xFF:
            break
    print('$%s (%s):' % (name, desc))
    print('  hex: %s' % hexstr)
    print('  text: "%s"' % ''.join(chars))
    print()
