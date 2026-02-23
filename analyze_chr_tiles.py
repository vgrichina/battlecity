#!/usr/bin/env python3
"""
Analyze specific tile regions in chr_pt0.png.
PNG layout: 32 tiles wide × 16 tiles tall, each tile rendered at 9×9px (8px + 1px gap).
Tiles 0-255: BG/PT1 bank (file $8010, PPU $1000-$1FFF)
Tiles 256-511: Sprite/PT0 bank (file $9010, PPU $0000-$0FFF)

Grid: row = tile_idx // 32, col = tile_idx % 32
"""
import sys
sys.path.insert(0, '.')
import png

PNG_PATH = 'tiles/chr_pt0.png'
CELL = 9  # 9px per tile cell (8px data + 1px gap)
GRID_W = 32

def load_png(path):
    r = png.Reader(filename=path)
    w, h, rows, meta = r.read()
    pixels = []
    for row in rows:
        pixels.append(list(row))
    return w, h, pixels, meta

def tile_pixel(pixels, tile_idx, px, py):
    """Get pixel color at position (px,py) within tile tile_idx."""
    row_idx = (tile_idx // GRID_W) * CELL + py
    col_base = (tile_idx % GRID_W) * CELL
    row = pixels[row_idx]
    # PNG may be RGB or RGBA
    channels = len(row) // (CELL * GRID_W + GRID_W)  # rough
    # Actually just index directly
    x = col_base + px
    # row is a flat list of channel values
    # Determine channels from meta
    return row  # return whole row for inspection

def get_tile_pixels(pixels, tile_idx, meta):
    """Get 8×8 pixel array for a tile (as list of rows, each row = list of RGB tuples)."""
    planes = meta.get('planes', 3)
    row_start = (tile_idx // GRID_W) * CELL
    col_start = (tile_idx % GRID_W) * CELL
    result = []
    for py in range(8):
        row = pixels[row_start + py]
        tile_row = []
        for px in range(8):
            x = (col_start + px) * planes
            if planes >= 3:
                tile_row.append((row[x], row[x+1], row[x+2]))
            else:
                tile_row.append((row[x], row[x], row[x]))
        result.append(tile_row)
    return result

def is_blank(tile_pixels):
    """Return True if tile is all one color (blank/empty)."""
    colors = set()
    for row in tile_pixels:
        for px in row:
            colors.add(px)
    return len(colors) <= 1

def describe_tile(tile_pixels):
    """Return brief description of tile content."""
    colors = set()
    for row in tile_pixels:
        for px in row:
            colors.add(px)
    if len(colors) <= 1:
        return "BLANK"
    # Check predominant color
    color_counts = {}
    for row in tile_pixels:
        for px in row:
            color_counts[px] = color_counts.get(px, 0) + 1
    dominant = max(color_counts, key=color_counts.get)
    non_bg = [(c, n) for c, n in color_counts.items() if c != dominant]
    return f"{len(colors)} colors, dominant={dominant}, others={non_bg[:3]}"

def analyze_region(pixels, meta, start_tile, end_tile, label):
    print(f"\n=== {label} (tiles {start_tile:#x}–{end_tile:#x}) ===")
    for ti in range(start_tile, end_tile + 1):
        tp = get_tile_pixels(pixels, ti, meta)
        blank = is_blank(tp)
        desc = describe_tile(tp)
        grid_row = ti // GRID_W
        grid_col = ti % GRID_W
        print(f"  Tile {ti:#05x} (idx={ti:3d}, grid [{grid_row:2d},{grid_col:2d}]): {desc}")

def main():
    print(f"Loading {PNG_PATH}...")
    w, h, pixels, meta = load_png(PNG_PATH)
    print(f"PNG size: {w}×{h}, planes={meta.get('planes',3)}, bitdepth={meta.get('bitdepth',8)}")
    print(f"Expected: {GRID_W * CELL}×{16 * CELL} = {GRID_W*CELL}×{16*CELL}")

    # Task: Verify tank sprite tile layout
    # Tank tiles are in sprite bank → PNG index 256+T
    # Player base $00, dirs: up=0, left=8, down=16, right=24
    # Each direction: 2 anim frames × 2 OAM entries (left+right half)
    # So up: tiles 256+0x00..256+0x07 (8 tiles: 4 frames × 2 halves)
    # But actually it's 2 frames × left/right = 4 tiles per direction
    # up: 256+0x00, 256+0x02 (frame0 L/R), 256+0x04, 256+0x06 (frame1 L/R? Or just 2?)
    # ROM says base + dir*8 + anim_bit → up (dir=0): tiles 0,2,4,6 for anim 0,1,2,3?
    # Let's just show all 0x00..0x1F for player tiles

    print("\n" + "="*60)
    print("PLAYER TANK TILES (sprite bank, PNG index 256+T)")
    print("Player base=$00, direction×8: up=0, left=8, down=16, right=24")
    print("Each dir has 8 tiles (256+base+dir*8+0..7)")

    analyze_region(pixels, meta, 256+0x00, 256+0x1F, "Player tank (star lvl 0)")
    analyze_region(pixels, meta, 256+0x80, 256+0x8F, "Enemy tier 0 (basic)")
    analyze_region(pixels, meta, 256+0xA0, 256+0xAF, "Enemy tier 1 (fast)")
    analyze_region(pixels, meta, 256+0xC0, 256+0xCF, "Enemy tier 2 (power)")
    analyze_region(pixels, meta, 256+0xE0, 256+0xEF, "Enemy tier 3 (armor)")

    # Also check BG bank tiles for spawn/eagle references
    analyze_region(pixels, meta, 0xA0, 0xAF, "Spawn anim tiles (BG bank, T&0xFE)")
    analyze_region(pixels, meta, 0xD0, 0xEF, "Eagle tiles (BG bank, $D0-$EF)")

    # Visual ASCII dump of a few key tiles
    print("\n\n=== ASCII pixel dump of key tiles ===")
    chars = ' .+#'
    # NES palette: 0=black, 1=dark, 2=light, 3=white → map by brightness
    def brightness(rgb):
        return rgb[0]*0.299 + rgb[1]*0.587 + rgb[2]*0.114

    def dump_tile(pixels, meta, tile_idx, label):
        tp = get_tile_pixels(pixels, tile_idx, meta)
        # Get unique colors sorted by brightness
        all_colors = sorted(set(c for row in tp for c in row), key=brightness)
        color_map = {c: chars[min(i, 3)] for i, c in enumerate(all_colors)}
        print(f"\nTile {tile_idx:#05x} ({label}):")
        for row in tp:
            print('  ' + ''.join(color_map[c] for c in row))

    for ti, lbl in [
        (256+0x00, "Player UP frame0 left"),
        (256+0x02, "Player UP frame0 right"),
        (256+0x08, "Player LEFT frame0 left"),
        (256+0x10, "Player DOWN frame0 left"),
        (256+0x18, "Player RIGHT frame0 left"),
        (256+0x80, "Enemy tier0 UP left"),
        (256+0xE0, "Enemy tier3 UP left"),
        (0xA0, "Spawn anim frame0 top"),
        (0xD0, "Eagle intact top-left"),
        (0xE0, "Eagle damaged top-left"),
    ]:
        dump_tile(pixels, meta, ti, lbl)

if __name__ == '__main__':
    main()
