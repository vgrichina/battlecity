# Battle City (Famicom) — Reverse Engineering Notes

## ROM Identification

| Field | Value |
|-------|-------|
| File | `battlecity_famicom.nes` (source: `BattleCity (Japan).nes`) |
| Format | iNES |
| Platform | Famicom (NES) |
| CPU | MOS 6502 (2A03) |
| Mapper | 0 (NROM) |
| PRG-ROM | 1 × 16 KB — mirrored at $8000–$BFFF and $C000–$FFFF |
| CHR-ROM | 1 × 8 KB |
| Mirror | Horizontal |
| Vectors | RESET=$C070  NMI=$D400  IRQ=$C070 |
| File size | 24,592 bytes (16-byte header + 16 KB PRG + 8 KB CHR) |

**VS System ROM** (`VS. Battle City (1985)(Namco).nes`) is separate — mapper 99, 32 KB PRG, two banks. Its RE annotations are in git history (commit before clearing labels/comments).

---

## Data-Range Map

| CPU Range | PRG Offset | Size | Classification | Notes |
|-----------|-----------|------|----------------|-------|
| $8000–$BFFF | $0000–$3FFF | 16 KB | PRG bank 0 | Same 16 KB mirrored in both halves |
| $C000–$FFFF | $0000–$3FFF | 16 KB | PRG bank 0 mirror | Identical bytes |
| $8070 | $0070 | — | Reset entry | Mirrors $C070 |
| $9689 | $1689 | ~42 | code | ReadControllers |
| $92A0–$92FF | $12A0–$12FF | ~96 | data/strings | Title screen string table (mirrors $D2A0–$D2FF) |
| $C000–$C07F | — | 128 | code | Reset / init |
| $C09C–$C0AD | — | 18 | code | MainLoop |
| $C0AE–$C0BD | — | 16 | code | ConstructionEntry |
| $C159 | — | — | code | GameInit (entry) |
| $C2B3 | — | — | code | NewGameSetup |
| $C0BE–$C0F7 | — | ~58 | code | Stage transition setup (clear state, draw banner, A/B check → $C18A) |
| $C0F8–$C158 | — | ~97 | code | InterStageScreen: show "STAGE X" BG tiles, UP/DOWN cycle $85 (stage), A/B or 10s timeout → $C18A |
| $C159–$C15D | — | 5 | code | StageWrapAround: $85=$23 (35) on UP wrap-around; JMP $C0F8 |
| $C18A–$C224 | — | ~155 | code | GameplayInit: OAM setup, run gameplay subsystems; ends at JMP $C0A6 (tick loop) |
| $C29F–$C2D8 | — | ~58 | code | GameTickMain: per-frame game tick; calls 14+ subsystems |
| $C301–$C344 | — | ~68 | code | SpawnPlayersInit: spawns P1/P2 via $E417, sets enemies=20 ($7F/$80), clears counters |
| $C3B5 | — | — | code | StagePlay entry |
| $C41D–$C44F | — | 51 | code | GameOverLoop |
| $C7AB–$C7C7 | — | 29 | code | TitleWaitLoop |
| $C9B0–$C9BF | — | 16 | code | ConstructionSetup |
| $C9C0–$CA8F | — | ~208 | code | PlayerSelectLoop + helpers |
| $D16A–$D27F | — | ~278 | code | SetupNametableStage + DrawTitleScreen |
| $D280–$D340 | $1280–$1340 | ~193 | data/strings | Title screen strings (mirrors $92A0–$9340) |
| $D341 | $1341 | 2 | data/string | str_LivesTile |
| $D400–$D44C | — | ~77 | code | NMI handler |
| $D467 | — | — | code | WaitNMI |
| $D470 | — | — | code | ClearSpriteBuf |
| $D47E | — | — | code | WriteNametable |
| $D491–$D501 | — | ~113 | code | Init + CheckSavedState |
| $D502–$D50D | — | 12 | code | InitRAM entry |
| $D50E | — | — | code | PaletteUpdate |
| $D5FB | — | — | code | CalcNametableAddr |
| $D689 | — | — | code | SoundUpdate |
| $D6B3–$D705 | — | ~83 | code | DrawNametableText variants |
| $D7B4 | — | — | code | InitEntities |
| $D7CC | — | — | code | ClearEntitySlots |
| $D8D2–$D8F5 | — | 36 | code | DrawSpriteString |
| $D8F6–$D8FC | — | 7 | code | WaitVBlank |
| $D8FD | — | — | code | HideOffscreenSprites |
| $DA93–$DAAC | — | ~26 | code | HideSpritePairs |
| $E413 | — | — | code | (unknown init) |
| $EA51 | — | — | code | (unknown) |
| $EA7E | — | — | code | (called from NMI, unknown) |
| $F200–$F27C | — | ~125 | code | DisplayStageNumber: A=stage(1–35 or $FF=clear); draws digit tiles using lookup table at $F27D |
| $F27D–$F2?? | — | — | data | Stage-number tile lookup table (BCD digit CHR tile indices) |
| $FFFA–$FFFF | $3FFA–$3FFF | 6 | vectors | NMI=$D400 RESET=$C070 IRQ=$C070 |

---

## Key Zero-Page Variables

| Addr | Name | Description |
|------|------|-------------|
| $06 | P1RawState | P1 controller raw bits: bit7=R 6=L 5=Dn 4=Up 3=Start 2=Select 1=B 0=A |
| $07 | P2RawState | P2 controller raw bits (same layout) |
| $08 | P1NewPresses | Edge-detected new presses P1 (0→1 transitions) |
| $09 | P2NewPresses | Edge-detected new presses P2 |
| $0A | FrameHi | Increments every 64 NMIs |
| $0B | FrameLo | Increments every NMI |
| $0C | OAMIndex | Current OAM write index ($0180 buffer) |
| $0D | SpritePairIdx | Index for HideSpritePairs alternating pattern |
| $0E | SomePPUParam | Set to 4 during Init |
| $11/$12 | StringPtrLo/Hi | Pointer for DrawNametableText |
| $13/$14 | SpritePtrLo/Hi | Pointer for DrawSpriteString |
| $4A | StartStage | Starting stage index (0-based); stage-skip cheat target |
| $4B | LoopCounter | Used in title/select timing loops |
| $4D | PPUMode | $FF=skip PPU updates; 0=normal; 3=player select |
| $4F | ScrollY | PPU vertical scroll value |
| $50 | PPUCtrlLo | OR'd with $B0 for PPUCTRL write |
| $56 | SpriteX | X position for DrawSpriteString |
| $57 | SpriteY | Y position for DrawSpriteString |
| $5A/$5B | (player slot) | Used during construction setup |
| $60 | TileOffset | Added to sprite tile indices; $30 for highlighted mode, 0 normal |
| $6C | MaxEntitySlotIdx | Max zero-page $A0 entity-array index: 5=1P (player slot 1 + 4 enemy slots 2–5), 7=2P (players 1–2 + enemy slots 3–7); set at $C3FF (1P) / $C8AE (2P); read by FindFreeEnemySlot ($DC01) and NMI scroll writer ($97E0: written to PPU $2005 as Y-scroll) |
| $6D | (game active) | Set to 1 at StagePlay |
| $83 | PlayerMode | 0=1P, 1=2P, 2=CONSTRUCTION; cycles via SELECT button |
| $90 | (unknown) | Set to $48 in PlayerSelectLoop |
| $98 | CursorSpriteIdx | OAM sprite index for cursor: $8B + ($83 × 16) |
| $7F/$80 | EnemiesRemaining | Enemies left to spawn this stage; both initialized to $14 (20) at $C325 (NewGameSetup); DEC'd by FindFreeEnemySlot ($DC12) each spawn |
| $A0 | EntityStatus[0..N] | Zero-page entity-status array; slots 1–$6C; $A0+idx=0 → slot free, non-zero → occupied |
| $85 | StageNumber | Current stage (1–35). Set to 35 at StagePlay ($C3BF); cycled UP/DOWN during InterStageScreen ($C0F8); INC'd at $C1F8 after stage completion; $F200 (DisplayStageNumber) converts it to tile display |
| $B0 | BlinkState | XOR'd with $04 every 4 frames for cursor blink |

---

## Architecture: Main Game Loop

```
Reset ($C070)
  SEI; wait 2 VBlanks; SP=$7F
  JSR Init          ($D491) — clear RAM, check saved state, init nametables
  $4F=$4B=$50=0
  JSR DrawTitleScreen ($D17F) — one-time BG/sprite draw of title
  $4B=0

MainLoop ($C09C):
  JSR SetupNametableStage ($D16A) — init nametable $1C for stage
  JSR TitleWaitLoop       ($C7AB) — spin until SELECT pressed (~240 frame demo timeout)
  JSR PlayerSelectLoop    ($C9C0) — SELECT cycles 1P/2P/CONSTRUCTION, START confirms
  JSR StagePlay           ($C3B5) — actual gameplay
  JSR GameOverLoop        ($C41D) — wait for button, then loop back
  JMP MainLoop
```

---

## Title Screen Layout (`DrawTitleScreen` $D17F)

Drawn once to nametable $24. Strings use ASCII tile indices; FF = terminator.

| Element | Type | String addr | Col | Row | Notes |
|---------|------|-------------|-----|-----|-------|
| "BATTLE" big logo | Sprite | $D299 | x=26 | y=46 | DrawSpriteString, 8×16 sprite tiles |
| "CITY" big logo | Sprite | $D2A0 | x=60 | y=86 | DrawSpriteString |
| Tile pair [5E][6B] | BG | $D2A5 | 2 | 3 | namcot logo or HUD prefix P1 |
| Tile pair [5F][6B] | BG | $D2A8 | 11 | 3 | HUD prefix P2 |
| "HI-" | BG | $D2B1 | 1 | 3 | Score header; $6B = '-' tile |
| "SCORE" | BG | $D2C0 | varies | 3 | Score label |
| "1 PLAYER" | BG | $D2C6 | 11 | 17 | Menu option 0 |
| "2 PLAYERS" | BG | $D2CF | 11 | 19 | Menu option 1 |
| "CONSTRUCTION" | BG | $D2EB | 11 | 21 | Menu option 2 |
| Credits names | BG | $D28F | 11 | 23 | Tile indices $60–$68 |
| "@1980 1985 NAMCO LTD" | BG | $D2F8 | 4 | 25 | $40=copyright symbol tile |
| "ALL RIGHTS RESERVED" | BG | $D320 | 6 | 27 | |

Staff credit: "WRITTEN BY" ($D284) + name tiles ($D28F: $60–$68).

---

## Player Select Screen (`PlayerSelectLoop` $C9C0)

- **SELECT** (bit2 of $08): cycles `$83` 0→1→2→0 (1P/2P/CONSTRUCTION)
- **START** (bit3 of $08): confirms; dispatches via `SelectDispatchTable` ($CA69)
- Cursor blink: `$B0 XOR #$04` every 4 frames
- Cursor sprite: `$98 = $8B + ($83 × 16)` → OAM index
- Stage-skip cheat: P1-DOWN ($06 bit5) + P2-A ($09 bit0) → `$4A += $10`
- Stage back cheat: P1-RIGHT ($06 bit7) + P2-B ($09 bit1) → `DEC $4A`

Dispatch table (`$CA69`):

| $83 | Target | Action |
|-----|--------|--------|
| 0 | $CA6F | 1P: → eventually JSR NewGameSetup; $6C set to 5 at $C3FF (within StagePlay $C3B5) |
| 1 | $CA74 | 2P: → eventually JSR NewGameSetup; $6C set to 7 at $C8AE |
| 2 | $CA7E | CONSTRUCTION: $6C=7 at $C8AE; JMP ConstructionEntry |

Note: addresses $CA6F/$CA74/$CA7E in the dispatch table are jump targets inside copy-table code and not simple `LDA #$05; STA $6C` sequences. $6C is set later during StagePlay/$C8B6 setup via dedicated sub-routines ($C3FD for 1P, $C8AC for 2P).

---

## Controller Read (`ReadControllers` $9689)

Strobe $4016: write 1 then 0. Read 8 bits from $4016 (P1) and $4017 (P2) via ROR loop.

Bit layout of $06/$07 (raw) and $08/$09 (new presses):
- bit7=Right  bit6=Left  bit5=Down  bit4=Up  bit3=Start  bit2=Select  bit1=B  bit0=A

---

## VS System vs Famicom Differences

| Feature | VS System (mapper 99) | Famicom (mapper 0) |
|---------|----------------------|---------------------|
| PRG | 2×16 KB banks | 1×16 KB mirrored |
| Coin/credits | Yes ($4B=credits, NMI coin handler) | No |
| $4020 VS protection | Yes | No |
| Palette DIP remapping | Yes (192-entry table via $4017 bits[7:6]) | No |
| Title screen | "PLEASE INSERT COIN" / "PUSH START BUTTON" | "1 PLAYER"/"2 PLAYERS"/"CONSTRUCTION" menu |
| Menu navigation | Fire button → start game | SELECT cycles, START confirms |
| namcot branding | Not present | CHR tiles $5E/$5F/$6B area |
| Stage select | Not present | Yes — cheat via P1+P2 combo |
| Starting lives DIP | Yes ($4016 bit4 → 3 or 5 lives) | No DIP; lives count from separate logic ($6C is entity slot count, NOT lives) |
| CONSTRUCTION mode | Not present | Yes (menu option 2) |

---

## Next Tasks

- [x] Understand what $6C=5/$6C=7 controls exactly (NewGameSetup $C2B3). **Done.** $6C = MaxEntitySlotIdx: upper bound of the $A0 zero-page entity-status array. Set at $C3FF (1P→5) or $C8AE (2P→7). Read by FindFreeEnemySlot ($DC01): loop scans $A0+$6C down to $A0+2 for free enemy slot; 1P gets 4 enemy slots (2–5), 2P gets 5–6 (3–7 with player 2 at slot 2). Also read at $97E0 and written to PPU $2005 (Y-scroll) — same value doubles as a 5 or 7 pixel nametable Y-offset for VS System layout. Enemy-per-stage count is stored separately in $7F/$80 (both = $14=20, set at $C325).
- [x] Identify GameInit ($C159) — what does it set up? **Done.** $C159 ("StageWrapAround") is NOT a true init; it's the UP-wrap code in the InterStageScreen loop ($C0F8). When UP cycles $85 past 35, $C159 resets $85=35 and JMPs back to $C0F8. The real game init is $C18A (GameplayInit). $C0F8 shows "STAGE X" BG tiles, allows UP/DOWN stage cycling, auto-starts after ~10s or A/B press. $85 = stage number (1–35), initialized to 35 at StagePlay, incremented at $C1F8 after each stage. $C29F = GameTickMain (14+ subsystem calls per frame). $C301 = SpawnPlayersInit (spawns tanks, sets enemies=20).
- [ ] Map StagePlay ($C3B5) — level data loading, entity init
- [ ] Extract CHR ROM tiles — identify tiles $5E/$5F/$6B (namcot logo?), $60–$68 (credit names)
- [ ] Map sound engine ($D689 and call sites at $EA7E)
- [ ] Understand CheckSavedState / DefaultConfig ($D4EF / $C040) — continue feature?
- [ ] Locate and map level/stage data (35 stages in Famicom vs 40 in VS)
- [ ] Map entity/enemy system (EntityType table, movement, AI). Entity status array at $A0 (indexed 1..$6C); FindFreeEnemySlot ($DC01) scans high→low for free slot; $E417 spawns enemy; $7F/$80 = enemies-remaining (init 20); need to map $E417 and EntityType table.
- [ ] Identify $DA93 role in NMI more precisely (appears to be sprite hiding, not controller)
- [ ] Map $EA51 and $EA7E (called from Init and NMI respectively)
- [ ] Locate high score save/load logic
- [ ] Identify palette data location and format
- [ ] Map GameTickMain ($C29F) subsystem calls — identify each of the 14+ JSRs ($E235, $C232, PlayerInputUpdate, $DC9F, $E2AE, $E0E2, $E35D, $E330, $E1D6, $E216, $DBF6, $E7A9, $EAB5, $E8B1, $EB17, $C7F8, $DBB9, $C6C5)
- [ ] Map InterStageScreen ($C0F8) fully — understand $D1CD/$D1DF BG strings (tile encoding?) and $F27D stage-number lookup table; understand $C8B6 sprite rendering
- [ ] Understand stage data: what index/table selects the level layout when a stage starts? How does $85 map to level data?
