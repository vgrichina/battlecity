
with open("VS. Battle City (1985)(Namco).nes", "rb") as f:
    header = f.read(16)
    print(f"PRG banks: {header[4]}")
    print(f"CHR banks: {header[5]}")
    print(f"Mapper: {((header[6] >> 4) & 0x0F) | (header[7] & 0xF0)}")
