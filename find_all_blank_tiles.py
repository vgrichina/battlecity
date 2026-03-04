
with open("VS. Battle City (1985)(Namco).nes", "rb") as f:
    rom = f.read()

pos = 0
blank_tile = b"\x00" * 16
while True:
    pos = rom.find(blank_tile, pos)
    if pos == -1: break
    print(f"Blank tile found at offset {pos:#x}")
    pos += 16
