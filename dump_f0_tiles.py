with open('battlecity.nes', 'rb') as f:
    f.seek(0xA010 + 0xF0 * 16)
    data = f.read(16 * 16)
    for i in range(16):
        print(f'Tile ${0xF0+i:02X}: {data[i*16:(i+1)*16].hex()}')
