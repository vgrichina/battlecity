import sys

ROM_PATH = "VS. Battle City (1985)(Namco).nes"
SHADES = [' ', '.', 'o', 'X']

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

def dump_tile(rom, file_offset, tile_idx, label):
    pixels, raw = decode_tile(rom, file_offset, tile_idx)
    nonzero = sum(1 for p in pixels if p != 0)
    print(f"\nTile {tile_idx:02X} - {label} ({nonzero} non-zero)")
    for row in range(8):
        line = "".join(SHADES[p]*2 for p in pixels[row*8:(row+1)*8])
        print(f"  {line}")

with open(ROM_PATH, "rb") as f:
    rom = f.read()

# Bank 1 BG (PT1 default)
print("--- BANK 1 (Default BG) ---")
dump_tile(rom, 0x9010, 0x20, "PT1")
dump_tile(rom, 0x9010, 0x10, "PT1")
dump_tile(rom, 0x9010, 0x00, "PT1")
dump_tile(rom, 0x9010, 0xFC, "PT1")

# Bank 3 BG (PT1 alt)
print("\n--- BANK 3 (Alt BG) ---")
dump_tile(rom, 0xB010, 0x20, "PT1")
dump_tile(rom, 0xB010, 0x10, "PT1")
dump_tile(rom, 0xB010, 0x00, "PT1")
dump_tile(rom, 0xB010, 0xFC, "PT1")
