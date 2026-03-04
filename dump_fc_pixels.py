with open("VS. Battle City (1985)(Namco).nes", "rb") as f:
    rom = f.read()

def dump_pixels(data):
    for y in range(8):
        p0 = data[y]
        p1 = data[y+8]
        line = ""
        for x in range(7, -1, -1):
            c = ((p0 >> x) & 1) | (((p1 >> x) & 1) << 1)
            line += str(c)
        print(line)

print("Bank 0 PT1 (0x9010) Tile $FC:")
dump_pixels(rom[0x9010 + 0xFC*16 : 0x9010 + 0xFD*16])

print("\nBank 1 PT1 (0xB010) Tile $FC:")
dump_pixels(rom[0xB010 + 0xFC*16 : 0xB010 + 0xFD*16])
