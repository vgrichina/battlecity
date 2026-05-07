# Battle City (Famicom, 1985) — Reverse Engineering

Annotated 6502 disassembly of Namco's Battle City (Famicom version, 1985) and a from-scratch browser reimplementation.

### [Play at battle-city.berrry.app](https://battle-city.berrry.app)

## Original Game

**Battle City** (バトルシティー) is a 1985 Namco arcade/Famicom tank-combat game — players defend their eagle base against waves of enemy tanks across 35 stages, with a two-player simultaneous mode and a built-in stage construction editor. Released for the Famicom on September 9, 1985.

The Famicom version (`battlecity_famicom.nes`) is mapper 0 (NROM), 16 KB PRG + 8 KB CHR, 24,592 bytes total.

## What's in this repo

- **Annotated 6502 disassembly** — `dis.py` reads `labels.csv` (249 labeled addresses) and produces commented disassembly of any region of the unpacked PRG.
- **Reverse-engineering notes** — [`REVERSE.md`](REVERSE.md) is the master document: ROM layout, data-range map, decoded subsystems (NMI handler, palette engine, entity tables, AI, sound, hi-score entry, result screen).
- **Asset extractors** — Python scripts decode CHR tiles (`extract_tiles.py`), level maps (`extract_level_maps.py`), enemy tables (`decode_enemy_table.py`), and the eagle/wall sprite layout (`decode_eagle_wall.py`).
- **Web reimplementation** — `web/` contains a self-contained JS port: `game.js`, `levels.js`, `sound.js`, plus a tile viewer and an architecture browser.
- **Cross-reference tools** — `xref.py` finds all callers/writers of any address; `search_bytes.py` locates byte patterns; `dump_strings.py` extracts string tables.

## Project Structure

```
battlecity/
├── REVERSE.md                  Master RE document — ROM layout, data ranges, decoded routines
├── labels.csv                  Address → label table (249 entries)
├── instruction_set.py          6502 / 2A03 opcode database
├── dis.py                      Annotated disassembler (reads labels.csv)
├── xref.py                     Cross-reference search
├── extract_tiles.py            CHR-ROM → PNG tile sheets
├── extract_level_maps.py       Stage layouts (35 stages)
├── decode_enemy_table.py       Enemy spawn tables per stage
├── decode_eagle_wall.py        Eagle base tile layout
├── render_frame.py             Render specific stage to PNG
├── render_level.py             Render level metadata
├── render_sprites.py           Render sprite tiles
├── gen_nes_master.py           Generate master tile reference image
├── tiles/                      Extracted CHR tile sheets
├── web/                        Browser reimplementation
│   ├── index.html              Main game page
│   ├── game.js                 Core game logic + rendering
│   ├── levels.js               Stage data
│   ├── sound.js                APU-equivalent audio
│   ├── architecture.html       Interactive RE browser
│   └── catalog.html            Tile/sprite catalog
└── re_loop_sessions/           RE workflow session logs
```

## Obtaining the ROM

ROMs are gitignored. Battle City is still under copyright (Namco). To run the disassembly tools:

1. Obtain `battlecity_famicom.nes` legally (e.g. you own a Famicom cartridge dump).
2. Place it at the repo root.
3. Verify: 24,592 bytes; iNES header `4E 45 53 1A 01 01 01 00`.

The web port at `battle-city.berrry.app` is a clean-room reimplementation and does not require the ROM.

## Running the Web Port Locally

No build step. Serve `web/` with any static HTTP server:

```bash
cd web && python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Running RE Tools

```bash
# Disassemble a region (CPU addresses):
python3 dis.py 0xC000 0xC080

# Find all references to an address:
python3 xref.py 0xC159

# Extract CHR tiles:
python3 extract_tiles.py

# Render a specific stage:
python3 render_level.py 1
```

Tools read `labels.csv` and `comments.csv` (if present) at startup and inline annotations into output. New findings are committed back to `labels.csv` as RE progresses.

## RE Methodology

The disassembly was built bottom-up without a third-party disassembler — `instruction_set.py` is a hand-built 6502/2A03 opcode database; `dis.py` decodes targeted regions on demand. Every byte range in the PRG is being accounted for in the data-range map in [`REVERSE.md`](REVERSE.md). The methodology is the [re-skill](https://github.com/vgrichina/re-skill) workflow.

## Status

- **Disassembly:** ~80% of PRG mapped (NMI, palette, entity tables, AI, hi-score entry, result screen, sound, construction mode).
- **Asset extraction:** complete (CHR tiles, all 35 stage layouts, enemy spawn tables, palettes).
- **Web port:** playable end-to-end, including 2-player mode, construction mode, hi-score entry, and the result screen tally animation.

Open issues and remaining unknowns are tracked in [`dead_ends.md`](dead_ends.md).

## License

The reverse engineering notes, disassembler tools, and web reimplementation are MIT licensed.

The original Battle City game and ROM remain the property of Namco/Bandai Namco Entertainment.
