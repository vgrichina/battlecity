#!/usr/bin/env python3
"""Check PNG chunks and sample gray pixel values in chr_pt0.png."""
import struct, zlib, sys

PNG_PATH = "tiles/chr_pt0.png"

def read_png_chunks(path):
    with open(path, 'rb') as f:
        sig = f.read(8)
        assert sig == b'\x89PNG\r\n\x1a\n', "Not a PNG"
        chunks = []
        while True:
            hdr = f.read(8)
            if len(hdr) < 8:
                break
            length = struct.unpack('>I', hdr[:4])[0]
            tag = hdr[4:8]
            data = f.read(length)
            crc = f.read(4)
            chunks.append((tag.decode('latin-1'), length, data))
            if tag == b'IEND':
                break
    return chunks

def decode_png_pixels(chunks):
    """Decode IDAT to raw pixels. Returns (width, height, pixels_rgb)."""
    ihdr = None
    idat_data = bytearray()
    for tag, length, data in chunks:
        if tag == 'IHDR':
            ihdr = struct.unpack('>IIBBBBB', data)
        elif tag == 'IDAT':
            idat_data += data
    w, h, bdepth, ctype = ihdr[0], ihdr[1], ihdr[2], ihdr[3]
    raw = bytearray(zlib.decompress(bytes(idat_data)))
    stride = 1 + w * 3  # filter byte + RGB per row
    pixels = []
    for y in range(h):
        row = raw[y*stride+1:(y+1)*stride]
        for x in range(w):
            r, g, b = row[x*3], row[x*3+1], row[x*3+2]
            pixels.append((r, g, b))
    return w, h, pixels

chunks = read_png_chunks(PNG_PATH)
print("=== PNG Chunks ===")
for tag, length, data in chunks:
    print(f"  {tag:8s}  {length:6d} bytes", end="")
    if tag in ('sRGB', 'gAMA', 'iCCP', 'cHRM'):
        if tag == 'sRGB':
            print(f"  rendering_intent={data[0]}", end="")
        elif tag == 'gAMA':
            gamma = struct.unpack('>I', data)[0]
            print(f"  gamma={gamma/100000:.5f}", end="")
    print()

print()
color_chunks = [t for t,_,_ in chunks if t in ('sRGB','gAMA','iCCP','cHRM')]
if color_chunks:
    print(f"WARNING: PNG has color profile chunks: {color_chunks}")
    print("Browser may apply color-space conversion when loading!")
else:
    print("OK: No sRGB/gAMA/iCCP/cHRM chunks. Browser treats as sRGB by default.")

# Sample actual pixel values at known tile positions
w, h, pixels = decode_png_pixels(chunks)
print(f"\nPNG size: {w}x{h}")
print("\nSampling tile 0 (should be blank/border tile at col 0, row 0):")
print("  Pixel (1,1) = tile 0 origin:", pixels[1*w+1])

# Find a tile with known content - tile $26 is "26" = a common non-blank BG tile
# Let's sample specific positions to check our 4 gray levels appear
print("\nSearching for each expected gray level (0x00, 0x55, 0xAA, 0xFF):")
found = {0x00: None, 0x55: None, 0xAA: None, 0xFF: None}
for y in range(min(h, 145)):
    for x in range(min(w, 289)):
        px = pixels[y*w+x]
        r = px[0]
        if r in found and found[r] is None:
            found[r] = (x, y)

for val, pos in sorted(found.items()):
    if pos:
        px = pixels[pos[1]*w+pos[0]]
        print(f"  gray 0x{val:02X} found at {pos}: actual pixel = {px}")
    else:
        print(f"  gray 0x{val:02X} NOT found in image!")

print("\nVerifying grayToIdx thresholds:")
def grayToIdx(r):
    return 0 if r < 0x2B else 1 if r < 0x7F else 2 if r < 0xD5 else 3

for gray, expected_idx in [(0x00, 0), (0x55, 1), (0xAA, 2), (0xFF, 3)]:
    got = grayToIdx(gray)
    ok = "OK" if got == expected_idx else "FAIL"
    print(f"  grayToIdx(0x{gray:02X}) = {got}  (expected {expected_idx}) [{ok}]")

# Edge-case tests
edge_cases = [
    (0x2A, 0),  # just below first threshold -> idx 0
    (0x2B, 1),  # at first threshold -> idx 1
    (0x54, 1),  # just below midpoint
    (0x55, 1),  # exact gray level 1
    (0x56, 1),  # just above
    (0x7E, 1),  # just below second threshold -> idx 1
    (0x7F, 2),  # at second threshold -> idx 2
    (0xAA, 2),  # exact gray level 2
    (0xD4, 2),  # just below third threshold -> idx 2
    (0xD5, 3),  # at third threshold -> idx 3
    (0xFF, 3),  # max -> idx 3
]
print("\nEdge-case tests:")
for val, expected in edge_cases:
    got = grayToIdx(val)
    ok = "OK" if got == expected else "FAIL"
    print(f"  grayToIdx(0x{val:02X}={val:3d}) = {got}  (expected {expected}) [{ok}]")
