
import PIL.Image
import numpy as np

def dump_tile_from_png(png_path, tile_idx):
    img = PIL.Image.open(png_path).convert('RGB')
    # 512 tiles in 32x16 grid, 9px cell (8px + 1px border)
    CHR_CELL = 9
    CHR_BORDER = 1
    
    tcol = tile_idx % 32
    trow = tile_idx // 32
    
    sx = tcol * CHR_CELL + CHR_BORDER
    sy = trow * CHR_CELL + CHR_BORDER
    
    tile = img.crop((sx, sy, sx + 8, sy + 8))
    pixels = np.array(tile)
    
    print(f"Tile {tile_idx} (hex {tile_idx:02X}) from {png_path}:")
    for y in range(8):
        line = ""
        for x in range(8):
            r, g, b = pixels[y, x]
            # Map grayscale to 0-3
            # In web/game.js: grayToIdx(r) { return r < 0x2B ? 0 : r < 0x7F ? 1 : r < 0xD5 ? 2 : 3; }
            if r < 0x2B: idx = 0
            elif r < 0x7F: idx = 1
            elif r < 0xD5: idx = 2
            else: idx = 3
            
            chars = [' ', '.', 'o', 'X']
            line += chars[idx] * 2
        print(line)

dump_tile_from_png('web/tiles/chr_all.png', 0xFC)
dump_tile_from_png('web/tiles/chr_all_alt.png', 0xFC)
