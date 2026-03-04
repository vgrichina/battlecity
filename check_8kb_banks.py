
with open("VS. Battle City (1985)(Namco).nes", "rb") as f:
    rom = f.read()

def check_bank(base_off, label):
    print(f"--- {label} (base {base_off:#x}) ---")
    for i in [0, 0xFC]:
        off = base_off + i * 16
        tile = rom[off:off+16]
        nz = sum(1 for b in tile if b != 0)
        print(f"  Tile ${i:02X}: {nz} non-zero bytes")

check_bank(0x8010, "Bank 0 (PT0)")
check_bank(0x9010, "Bank 0 (PT1)")
check_bank(0xA010, "Bank 1 (PT0)")
check_bank(0xB010, "Bank 1 (PT1)")
