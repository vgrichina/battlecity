#!/usr/bin/env python3
"""Dump ROM string data for title screen text elements."""
import sys

rom = open('battlecity.nes', 'rb').read()

# Bank 3 = $C000-$FFFF, file offset = addr - 0xC000 + 0x4010
addrs = [
    ('D145', 0xD145, 'copyright line 1?'),
    ('D15B', 0xD15B, 'P1 score label'),
    ('D15E', 0xD15E, 'P2 score label'),
    ('D167', 0xD167, 'HI score label'),
    ('D1E7', 0xD1E7, 'menu line 1?'),
    ('D1FE', 0xD1FE, 'menu line 2?'),
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
    off = addr - 0xC000 + 0x4010
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
