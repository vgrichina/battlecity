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
| $C3B5 | — | — | code | StagePlay entry |
| $C159–$C1C4 | — | ~108 | code | InterStageScreen: shows stage# ($85), A=next/B=prev (1–35), Start/timeout→$C1C5; draws stage tiles via $CA91 |
| $C1C5–$C1FF | — | ~59 | code | StageStartSetup: sets up nametables, JSR $F000 (load stage?), JSR ConstructionSetup or $CB5D, then JSR $CC27/$CCB2, clear $0C, enable PPU |
| $C1C5–$C222 | — | ~94 | code | StageStartSetup + GameLoop: ConstructionSetup; $F000(A=$85) load tilemap; $CAF5 HUD; $C331 spawn; game loop at $C1F9 (WaitVBlank+ticks+CheckGameOver) |
| $C2BD–$C2E5 | — | ~41 | code | GameVarsInit: clears $66/$67/$4C; STA $51=$52=$6A=3; 1P→$52=0; STA $85=1; STA $46=0 |
| $C2E6–$C31C | — | ~55 | code | GameTickMain: 14+ subsystem JSR calls per frame (enemy AI, movement, collision, spawn, sound) |
| $C331–$C3B4 | — | ~132 | code | StageStartInit: clear entity tables; spawn P1/P2; set enemies=20; calc SpawnDelayBase=$BE-(stage×4); 2P:-20 |
| $C3B5–$C41C | — | ~104 | code | StagePlay: new-game var init; blank map load ($F000/FF); draw STAGE sprites; entity init; StageStartInit; HUD |
| $C41D–$C44F | — | 51 | code | GameOverLoop: post-game animation; WaitVBlank+game ticks until button pressed |
| $C728–$C754 | — | ~45 | code | CheckGameOver: returns A=1 if $68=0 (eagle destroyed), $80=0 (stage clear), or $51+$52=0 (all lives lost) |
| $C7AB–$C7C7 | — | 29 | code | TitleWaitLoop |
| $C9B0–$C9BF | — | 16 | code | ConstructionSetup |
| $C9C0–$CA8F | — | ~208 | code | PlayerSelectLoop + helpers |
| $D16A–$D27F | — | ~278 | code | SetupNametableStage + DrawTitleScreen |
| $D280–$D345 | $1280–$1345 | ~198 | data/strings | Title screen string table (mirrors $92A0–$9345): 17 FF-terminated rows; format = col_byte+tiles+$FF; decoded to CHR tile indices |
| $D346 | $1346 | 2 | data/string | str_LivesTile |
| $D400–$D44C | — | ~77 | code | NMI handler |
| $D467 | — | — | code | WaitNMI |
| $D470 | — | — | code | ClearSpriteBuf |
| $D47E | — | — | code | WriteNametable |
| $C040–$C04F | $0040–$004F | 16 | data | DevSignature: ASCII "RYOUITI OOKUBO  " (developer name used as SRAM magic for soft-reset detection) |
| $D491–$D4E2 | — | ~82 | code | Init: clear vars; InitRAM; WriteNametable; HideSpritePairs; if !CheckSavedState: set $3F=2/$83=0; InitEntities x2; WriteDefaultConfig; APUSoundInit |
| $D4E3–$D4EE | — | 12 | code | WriteDefaultConfig: copy DevSignature ($C040) → $0110-$011F in RAM; called at end of Init |
| $D4EF–$D501 | — | 19 | code | CheckSavedState: compare $0110-$011F vs DevSignature ($C040); A=1 = match (soft-reset); A=0 = no match (first boot) |
| $D502–$D50D | — | 12 | code | InitRAM entry |
| $D50E | — | — | code | PaletteUpdate |
| $D5FB | — | — | code | CalcNametableAddr |
| $D689 | — | — | code | ReadControllers (mirror of $9689; reads $4016/$4017 → $06-$09; called from NMI; was mislabeled as SoundUpdate) |
| $D6B3–$D705 | — | ~83 | code | DrawNametableText variants |
| $D7B4 | — | — | code | InitEntities |
| $D7CC | — | — | code | ClearEntitySlots |
| $D8D2–$D8F5 | — | 36 | code | DrawSpriteString |
| $D8F6–$D8FC | — | 7 | code | WaitVBlank |
| $D8FD | — | — | code | HideOffscreenSprites |
| $DA93–$DAAC | — | ~26 | code | HideSpritePairs |
| $E413 | — | — | code | ClearEntitySlots2: clears $A0-$A7 and $0103-$010A (8 entity slots) |
| $EA51–$EA7D | — | ~45 | code | APUSoundInit: STA $4015=$0F (enable sq1+sq2+tri+noise); STA $4017=$C0 (5-step, no IRQ); zero 28 channel blocks at $031C–$03FB and $0300–$031B |
| $EA7E–$ECAD | — | ~560 | code | SoundEngineTick: NMI-called; $6D→$F5 (1 channel if game active, else 28); pointer $F0/$F1→$031C; iterate channels; write APU $4000+X*4; call GetChannelDataPtr/ReadChannelByte |
| $ECAF–$ECBD | — | ~15 | code | GetChannelDataPtr: loads $F2/$F3 from ChannelPtrTable[$ECFE + $F4*2] |
| $ECBE–$ECCF | — | ~18 | code | ReadChannelByte: reads next byte from note sequence at ($F2/$F3); advances pointer |
| $ECE6–$ECFD | — | 24 | data | NoteFreqTable: 12 note period-hi values (C through B one octave) for APU frequency registers |
| $ECFE–$ED35 | — | 56 | data | ChannelPtrTable: 28 × u16le pointers to note/SFX sequence data |
| $F000–$F079 | $3000–$3079 | 122 | code | LoadStageData: decode 13×13 nibble grid from StageDataTable; A=stage# (1–35); A=$FF→entry 36 (blank); A≥$24 wraps (A-=$23); PlaceTileBlock each nibble |
| $F07A–$FD44 | $307A–$3D44 | 3276 | data | StageDataTable: 36×91 bytes; nibble-encoded 13×13 block maps; 7 bytes/row (13 data nibbles + 1 pad); stages 1–35 at entries 0–34; entry 35=$FCEB=blank stage (all $DD/$6D = empty + eagle area) |
| $DABB–$DACA | — | 16 | data | TileAttrTable: palette attr per nibble type; 0-4→pal0(brick); 5-9→pal3(steel); A→pal1; B→pal2; C→pal3; D-F→pal0(empty) |
| $DACB–$DB0A | — | 64 | data | TileTypeTable: 4 tile indices per block type; D-F=empty($00×4); 0-3=partial brick($00/$0F); 4=full brick($0F×4); 5-8=partial steel($10/$20); 9=full steel($10×4); A=water($12×4); B=forest($22×4); C=ice($21×4) |
| $DB48–$DB74 | — | ~45 | code | EnemySpawnTick: DEC $82 (delay); if $7F>0 scan $A0+$6C..+2 for free slot; call SpawnEnemy; DEC $7F; DrawEnemiesLeft |
| $DB75–$DBF0 | — | ~28 | code | PlayerMoveTick: entity slots 0-1 only; checks $0B timing; dir from $06,X; calls $E451 |
| $DBF1–$DC3C | — | ~76 | code | EntityMainLoop: X=7..0; check $0100; dispatch via EntityAIDispatch ($DC3D) |
| $DC3D–$DC4F | — | ~19 | code | EntityAIDispatch: Y=(A0>>3)&$FE; JMP via EntityStateTable ($E498) |
| $DC7C–$DCF0 | — | ~117 | code | EntityMovementAI: align-check → AI direction; dir delta lookup ($E46C/$E470); collision check |
| $DE55–$DE63 | — | 15 | code | SpawnAnimTick: INC $A0,X × 14 → set $E0 (1st spawn phase) |
| $DE64–$DE71 | — | 14 | code | DeathAnimTick: INC $A0,X × 14 → FinalizeEntitySpawn (2nd phase / death) |
| $E363–$E408 | — | ~166 | code | SpawnEnemy + FinalizeEntitySpawn: spawn positioning, blink flag, entity type selection, activation |
| $E46C–$E46F | — | 4 | data | DirDeltaX[4]: X delta per direction (up=0, left=-1, down=0, right=+1) |
| $E470–$E473 | — | 4 | data | DirDeltaY[4]: Y delta per direction (up=-1, left=0, down=+1, right=0) |
| $E474–$E476 | — | 3 | data | EnemySpawnX[3]: $18/$78/$D8 (left/center/right spawn columns) |
| $E477–$E479 | — | 3 | data | EnemySpawnY[3]: all $18 (top of play area Y=24) |
| $E47A–$E47B | — | 2 | data | PlayerSpawnX[2]: $58/$98 (88/152) |
| $E47C–$E47D | — | 2 | data | PlayerSpawnY[2]: both $D8 (216 = bottom) |
| $E47E–$E485 | — | 8 | data | EntityInitStatus[8]: $A0×2 (players), $A2×6 (enemies) |
| $E498–$E4B7 | — | 32 | data | EntityStateTable[16×ptr16]: AI dispatch; key states $00→RTS $14→movement $1C→death $1E→spawn |
| $E4EC–$E577 | — | 140 | data | EntityTypeTable[35×4]: entity type byte per stage (0=$80 basic, 1=$A0 fast, 2=$C0 power, 3=$E0→$E3 armor) |
| $E578–$E603 | — | 140 | data | StageEnemyCountTable: 35×4 bytes; enemy type counts per stage (always sum to 20); loaded into $8B-$8E |
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
| $6C | MaxEntityScanIdx | Entity slot upper bound: 1P=5, 2P/Construction=7. Set at $CA76; reset to 5 at $C41A. Read by EnemySpawnTick ($DB48): scans $A0+$6C down to $A0+2 for free slot. 1P → 4 enemy slots (2–5); 2P → 6 scan positions (2–7). |
| $6D | (game active) | Set to 1 at StagePlay |
| $7F | EnemiesRemaining | Enemies left to spawn this stage; DEC'd by EnemySpawnTick ($DB48) on each spawn; compared to 0 to stop spawning |
| $83 | PlayerMode | 0=1P, 1=2P, 2=CONSTRUCTION; cycles via SELECT button |
| $90 | (unknown) | Set to $48 in PlayerSelectLoop |
| $98 | CursorSpriteIdx | OAM sprite index for cursor: $8B + ($83 × 16) |
| $51 | P1Lives | Player 1 life count; initialized to 3 by GameVarsInit; 0 in 1P if P1 dead; $51+$52=0 → game over |
| $52 | P2Lives | Player 2 life count; initialized to 3 (2P) or 0 (1P); $51+$52=0 → game over |
| $68 | EagleStatus | Non-zero=eagle alive; 0=eagle destroyed → CheckGameOver exits game loop |
| $80 | EnemiesOnScreen | Enemies still on field; initialized to 20; decremented on kill; 0→stage clear |
| $82 | SpawnDelay | Enemy spawn cooldown counter; loaded from $84 on each spawn; DEC'd each tick |
| $84 | SpawnDelayBase | Loaded into $82 after each enemy spawn; = $BE-(stage×4); 2P: -20 more |
| $85 | StageNumber | Current stage (1–35). Set to 1 in NewGameSetup ($C2DF); cycled A/B during InterStageScreen ($C159); gameplay starts when Start pressed |
| $8B–$8E | EnemyTypeCounts | Counts of 4 enemy types for current stage; loaded from StageEnemyCountTable ($E578) by LoadStageEnemyCounts ($E42B); used by SpawnEnemy to pick type |
| $6A | SpawnPointRR | Round-robin spawn point index (0–2); INC'd each enemy spawn; wraps to 0 after 2 |
| $6F | PostSpawnDelay | Per-entity post-spawn delay countdown (slot-indexed as $6F,X) |
| $8F | EnemyTypeIdx | Current enemy type being spawned (0–3); advances when count[$8F] hits 0 |
| $90 | EntityPosX[] | Entity X pixel position (ZP array $90,X) |
| $98 | EntityPosY[] | Entity Y pixel position (ZP array $98,X) |
| $A0 | EntityStatus[] | Entity state byte ($A0,X); 0=free; $F0=spawn-anim; $E0=death-anim; $A0/$A2=active. AI dispatch: (val>>3)&$FE indexes EntityStateTable ($E498) |
| $A8 | EntityType[] | Entity type byte ($A8,X); hi nibble: $8x=basic $Ax=fast $Cx=power $Ex=armor; bit2=blink/bonus flag |
| $B0 | EntityAnimState[] | Entity animation state / frame counter ($B0,X); cleared on activation |

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

## Stage Data Format (`LoadStageData` $F000)

Stage tilemap table at **$F07A**, 36 entries × **91 bytes** ($5B) each.
Stages 1–35 at entries 0–34; entry 35 ($FCEB–$FD44) = blank stage loaded when `A=$FF`.

### Decode algorithm
1. Stage N: pointer = $F07A + (N-1) × 91
2. Outer loop: 13 rows × 16 px stride (Y=$10 to $D0, step $10; WaitVBlank each row)
3. Inner loop: 13 columns × 16 px stride (X=$10 to $D0, step $10)
4. Each step: read nibble from packed data (even $5A→high nibble = byte>>4; odd $5A→low nibble = byte&$0F)
5. At row end: INC $5A (skip 1 pad nibble); advance to next row
6. For each nibble: call `PlaceTileBlock` ($D80B) → 2×2 tile block at pixel (X,Y)

**Row layout:** 14 nibbles = 7 bytes (13 data nibbles + 1 padding nibble, discarded)

### Block type encoding (nibble value → terrain type)

| Nibble | Terrain | Tiles | Attr |
|--------|---------|-------|------|
| $0 | Brick (right half) | $00,$0F,$00,$0F | pal0 |
| $1 | Brick (bot half) | $00,$00,$0F,$0F | pal0 |
| $2 | Brick (left half) | $0F,$00,$0F,$00 | pal0 |
| $3 | Brick (top half) | $0F,$0F,$00,$00 | pal0 |
| $4 | Brick (full) | $0F×4 | pal0 |
| $5 | Steel (right half) | $20,$10,$20,$10 | pal3 |
| $6 | Steel (bot half) | $20,$20,$10,$10 | pal3 |
| $7 | Steel (left half) | $10,$20,$10,$20 | pal3 |
| $8 | Steel (top half) | $10,$10,$20,$20 | pal3 |
| $9 | Steel (full) | $10×4 | pal3 |
| $A | Water | $12×4 | pal1 |
| $B | Forest/Bush | $22×4 | pal2 |
| $C | Ice | $21×4 | pal3 |
| $D–$F | Empty | $00×4 | pal0 |

### Stage enemy configuration (`StageEnemyCountTable` $E578)

35 entries × 4 bytes: counts of enemy types [basic, fast, power, armor] per stage. Always sum to 20.
Examples: Stage 1 = [18,2,0,0]; Stage 16 = [16,0,2,2]; Stage 35 = [4,6,0,10].
Loaded into $8B–$8E by `LoadStageEnemyCounts` ($E42B).

### Spawn delay formula

`SpawnDelayBase ($84) = $BE − (stage_number × 4)` — 2P mode: subtract 20 more.
Stage 1: 186 frames/spawn; Stage 35: 50 frames/spawn. Controls enemy spawn rate via $82.

---

## Entity System

### Entity slots

8 slots (indices 0–7) backed by parallel zero-page arrays:

| Array | Description |
|-------|-------------|
| $A0,X | State byte — drives AI dispatch (see below) |
| $90,X | Pixel X position |
| $98,X | Pixel Y position |
| $A8,X | Type byte (hi nibble = tank class; lo bits = flags) |
| $B0,X | Animation frame counter |
| $6F,X | Post-spawn delay (player re-spawn delay) |
| $0103,X | Extended flags (mirror in page 1 RAM) |

Slot 0 = Player 1; Slot 1 = Player 2; Slots 2–7 = enemies.
1P mode: enemy slots 2–5 used ($6C=5); 2P mode: slots 2–7 ($6C=7).

### Entity state machine

```
Free (A0=0) ──[SpawnEnemy]──> SpawnAnim ($F0...$FE) ──14 ticks──> $E0
                                                                     |
                                                            DeathAnim ($E0...$EE)
                                                               ──14 ticks──> FinalizeEntitySpawn
                                                                              → Active ($A0/$A2)
                                                                              → [game running]
                                                                              → [hit] → $E0 (explosion)
                                                                              → Free (0) after explosion
```

### AI dispatch table (`EntityStateTable` $E498)

Dispatch index: `Y = (A0,X >> 3) & $FE`; load 16-bit pointer from $E498,Y; JMP.

| $A0,X range | Y | Handler | Description |
|-------------|---|---------|-------------|
| $00 | $00 | $DBF0 (RTS) | Inactive/free slot |
| $F0–$FE | $1E | $DE55 | Spawn star animation (phase 1 → $E0) |
| $E0–$EE | $1C | $DE64 | Death/spawn animation (phase 2 → activate) |
| $A0–$A7 | $14 | $DC7C | Active entity movement AI |

### Direction encoding (`$A0,X` bits 1–0)

| Bits | Direction | dX | dY |
|------|-----------|-----|-----|
| 00 | Up | 0 | −8 |
| 01 | Left | −8 | 0 |
| 10 | Down | 0 | +8 |
| 11 | Right | +8 | 0 |

Delta tables: `$E46C[dir]` (dX: 0/−1/0/+1), `$E470[dir]` (dY: −1/0/+1/0); multiplied by 8 for pixel speed.

### Spawn positions

Enemies rotate through 3 spawn points (index $6A, wraps 0→1→2→0):
- Left: X=$18 (24), Y=$18 (24)
- Center: X=$78 (120), Y=$18 (24)
- Right: X=$D8 (216), Y=$18 (24)

Players fixed positions: P1 X=$58/$D8 (88,216); P2 X=$98/$D8 (152,216).

### Enemy type selection (`FinalizeEntitySpawn` $E3B8)

1. $8F = current type index (0–3)
2. If $8B+$8F count = 0: advance $8F to next type with non-zero count
3. Decrement count; look up `EntityTypeTable[$E4EC][(stage-1)×4 + $8F]`
4. If type = $E0 (armor): OR with $03 → $E3 (4-hit variant)
5. Blink enemies (flashing power-up) flagged at $7F = 3, 10, or 17 remaining

Enemy type bytes: $80=Basic, $A0=Fast, $C0=Power, $E0/$E3=Armor

---

## CHR ROM Tile Map (PT1 = BG tiles, PT0 = sprite tiles)

CHR ROM at file offset $4010 (PT0 sprites) and $5010 (PT1 BG). All 512 tiles extracted to `tiles/`.

### BG tile ranges (PT1, indexed by nametable byte value)

| Tile range | Content | Notes |
|------------|---------|-------|
| $00 | Blank / transparent | |
| $01–$0F | Brick/terrain tiles | 4 variants × 4 terrain types; 2×2 block pieces |
| $10–$1F | Steel/water/forest/ice terrain | Tile types used by PlaceTileBlock |
| $20–$3F | (various) | Additional terrain, HUD tiles, etc. |
| $40 | © copyright symbol | Large, both planes equal (solid white) |
| $41–$5A | A–Z uppercase alphabet | p0=p1 (solid white glyphs); ASCII-mapped ($41='A') |
| $5B | Right arrow / cursor | Diamond/chevron pointer glyph |
| $5C | Horizontal rule | Two full-width bars at bottom = separator line |
| $5D | Right-pointing arrow → | Chevron arrow pointing right |
| $5E | Roman numeral "I" | Serif capital I: stem 2px wide, serifs 4px. Player-1 selector marker. Used in "I-PLAYER" string ($D2D9) |
| $5F | Roman numeral "II" | Two vertical bars 5px wide with top/bottom crossbars. Player-2 selector marker. Used in "II-PLAYER" string ($D2E2) |
| $60–$68 | NAMCOT logo (9 tiles) | Large pixel-art publisher logo. Plane-1=0 (monochrome, color-1 only). Displayed as one 9-tile-wide BG row on title screen ($D28F) |
| $69 | Period / dot | 2-pixel mark at rows 5–6. Used after "NAMCO LTD" in copyright string ($D30D) |
| $6A | Decorative graphic | Multi-color (uses palette indices 0, 2, 3). Likely NAMCO mascot or title screen decoration |
| $6B | Dash "–" character | Two centered horizontal bars (p0=p1=$7E). Used in "HI-SCORE", "I-PLAYER", "II-PLAYER" strings |
| $6C–$FF | (various) | HUD digits, enemy/life icons, bonus symbols, etc. |

### Title screen string table ($D280–$D345)

Format: each entry = column-byte + tile-index bytes + $FF terminator. $40=©, $41-$5A=A-Z, $30-$39=0-9, $20=space.

| String data | Decoded | Addr |
|-------------|---------|------|
| $60–$68 | NAMCOT logo (9 graphic tiles, 1 row) | $D28F |
| $42 $41 $54 $54 $4C $45 | "BATTLE" | $D299 |
| $43 $49 $54 $59 | "CITY" | $D2A0 |
| $5E $6B | "I-" (player 1 prefix, abbreviated) | $D2A5 |
| $5F $6B | "II-" (player 2 prefix, abbreviated) | $D2A8 |
| $48 $49 $6B | "HI-" | $D2B1 |
| $48 $49 $53 $43 $4F $52 $45 | "HISCORE" | $D2B5 |
| $48 $49 $6B $53 $43 $4F $52 $45 | "HI-SCORE" | $D2BD |
| $31 $20 + "PLAYER" | "1 PLAYER" | $D2C6 |
| $32 $20 + "PLAYERS" | "2 PLAYERS" | $D2CF |
| $5E $6B + "PLAYER" | "I-PLAYER" | $D2D9 |
| $5F $6B + "PLAYER" | "II-PLAYER" | $D2E2 |
| "CONSTRUCTION" | "CONSTRUCTION" | $D2EB |
| $40 + "1980 1985 NAMCO LTD" + $69 | "© 1980 1985 NAMCO LTD." | $D2F8 |
| "THIS PROGRAM WAS" | "THIS PROGRAM WAS" | $D30F |
| "ALL RIGHTS RESERVED" | "ALL RIGHTS RESERVED" | $D320 |
| "OPEN-REACH" | "OPEN-REACH" (meaning TBD) | $D334 |

---

## Title Screen Layout (`DrawTitleScreen` $D17F)

Drawn once to nametable $24. Strings use ASCII tile indices; $FF = terminator.

| Element | Type | String addr | Notes |
|---------|------|-------------|-------|
| NAMCOT logo graphic | BG | $D28F | 9 tiles $60–$68 (large monochrome pixel-art logo) |
| "BATTLE CITY" | Sprite | $D299/$D2A0 | DrawSpriteString, 8×16 sprite tiles |
| "I-" (P1 indicator) | BG | $D2A5 | Tiles $5E $6B = Roman-I + dash |
| "II-" (P2 indicator) | BG | $D2A8 | Tiles $5F $6B = Roman-II + dash |
| "HI-SCORE" | BG | $D2BD | $6B = dash; score area label |
| "1 PLAYER" | BG | $D2C6 | Menu option 0 |
| "2 PLAYERS" | BG | $D2CF | Menu option 1 |
| "I-PLAYER" | BG | $D2D9 | $5E = Roman "I"; full text with PLAYER |
| "II-PLAYER" | BG | $D2E2 | $5F = Roman "II"; full text with PLAYER |
| "CONSTRUCTION" | BG | $D2EB | Menu option 2 |
| "© 1980 1985 NAMCO LTD." | BG | $D2F8 | $40=©, $69=period/dot |
| "ALL RIGHTS RESERVED" | BG | $D320 | |
| "OPEN-REACH" | BG | $D334 | Meaning TBD |

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
| 0 | $CA6F | 1P: LDA #$05, JMP $CA76 (shared STA $6C; JSR NewGameSetup; JMP InterStageScreen) |
| 1 | $CA74 | 2P: LDA #$07, fall-through to STA $6C at $CA76 |
| 2 | $CA7E | CONSTRUCTION: LDA #$07; STA $6C=$CA80; JMP ConstructionEntry |

---

## Controller Read (`ReadControllers` $9689)

Strobe $4016: write 1 then 0. Read 8 bits from $4016 (P1) and $4017 (P2) via ROR loop.

Bit layout of $06/$07 (raw) and $08/$09 (new presses):
- bit7=Right  bit6=Left  bit5=Down  bit4=Up  bit3=Start  bit2=Select  bit1=B  bit0=A

---

## Sound Engine

### APU initialization (`APUSoundInit` $EA51)

Called at startup. Writes:
- `$4015 = $0F` — enable square 1, square 2, triangle, noise channels
- `$4017 = $C0` — 5-step frame counter mode, IRQ disabled

Zeros 28 channel data blocks at `$031C–$03FB` (8 bytes each) and status array `$0300–$031B` (28 bytes).

### Sound engine tick (`SoundEngineTick` $EA7E)

Called from NMI handler every frame (after ReadControllers and HideSpritePairs).

**Channel count selection:** `$6D` (game-active flag) controls $F5:
- `$6D = 0` (not in gameplay): `$F5 = $1C = 28` — process all channels
- `$6D ≠ 0` (in gameplay): `$F5 = 1` — process only 1 channel

**Channel data layout** (8 bytes per channel at `$031C + N×8`):

| Byte offset | Purpose |
|-------------|---------|
| 0 | Current command / note type |
| 1–4 | APU register values (written to $4000+hwchan*4) |
| 5 | Sequence byte position |
| 6 | Duration / timer lo |
| 7 | Duration counter |

**Status array:** `$0300[N]` = active flag for channel N (0=inactive)
**APU hardware mapping:** channel N → hardware channel `N mod 4` (sq1/sq2/tri/noise)

### Helper routines

| Address | Name | Description |
|---------|------|-------------|
| $ECAF | GetChannelDataPtr | Loads $F2/$F3 from ChannelPtrTable[$ECFE + $F4×2] |
| $ECBE | ReadChannelByte | Reads next byte from note sequence at ($F2/$F3); advances pointer |
| $ECE6 | NoteFreqTable | 12 note period-hi values (C–B) for APU frequency register |
| $ECFE | ChannelPtrTable | 28 × u16le pointers to note/SFX sequence data in ROM |

**Note:** `$D689` (labeled "SoundUpdate" in earlier sessions) is actually `ReadControllers` — it reads $4016/$4017 with strobe protocol, edge-detects into $06–$09. Same code as $9689. It is NOT a sound routine.

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
| NAMCOT branding | Not present | CHR BG tiles $60–$68 = NAMCOT logo graphic (9-tile row); $5E=Roman-I; $5F=Roman-II; $6B=dash "-"; copyright "© 1980 1985 NAMCO LTD." |
| Stage select | Not present | Yes — cheat via P1+P2 combo |
| Starting lives DIP | Yes ($4016 bit4 → 3 or 5 lives) | No DIP; lives stored separately; $6C=5/7 is entity slot bound, not lives |
| CONSTRUCTION mode | Not present | Yes (menu option 2) |

---

## Next Tasks

- [x] Understand what $6C=5/$6C=7 controls exactly. **Done.** $6C = MaxEntityScanIdx (entity slot upper bound). Set at $CA76 to 5 (1P) or 7 (2P/Construction); reset to 5 at $C41A (stage end). Only read by EnemySpawnTick ($DB48): scans $A0+$6C down to $A0+2 for free enemy slot. 1P → 4 enemy slots (2–5); 2P → 6 scan positions (2–7). $7F = enemies remaining, DEC'd on spawn. $E363 = SpawnEnemy.
- [x] Identify GameInit ($C159) — what does it set up? **Done.** $C159 is InterStageScreen, NOT a generic init. Called by Start1P/2P after NewGameSetup. Shows current stage; A button increments $85 (stage), B decrements; $85 wraps between 1 and 35. Pressing Start (or $4C≠0 timeout) exits at $C1C5 to begin actual gameplay. Real game subsystem init happens at $C1C5 onward (JSR ConstructionSetup/$CB5D, $CC27, $CCB2). NewGameSetup itself ($C2B3) initializes $66/$67/$4C/$51/$52/$6A/$85, then returns.
- [x] Map StagePlay ($C3B5) — level data loading, entity init. **Done.** StagePlay ($C3B5) = new-game init (vars, blank map, sprites, entities, $C331 spawn init, HUD). Actual game loop is in StageStartSetup ($C1C5) at $C1F9: WaitVBlank → GameTickMain ($C2E6) → CheckGameOver ($C728) → loop. Stage tilemap loaded by $F000(A=$85) from $F07A (35×91 bytes). Stage nibble types: D-F=empty, 0-3=partial brick, 4=full brick, 5-8=partial steel, 9=full steel, A=water, B=forest, C=ice. Enemy counts per stage from $E578 (35×4 table) → $8B-$8E. SpawnDelayBase=$BE-stage×4. CheckGameOver exits on eagle destroy ($68=0), stage clear ($80=0), or all lives ($51+$52=0).
- [x] Map entity/enemy system: SpawnEnemy ($E363) internals; EntityType table; movement/AI dispatcher; understand $8B-$8E usage in spawn logic. **Done.** Entity state machine: Free(0)→SpawnAnim($F0, 14 ticks via $DE55)→$E0→DeathAnim(14 ticks via $DE64)→FinalizeEntitySpawn($E3B8)→Active($A0/$A2). 8 slots: 0-1=players, 2-7=enemies (2-5 in 1P, 2-7 in 2P). Direction 0=up/1=left/2=down/3=right (dX: $E46C, dY: $E470, ×8 px/frame). Enemy spawns at X=$18/$78/$D8 (round-robin $6A), Y=$18. Type selection: $8F indexes $8B-$8E counts → $E4EC[(stage-1)×4+$8F] ($80=basic $A0=fast $C0=power $E0→$E3=armor). Blink flag at $7F=3/10/17. EntityStateTable($E498): 16 ptrs; AI dispatch at $DC3D. Added 17 new labels, EntityStateTable/EntityTypeTable/spawn tables documented.
- [x] Extract CHR ROM tiles — identify tiles $5E/$5F/$6B (namcot logo?), $60–$68 (credit names). **Done.** Fixed TILE_SZ bug in extract_tiles.py. CHR tiles extracted to tiles/. BG font: $40=©, $41–$5A=A–Z, $6B="-" dash (used in HI-SCORE/I-PLAYER/II-PLAYER). Tiles $5E=Roman-numeral-I (player-1 indicator), $5F=Roman-numeral-II (player-2 indicator), $6B=dash separator. Tiles $60–$68 = 9 NAMCOT logo graphic tiles (monochrome, plane-1=0), displayed as one row on title screen at $D28F — confirmed by raw string table at $D280. Full string table decoded: "© 1980 1985 NAMCO LTD.", "ALL RIGHTS RESERVED", "OPEN-REACH". Added CHR ROM Tile Map section and corrected Title Screen Layout table.
- [x] Map sound engine ($D689 and call sites at $EA7E). **Done.** $D689 = ReadControllers (mislabeled "SoundUpdate" — it reads $4016/$4017). The real sound engine: $EA51=APUSoundInit (enables sq1+sq2+tri+noise; $4017=$C0; zeros 28 channel data blocks at $031C–$03FB). $EA7E=SoundEngineTick (NMI-called; $6D→$F5: 1 channel if game, else 28; iterate channels at $031C, each 8B; $ECAF=GetChannelDataPtr reads $F2/$F3 from ChannelPtrTable at $ECFE; $ECBE=ReadChannelByte reads note sequence; writes APU $4000+X×4). $ECE6=NoteFreqTable (12 note periods). $ECFE=ChannelPtrTable (28 × u16le ptrs to note/SFX seq data). $0300[$F4]=channel active status; $0300–$031B=28-byte status array; $031C–$03FB=28 × 8B channel state blocks.
- [x] Understand CheckSavedState / DefaultConfig ($D4EF / $C040) — continue feature? **Done.** $C040–$C04F = DevSignature "RYOUITI OOKUBO  " (16-byte ASCII dev name as SRAM magic). $D4E3 = WriteDefaultConfig (copies signature to RAM $0110–$011F, called at end of Init). $D4EF = CheckSavedState (compare $0110 vs $C040; A=1→soft-reset, skip $3F/$83 init; A=0→first boot, set $3F=2/$83=0). This is Battle City's "continue" mechanism: on first power-on the RAM won't have the signature so game resets state; on soft-reset the signature survives and state is preserved.
- [x] Locate and map level/stage data (35 stages in Famicom vs 40 in VS). **Done.** StageDataTable confirmed at $F07A (Famicom ROM), 36 × 91 bytes = $F07A–$FD44. Entries 0–34 = stages 1–35 (playable). Entry 35 ($FCEB–$FD44) = blank stage loaded via A=$FF (mostly $DD/empty with eagle-area $6D). LoadStageData ($F000): A<$24→use as stage# directly; A≥$24→wrap (A-=$23); A=$FF→force entry 36. web/levels.js confirmed correct (same 35 stage layouts). REVERSE.md had wrong end ($F4C5→$FD44) and wrong count (1092→3276 bytes). web/levels.js header comment and tile type labels fixed.
- [x] Map entity/enemy system (EntityType table, movement, AI) — covered above
- [ ] Identify $DA93 role in NMI more precisely (appears to be sprite hiding, not controller)
- [ ] Locate high score save/load logic
- [ ] Identify palette data location and format
- [ ] Understand GameTickMain subsystems ($E181, $E1FA, $E02E, $E2A9, $E27C, $E122, $E162, $DB0B, $C7C8) — bullet/collision/explosion/score logic
