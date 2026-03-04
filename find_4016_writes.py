
with open("VS. Battle City (1985)(Namco).nes", "rb") as f:
    rom = f.read()

# Search for any instruction writing to $4016
# 8D 16 40 -> STA $4016
# 8E 16 40 -> STX $4016
# 8C 16 40 -> STY $4016
# 9D 16 40 -> STA $4016,X
# 9E 16 40 -> STX $4016,Y  (illegal but check anyway)

targets = [b"\x8D\x16\x40", b"\x8E\x16\x40", b"\x8C\x16\x40", b"\x9D\x16\x40"]
for target in targets:
    pos = 0
    while True:
        pos = rom.find(target, pos)
        if pos == -1: break
        cpu_addr = pos - 16 + 0x8000
        print(f"Found {target.hex()} at file offset {pos:#x} (CPU {cpu_addr:#x})")
        pos += 1
