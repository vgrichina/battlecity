
with open("VS. Battle City (1985)(Namco).nes", "rb") as f:
    rom = f.read()

CHR_BASE = 0x8010
for bank in range(4):
    bank_off = CHR_BASE + bank * 0x1000
    blanks = []
    for i in range(256):
        tile_data = rom[bank_off + i*16 : bank_off + (i+1)*16]
        if all(b == 0 for b in tile_data):
            blanks.append(i)
    print(f"Bank {bank} blank tiles: {blanks}")
