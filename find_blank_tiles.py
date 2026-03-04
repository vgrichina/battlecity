
import sys

ROM_PATH = "VS. Battle City (1985)(Namco).nes"

def decode_tile(rom, file_offset, tile_idx):
    off = file_offset + tile_idx * 16
    pixels = []
    raw = rom[off:off+16]
    for row in range(8):
        p0 = raw[row]
        p1 = raw[row + 8]
        for bit in range(7, -1, -1):
            c = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            pixels.append(c)
    return pixels, raw

with open(ROM_PATH, "rb") as f:
    rom = f.read()

bank1_off = 0x9010
bank3_off = 0xB010

blank_bank1 = []
blank_bank3 = []

for i in range(256):
    px1, _ = decode_tile(rom, bank1_off, i)
    if all(p == 0 for p in px1):
        blank_bank1.append(i)
        
    px3, _ = decode_tile(rom, bank3_off, i)
    if all(p == 0 for p in px3):
        blank_bank3.append(i)

common_blank = set(blank_bank1).intersection(set(blank_bank3))
print(f"Blank in Bank 1: {blank_bank1}")
print(f"Blank in Bank 3: {blank_bank3}")
print(f"Commonly blank: {common_blank}")
