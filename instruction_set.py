"""
6502 / 2A03 instruction set database.

Each entry in OPCODES is keyed by the opcode byte (0x00-0xFF) and contains:
    mnemonic  : str   — instruction name
    mode      : str   — addressing mode abbreviation
    length    : int   — total instruction length in bytes (opcode + operands)
    cycles    : int   — base cycle count (may vary with page-cross / branch-taken)

Addressing mode abbreviations:
    IMP  Implied           (no operand)
    ACC  Accumulator       (operand is A)
    IMM  Immediate         #nn
    ZPG  Zero Page         nn
    ZPX  Zero Page, X      nn,X
    ZPY  Zero Page, Y      nn,Y
    REL  Relative          (branch offset)
    ABS  Absolute          nnnn
    ABX  Absolute, X       nnnn,X
    ABY  Absolute, Y       nnnn,Y
    IND  Indirect          (nnnn)   — JMP only
    IZX  (Indirect, X)    (nn,X)
    IZY  (Indirect), Y    (nn),Y
    ---  Illegal/unknown
"""

OPCODES = {
    # ---- BRK / RTI / RTS / RTI ------------------------------------------
    0x00: ('BRK', 'IMP', 1, 7),
    0x40: ('RTI', 'IMP', 1, 6),
    0x60: ('RTS', 'IMP', 1, 6),

    # ---- NOP ----------------------------------------------------------------
    0xEA: ('NOP', 'IMP', 1, 2),

    # ---- Transfer -----------------------------------------------------------
    0xAA: ('TAX', 'IMP', 1, 2),
    0x8A: ('TXA', 'IMP', 1, 2),
    0xA8: ('TAY', 'IMP', 1, 2),
    0x98: ('TYA', 'IMP', 1, 2),
    0xBA: ('TSX', 'IMP', 1, 2),
    0x9A: ('TXS', 'IMP', 1, 2),

    # ---- Stack --------------------------------------------------------------
    0x48: ('PHA', 'IMP', 1, 3),
    0x68: ('PLA', 'IMP', 1, 4),
    0x08: ('PHP', 'IMP', 1, 3),
    0x28: ('PLP', 'IMP', 1, 4),

    # ---- Flag operations ----------------------------------------------------
    0x18: ('CLC', 'IMP', 1, 2),
    0x38: ('SEC', 'IMP', 1, 2),
    0x58: ('CLI', 'IMP', 1, 2),
    0x78: ('SEI', 'IMP', 1, 2),
    0xB8: ('CLV', 'IMP', 1, 2),
    0xD8: ('CLD', 'IMP', 1, 2),
    0xF8: ('SED', 'IMP', 1, 2),

    # ---- LDA ----------------------------------------------------------------
    0xA9: ('LDA', 'IMM', 2, 2),
    0xA5: ('LDA', 'ZPG', 2, 3),
    0xB5: ('LDA', 'ZPX', 2, 4),
    0xAD: ('LDA', 'ABS', 3, 4),
    0xBD: ('LDA', 'ABX', 3, 4),
    0xB9: ('LDA', 'ABY', 3, 4),
    0xA1: ('LDA', 'IZX', 2, 6),
    0xB1: ('LDA', 'IZY', 2, 5),

    # ---- LDX ----------------------------------------------------------------
    0xA2: ('LDX', 'IMM', 2, 2),
    0xA6: ('LDX', 'ZPG', 2, 3),
    0xB6: ('LDX', 'ZPY', 2, 4),
    0xAE: ('LDX', 'ABS', 3, 4),
    0xBE: ('LDX', 'ABY', 3, 4),

    # ---- LDY ----------------------------------------------------------------
    0xA0: ('LDY', 'IMM', 2, 2),
    0xA4: ('LDY', 'ZPG', 2, 3),
    0xB4: ('LDY', 'ZPX', 2, 4),
    0xAC: ('LDY', 'ABS', 3, 4),
    0xBC: ('LDY', 'ABX', 3, 4),

    # ---- STA ----------------------------------------------------------------
    0x85: ('STA', 'ZPG', 2, 3),
    0x95: ('STA', 'ZPX', 2, 4),
    0x8D: ('STA', 'ABS', 3, 4),
    0x9D: ('STA', 'ABX', 3, 5),
    0x99: ('STA', 'ABY', 3, 5),
    0x81: ('STA', 'IZX', 2, 6),
    0x91: ('STA', 'IZY', 2, 6),

    # ---- STX ----------------------------------------------------------------
    0x86: ('STX', 'ZPG', 2, 3),
    0x96: ('STX', 'ZPY', 2, 4),
    0x8E: ('STX', 'ABS', 3, 4),

    # ---- STY ----------------------------------------------------------------
    0x84: ('STY', 'ZPG', 2, 3),
    0x94: ('STY', 'ZPX', 2, 4),
    0x8C: ('STY', 'ABS', 3, 4),

    # ---- ADC ----------------------------------------------------------------
    0x69: ('ADC', 'IMM', 2, 2),
    0x65: ('ADC', 'ZPG', 2, 3),
    0x75: ('ADC', 'ZPX', 2, 4),
    0x6D: ('ADC', 'ABS', 3, 4),
    0x7D: ('ADC', 'ABX', 3, 4),
    0x79: ('ADC', 'ABY', 3, 4),
    0x61: ('ADC', 'IZX', 2, 6),
    0x71: ('ADC', 'IZY', 2, 5),

    # ---- SBC ----------------------------------------------------------------
    0xE9: ('SBC', 'IMM', 2, 2),
    0xE5: ('SBC', 'ZPG', 2, 3),
    0xF5: ('SBC', 'ZPX', 2, 4),
    0xED: ('SBC', 'ABS', 3, 4),
    0xFD: ('SBC', 'ABX', 3, 4),
    0xF9: ('SBC', 'ABY', 3, 4),
    0xE1: ('SBC', 'IZX', 2, 6),
    0xF1: ('SBC', 'IZY', 2, 5),

    # ---- AND ----------------------------------------------------------------
    0x29: ('AND', 'IMM', 2, 2),
    0x25: ('AND', 'ZPG', 2, 3),
    0x35: ('AND', 'ZPX', 2, 4),
    0x2D: ('AND', 'ABS', 3, 4),
    0x3D: ('AND', 'ABX', 3, 4),
    0x39: ('AND', 'ABY', 3, 4),
    0x21: ('AND', 'IZX', 2, 6),
    0x31: ('AND', 'IZY', 2, 5),

    # ---- ORA ----------------------------------------------------------------
    0x09: ('ORA', 'IMM', 2, 2),
    0x05: ('ORA', 'ZPG', 2, 3),
    0x15: ('ORA', 'ZPX', 2, 4),
    0x0D: ('ORA', 'ABS', 3, 4),
    0x1D: ('ORA', 'ABX', 3, 4),
    0x19: ('ORA', 'ABY', 3, 4),
    0x01: ('ORA', 'IZX', 2, 6),
    0x11: ('ORA', 'IZY', 2, 5),

    # ---- EOR ----------------------------------------------------------------
    0x49: ('EOR', 'IMM', 2, 2),
    0x45: ('EOR', 'ZPG', 2, 3),
    0x55: ('EOR', 'ZPX', 2, 4),
    0x4D: ('EOR', 'ABS', 3, 4),
    0x5D: ('EOR', 'ABX', 3, 4),
    0x59: ('EOR', 'ABY', 3, 4),
    0x41: ('EOR', 'IZX', 2, 6),
    0x51: ('EOR', 'IZY', 2, 5),

    # ---- CMP ----------------------------------------------------------------
    0xC9: ('CMP', 'IMM', 2, 2),
    0xC5: ('CMP', 'ZPG', 2, 3),
    0xD5: ('CMP', 'ZPX', 2, 4),
    0xCD: ('CMP', 'ABS', 3, 4),
    0xDD: ('CMP', 'ABX', 3, 4),
    0xD9: ('CMP', 'ABY', 3, 4),
    0xC1: ('CMP', 'IZX', 2, 6),
    0xD1: ('CMP', 'IZY', 2, 5),

    # ---- CPX ----------------------------------------------------------------
    0xE0: ('CPX', 'IMM', 2, 2),
    0xE4: ('CPX', 'ZPG', 2, 3),
    0xEC: ('CPX', 'ABS', 3, 4),

    # ---- CPY ----------------------------------------------------------------
    0xC0: ('CPY', 'IMM', 2, 2),
    0xC4: ('CPY', 'ZPG', 2, 3),
    0xCC: ('CPY', 'ABS', 3, 4),

    # ---- BIT ----------------------------------------------------------------
    0x24: ('BIT', 'ZPG', 2, 3),
    0x2C: ('BIT', 'ABS', 3, 4),

    # ---- INC / DEC ----------------------------------------------------------
    0xE6: ('INC', 'ZPG', 2, 5),
    0xF6: ('INC', 'ZPX', 2, 6),
    0xEE: ('INC', 'ABS', 3, 6),
    0xFE: ('INC', 'ABX', 3, 7),
    0xC6: ('DEC', 'ZPG', 2, 5),
    0xD6: ('DEC', 'ZPX', 2, 6),
    0xCE: ('DEC', 'ABS', 3, 6),
    0xDE: ('DEC', 'ABX', 3, 7),
    0xE8: ('INX', 'IMP', 1, 2),
    0xCA: ('DEX', 'IMP', 1, 2),
    0xC8: ('INY', 'IMP', 1, 2),
    0x88: ('DEY', 'IMP', 1, 2),

    # ---- Shift / rotate -----------------------------------------------------
    0x0A: ('ASL', 'ACC', 1, 2),
    0x06: ('ASL', 'ZPG', 2, 5),
    0x16: ('ASL', 'ZPX', 2, 6),
    0x0E: ('ASL', 'ABS', 3, 6),
    0x1E: ('ASL', 'ABX', 3, 7),
    0x4A: ('LSR', 'ACC', 1, 2),
    0x46: ('LSR', 'ZPG', 2, 5),
    0x56: ('LSR', 'ZPX', 2, 6),
    0x4E: ('LSR', 'ABS', 3, 6),
    0x5E: ('LSR', 'ABX', 3, 7),
    0x2A: ('ROL', 'ACC', 1, 2),
    0x26: ('ROL', 'ZPG', 2, 5),
    0x36: ('ROL', 'ZPX', 2, 6),
    0x2E: ('ROL', 'ABS', 3, 6),
    0x3E: ('ROL', 'ABX', 3, 7),
    0x6A: ('ROR', 'ACC', 1, 2),
    0x66: ('ROR', 'ZPG', 2, 5),
    0x76: ('ROR', 'ZPX', 2, 6),
    0x6E: ('ROR', 'ABS', 3, 6),
    0x7E: ('ROR', 'ABX', 3, 7),

    # ---- Jump / call --------------------------------------------------------
    0x4C: ('JMP', 'ABS', 3, 3),
    0x6C: ('JMP', 'IND', 3, 5),
    0x20: ('JSR', 'ABS', 3, 6),

    # ---- Branches -----------------------------------------------------------
    0x90: ('BCC', 'REL', 2, 2),
    0xB0: ('BCS', 'REL', 2, 2),
    0xF0: ('BEQ', 'REL', 2, 2),
    0xD0: ('BNE', 'REL', 2, 2),
    0x30: ('BMI', 'REL', 2, 2),
    0x10: ('BPL', 'REL', 2, 2),
    0x70: ('BVS', 'REL', 2, 2),
    0x50: ('BVC', 'REL', 2, 2),

    # ---- Illegal opcodes (commonly used) ------------------------------------
    0x1A: ('NOP', 'IMP', 1, 2),  # unofficial NOP
    0x3A: ('NOP', 'IMP', 1, 2),
    0x5A: ('NOP', 'IMP', 1, 2),
    0x7A: ('NOP', 'IMP', 1, 2),
    0xDA: ('NOP', 'IMP', 1, 2),
    0xFA: ('NOP', 'IMP', 1, 2),
    0x80: ('NOP', 'IMM', 2, 2),  # unofficial SKB
    0x82: ('NOP', 'IMM', 2, 2),
    0x89: ('NOP', 'IMM', 2, 2),
    0xC2: ('NOP', 'IMM', 2, 2),
    0xE2: ('NOP', 'IMM', 2, 2),
    0x04: ('NOP', 'ZPG', 2, 3),  # unofficial SKB
    0x44: ('NOP', 'ZPG', 2, 3),
    0x64: ('NOP', 'ZPG', 2, 3),
    0x14: ('NOP', 'ZPX', 2, 4),
    0x34: ('NOP', 'ZPX', 2, 4),
    0x54: ('NOP', 'ZPX', 2, 4),
    0x74: ('NOP', 'ZPX', 2, 4),
    0xD4: ('NOP', 'ZPX', 2, 4),
    0xF4: ('NOP', 'ZPX', 2, 4),
    0x0C: ('NOP', 'ABS', 3, 4),  # unofficial IGN
    0x1C: ('NOP', 'ABX', 3, 4),
    0x3C: ('NOP', 'ABX', 3, 4),
    0x5C: ('NOP', 'ABX', 3, 4),
    0x7C: ('NOP', 'ABX', 3, 4),
    0xDC: ('NOP', 'ABX', 3, 4),
    0xFC: ('NOP', 'ABX', 3, 4),
    # LAX
    0xA7: ('LAX', 'ZPG', 2, 3),
    0xB7: ('LAX', 'ZPY', 2, 4),
    0xAF: ('LAX', 'ABS', 3, 4),
    0xBF: ('LAX', 'ABY', 3, 4),
    0xA3: ('LAX', 'IZX', 2, 6),
    0xB3: ('LAX', 'IZY', 2, 5),
    # SAX
    0x87: ('SAX', 'ZPG', 2, 3),
    0x97: ('SAX', 'ZPY', 2, 4),
    0x8F: ('SAX', 'ABS', 3, 4),
    0x83: ('SAX', 'IZX', 2, 6),
    # DCP (DEC + CMP)
    0xC7: ('DCP', 'ZPG', 2, 5),
    0xD7: ('DCP', 'ZPX', 2, 6),
    0xCF: ('DCP', 'ABS', 3, 6),
    0xDF: ('DCP', 'ABX', 3, 7),
    0xDB: ('DCP', 'ABY', 3, 7),
    0xC3: ('DCP', 'IZX', 2, 8),
    0xD3: ('DCP', 'IZY', 2, 8),
    # ISC (INC + SBC)
    0xE7: ('ISC', 'ZPG', 2, 5),
    0xF7: ('ISC', 'ZPX', 2, 6),
    0xEF: ('ISC', 'ABS', 3, 6),
    0xFF: ('ISC', 'ABX', 3, 7),
    0xFB: ('ISC', 'ABY', 3, 7),
    0xE3: ('ISC', 'IZX', 2, 8),
    0xF3: ('ISC', 'IZY', 2, 8),
    # SLO (ASL + ORA)
    0x07: ('SLO', 'ZPG', 2, 5),
    0x17: ('SLO', 'ZPX', 2, 6),
    0x0F: ('SLO', 'ABS', 3, 6),
    0x1F: ('SLO', 'ABX', 3, 7),
    0x1B: ('SLO', 'ABY', 3, 7),
    0x03: ('SLO', 'IZX', 2, 8),
    0x13: ('SLO', 'IZY', 2, 8),
    # RLA (ROL + AND)
    0x27: ('RLA', 'ZPG', 2, 5),
    0x37: ('RLA', 'ZPX', 2, 6),
    0x2F: ('RLA', 'ABS', 3, 6),
    0x3F: ('RLA', 'ABX', 3, 7),
    0x3B: ('RLA', 'ABY', 3, 7),
    0x23: ('RLA', 'IZX', 2, 8),
    0x33: ('RLA', 'IZY', 2, 8),
    # SRE (LSR + EOR)
    0x47: ('SRE', 'ZPG', 2, 5),
    0x57: ('SRE', 'ZPX', 2, 6),
    0x4F: ('SRE', 'ABS', 3, 6),
    0x5F: ('SRE', 'ABX', 3, 7),
    0x5B: ('SRE', 'ABY', 3, 7),
    0x43: ('SRE', 'IZX', 2, 8),
    0x53: ('SRE', 'IZY', 2, 8),
    # RRA (ROR + ADC)
    0x67: ('RRA', 'ZPG', 2, 5),
    0x77: ('RRA', 'ZPX', 2, 6),
    0x6F: ('RRA', 'ABS', 3, 6),
    0x7F: ('RRA', 'ABX', 3, 7),
    0x7B: ('RRA', 'ABY', 3, 7),
    0x63: ('RRA', 'IZX', 2, 8),
    0x73: ('RRA', 'IZY', 2, 8),
}

# Fill remaining opcodes as illegal/unknown
for _op in range(0x100):
    if _op not in OPCODES:
        OPCODES[_op] = ('???', '---', 1, 0)


def decode(data, offset):
    """
    Decode one instruction from `data` starting at `offset`.

    Returns (mnemonic, mode, length, cycles, operand_bytes)
    where operand_bytes is a list of 0–2 bytes.
    """
    op = data[offset]
    mnemonic, mode, length, cycles = OPCODES[op]
    operand = list(data[offset + 1 : offset + length])
    return mnemonic, mode, length, cycles, operand


def format_operand(mode, operand, pc, labels=None):
    """
    Format the operand portion of an instruction for display.

    `pc` is the address of the *next* instruction (used for REL branches).
    `labels` is an optional dict mapping address -> name.
    """
    def lbl(addr):
        if labels and addr in labels:
            return labels[addr]
        return f'${addr:04X}'

    if mode == 'IMP' or mode == 'ACC':
        return ''
    if mode == 'IMM':
        return f'#${operand[0]:02X}'
    if mode == 'ZPG':
        return f'${operand[0]:02X}'
    if mode == 'ZPX':
        return f'${operand[0]:02X},X'
    if mode == 'ZPY':
        return f'${operand[0]:02X},Y'
    if mode == 'REL':
        offset = operand[0] if operand[0] < 128 else operand[0] - 256
        target = pc + offset
        return lbl(target)
    if mode == 'ABS':
        addr = operand[0] | (operand[1] << 8)
        return lbl(addr)
    if mode == 'ABX':
        addr = operand[0] | (operand[1] << 8)
        return f'{lbl(addr)},X'
    if mode == 'ABY':
        addr = operand[0] | (operand[1] << 8)
        return f'{lbl(addr)},Y'
    if mode == 'IND':
        addr = operand[0] | (operand[1] << 8)
        return f'({lbl(addr)})'
    if mode == 'IZX':
        return f'(${operand[0]:02X},X)'
    if mode == 'IZY':
        return f'(${operand[0]:02X}),Y'
    return ''


if __name__ == '__main__':
    # Self-test: print coverage
    legal   = sum(1 for v in OPCODES.values() if v[0] != '???')
    illegal = sum(1 for v in OPCODES.values() if v[0] == '???')
    print(f'6502 opcode table: {legal} known, {illegal} unknown/illegal slots')
