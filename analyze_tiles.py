#!/usr/bin/env python3
"""analyze_tiles.py — Compare ROM-accurate rendering vs game.js rendering for stage 1.

No external dependencies — uses built-in PNG reader/writer via struct/zlib.
"""

import os, struct, zlib

ROM_PATH = "VS. Battle City (1985)(Namco).nes"
CHR_PNG  = "tiles/chr_all.png"
OUT_DIR  = "output_gfx"

# ── Built-in PNG reader ──────────────────────────────────────────────────────
def read_png(path):
    """Read PNG → (width, height, rows) where rows is list of bytearrays (RGBA)."""
    with open(path, 'rb') as f:
        sig = f.read(8)
        assert sig == b'\x89PNG\r\n\x1a\n', "Not a PNG"
        chunks = {}
        idat_data = b''
        while True:
            hdr = f.read(8)
            if len(hdr) < 8: break
            length, ctype = struct.unpack('>I4s', hdr)
            data = f.read(length)
            f.read(4)  # CRC
            ctype = ctype.decode('ascii')
            if ctype == 'IHDR':
                w, h, depth, ctype_i, comp, filt, intl = struct.unpack('>IIBBBBB', data)
                chunks['IHDR'] = (w, h, depth, ctype_i)
            elif ctype == 'IDAT':
                idat_data += data
            elif ctype == 'IEND':
                break

    w, h, depth, ct = chunks['IHDR']
    raw = zlib.decompress(idat_data)

    # Determine bytes per pixel
    if ct == 0: bpp = 1  # grayscale
    elif ct == 2: bpp = 3  # RGB
    elif ct == 4: bpp = 2  # grayscale+alpha
    elif ct == 6: bpp = 4  # RGBA
    else: raise ValueError(f"Unsupported color type {ct}")

    stride = 1 + w * bpp  # filter byte + row data
    rows = []
    prev_row = bytearray(w * bpp)
    for y in range(h):
        off = y * stride
        filt = raw[off]
        row = bytearray(raw[off+1 : off+1+w*bpp])
        if filt == 1:  # Sub
            for i in range(len(row)):
                a = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + a) & 0xFF
        elif filt == 2:  # Up
            for i in range(len(row)):
                row[i] = (row[i] + prev_row[i]) & 0xFF
        elif filt == 3:  # Average
            for i in range(len(row)):
                a = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + (a + prev_row[i]) // 2) & 0xFF
        elif filt == 4:  # Paeth
            for i in range(len(row)):
                a = row[i - bpp] if i >= bpp else 0
                b = prev_row[i]
                c = prev_row[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                if pa <= pb and pa <= pc: pr = a
                elif pb <= pc: pr = b
                else: pr = c
                row[i] = (row[i] + pr) & 0xFF

        # Convert to RGBA
        rgba_row = bytearray(w * 4)
        for x in range(w):
            if ct == 0:  # grayscale
                g = row[x]
                rgba_row[x*4:x*4+4] = bytes([g, g, g, 255])
            elif ct == 2:  # RGB
                rgba_row[x*4:x*4+4] = bytes([row[x*3], row[x*3+1], row[x*3+2], 255])
            elif ct == 4:  # gray+alpha
                g = row[x*2]
                rgba_row[x*4:x*4+4] = bytes([g, g, g, row[x*2+1]])
            elif ct == 6:  # RGBA
                rgba_row[x*4:x*4+4] = row[x*4:x*4+4]
        rows.append(rgba_row)
        prev_row = row if ct == 6 else bytearray(row)
        # For filter reconstruction we need the raw (pre-RGBA-conversion) row
        # Fix: store the bpp-native row for filter, not the RGBA version
    # Redo with correct filter reconstruction
    rows = []
    prev_row = bytearray(w * bpp)
    for y in range(h):
        off = y * stride
        filt = raw[off]
        row = bytearray(raw[off+1 : off+1+w*bpp])
        if filt == 1:
            for i in range(len(row)):
                a = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + a) & 0xFF
        elif filt == 2:
            for i in range(len(row)):
                row[i] = (row[i] + prev_row[i]) & 0xFF
        elif filt == 3:
            for i in range(len(row)):
                a = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + (a + prev_row[i]) // 2) & 0xFF
        elif filt == 4:
            for i in range(len(row)):
                a = row[i - bpp] if i >= bpp else 0
                b = prev_row[i]
                c = prev_row[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                if pa <= pb and pa <= pc: pr = a
                elif pb <= pc: pr = b
                else: pr = c
                row[i] = (row[i] + pr) & 0xFF

        rgba_row = bytearray(w * 4)
        for x in range(w):
            if ct == 0:
                g = row[x]
                rgba_row[x*4:x*4+4] = bytes([g, g, g, 255])
            elif ct == 2:
                rgba_row[x*4:x*4+4] = bytes([row[x*3], row[x*3+1], row[x*3+2], 255])
            elif ct == 4:
                g = row[x*2]
                rgba_row[x*4:x*4+4] = bytes([g, g, g, row[x*2+1]])
            elif ct == 6:
                rgba_row[x*4:x*4+4] = row[x*4:x*4+4]
        rows.append(rgba_row)
        prev_row = row
    return w, h, rows

# ── NES palette ──────────────────────────────────────────────────────────────
NES_MASTER = [
    (84,84,84),(0,30,116),(8,16,144),(48,0,136),(68,0,100),(92,0,48),(84,4,0),(60,24,0),
    (32,42,0),(8,58,0),(0,64,0),(0,60,0),(0,50,60),(0,0,0),(0,0,0),(0,0,0),
    (152,150,152),(8,76,196),(48,50,236),(92,30,228),(136,20,176),(160,20,100),(152,34,32),(120,60,0),
    (84,90,0),(40,114,0),(8,124,0),(0,118,40),(0,102,120),(0,0,0),(0,0,0),(0,0,0),
    (236,238,236),(76,154,236),(120,124,236),(176,98,236),(228,84,236),(236,88,180),(236,106,100),(212,136,32),
    (160,170,0),(116,196,0),(76,208,32),(56,204,108),(56,180,204),(60,60,60),(0,0,0),(0,0,0),
    (236,238,236),(168,204,236),(188,188,236),(212,178,236),(236,174,236),(236,174,212),(236,180,176),(228,196,144),
    (204,210,120),(180,222,120),(168,226,144),(152,226,180),(160,214,228),(160,162,160),(0,0,0),(0,0,0),
]

ROM_PAL_BYTES = [
    [0x0F,0x17,0x06,0x00],[0x0F,0x3C,0x10,0x12],[0x0F,0x29,0x09,0x0B],[0x0F,0x00,0x10,0x20],
    [0x0F,0x18,0x27,0x38],[0x0F,0x0A,0x1B,0x3B],[0x0F,0x0C,0x10,0x20],[0x0F,0x04,0x16,0x20],
]
ROM_PAL = [[NES_MASTER[c & 0x3F] for c in slot] for slot in ROM_PAL_BYTES]

def hex2rgb(h):
    return (int(h[1:3],16), int(h[3:5],16), int(h[5:7],16))

JS_PAL = [
    [hex2rgb(c) for c in ['#000000','#783C00','#540400','#545454']],
    [hex2rgb(c) for c in ['#000000','#A0D6E4','#989698','#3032EC']],
    [hex2rgb(c) for c in ['#000000','#74C400','#083A00','#003C00']],
    [hex2rgb(c) for c in ['#000000','#545454','#989698','#ECEEEC']],
    [hex2rgb(c) for c in ['#000000','#545A00','#D48820','#CCD278']],
    [hex2rgb(c) for c in ['#000000','#004000','#007628','#98E2B4']],
    [hex2rgb(c) for c in ['#000000','#00323C','#989698','#ECEEEC']],
    [hex2rgb(c) for c in ['#000000','#440064','#982220','#ECEEEC']],
]

# ── Palette check ────────────────────────────────────────────────────────────
print("=== PALETTE COMPARISON ===")
any_diff = False
for i in range(8):
    for j in range(4):
        if ROM_PAL[i][j] != JS_PAL[i][j]:
            any_diff = True
            print(f"  MISMATCH pal[{i}][{j}]: ROM={ROM_PAL[i][j]} JS={JS_PAL[i][j]}")
if not any_diff:
    print("  All 32 palette entries match perfectly.")

# ── Level / tile data ────────────────────────────────────────────────────────
LEVEL_OFF = 0x4010 + (0xF27D - 0xC000)
STAGE_SIZE, MAP_COLS, MAP_ROWS = 91, 13, 13

def decode_stage(raw):
    grid = []
    for row in range(MAP_ROWS):
        r = []
        for col in range(MAP_COLS):
            ni = row * 14 + col
            t = (raw[ni//2] >> 4) & 0xF if ni % 2 == 0 else raw[ni//2] & 0xF
            r.append(t)
        grid.append(r)
    return grid

def decode_tile_2bpp(data, offset):
    px = []
    for row in range(8):
        lo, hi = data[offset+row], data[offset+row+8]
        for bit in range(7,-1,-1):
            px.append(((lo>>bit)&1) | (((hi>>bit)&1)<<1))
    return px

def gray_to_idx(r):
    if r < 0x2B: return 0
    if r < 0x7F: return 1
    if r < 0xD5: return 2
    return 3

TILE_CHR = {
    0:[0x00,0x0F,0x00,0x0F], 1:[0x00,0x00,0x0F,0x0F], 2:[0x0F,0x00,0x0F,0x00],
    3:[0x0F,0x0F,0x00,0x00], 4:[0x0F,0x0F,0x0F,0x0F],
    5:[0x20,0x10,0x20,0x10], 6:[0x20,0x20,0x10,0x10], 7:[0x10,0x20,0x10,0x20],
    8:[0x10,0x10,0x20,0x20], 9:[0x10,0x10,0x10,0x10],
    10:[0x12,0x12,0x12,0x12], 11:[0x22,0x22,0x22,0x22], 12:[0x21,0x21,0x21,0x21],
}
TILE_PAL_IDX = {0:0,1:0,2:0,3:0,4:0, 5:3,6:3,7:3,8:3,9:3, 10:1,11:2,12:3}

def write_png(path, width, height, rgb_pixels):
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I',len(data)) + body + struct.pack('>I',zlib.crc32(body)&0xFFFFFFFF)
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            r,g,b = rgb_pixels[y*width+x]
            raw += bytes([r,g,b])
    data = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB',width,height,8,2,0,0,0))
            + chunk(b'IDAT', zlib.compress(bytes(raw),9))
            + chunk(b'IEND', b''))
    with open(path,'wb') as f: f.write(data)

class Canvas:
    def __init__(self, w, h, bg=(0,0,0)):
        self.w, self.h = w, h
        self.px = [bg]*(w*h)
    def set(self, x, y, col):
        if 0<=x<self.w and 0<=y<self.h: self.px[y*self.w+x] = col
    def get(self, x, y):
        if 0<=x<self.w and 0<=y<self.h: return self.px[y*self.w+x]
        return (0,0,0)
    def draw_tile(self, pix, pal, ox, oy):
        for ty in range(8):
            for tx in range(8):
                self.set(ox+tx, oy+ty, pal[pix[ty*8+tx]])
    def fill_rect(self, x, y, w, h, col):
        for dy in range(h):
            for dx in range(w):
                self.set(x+dx, y+dy, col)
    def save(self, path): write_png(path, self.w, self.h, self.px)

def main():
    with open(ROM_PATH,'rb') as f: rom = f.read()
    prg_banks = rom[4]
    chr_data = rom[16+prg_banks*16384 : 16+prg_banks*16384+16384]
    rom_bg_tiles = [decode_tile_2bpp(chr_data, i*16) for i in range(256)]

    # Load chr_all.png
    pw, ph, png_rows = read_png(CHR_PNG)
    CHR_CELL, CHR_BORDER = 9, 1

    def get_png_tile(tile_abs):
        tcol, trow = tile_abs % 32, tile_abs // 32
        sx, sy = tcol*CHR_CELL+CHR_BORDER, trow*CHR_CELL+CHR_BORDER
        pix = []
        for py in range(8):
            for px in range(8):
                if sy+py < ph:
                    r = png_rows[sy+py][(sx+px)*4]
                else:
                    r = 0
                pix.append(gray_to_idx(r))
        return pix

    off = LEVEL_OFF
    grid = decode_stage(rom[off:off+STAGE_SIZE])
    FX, FY, META = 16, 16, 16

    # ── ROM-accurate BG ──────────────────────────────────────────────────────
    rom_canvas = Canvas(256, 240)
    attr = bytearray(64)
    nt = bytearray(960)
    for mr in range(MAP_ROWS):
        for mc in range(MAP_COLS):
            t = grid[mr][mc]
            chr4 = TILE_CHR.get(t)
            if chr4 is None: continue
            pi = TILE_PAL_IDX.get(t,0)
            for si,(dr,dc) in enumerate([(0,0),(0,1),(1,0),(1,1)]):
                tr, tc = mr*2+dr+2, mc*2+dc+2
                if tr<30 and tc<32: nt[tr*32+tc] = chr4[si]
            tcb, trb = mc*2+2, mr*2+2
            ax, ay = tcb>>2, trb>>2
            aidx = ay*8+ax
            if aidx < 64:
                q = (((trb>>1)&1)<<1)|((tcb>>1)&1)
                attr[aidx] = (attr[aidx] & ~(3<<(q*2))) | (pi<<(q*2))

    for row in range(30):
        for col in range(32):
            ti = nt[row*32+col]
            ax, ay = col>>2, row>>2
            aidx = ay*8+ax
            b = attr[aidx] if aidx<64 else 0
            q = ((row>>1)&1)*2+((col>>1)&1)
            pi = (b>>(q*2))&3
            rom_canvas.draw_tile(rom_bg_tiles[ti], ROM_PAL[pi], col*8, row*8)

    ex, ey = 120, 216
    bt, bp = rom_bg_tiles[0x0F], ROM_PAL[0]
    for dx in [-16,-8,0,8]: rom_canvas.draw_tile(bt, bp, ex+dx, ey-16)
    rom_canvas.draw_tile(bt, bp, ex-16, ey-8)
    rom_canvas.draw_tile(bt, bp, ex-16, ey)
    rom_canvas.draw_tile(bt, bp, ex+8, ey-8)
    rom_canvas.draw_tile(bt, bp, ex+8, ey)
    for ti2,tx,ty in [(0xC8,ex-8,ey-8),(0xCA,ex,ey-8),(0xC9,ex-8,ey),(0xCB,ex,ey)]:
        tcol2,trow2 = tx//8, ty//8
        aidx2 = (trow2>>2)*8+(tcol2>>2)
        b2 = attr[aidx2] if aidx2<64 else 0
        q2 = ((trow2>>1)&1)*2+((tcol2>>1)&1)
        pi2 = (b2>>(q2*2))&3
        rom_canvas.draw_tile(rom_bg_tiles[ti2], ROM_PAL[pi2], tx, ty)

    os.makedirs(OUT_DIR, exist_ok=True)
    rom_canvas.save(os.path.join(OUT_DIR, 'compare_rom.png'))
    print(f"ROM-accurate BG -> {OUT_DIR}/compare_rom.png")

    # ── game.js-equivalent BG ────────────────────────────────────────────────
    JS_FIELD, JS_BORDER = (8,8,8), (64,64,64)
    js_canvas = Canvas(256, 240)
    js_canvas.fill_rect(FX-4, FY-4, MAP_COLS*META+8, MAP_ROWS*META+8+8, JS_BORDER)
    js_canvas.fill_rect(FX, FY, MAP_COLS*META, MAP_ROWS*META+8, JS_FIELD)

    for mr in range(MAP_ROWS):
        for mc in range(MAP_COLS):
            t = grid[mr][mc]
            px_x, px_y = FX+mc*META, FY+mr*META
            js_canvas.fill_rect(px_x, px_y, META, META, JS_FIELD)
            if t == 13 or t > 13: continue
            chr4 = TILE_CHR.get(t)
            if chr4 is None: continue
            pi = TILE_PAL_IDX.get(t,0)
            pal = JS_PAL[pi]
            if t <= 4:
                bits = {0:0b1010,1:0b1100,2:0b0101,3:0b0011,4:0xF}[t]
                for q in range(4):
                    ti2 = 0x0F if (bits&(1<<q)) else 0x00
                    qx, qy = 8 if (q&1) else 0, 8 if q>=2 else 0
                    js_canvas.draw_tile(get_png_tile(ti2), pal, px_x+qx, px_y+qy)
            else:
                for si,(dr,dc) in enumerate([(0,0),(0,1),(1,0),(1,1)]):
                    js_canvas.draw_tile(get_png_tile(chr4[si]), pal, px_x+dc*8, px_y+dr*8)

    bpng, jbp = get_png_tile(0x0F), JS_PAL[0]
    for dx in [-16,-8,0,8]: js_canvas.draw_tile(bpng, jbp, ex+dx, ey-16)
    js_canvas.draw_tile(bpng, jbp, ex-16, ey-8)
    js_canvas.draw_tile(bpng, jbp, ex-16, ey)
    js_canvas.draw_tile(bpng, jbp, ex+8, ey-8)
    js_canvas.draw_tile(bpng, jbp, ex+8, ey)

    js_canvas.save(os.path.join(OUT_DIR, 'compare_gamejs.png'))
    print(f"game.js-equivalent BG -> {OUT_DIR}/compare_gamejs.png")

    # ── Pixel diff ───────────────────────────────────────────────────────────
    diff_canvas = Canvas(256, 240)
    dc = 0
    rd = {'playfield_tiles':0,'playfield_bg':0,'border_area':0,'outside_playfield':0,'eagle_area':0}
    for y in range(240):
        for x in range(256):
            rp, jp = rom_canvas.get(x,y), js_canvas.get(x,y)
            if rp != jp:
                dc += 1
                diff_canvas.set(x, y, (255,0,0))
                ipf = FX<=x<FX+MAP_COLS*META and FY<=y<FY+MAP_ROWS*META
                ibr = FX-4<=x<FX+MAP_COLS*META+4 and FY-4<=y<FY+MAP_ROWS*META+4+8
                iea = ex-16<=x<ex+16 and ey-16<=y<ey+8
                if iea: rd['eagle_area']+=1
                elif ipf:
                    mc2,mr2 = (x-FX)//META,(y-FY)//META
                    if 0<=mr2<MAP_ROWS and 0<=mc2<MAP_COLS:
                        rd['playfield_bg' if grid[mr2][mc2]==13 else 'playfield_tiles']+=1
                    else: rd['playfield_bg']+=1
                elif ibr: rd['border_area']+=1
                else: rd['outside_playfield']+=1
            else:
                diff_canvas.set(x,y,(rp[0]//4,rp[1]//4,rp[2]//4))
    diff_canvas.save(os.path.join(OUT_DIR, 'compare_diff.png'))
    print(f"Diff image -> {OUT_DIR}/compare_diff.png")

    print(f"\n=== PIXEL DIFF SUMMARY ===")
    print(f"Total: {dc} / {256*240} ({100*dc/(256*240):.1f}%)")
    for k,v in sorted(rd.items(), key=lambda x:-x[1]):
        if v: print(f"  {k}: {v}")

    print(f"\n=== DETAILED DISCREPANCIES ===")
    print(f"\n1. BACKGROUND COLOR: ROM=(0,0,0) vs JS=(8,8,8) C.FIELD")
    print(f"\n2. BORDER: ROM=none, JS=gray #404040 rect ({rd['border_area']} px)")
    print(f"\n3. OUTSIDE PLAYFIELD: ROM=full nametable, JS=only 13x13 ({rd['outside_playfield']} px)")

    if rd['playfield_tiles'] > 0:
        print(f"\n4. PLAYFIELD TILES: {rd['playfield_tiles']} pixel diffs!")
        s = 0
        for y in range(FY, FY+MAP_ROWS*META):
            for x in range(FX, FX+MAP_COLS*META):
                mc2,mr2 = (x-FX)//META,(y-FY)//META
                if 0<=mr2<MAP_ROWS and 0<=mc2<MAP_COLS and grid[mr2][mc2]!=13:
                    rp,jp = rom_canvas.get(x,y), js_canvas.get(x,y)
                    if rp!=jp and s<10:
                        print(f"   type {grid[mr2][mc2]} at ({mc2},{mr2}) px({x},{y}): ROM={rp} JS={jp}")
                        s+=1
    else:
        print(f"\n4. PLAYFIELD TILES: All match!")

    if rd['eagle_area']:
        print(f"\n5. EAGLE AREA: {rd['eagle_area']} diffs (ROM has BG tiles $C8-CB; JS uses sprites)")

    print(f"\n6. TILE $00 (MORTAR): ROM==PNG: {rom_bg_tiles[0]==get_png_tile(0)}")
    if rom_bg_tiles[0] != get_png_tile(0):
        for py in range(8):
            r1,r2 = rom_bg_tiles[0][py*8:(py+1)*8], get_png_tile(0)[py*8:(py+1)*8]
            if r1!=r2: print(f"   Row {py}: ROM={r1} PNG={r2}")

    print(f"\n7. CHR TILES (ROM vs PNG):")
    tiles = [0x00,0x0F,0x10,0x12,0x20,0x21,0x22]
    names = {0x00:'mortar',0x0F:'brick',0x10:'steel',0x12:'water',0x20:'steel_brd',0x21:'ice',0x22:'trees'}
    ok = True
    for ti in tiles:
        if rom_bg_tiles[ti] != get_png_tile(ti):
            ok = False
            print(f"   MISMATCH ${ti:02X} ({names.get(ti,'?')})")
            for py in range(8):
                r1,r2 = rom_bg_tiles[ti][py*8:(py+1)*8], get_png_tile(ti)[py*8:(py+1)*8]
                if r1!=r2: print(f"     Row {py}: ROM={r1} PNG={r2}")
    if ok: print(f"   All {len(tiles)} tiles match.")

    print(f"\n8. BRICK brickBits:")
    for t in range(5):
        chr4 = TILE_CHR[t]
        bits = sum((1<<q) for q in range(4) if chr4[q]==0x0F)
        js = {0:0b1010,1:0b1100,2:0b0101,3:0b0011,4:0xF}[t]
        n = ['BRICK_TL','BRICK_TR','BRICK_BL','BRICK_BR','BRICK'][t]
        print(f"   {n}: CHR=0b{bits:04b} JS=0b{js:04b} {'OK' if bits==js else 'MISMATCH!'}")

    print("\n=== DONE ===")

if __name__ == '__main__':
    main()
