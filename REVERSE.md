# VS. Battle City — Reverse Engineering Notes

## ROM Identification

| Field | Value |
|-------|-------|
| File | `VS. Battle City (1985)(Namco).nes` |
| Format | iNES |
| Platform | NES / Nintendo VS. System arcade cabinet |
| CPU | MOS 6502 (2A03) |
| Mapper | 99 (VS. System — linear 32KB PRG, no bankswitching) |
| PRG-ROM | 2 × 16 KB = 32,768 bytes |
| CHR-ROM | 2 × 8 KB = 16,384 bytes |
| Mirroring | Horizontal |
| VS. System | Yes |

### Interrupt Vectors
| Vector | Address |
|--------|---------|
| NMI    | `$D300` |
| RESET  | `$C070` |
| IRQ    | `$C070` (shared with RESET) |

---

## File Layout

| Start   | End     | Size   | Type    | Notes |
|---------|---------|--------|---------|-------|
| 0x00000 | 0x0000F | 16 B   | Header  | iNES header |
| 0x00010 | 0x04010 | 16 KB  | PRG bank 0 | CPU $8000–$BFFF — level code + level data |
| 0x04010 | 0x08010 | 16 KB  | PRG bank 1 | CPU $C000–$FFFF — all engine code |
| 0x08010 | 0x09010 | 4 KB   | CHR bank 0 | PPU $0000–$0FFF (sprites pattern table) |
| 0x09010 | 0x0A010 | 4 KB   | CHR bank 1 | PPU $1000–$1FFF (bg pattern table) |
| 0x0A010 | 0x0B010 | 4 KB   | CHR bank 2 | PPU (alternate) |
| 0x0B010 | 0x0C010 | 4 KB   | CHR bank 3 | PPU (alternate) |

---

## CPU Memory Map

| Range         | Purpose |
|---------------|---------|
| $0000–$00FF   | Zero page — key game variables |
| $0100–$017F   | Stack (128 bytes; SP initialised to $7F) |
| $0180–$01FF   | PPU write queue (applied during VBlank by NMI) |
| $0200–$02FF   | OAM shadow buffer (DMA'd to PPU at NMI) |
| $0300–$03FF   | Entity bullets, misc buffers; $0310 = enemy fire trigger |
| $0400–$07FF   | Sprite work buffer (4 pages, zeroed each frame) |
| $8000–$BFFF   | PRG bank 0 code/data (level init routines + level tables) |
| $C000–$FFFF   | PRG bank 1 code/data (all engine code) |
| $2000–$2007   | PPU registers |
| $4016         | P1 controller + VS. coin inputs |
| $4017         | P2 controller + DIP switches; bits 7–6 = color variant ($4E) |
| $4020         | VS. System service register |

---

## Zero Page Variable Map

| Addr | Name | Notes |
|------|------|-------|
| $00–$01 | Ptr0 | General-purpose indirect pointer (used via `($00),Y` etc.) |
| $05 | NametableId | Nametable selector: $1C/$20/$24/$28 passed to WriteNametable |
| $06–$07 | P1Dir / P2Dir | Player 1 / 2 direction input (bits encoded by $E50E) |
| $08–$09 | P1Fire / P2Fire | Player 1 / 2 fire input |
| $0A–$0B | FrameHi / FrameLo | Frame counter; incremented by NMI; $0B used for VBlank sync |
| $0C | PPUQueueIdx | Write index into PPU queue at $0180 |
| $0D | OAMHideIdx | OAM hide index for DB22 |
| $0E | OAMHideStep | OAM hide step |
| $0F | RngState | PRNG output register (updated each call to $D37C) |
| $10 | RngRingIdx | PRNG ring-buffer index into ZP $00,X |
| $11–$12 | SrcPtr | Source data pointer (low/high) — sprite and nametable draw; also used as dispatch target |
| $41 | StageNum | Current stage/level number (index into $8000 and $801A tables) |
| $42 | SubStageIdx | Sub-stage or formation index within a stage |
| $43 | EnemyCount | Enemy count remaining in current wave |
| $46 | PlayerCount | Player count / game mode |
| $47–$48 | TileX / TileY | Tile coordinates used by $D726 / $DABA |
| $4A | — | Cleared at init |
| $4B | CoinBtn | Coin or start button pressed flag |
| $4C | Credits? | Cleared at game start |
| $4D | NMISyncFlag | 0 = do OAM DMA in NMI; 1 = skip OAM DMA |
| $4E | DIPBits | DIP switch high 2 bits (from $4017 AND $C0); affects palette |
| $4F–$50 | ScrollX/Y | PPU scroll X/Y; written to $2005 in NMI |
| $51 | P1Lives | Player 1 lives remaining |
| $52 | P2Lives | Player 2 lives remaining |
| $53 | SprTileBase | Sprite tile index base (set before $DABA / $DB02 calls) |
| $54–$55 | SprSaveX/Y | Saved X/Y for two-part sprite draw ($DB02) |
| $56–$57 | DrawX / DrawY | Draw target X/Y (used by nametable routines) |
| $5A | EntityIdx | Entity loop counter (temp, counts 7→0 or 9→0) |
| $60 | GameState | Game state machine: $00=init, $6E=attract/title, $30=? |
| $62 | EffectTimer | Countdown timer for visual effects |
| $66–$67 | — | Cleared at game start |
| $68 | — | Compared to $80 in input code; set by level init to stage phase |
| $6A | SpawnRotIdx | Enemy spawn-point cyclic index (0→1→2→0…); cycles 3 spawn X positions |
| $6B | GameActive | Non-zero = game in progress |
| $6D | ServiceMode | Non-zero = VS. System service mode active |
| $6E | NametableCfg | Nametable config byte; $00=clear, $20=set by most handlers |
| $64–$65 | DirDeltaX/Y | Temporaries for CalcDirToTarget ($DE56): sign-of-delta values (0/1/2) |
| $6C | EnemySpawnSlot | Entity slot index to try for next enemy spawn (used by $DBF6) |
| $6F,X | DirTimer | Per-entity direction-change delay timer (X = entity 0–7) |
| $71–$72 | TargetX/Y | AI navigation target pixel position (set by DirTowardP1/P2/HQ before CalcDirToTarget) |
| $7F | EnemiesRemaining | Enemies left to spawn this wave (20→0); checked at 17/10/3 to mark power-up tanks |
| $80 | EnemyKillsPool | Enemies left to kill for stage clear (20→0); decremented by EnemyKilled |
| $82 | SpawnDelay | Inter-enemy spawn cooldown (loaded from $84; counts down before next spawn) |
| $83 | GameInProgress | Non-zero = game running (guards input merge) |
| $84 | SpawnDelayMax | Max spawn delay; loaded into $82 each time a new enemy spawns |
| $85 | GameSpeed | Game pace/speed control; compared against $41 |
| $86 | EffectX | Active area-effect X position; 0 = no effect |
| $87 | EffectY | Active area-effect Y position (paired with $86) |
| $89,X | ShieldTimer | Per-player shield countdown (X=0–1); decremented every 64 frames |
| $8B–$8E | SpeedParams | Four speed parameters loaded from SpeedTable by SetSpeedPtr |
| $8F | EnemyQueueIdx | Index into enemy type queue (ZP $8B,Y → type countdown) |
| $90,X | EntityX | Entity X positions (8 bytes; X = 0–7) |
| $98,X | EntityY | Entity Y positions (8 bytes) |
| $A0,X | EntityState | Entity state byte (see format below) |
| $A8,X | EntityType | Entity type byte; bit 2 set ($04) = power-up/armored tank |
| $45 | PowerUpTimer | Power-up appearance countdown; decremented every 64 frames when non-zero |
| $B0,X | EntitySprFrame | Per-entity sprite animation frame (XOR'd by $04 for blinking) |
| $B8,X | BulletX | Primary bullet X position (per entity; X = entity index 0–7) |
| $C0,X | SavedBulletX | Double-shot saved secondary bullet X (copied from $B8,X before firing new bullet) |
| $C2,X | BulletY | Primary bullet Y position (per entity) — **not** BulletOwner |
| $CA,X | SavedBulletY | Double-shot saved secondary bullet Y (copied from $C2,X) |
| $CC,X | BulletState | Bullet state byte (same state-machine format as EntityState; see $E595 table) |
| $D4,X | BulletFired | Saved bullet state at fire time (for double-shot secondary tracking) |
| $D6,X | BulletDouble | Double-shot / armor flags (bit 0=double, bit 1=armor-piercing) |
| $DE,X | SavedBulletDouble | Double-shot flag saved alongside SavedBulletX/Y |
| $E0,X | EntityTilePtr | Entity tile-map pointer low byte (high 2 bits in $E8,X bits 1–0) |
| $E8,X | EntityFlags | Collision alignment flags (bit7=X-aligned, bit6=Y-aligned, bits1–0=tilemap page) |

### Direction Encoding (corrected from delta table $E529)
| Dir value | Meaning | dx | dy | Input bit |
|-----------|---------|----|----|-----------|
| 0 | UP    | 0  | −1 | bit 4 of direction byte |
| 1 | LEFT  | −1 | 0  | bit 6 |
| 2 | DOWN  | 0  | +1 | bit 5 |
| 3 | RIGHT | +1 | 0  | bit 7 |

DirDeltaTable ($E529, 8 bytes): `{0, $FF, 0, 1, $FF, 0, 1, 0}` = dx[0..3] then dy[0..3]
DecodeDirection ($E50E): tests bits 7,6,5,4 of input byte → returns dir 3,1,2,0 respectively.

### Entity State Byte Format (`$A0,X`)
```
Bit 7   : 1 = entity active / alive
Bits 6–4: behavior/movement state → selects handler in dispatch tables
Bits 3–0: lower nibble used as countdown timer within a state (decremented by handlers)
Bits 1–0: direction (up=0, left=1, down=2, right=3)
```

### Entity Layout (indices 0–7)
- **0–1**: Player tanks — move on 3 of every 4 frames (skip when $0B mod 4 = 2); entity 1 = AI-controlled in 1-player mode
- **2–7**: Enemy tanks — AI-driven, throttled by speed ($85) and alternating-frame check; $A8,X bit 2 ($04) = power-up tank (flashing)

### Bullet Layout (per entity index X = 0–7)
- Primary bullet: $CC,X (state), $B8,X (X), $C2,X (Y), $D6,X (double/armor flags)
- Secondary bullet (double-shot): $D4,X (saved state), $C0,X (saved X), $CA,X (saved Y), $DE,X (saved double flag)
- Before firing a new bullet, old bullet data is saved to secondary slots; then FireBullet writes fresh bullet at state = dir | $40
- Dispatched by $E0F0 via $E595 table; state uses same format as EntityState

### Initial Entity States ($E53B, 8 bytes)
| Index | Value | Meaning |
|-------|-------|---------|
| 0–1   | $A0   | Active, behavior 2, direction 0 (right) — players |
| 2–7   | $A2   | Active, behavior 2, direction 2 (up) — enemies |

---

## Bank 0 Layout ($8000–$BFFF)

| Range | Type | Contents |
|-------|------|----------|
| $8000–$8019 | Pointer table | 13 × 2 B: level init-routine pointers (indexed by `$41 * 2`) |
| $801A–$8033 | Pointer table | 13 × 2 B: per-stage enemy-formation outer pointers |
| $8034–$80A3 | Data | Per-stage inner data tables (pairs of 16-bit pointers to enemy/sprite data) |
| $80A4+  | Mixed | More inner data tables |
| $874D+  | Code | Level 0 init routine; reads stage conditions, dispatches via ZP Ptr0 |
| $86E0+  | Code | Stage loader: reads $8000[stage] ptr → sets Ptr0 → JMP ($0000) |
| $8B63   | Code | `STA $01; JMP ($0000)` — trampoline that jumps through ZP Ptr0 |
| $8B69+  | Code | Entity slot fill / enemy queue setup |
| various | Code/Data | Level init routines and tile/sprite data for all 13 stages |

### Level Map Pointer Table ($8000, 13 entries)
| Stage | Ptr   | Notes |
|-------|-------|-------|
| 0  | $874D | Level 0 init code |
| 1  | $8A6E | Level 1 init code |
| 2  | $896A | Level 2 init code |
| 3  | $91E8 | Level 3 init code |
| 4  | $8B48 | Level 4 init code |
| 5  | $D309 | Level 5 init code (bank 1) |
| 6  | $D184 | Level 6 init code (bank 1) |
| 7  | $D309 | Level 7 (shared with 5) |
| 8  | $D19F | Level 8 init code (bank 1) |
| 9  | $BB32 | Level 9 init code |
| 10 | $BE65 | Level 10 init code |
| 11 | $90BC | Level 11 init code |
| 12 | $91E8 | Level 12 (shared with 3) |

### Enemy-Formation Outer Pointer Table ($801A, 13 entries)
Each entry → inner table of 16-bit pointers to per-enemy sprite/position data blocks.
| Stage | Outer Ptr | Notes |
|-------|-----------|-------|
| 0  | $8034 | 12 formation entries |
| 1  | $8078 | |
| 2  | $806C | |
| 3  | $803C | |
| 4  | $804C | |
| 5  | $805E | |
| 6  | $8084 | |
| 7  | $8066 | |
| 8  | $807C | |
| 9  | $808A | |
| 10 | $8096 | |
| 11 | $80A0 | |
| 12 | $80A4 | |

---

## Code Map (Bank 1: $C000–$FFFF)

| Address | Label | Purpose |
|---------|-------|---------|
| $C070 | Reset | RESET/IRQ handler; hardware init, wait 2 VBlanks, start |
| $C0A9 | MainLoopTop | Top of main loop: calls CF96, C65C, C67B, C389, C402 |
| $C0BB | AttractEntry | Attract / service mode entry point |
| $C232 | MergeInputs | Merge P2 into P1 in 1-player mode |
| $C264 | ReadCoinInput | Read VS. coin/start; set P1/P2 lives (3 or 5) |
| $C29F | GameUpdate2 | Per-frame: 16 subsystem calls (AI, movement, bullets, etc.) |
| $C2D9 | PaletteFlash | Cycle palette slots 5/6 every 32 frames (player shield flash) |
| $C389 | MainLoop_4 | Check VS. service button ($4017 bit 2); read inputs |
| $C402 | GameFrame | Core game frame loop; runs subsystems until game-over |
| $C43F | SetHUDSprites | Write $70 to OAM bytes $0105/$0106/$0108 (HUD sprites) |
| $C5A1 | GameUpdate1 | Bullet spawn check loop: checks effect/entity active, calls $DE56 |
| $C62F | CheckGameOver | Returns zero flag set if game continues |
| $C65C | MainLoop_2 | Wait 240 frames or until coin; title screen animation |
| $C67B | MainLoop_3 | Wait 8 frame-counter ticks or until coin |
| $C6C5 | StartGame | Transition to game state $6E; set $5A=$6B=1 |
| $C69A | AnimateTitleSprite | Toggle between $D1A7/$D1BA for blinking attract animation |
| $CF96 | MainLoop | Per-frame: call D5AF, D3A1, D3AC, D7D4, Init2 |
| $CFAA | PreLoop | Pre-game sequence: draw title elements, wait |
| $D300 | NMI | Save regs; trigger rendering; OAM DMA; scroll; flush PPU queue |
| $D352 | NMI_Sub | First NMI sub (to be disassembled) |
| $D37C | RNG | PRNG: A = ($0F×8 − $0F + $0A + ZP[$10]) & $FF; updates $0F, $10 |
| $D396 | Init2 | Clear NMI sync flag; wait VBlank |
| $D3A1 | WaitNMI | Set NMI sync flag; wait VBlank |
| $D3AC | ClearSpriteBuf | Zero pages $04–$07 (sprite work buffer) |
| $D3BF | Init | Hardware init: clear ZP vars, read DIP, init PPU, clear OAM |
| $D41E | InitPalette | Write 32-byte palette table to PPU $3F00 |
| $D44A | PaletteData | 32-byte base palette: 4 BG palettes + 4 sprite palettes |
| $D46A | PaletteApplyDIP | OR raw palette index with $4E, lookup in $D475 colour table |
| $D475 | PaletteColorTable | Colour remapping table for DIP switch variants |
| $D5AF | SetGamePalette | Write fixed gameplay palette colours (hardcoded NES indices) |
| $D5D3 | SetTitlePalette | Write palette colours from PaletteData table (title screen) |
| $D6D3 | DrawSprites | Draw sprite data: reads (src ptr), writes to sprite buffer |
| $D726 | TilePosLookup | Calc tile coordinates from entity X/Y → $47/$48 |
| $D7D4 | WriteNametable | Write nametable tiles to PPU VRAM (controlled by $05, $11/$12) |
| $D95F | WaitVBlank | Spin on $0B frame counter until NMI increments it |
| $D966 | WaitVBlankX | Wait X VBlanks |
| $D96D | FlushPPUQueue | Apply deferred PPU write queue ($0180) during VBlank |
| $DA7F | ZeroSlot | Zero 8 bytes at ZP $00+X…$07+X; set $07+X=$FF (slot clear) |
| $DA94 | BCD_Div | Divide A by 10 repeatedly → BCD in $3A (tens) and $3B (units) |
| $DABA | DrawEntityTile | Draw one 8×8 tile into OAM: X=pixel-x, Y=pixel-y, $53=tile, $04=attr |
| $DB02 | DrawTank2x2 | Draw 2-part entity sprite: direction × 8 + frame → tile, calls $DABA twice |
| $DB0A | DrawTank | Set pixel origin (X,Y), compute tile from $53/$04, call $DABA twice |
| $DB22 | HideSprites | Fill unused OAM entries with $F0 (offscreen Y) |
| $DB3E | QueuePaletteWrite | Append {$3F, slot, colour, $FF} to PPU write queue at $0180 |
| $DC23 | EnemyAI | AI for entity 1 (P2 slot, AI-controlled in 1-player): direction snapping, 1-in-32 random turn |
| $DC9E | NullHandler | Single RTS — used by state machine for inactive/null states |
| $DC9F | EntityMovement | Loop all 8 entities; player frame-throttle; enemy type/speed check; call $DCF1 |
| $DCF1 | EntityDispatch | Y=(state>>3)&$FE; JMP through $E555 table |
| $DD06 | ShieldHandler | Player shield timer: blink sprite ($B0,X XOR $04); enemy: DEC state by 4, trigger $E4DD |
| $DD30 | MoveGridSnap | Enemy: snap to 8-px grid then random-direction ($D37C) |
| $DE9E | StateCountdown | DEC $A0,X; on lower-nibble=0 step down one state tier |
| $DEBA | PlayerKilled | Player death: DEC $51/$52; if no lives → game-over, else respawn via $E417 |
| $DEC9 | EnemyKilled | Enemy death: DEC $80 (shared pool) |
| $DECC | SpawnP2 | Write spawn sprite OAM for P2 ($0103–$0108) then call $DEFA |
| $DEE8 | SpawnP1 | Write spawn sprite OAM for P1, call $DEFA |
| $DEFA | SpawnReset | Write spawn sprite data ($0106–$0108); reset frame counter ($0B=0) |
| $DF09 | StateIncSlot | INC $A0,X; if lower-nibble reaches $E, set state to $E0 (activate) |
| $DF18 | StateIncFire | INC $A0,X; if lower-nibble reaches $E, call $E46C (full spawn+queue) |
| $DF5A | MoveUpdate | Loop all 8 entities; dispatch position-update via $E575 table |
| $DF81 | DrawMovingSprite | Draw entity sprite using state-derived tile index (movement animation) |
| $DF96 | CalcSprTile | Compute sprite tile from state byte: `(state>>4-7) neg×4+$F1` |
| $DFB1 | DrawSpawnSprite | Draw entity spawn "star" sprite using $A8,X to index into tile block |
| $DFE7 | DrawSmallSprite | Draw entity with tile from $A9 sub-table; used for small spawn frame |
| $DFFA | DrawExpandSprite | Draw 2-part expanding spawn sprite; shift X/Y by 8 and call $DB0A twice |
| $E06A | MoveTank | Main tank position-update handler: read controller dir ($04), compute tile ptr, call $DB02 |
| $E0B7 | EnemySpeedTable | 8-byte table: speed tier index → movement frame pattern (2-bit values) |
| $E0BF | DrawShootSprite | Draw tank in shoot-animation state: tile = `(state&$F-7)*4 + $A1` |
| $E0E2 | BulletUpdate | Loop 10 bullet slots (X=9→0); dispatch via $E595 table |
| $E0F0 | BulletDispatch | Y=(bulletState>>3)&$FE; JMP through $E595 table |
| $E105 | BulletImpact | Bullet hit handler: double-shot check ($D6,X), call move helper |
| $E117 | BulletDelta | Apply DirDeltaTable delta to bullet position: read $E529,Y × scale |
| $E12A | BulletCountdown | DEC $CC,X; on lower-nibble=0, step down state tier |
| $E140 | FireBullet | Set $CC,X = dir|$40; compute bullet start position from entity X/Y/dir |
| $E1AF | BulletExplode | Bullet explosion animation handler |
| $E1C6 | BulletTravel | Move bullet: load $B8,X/$C2,X, apply $DF96 tile, call $DF96 |
| $E1D6 | PlayerFireCheck | Loop entities 1→0: if active & fire pressed & type=$4x & bullet avail, fire |
| $E216 | EnemyFireCheck | If spawn timer=0: loop entities 7→2; 1-in-32 chance (PRNG) to call $E140 |
| $E235 | CalcTilePos | Calc entity tile-map positions + mark collision flags |
| $E2AE | ClearTileFlags | Clear entity collision flags from tile map |
| $E2EF | EntityUpdate | Effect timer decrement |
| $E330 | DrawPlayerShield | Loop entities 0–1; if ShieldTimer > 0: draw blinking shield sprite (tile $29/$2B alternating every 2 frames); decrement timer every 64 frames |
| $E35D | PowerUpSpawn | Manage power-up countdown ($45); animate eagle base ($68 flash timer); dispatch eagle-state handlers via $E3BA table |
| $E417 | PlayerRespawn | Players: load PlayerSpawnX/Y, clear DirTimer. Enemies: cycle SpawnRotIdx ($6A 0→2), load EnemySpawnX/Y; if EnemiesRemaining($7F) = 17/10/3 → mark power-up tank ($A8=4). Both: set state $F0, call DrawNametableTile ($D82B, A=$0F) |
| $E46C | EnemySpawn | Set initial state from $E53B; setup entity slot; update spawn index |
| $E4DD | SetStateLo | A=state-high-nibble → OR into $A0,X preserving lower nibble |
| $E4E8 | SetSpeedPtr | Compute $8B/$8C = pointer into $E6A9 speed table from $85/$46 |
| $E50E | DecodeDirection | Decode direction byte from input: right=0, left=1, up=2, down=3 |
| $E529 | DirDeltaTable | 8 bytes: (dx,dy) pairs for directions 0–3: (0,-1),(0,+1),(-1,0),(+1,0) |
| $E531 | EnemySpawnX | 6 bytes: enemy spawn X positions for entities 0–5: $18,$78,$D8,$18,$18,$18 |
| $E537 | PlayerSpawnX | 2 bytes: P1=$58 (88), P2=$98 (152) |
| $E539 | PlayerSpawnY | 2 bytes: P1=$D8 (216), P2=$D8 (216) |
| $E53B | InitState | 8 bytes: initial EntityState per entity (players=$A0, enemies=$A2) |
| $E555 | MovementDispatch | 24×2 B ptr table: Y=(state>>3)&$FE → EntityMovement handler |
| $E575 | MoveUpdateDispatch | 24×2 B ptr table: Y=(state>>3)&$FE → MoveUpdate position handler |
| $E595 | BulletDispatch | 16×2 B ptr table: Y=(bulletState>>3)&$FE → bullet handler |
| $E6A9 | SpeedTable | Difficulty/speed parameters: 2-byte entries indexed by ($85−1)×4 |
| $E7A9 | ScoreDraw | (to be disassembled) |
| $E8B1 | HUDDraw | (to be disassembled) |
| $EAB5 | BonusDraw | (to be disassembled) |
| $EB17 | LivesDraw | (to be disassembled) |
| $EBF6 | GameOverHandler | Enable APU ($4015/$4017); zero $0300–$031B via X loop and $031C–$03F4 at stride 8 via pointer (clears entity/bullet tracking page) |
| $EC23 | NMI_Sub3 | Stage-summary score/kill-count tabulator; reads $0300,X entries and $6D (ServiceMode); fills $F9–$FC counters for end-of-stage results display |
# New routines (Session 3)
| $DDFC | RandomDirChange | State $50–$5F handler: 50% → SpeedCtrlMove ($DF26); 25% → turn right (dir+1); 25% → turn left (dir−1) |
| $DE22 | ClampXMove | Boundary clamp helper: if A > $56 → A−1 |
| $DE2A | ClampYMove | Boundary clamp helper: if A > $57 → A−1 |
| $DE32 | DirTowardP1 | Load entity 0 X/Y into $71/$72; call DirTowardTarget |
| $DE3D | DirTowardP2 | Load entity 1 X/Y into $71/$72; call DirTowardTarget |
| $DE48 | DirTowardHQ | Load eagle position ($78,$D8) into $71/$72; call DirTowardTarget |
| $DE50 | DirTowardTarget | JSR CalcDirToTarget; STA $A0,X (write new state with direction); RTS |
| $DE56 | CalcDirToTarget | Compute 9-way direction toward ($71,$72) from entity ($90/$98,X): sign(targetX−entityX)→$64, sign(targetY−entityY)→$65; index = $65×3+$64; lookup DirToStateTable[$E543, index or index+9]; return state byte |
| $DB5D | SignFn | Sign of SEC;SBC result: BEQ→A=0; BCS→A=+1; else A=$FF (−1) |
| $DF26 | SpeedCtrlMove | State $50 speed handler: slow ($84>>2 < FrameHi) → set state $B0; medium (random or P1/P2 absent) → set $C0; fast → set $D0; via SetStateLo |
| $D5FC | TileAddrCompute | Tile (X=tileX, Y=tileY) → RAM address: low = tileX | (tileY&7)<<5; high = $04|(tileY>>3). Covers $0400–$07FF |
| $D82B | DrawNametableTile | Write 4-tile pattern to nametable shadow: index in A, pixel position in X/Y; reads $DB69 palette table; calls $D613/$D7A4 to write tiles into $0400–$07FF |
| $E838 | BulletTileCollision | Check bullet at (X=pixelX, Y=pixelY) vs tile map; if eagle ($C8): trigger eagle-hit flags; if steel ($10): stop bullet (armored bullet destroys); if water ($11): stop, no destroy; if brick ($00–$0F, sub-tile bit): stop and destroy ($D763) |
| $DBF6 | EnemySpawnDispatch | If SpawnDelay ($82) > 0: decrement and return. If EnemiesRemaining ($7F) = 0: return. Find free entity slot ($6C→2..7), call PlayerRespawn, DEC $7F, update HUD |
| $DBB9 | CheckPlayersMoving | Check $0311 flag; test if entity 0 or 1 has direction input ($06,X & $F0 ≠ 0) AND is active; update $0311 accordingly |

### GameUpdate2 Subsystem Call Sequence ($C29F)
Each game frame invokes these 18 subsystems in order:
1. `CalcTilePos` — mark entity positions as occupied in tile map (bit 7 of each tile byte)
2. `$C232` — MergeInputs (P2→P1 in 1-player mode)
3. `EnemyAI` — update AI direction for entity 1
4. `EntityMovement` — state-machine dispatch for all 8 entities
5. `ClearTileFlags` — erase entity occupation marks from tile map
6. `BulletUpdate` — move bullets + draw bullet sprites (dispatch via $E595)
7. `PowerUpSpawn` — update power-up countdown and eagle-base animation
8. `DrawPlayerShield ($E330)` — blink shield sprite for spawning players
9. `PlayerFireCheck` — players shoot on button press
10. `EnemyFireCheck` — enemies fire with 1-in-32 random chance
11. `EnemySpawnDispatch ($DBF6)` — spawn next enemy if slot free and delay elapsed
12. `ScoreDraw ($E7A9)` — loop moving bullets: call BulletTileCollision; draw score tile on hit
13. `BonusDraw ($EAB5)` — (to be disassembled)
14. `HUDDraw ($E8B1)` — check impacting bullets vs player entities; deflect with shield or register hit (set CC,X=$33)
15. `LivesDraw ($EB17)` — check effect position ($86/$87) against entities; area-kill within 12px
16. `$C7F8` — (to be disassembled)
17. `CheckPlayersMoving ($DBB9)` — update $0311 movement flag
18. `StartGame ($C6C5)` — check game-start transition

### Nametable Shadow and Tile Collision Map
The 1 KB range **$0400–$07FF** serves dual purpose:
- **Each frame**: ClearSpriteBuf zeros the entire range at frame start
- **Rebuilt by CalcTilePos**: entity positions are written (bit 7 set) before collision checks
- **Tile data** written by level loader and DrawNametableTile represents wall/obstacle type

**Tile byte format** (in collision map):
| Value | Meaning |
|-------|---------|
| $00 | Empty / destroyed (no collision; caught by sub-tile mask check) |
| $01–$0F | Brick — 4-bit sub-tile map (bits 0–3 = four 4×4 quarters; 0=destroyed, 1=intact) |
| $10 | Steel wall — stops all bullets; only armored bullet ($D6 bit 1) destroys |
| $11 | Water — impassable; stops bullets without destroying tile |
| $12–$7F | Passable (open ground, forest, ice) — bullets travel through |
| $80–$FF | Entity-occupied tile (bit 7 set by CalcTilePos; $C0–$DF = entity in normal states) |
| $C8 | Eagle/base — bullet hit triggers game-over sequence |

**Address computation** (`TileAddrCompute $D5FC`):
```
tileX = pixelX >> 3    (0–31)
tileY = pixelY >> 3    (0–29)
addr_low  = tileX | ((tileY & 7) << 5)
addr_high = $04 | (tileY >> 3)     → range $04–$07
RAM address = $0400 + tileY*32 + tileX
```

**Sub-tile mask** (`$D745`): computes 1-bit mask (1, 2, or 4) from within-tile position bits, identifying which quarter of an 8×8 tile the entity/bullet is in. Collision only triggers if that specific brick quarter is still intact.

**Key RAM flags at $0300+**:
| Address | Purpose |
|---------|---------|
| $0307 | Eagle hit flag (set by BulletTileCollision when bullet hits eagle) |
| $030B | Eagle flash trigger |
| $030C | Player bullet wall-penetration flag |
| $030F | Player fired flag (set by FireBullet for player entities) |
| $0311 | Any player has directional input (updated by CheckPlayersMoving) |

### Data Tables (Bank 1)
| Address | Label | Size | Contents |
|---------|-------|------|----------|
| $D44A | PaletteData | 32 B | NES palette indices for 8 palettes |
| $D475 | PaletteColorTable | ? | DIP switch colour remapping |
| $D1A7 | TitleSpriteA | ? | Attract mode sprite frame A |
| $D1BA | TitleSpriteB | ? | Attract mode sprite frame B |
| $E0B7 | EnemySpeedTable | 8 B | Frame-pattern per speed tier |
| $E529 | DirDeltaTable | 8 B | dx[0..3]={0,−1,0,+1} then dy[0..3]={−1,0,+1,0}; dirs: 0=up,1=left,2=down,3=right |
| $E531 | EnemySpawnX | 3 B | Enemy spawn X: $18/$78/$D8 (left/center/right edge) |
| $E534 | EnemySpawnY | 3 B | Enemy spawn Y: $18/$18/$18 (all near top) |
| $E537 | PlayerSpawnX | 2 B | Player spawn X: $58/$98 |
| $E539 | PlayerSpawnY | 2 B | Player spawn Y: $D8/$D8 |
| $E543 | DirToStateTable | 18 B | 9-way direction-to-state lookup; index = (signY+1)×3+(signX+1); set 0 (idx 0–8) = prefer-Y-axis states; set 1 (idx 9–17) = prefer-X-axis states |
| $E53B | InitState | 8 B | Initial EntityState per entity slot |
| $E555 | MovementDispatch | 48 B | Entity state-machine handler pointers |
| $E575 | MoveUpdateDispatch | 48 B | Entity position-update handler pointers |
| $E595 | BulletDispatch | 32 B | Bullet-update handler pointers |
| $E6A9 | SpeedTable | ? | Speed/difficulty parameters |

---

## CHR-ROM / Graphics (Phase 4)

### PPU Pattern Table Assignment
PPU ctrl ($2000) final value = **$B0** = `1011 0000`:
- Bit 7 = NMI enable
- Bit 4 = BG pattern table at **$1000** (pattern table 1)
- Bit 3 = sprite pattern table at **$0000** (pattern table 0)

### CHR-ROM Layout (16KB = 1024 tiles total)
| File offset | PPU addr | Tiles   | Purpose               |
|-------------|----------|---------|-----------------------|
| $8010–$8FFF | $0000–$0FFF | 0–255  | Sprite pattern table  |
| $9010–$9FFF | $1000–$1FFF | 256–511| Background pattern table |
| $A010–$AFFF | (bank 1) | 512–767 | Sprite tiles, bank 1  |
| $B010–$BFFF | (bank 1) | 768–1023| BG tiles, bank 1      |

### Tile Format (NES 2bpp)
- Each tile = 16 bytes: 8 bytes plane-0 + 8 bytes plane-1
- Pixel color index (0–3): bit from plane0 | (bit from plane1 << 1)
- Bit 7 of each row byte = leftmost pixel (x=0)

### Extracted Output
`extract_tiles.py` produces:
- `tiles/chr_all.png` — all 1024 tiles in 32×32 grid (289×289 px)
- `tiles/chr_pt0.png` — pattern table 0 (sprite tiles 0–511)
- `tiles/chr_pt1.png` — pattern table 1 (bg tiles 256–511 of first CHR bank)

### BulletExplode ($E1AF)
```
A = CC[X] & $03          ; extract bullet direction (bits 1:0)
PHA
Y = C2[X]                ; bullet Y (BulletY)
X = B8[X]                ; bullet X (BulletX) — becomes new X register
$04 = $02                ; sprite attribute byte
$53 = $B1                ; base tile for explosion sprite
PLA                       ; restore dir
JSR $DAF3                ; encode dir → tile offset, adjust X by −5, call DrawEntityTile
```
`$DAF3`: A=(dir×2) + $53 → tile index; X−=5; call DrawEntityTile.
Explosion is a single 8×8 sprite centered −5 px from bullet's pixel-X.

### CollisionUpdate ($E18C)
```
$5A = 9                        ; loop counter 9→0 (10 bullet slots)
loop:
  X = $5A
  A = CC[X] >> 3 & $FE         ; BulletState → dispatch index
  Y = A
  ptr = $E59F[Y] : $E5A0[Y]    ; load handler ptr from BulletDispatch+4 offset
  JMP (ptr)                    ; tail-call bullet handler
  DEC $5A; BPL loop
```
This is actually **BulletUpdate** ($E0E2) reconfirmed — iterates all 10 bullet slots and dispatches via the `$E595` bullet dispatch table. (The label `CollisionUpdate` at $E18C may be a misnomer; it dispatches bullet movement, not entity collision.)

---

## Key Algorithms

### NMI / VBlank synchronisation
1. Game calls `WaitNMI` → sets `$4D=1`, spins on `$0B`
2. NMI fires → saves registers, checks `$4D`:
   - `$4D = 0`: full path: OAM DMA, scroll write, FlushPPUQueue
   - `$4D ≠ 0`: skip OAM DMA
3. NMI increments `$0B` → spinning loop exits
4. `Init2` clears `$4D=0` (resync for next frame)

### Deferred PPU writes (`$0180` queue)
- `QueuePaletteWrite`: appends 4-byte record `{$3F, slot, colour, $FF}`
- During NMI (`FlushPPUQueue`): terminates list, writes each record to `$2006`/`$2007`

### Three Entity Dispatch Tables
All three tables use the same index formula:
```
Y = (state_byte >> 3) & $FE      ; even byte offset, range $00..$1E
```
Inactive entities (bit 7 = 0): Y = $00..$0E → table entries [0]..[7]
Active entities (bit 7 = 1): Y = $10..$1E → table entries [8]..[15]

**$E555 — EntityMovement** (called from $DCF1 — state-machine transitions):
| State range | Y | Handler | Role |
|-------------|---|---------|------|
| $00         | $00 | $DC9E (RTS) | Null / completely inactive |
| $10–$3F     | $02–$06 | $DE9E | Countdown: DEC state; on lower-nib=0 step down tier |
| $40–$4F     | $08 | $DD06 | Shield blink / enemy state decrement by 4 |
| $50–$5F     | $0A | $DDFC | (to be mapped) |
| $60–$6F     | $0C | $DD30 | Grid-snap + random direction change |
| $70–$7F     | $0E | $DE48 | (to be mapped) |
| $80–$8F     | $10 | $DC9E (RTS) | Active, null state |
| $90–$9F     | $12 | $DFB1 | Draw spawn "star" sprite |
| $A0–$AF     | $14 | $DFE7 | Draw small spawn sprite |
| $B0–$CF     | $16–$18 | $DFFA | Draw expanding spawn sprite |
| $D0–$FF     | $1A–$1E | $DF81 | Draw moving sprite (animation) |

**$E575 — MoveUpdate** (called from $DF6C — position updates):
| State range | Y | Handler | Role |
|-------------|---|---------|------|
| $00         | $00 | $DC9E (RTS) | Skip |
| $10–$1F     | $02 | $DFB1 | |
| $20–$2F     | $04 | $DFE7 | |
| $30–$4F     | $06–$08 | $DFFA | |
| $50–$7F     | $0A–$0E | $DF81 | |
| $80–$DF     | $10–$1A | $E06A | Move tank: read dir, apply delta, update OAM |
| $E0–$FF     | $1C–$1E | $E0BF | Shoot animation: draw shooting sprite |

**$E595 — BulletDispatch** (called from $E0F0 — bullet updates):
| BulletState | Y | Handler | Role |
|-------------|---|---------|------|
| $00         | $00 | $DC9E (RTS) | No bullet |
| $10–$3F     | $02–$06 | $E12A | Countdown (like entity) |
| $40–$4F     | $08 | $E105 | Bullet impact / hit |
| $50–$5F     | $0A | $DC9E (RTS) | ? |
| $60–$7F     | $0C–$0E | $E1C6 | Bullet travel (move position) |
| $80–$CF     | $10–$18 | $E1C6 | Bullet travel |
| $D0–$DF     | $1A | $E1AF | Bullet explode animation |
| $E0–$FF     | $1C–$1E | $E0BF / other | (edge cases) |

### PRNG ($D37C)
```
A = ($0F × 8) − $0F + FrameHi    ; linear congruential step
$10 = ($10 + 1) & $FF              ; advance ring index
A = A + ZP[$10]                    ; add ring-buffer byte
$0F = A                            ; store new state
return A
```
Used by EnemyAI (random direction 1-in-4) and EnemyFireCheck (1-in-32 fire chance).

### Entity movement dispatch
```
Y = (EntityState >> 3) & $FE        ; 2-byte table index
ptr = [$E555+Y, $E555+Y+1]          ; little-endian function pointer
JMP (ptr)                           ; tail-call to state handler
```

### Tank movement (MoveTank $E06A)
```
if X < 2 (player):
  if DirTimer[$6F,X] != 0 and frame bit 3:  return (throttled)
  dir = $90,X & 3                            ; from entity X (player 1)
else (enemy):
  dir = SpeedTable or EntityType bits
tile_ptr = EntityType | SprFrame → $53
call DrawTank ($DB02): draws 2 tiles (EntityX/Y ± 8 px)
```

### AI direction toward target (CalcDirToTarget $DE56)
```
signX = sign(targetX − entityX)     ; −1, 0, or +1
signY = sign(targetY − entityY)     ; via SignFn ($DB5D)
index = (signY+1) × 3 + (signX+1)  ; 0–8 (nine compass positions)
if entity >= 2 (enemy):
  index += 9 if RNG() & $01         ; 50% chance: prefer-X-axis table
else (player):
  if (X*2) XOR $0A has bit 1 set: index += 9   ; fire-button modifier
new_state = DirToStateTable[$E543, index]         ; look up state byte
EntityState[X] = new_state                        ; write direction into state
```

**DirToStateTable decoded** (`$E543`, 18 bytes: `A0 A0 A0 A1 A0 A3 A2 A2 A2  A1 A0 A3 A1 A0 A3 A1 A2 A3`):

| idx | signY | signX | Set-0 state (prefer-Y) | Set-1 state (prefer-X) |
|-----|-------|-------|------------------------|------------------------|
|  0  |  −1   |  −1   | $A0 = UP               | $A1 = LEFT             |
|  1  |  −1   |   0   | $A0 = UP               | $A0 = UP               |
|  2  |  −1   |  +1   | $A0 = UP               | $A3 = RIGHT            |
|  3  |   0   |  −1   | $A1 = LEFT             | $A1 = LEFT             |
|  4  |   0   |   0   | $A0 = UP (default)     | $A0 = UP               |
|  5  |   0   |  +1   | $A3 = RIGHT            | $A3 = RIGHT            |
|  6  |  +1   |  −1   | $A2 = DOWN             | $A1 = LEFT             |
|  7  |  +1   |   0   | $A2 = DOWN             | $A2 = DOWN             |
|  8  |  +1   |  +1   | $A2 = DOWN             | $A3 = RIGHT            |

Set 0 (prefer-Y): diagonals resolve vertically. Set 1 (prefer-X): diagonals resolve horizontally. Enemies randomly pick between sets for obstacle avoidance.

Callers:
- `DirTowardHQ ($DE48)`: target = ($78, $D8) — eagle/base position
- `DirTowardP1 ($DE32)`: target = entity 0 pixel position
- `DirTowardP2 ($DE3D)`: target = entity 1 pixel position

### Enemy spawn wave ($DBF6)
```
if SpawnDelay ($82) > 0: DEC $82; return
if EnemiesRemaining ($7F) = 0: return   ; all 20 spawned
find free entity slot (loop $6C→2..7, check $A0,X = 0)
JSR PlayerRespawn(X)      ; set spawn position, state $F0, mark power-up if $7F ∈ {17,10,3}
DEC $7F                   ; one fewer to spawn
$82 = $84                 ; reload spawn delay
call HUD update ($C7AE)
```

### Bullet state machine (corrected)
```
Bullet fired: $CC,X = dir | $40    (state $40–$4F = "moving")
Each frame via BulletUpdate → BulletDispatch → $E595:
  state $40–$4F → BulletMove ($E105): advance position 2px (4px if double-shot)
  state $60–$CF → BulletDrawSprite ($E1C6): draw bullet at ($B8,X, $C2,X)
  state $D0–$DF → BulletExplode ($E1AF): explosion animation
Bullet hits wall (BulletTileCollision/$E838): $CC,X = $33 (stop/clear)
```

### Grid-snapping before direction change
```
NewX = (OldX + 4) & $F8             ; snap to 8-pixel boundary
NewY = (OldY + 4) & $F8
```

### Player vs. enemy input throttling
- Players: process on odd frames (`$0B & $01 != 0`) **or** when `$0B mod 4 = 0`; skip when `$0B mod 4 = 2`
- Enemies: throttled by `$85` (GameSpeed) vs $41, plus `($5A XOR $0B) & $01` alternating-frame check

### Enemy AI direction (EnemyAI $DC23, entity 1 only)
1. Skip if frame is not odd or `$0B mod 4 != 0`
2. If `$6F,X` (DirTimer) > 0: decrement, draw straight
3. Else: decode current dir via $E50E → compare to desired dir
4. If already facing desired dir: call `$E50E` on $06,X (input)
5. Else: random chance to pick new dir (`D37C & $1F == 0`)
6. Grid-snap position then store new direction into `$A0,X` bits 1:0

### Bullet firing (FireBullet $E140)
```
if CC[X] != 0: return (bullet already active)
CC[X] = (EntityState & 3) | $40    ; encode dir in bullet state
BX = EntityX + DirDeltaX[dir] × 8  ; start 8px ahead
BY = EntityY + DirDeltaY[dir] × 8
```

### Level loading
```
Y = $41 × 2                       ; stage index × 2
Ptr0.lo = $8000[Y]                 ; load level-init routine ptr
Ptr0.hi = $8000[Y+1]
...
JSR $8B63 → STA $01; JMP ($0000)  ; jump through Ptr0 to level init code
```

### Player death / respawn
```
DEC $51+X (lives)
if lives == 0:
  check other player → GameOver or continue
else:
  $A8,X = 0 (deactivate entity type)
  EntityX = $E537[X]  ; spawn position
  EntityY = $E539[X]
  EntityState = $F0   ; set to dying/spawn animation state
  call $D82B          ; (unknown — likely play respawn sound/animation)
```

---

## Next Tasks

- [ ] Disassemble BonusDraw ($EAB5) — likely draws bonus tank icons on HUD
- [ ] Disassemble $C7F8, $C7AE — post-spawn HUD update and unknown game-frame routine
- [ ] Disassemble $E4C6 / $E4D0 — called at game start (entity type/queue setup?)
- [ ] Disassemble $D763 / $D7A4 (tile destruction routines) — understand brick bit-clearing
- [ ] Disassemble bank 0 level init routines ($874D, $8A6E, $896A, etc.) — understand how tile map is populated at level start
- [ ] Decode inner formation data tables at $8034+ (per-stage enemy sprite/position blocks)
- [ ] Disassemble SpeedTable ($E6A9) — dump entries, understand per-level speed parameters
- [ ] Disassemble $8B69+ (entity slot fill / enemy queue setup)
- [ ] Disassemble $DA31 / $DA62 — called from LivesDraw area-kill handler
- [ ] Disassemble $C9BB / $C912 — power-up activate/spawn routines
- [ ] Validate tile map at game start — what values does level loader write to $0400–$07FF?
- [ ] Identify and label CHR tiles by visual inspection of `tiles/chr_pt0.png` + `tiles/chr_pt1.png`
- [ ] Disassemble HUDDraw ($E8B1), ScoreDraw ($E7A9), LivesDraw ($EB17) — scoreboard and HUD rendering
- [ ] Disassemble $C7AE/$C7F8 area — track the 16th & 17th GameUpdate2 calls

### Completed
- [x] ROM identification: iNES, mapper 99, 32KB PRG, 16KB CHR
- [x] Interrupt vectors mapped ($C070 reset, $D300 NMI)
- [x] Zero page variable map (~45 variables now known; corrected direction/bullet entries)
- [x] Full entity dispatch table ($E555): 24 entries decoded via `decode_tables.py`
- [x] Full MoveUpdate dispatch table ($E575): 24 entries decoded
- [x] Full bullet dispatch table ($E595): 16 entries decoded
- [x] PRNG at $D37C identified and documented
- [x] DirDeltaTable ($E529): up=0(dy=-1), left=1(dx=-1), down=2(dy=+1), right=3(dx=+1) — corrected from previous wrong encoding
- [x] Entity spawn positions: players P1=(88,216) P2=(152,216); enemy spawns top L/C/R at Y=24
- [x] Bank 0 structure mapped: level-init pointer table + enemy-formation pointer table (13 stages)
- [x] Level pointer tables decoded: $8000 (code ptrs) and $801A (data ptrs), 13 stages each
- [x] `decode_tables.py` built and working (flat + ptr16 support)
- [x] EnemyAI ($DC23) processes only entity 1 (AI-controlled P2 in 1-player mode)
- [x] Bullet system: per-entity slots ($CC,X/$B8,X/$C2,X), double-shot secondary ($D4,X/$C0,X/$CA,X)
- [x] Enemy fire: EnemyFireCheck ($E216) — 1-in-32 PRNG chance per active enemy per frame
- [x] $DDFC (state $50–$5F): RandomDirChange — 50% straight/25% right/25% left turn
- [x] $DE48 (state $70–$7F): DirTowardHQ — AI navigates toward eagle ($78,$D8)
- [x] CalcDirToTarget ($DE56): 9-way sign-based direction toward target position
- [x] DirToStateTable ($E543, 18 bytes): fully decoded — 3×3 compass grid × 2 sets (prefer-Y / prefer-X); enemies randomly pick set
- [x] BulletExplode ($E1AF): explosion draws single 8×8 sprite at tile $B1+dir×2, centered at bullet pos −5px X
- [x] CollisionUpdate / BulletUpdate ($E18C): confirmed as bullet-slot dispatcher — iterates X=9→0 via $E595 table
- [x] Nametable shadow $0400–$07FF: tile format (bit7=entity, $00=empty, $01–$0F=brick, $10=steel, $11=water, $C8=eagle)
- [x] BulletTileCollision ($E838): brick destruction, steel/water/eagle handling
- [x] Enemy spawn wave ($DBF6): EnemiesRemaining($7F) 20→0; power-up tanks at 17/10/3 remaining
- [x] GameUpdate2 sequence: 18 subsystem calls documented in order
- [x] $D5FC: nametable shadow address formula documented
- [x] SetSpeedPtr ($E4E8): loads 4-byte speed parameters from SpeedTable into $8B–$8E
- [x] CHR-ROM extracted: `extract_tiles.py` produces `tiles/chr_all.png`, `chr_pt0.png`, `chr_pt1.png` — sprites at PPU $0000, BG at $1000
