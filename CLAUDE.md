# Battle City — Reverse Engineering Project

## Goal

Reverse engineer the Battle City ROM/binary and reimplement the game as a faithful web version.

## Established RE Workflow (from sibling projects)

### Phase 1 — Binary Identification
- Determine platform (Game Boy, DOS MZ, etc.) from file header
- Identify compiler/toolchain artifacts (Borland FPU emulation, RGBDS output, etc.)
- Map memory layout: code segments, data segment, ROM banks, file offsets

### Phase 2 — Decompression (before any disassembly)
- Identify whether the binary or its data regions are packed/compressed (look for short files, entropy spikes, known packer signatures)
- Reverse-engineer the decompression routine from the binary itself — do NOT assume a standard algorithm
- Implement `decompress.py` and produce a fully unpacked image of the binary
- All subsequent disassembly and asset extraction operates on the **unpacked** image, never the compressed original

### Phase 3 — Disassembly & Annotation
- **Do not use third-party disassemblers** (no mgbdis, radare2, ndisasm, Ghidra, etc.)
- Build `instruction_set.py` — a complete CPU opcode database for the target architecture
- Build `dis.py` on top of it — targeted, annotated disassembly of any region of the unpacked image
- `dis.py` reads `labels.csv` and `comments.csv` at startup and inlines them into output
- Every newly-understood address is immediately committed to `labels.csv` / `comments.csv`
- For DOS Borland targets, add `fpu_decode.py` to convert INT 34h–3Dh back to x87 mnemonics
- Keep `REVERSE.md` updated at every session: data-range map, findings, and Next Tasks section
- **The process does not stop until every byte range in the binary is accounted for**

### Phase 4 — Asset Extraction
- Identify graphics encoding (2bpp tiles, EGA planar, custom sprite format, etc.) from the unpacked image
- Build decoder scripts for each asset type: tiles, tilemaps, palettes, sprites
- Visually validate extracted assets against a running copy of the game

### Phase 5 — Data Structure Mapping
- Use `search_bytes.py` / `strings_dump.py` to locate tables by known byte patterns or debug strings
- Build `decode_tables.py` / `struct_dump.py` to dump fixed-size struct arrays
- Map pointer tables (two-level: outer ptr → sub-table) with `--follow` style decoding
- Cross-reference every address of interest with `xref.py` to find all callers and writers

### Phase 6 — Validation Loop
- Run the original binary in an emulator (v86 for DOS, mGBA/SameBoy for GB) in parallel
- Diff extracted data and rendered assets against live emulator state
- Build field-dump / tick-compare scripts when engine-level fidelity is needed

### Phase 7 — Web Reimplementation
- Scaffold `web/` or `src/` with a plain HTML canvas page (no build tools)
- Port decoded data as JS constants; use the asset decoder output directly
- Implement physics/logic incrementally, validating each subsystem against the original
- Serve with `python3 -m http.server` for quick iteration

---

## Self-Made Tools to Build

All disassembly tooling is written from scratch — no third-party disassemblers.

### Knowledge files (hand-maintained, source of truth)

| File | Format | Purpose |
|------|--------|---------|
| `labels.csv` | `bank,addr,name` | Address → symbol name; loaded by `dis.py` and `xref.py` to annotate output |
| `comments.csv` | `bank,addr,comment` | Address → inline comment; loaded by `dis.py` to annotate output |
| `REVERSE.md` | Markdown | High-level findings: full data-range map, subsystem notes, Next Tasks section |

`labels.csv` and `comments.csv` are updated immediately whenever understanding improves.
`REVERSE.md` must always have a **Next Tasks** section kept current; it drives each session.
The data-range map in `REVERSE.md` tracks every byte range in the binary — work continues until all ranges are classified (code / data / asset / padding).

### Scripts

| Tool | Language | Purpose |
|------|----------|---------|
| `decompress.py` | Python | Reverse-engineered decompressor; produces unpacked binary image |
| `instruction_set.py` | Python | Complete CPU opcode database for the target architecture |
| `dis.py` | Python | Targeted disassembler; reads `labels.csv` + `comments.csv` to annotate output |
| `search_bytes.py` | Python | Byte-pattern search across the unpacked image with context + optional inline disassembly |
| `xref.py` | Python | Find all references (call/jp/jr/ld/mov/cmp/push) to a given address or offset |
| `decode_tables.py` | Python | Universal struct/table decoder — flat and two-level pointer tables |
| `extract_tiles.py` | Python | Decode platform-native tile format (2bpp / EGA planar / etc.) → PNG |
| `render_screen.py` | Python | Composite full screens: tiles + tilemap + palettes + attributes |

For DOS Borland targets, also:

| Tool | Language | Purpose |
|------|----------|---------|
| `fpu_decode.py` | Python | Decode Borland INT 34h–3Dh FPU sequences to x87 mnemonics |
| `ds_lookup.py` | Python | DS offset ↔ file offset converter; interprets bytes as various types |
| `strings_dump.py` | Python | Scan data segment for printable strings with grep-like filtering |
| `struct_dump.py` | Python | Pre-configured struct dumper for known arrays (weapons, players, etc.) |

---

## Key Commands (fill in once binary is identified)

```bash
# Step 1: decompress/unpack the binary
python decompress.py <input> <output.unpacked>

# Step 2: targeted disassembly of unpacked image (all subsequent work uses the unpacked file)
python dis.py <bank_or_segment> <addr> [lines]

# Byte pattern search across unpacked image
python search_bytes.py <hex_bytes> [--context N] [--disasm]

# Cross-references
python xref.py <addr> [bank]

# Table / struct decode
python decode_tables.py <bank> <addr> <count> <format>

# Asset extraction from unpacked image
python extract_tiles.py
python render_screen.py

# Serve web reimplementation
python3 -m http.server 8000
```

---

## Conventions (consistent with sibling projects)

- File offsets: always hex with `0x` prefix (e.g., `0x263F0`)
- ROM bank:addr pairs: `bank$04:$4732` style
- DS offsets: `DS:XXXX` notation
- `labels.csv` columns: `bank,addr,name` — addr in hex without prefix, e.g. `04,4732,BallCollision`
- `comments.csv` columns: `bank,addr,comment` — same addr format
- `REVERSE.md` must always open with the **data-range map** (start, end, size, classification, notes) and close with **Next Tasks**
- Resolved tasks struck through in Next Tasks; new discoveries added immediately
- Intermediate disassembly output goes in `disasm/` directory
- Extracted assets go in `gfx/`, `tiles/`, `output_gfx/`, etc.
- Python venv at `.venv/` with `pypng` for image output

---

## Autonomous RE Loop

`re_loop.sh` drives repeated short Claude sessions until all Next Tasks are resolved.

```bash
./re_loop.sh                 # default: up to 50 sessions, 3 tasks each
./re_loop.sh --max 10        # limit iterations
./re_loop.sh --tasks 5       # tasks per session
./re_loop.sh --dry-run       # print prompt only
```

### How each session works
1. Claude reads REVERSE.md, picks the top `--tasks` unchecked items
2. Investigates each with `dis.py` / `xref.py` / `search_bytes.py`
3. Updates REVERSE.md (Code Map, algorithms, marks tasks `[x]`, adds new `[ ]`)
4. Updates `labels.csv` and `comments.csv`
5. Outputs `SESSION_SUMMARY: <one line>` at end

The script commits after each session using the summary as the message, then loops.
Stops automatically when: no tasks remain, no files changed, or `--max` hit.

### Session prompt rules (enforced in re_loop.sh)
- Scoped tools only: `Bash(python dis.py*)`, `Bash(python xref.py*)`, `Bash(python search_bytes.py*)`, `Bash(python decode_tables.py*)`, `Read`, `Edit`, `Write`
- Stop after N tasks (keeps context small for reliable restarts)
- Do not re-document already-covered addresses
