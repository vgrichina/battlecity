import sys

with open('battlecity_listing.txt', 'r') as f:
    lines = f.readlines()

table = []
start_found = False
for line in lines:
    if '$D475' in line and '.byte' in line:
        start_found = True
    if start_found:
        if '.byte' in line:
            parts = line.split('.byte')
            val = parts[1].strip().split(';')[0].strip()
            if val.startswith('$'):
                table.append(int(val[1:], 16))
            else:
                table.append(int(val))
        if len(table) == 256:
            break

print(f"const PALETTE_COLOR_TABLE = {table};")
