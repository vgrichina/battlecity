#!/usr/bin/env python3
"""Dump raw bytes from ROM at a given CPU address."""
import sys

ROM_PATH = "battlecity_famicom.nes"
HEADER_SIZE = 16

def cpu_to_file(addr):
    """Convert CPU address to file offset (mapper 0, 16KB PRG mirrored at $8000 and $C000)."""
    base = 0xC000 if addr >= 0xC000 else 0x8000
    return addr - base + HEADER_SIZE

def main():
    addr = int(sys.argv[1], 16)
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 16
    offset = cpu_to_file(addr)
    with open(ROM_PATH, "rb") as f:
        f.seek(offset)
        data = f.read(count)
    hex_str = " ".join(f"{b:02X}" for b in data)
    dec_str = " ".join(f"{(b if b < 128 else b - 256):+d}" for b in data)
    print(f"${addr:04X}: {hex_str}")
    print(f"signed: {dec_str}")

if __name__ == "__main__":
    main()
