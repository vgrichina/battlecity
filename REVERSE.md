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
| $88 | PowerUpType | Current power-up type index (0–5) for dispatch at $EB87 |
| $89,X | ShieldTimer | Per-player shield countdown (X=0–1); decremented every 64 frames |
| $8B–$8E | SpeedParams | Four speed parameters loaded from SpeedTable by SetSpeedPtr |
| $8F | EnemyQueueIdx | Index into enemy type queue (ZP $8B,Y → type countdown) |
| $90,X | EntityX | Entity X positions (8 bytes; X = 0–7) |
| $98,X | EntityY | Entity Y positions (8 bytes) |
| $15–$1B | P1Score | Player 1 BCD score: 7 digits, $1B = units, $15 = millions |
| $1C–$22 | P2Score | Player 2 BCD score (same format) |
| $35–$3C | ScoreIncr | Temporary score-increment BCD: $39 = hundreds, $3A = tens, $3B = units |
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

### Entity State Lifecycle
```
Spawn:   EntityState = $F0               (StateIncSlot handler)
         $F0 → $F1 → … → $FE → state=$E0 (StateIncFire handler)
         $E0 → $E1 → … → $EE → call EnemySpawn ($E46C) → state=$A0-$A3
Active:  $A0-$AF  MoveGridSnap — primary movement (16 states, dir in bits 1:0)
         $B0-$BF  DirTowardHQ  — navigate to eagle; sets state $A0-$A3
         $C0-$CF  DirTowardP2  — navigate to P2;    sets state $A0-$A3
         $D0-$DF  DirTowardP1  — navigate to P1;    sets state $A0-$A3
         $90-$9F  RandomDirChange — decide direction then return to $A0-$A3
         $80-$8F  ShieldHandler — blink/pause (temporary blocked state)
Death:   EntityState = $73 (set by EnemyBulletPlayerHit on bullet hit)
         $73 → countdown via StateCountdown → $00 → PlayerKilled/EnemyKilled
```

### Initial Entity States ($E53B, 8 bytes)
| Index | Value | Meaning |
|-------|-------|---------|
| 0–1   | $A0   | State $A0 — MoveGridSnap, direction UP — players |
| 2–7   | $A2   | State $A2 — MoveGridSnap, direction DOWN — enemies |

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
| $E1AF | BulletExplode | Draw explosion sprite: tile $B1+dir×2 at bullet pos −5px X |
| $E1C6 | BulletTravel | Draw traveling bullet sprite (state $60-$8F) |
| $E1D6 | PlayerFireCheck | Loop entities 1→0: if active & fire pressed & type=$4x & bullet avail, fire |
| $E216 | EnemyFireCheck | If spawn timer=0: loop entities 7→2; 1-in-32 chance (PRNG) to call $E140 |
| $E235 | CalcTilePos | Calc entity tile-map positions + mark collision flags |
| $E2AE | ClearTileFlags | Clear entity collision flags from tile map |
| $E2EF | EntityUpdate | Effect timer decrement |
| $E330 | DrawPlayerShield | Loop entities 0–1; if ShieldTimer > 0: draw blinking shield sprite (tile $29/$2B alternating every 2 frames); decrement timer every 64 frames |
| $E35D | PowerUpSpawn | Manage power-up countdown ($45); animate eagle base ($68 flash timer); dispatch eagle-state handlers via $E3BA table |
| $E417 | PlayerRespawn | Players: load PlayerSpawnX/Y, clear DirTimer. Enemies: cycle SpawnRotIdx ($6A 0→2), load EnemySpawnX/Y; if EnemiesRemaining($7F) = 17/10/3 → mark power-up tank ($A8=4). Both: set state $F0, call DrawNametableTile ($D82B, A=$0F) |
| $E46C | EnemySpawn | Set initial state from $E53B; setup entity slot; update spawn index |
| $E4C6 | ClearBulletSlots | Zero all 10 bullet state slots ($CC,0–$CC,9) — called at game init |
| $E4D0 | ClearEntitySlots | Zero $A0,0–$A0,7 and $0103,0–$010A — called at game init |
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
| $E7A9 | BulletMoveCollision | (to be disassembled) |
| $E8B1 | EnemyBulletPlayerHit | (to be disassembled) |
| $EAB5 | BulletVsBulletCancel | (to be disassembled) |
| $EB17 | PowerUpCollision | (to be disassembled) |
| $EBF6 | GameOverHandler | Enable APU ($4015/$4017); zero $0300–$031B via X loop and $031C–$03F4 at stride 8 via pointer (clears entity/bullet tracking page) |
| $EC23 | NMI_Sub3 | Stage-summary score/kill-count tabulator; reads $0300,X entries and $6D (ServiceMode); fills $F9–$FC counters for end-of-stage results display |
# New routines (Sessions 3–4)
| $C912 | PowerUpSprite_Off | Draw power-up "OFF" sprite frames (4×DrawSprites) + clear palette at $07F3/$07F4 |
| $C9BB | PowerUpSprite_On | Draw power-up "ON" sprite frames (4×DrawSprites) + set $3F palette flash at $07F3/$07F4 |
| $CA25 | EagleHitAnim | Draw eagle hit animation (2×DrawSprites, OAM slot $0E, frames A/B) |
| $CA44 | ShovelAttribUpdate | Write 64 bytes from tile-map $07C0 to PPU attribute area $23C0 (fortify base palette effect) |
| $CA79 | QueueTileNametable | TileAddrCompute → queue nametable write at computed address |
| $DA31 | ScoreAdd | BCD-add 7-digit value at $35–$3B to player score at ZP $15+X*8; carry propagation; cap digits at 9 |
| $DA62 | ScoreSetup | A = packed BCD amount (hi nibble=tens, lo nibble=units); zeros $35–$3C; stores tens→$39, units→$3A |
| $D745 | SubTileBitmask | Compute 1-bit mask for brick sub-tile quarter: TileY.bit2→shift2, TileX.bit2→shift1; top-left=1, top-right=2, bottom-left=4, bottom-right=8 |
| $D75C | TileCollidableCheck | Test if brick quarter intact: A = tile & (mask\|$F0); non-zero if brick present OR entity on tile |
| $D763 | TileDestroyBrick | Clear brick sub-tile bit: tile &= ~mask; call $D7A4 to write+queue nametable |
| $D76D | TileDestroyIfNoEntity | Destroy brick quarter only if tile high nibble = 0 (no entity); no PPU queue |
| $D77C | TileSetBrick | Set (OR) brick quarter bit; call $D7A4 |
| $D784 | TileSetIfNoEntity | Set brick quarter bit only if no entity present; no PPU queue |
| $D791 | PPUWriteDirect | Write tile byte directly to PPU: addr = ($12 + $05, $11); value from ($11),Y |
| $D7A4 | WriteTileQueueUpdate | STA ($11),Y; enqueue 4-byte PPU record {$12+$1C, $11, value, $FF} at $0180 |
| $D7CA | AdvanceTilePtr | Add A to ($11,$12) pointer pair (advance tile ptr by A bytes) |
| $E3C6 | EagleAnimA | Draw eagle sprite tile $F1 at position ($78,$D8) via DrawTank |
| $E3CB | EagleAnimB | Draw eagle sprite tile $F5 at ($78,$D8) |
| $E3D0 | EagleAnimC | Draw eagle sprite tile $F9 at ($78,$D8) |
| $E3DC | EagleAnimDraw | DrawTank with tile=$53+$69 at fixed eagle position |
| $E3E2 | EagleWallClosed | Set $69=0; draw 4 base wall tiles around eagle (closed/intact formation) |
| $E3EA | EagleWallOpen | Set $69=$10; draw 4 base wall tiles (open/damaged formation) |
| $E3F2 | DrawEagleWalls | Draw 4 wall sprites at (70,D0),(80,D0),(70,E0),(80,E0) with tiles $D1/$D5/$D9/$DD+$69 |
| $EB17 | PowerUpCollision | Effect-position vs player proximity check (12px); if hit: set EffectTimer=50, dispatch via $EB87 power-up table |
| $EB95 | PU_Helmet | Helmet power-up: ShieldTimer[$89,X] = 10 (≈640 frames invincibility) |
| $EB9A | PU_Timer | Timer/Clock power-up: EnemyFreezeTimer[$0100] = 10 (freeze enemies ≈640 frames) |
| $EBA0 | PU_Shovel | Shovel power-up: if $68<0: JSR PowerUpSprite_On; PowerUpTimer[$45]=20 |
| $EBAC | PU_Star | Star power-up: upgrade entity type $0101,X += $20 (max $60; 3 tiers) |
| $EBBC | PU_Grenade | Grenade/Bomb power-up: set EntityState=$73 for all 8 active entities (instant kill-all) |
| $EBE3 | PU_1Up | Tank/1-Up power-up: INC $51,X (add life); set $0304=$0305=1 |
| $DDFC | RandomDirChange | State $90–$9F handler: 50% → SpeedCtrlMove; 25% → turn right (dir+1 &3); 25% → turn left (dir−1 &3); result stored as $A0|(dir&3) |
| $DE22 | ClampXMove | Boundary clamp helper: if A > $56 → A−1 |
| $DE2A | ClampYMove | Boundary clamp helper: if A > $57 → A−1 |
| $DE32 | DirTowardP1 | Load entity 0 X/Y into $71/$72; call DirTowardTarget |
| $DE3D | DirTowardP2 | Load entity 1 X/Y into $71/$72; call DirTowardTarget |
| $DE48 | DirTowardHQ | Load eagle position ($78,$D8) into $71/$72; call DirTowardTarget |
| $DE50 | DirTowardTarget | JSR CalcDirToTarget; STA $A0,X (write new state with direction); RTS |
| $DE56 | CalcDirToTarget | Compute 9-way direction toward ($71,$72) from entity ($90/$98,X): sign(targetX−entityX)→$64, sign(targetY−entityY)→$65; index = $65×3+$64; lookup DirToStateTable[$E543, index or index+9]; return state byte |
| $DB5D | SignFn | Sign of SEC;SBC result: BEQ→A=0; BCS→A=+1; else A=$FF (−1) |
| $DF26 | SpeedCtrlMove | AI mode selector: slow ($84>>2 >= FrameHi) → DirTowardHQ ($B0); medium ($84>>3 >= FrameHi) → random dir ($A0-$A3); fast → DirTowardP1 ($D0) or DirTowardP2 ($C0) based on player presence |
| $C791 | HUDKillCounterHelper | Compute OAM slot X and sprite Y from HUD index: even→X=$1D, odd→X=$1E; Y=idx/2+3 |
| $C79F | DrawHUDKillIconA | Draw one HUD kill-counter icon from sprite table $D222 |
| $C7AE | DrawHUDKillIconB | Draw one HUD kill-counter icon from sprite table $D22B (alternate frame) |
| $C7BD | DrawAllHUDKillIcons | Loop $5A=$12→0 step−2 (10 pairs), call $C79F: draw all 10 HUD kill-counter icons |
| $C7CD | DrawHUDTanks | Draw two tank sprites (tiles $79/$7D) at $0105/$0106; used for HUD enemy-count animation |
| $C7F8 | HUDTankAnimation | Count down $0108 every 16 frames; if >= $0A: move icon along $D2C6/$D2CA delta path; call DrawHUDTanks |
| $D5FC | TileAddrCompute | Tile (X=tileX, Y=tileY) → RAM address: low = tileX | (tileY&7)<<5; high = $04|(tileY>>3). Covers $0400–$07FF |
| $D82B | DrawNametableTile | Write 4-tile pattern to nametable shadow: index in A, pixel position in X/Y; reads $DB69 palette table; calls $D613/$D7A4 to write tiles into $0400–$07FF |
| $E838 | BulletTileCollision | Check bullet at (X=pixelX, Y=pixelY) vs tile map; if eagle ($C8): trigger eagle-hit flags; if steel ($10): stop bullet (armored bullet destroys); if water ($11): stop, no destroy; if brick ($00–$0F, sub-tile bit): stop and destroy ($D763) |
| $DBF6 | EnemySpawnDispatch | If SpawnDelay ($82) > 0: decrement and return. If EnemiesRemaining ($7F) = 0: return. Find free entity slot ($6C→2..7), call PlayerRespawn, DEC $7F, update HUD |
| $DBB9 | CheckPlayersMoving | Check $0311 flag; test if entity 0 or 1 has direction input ($06,X & $F0 ≠ 0) AND is active; update $0311 accordingly |

### Power-up Dispatch Table ($EB87, 6 entries, indexed by `$88 × 2`)

| $88 | Handler | Power-up | Effect |
|-----|---------|----------|--------|
| 0 | $EB95 | Helmet | `$89,X` (ShieldTimer) = 10 → ~640 frames invincibility |
| 1 | $EB9A | Timer/Clock | `$0100` (EnemyFreezeTimer) = 10 → freeze all enemies ~640 frames |
| 2 | $EBA0 | Shovel | If $68<0: call $C9BB; PowerUpTimer=20 (fortify base) |
| 3 | $EBAC | Star | `$0101,X` += $20 (max $60); `$A8,X` = same (3-tier weapon upgrade) |
| 4 | $EBBC | Grenade | All 8 entities → state $73, clear $A8 (instant screen-clear) |
| 5 | $EBE3 | Tank/1-Up | INC $51,X; set $0304=$0305=1 (extra life) |
| 6 | $EBED | (null) | RTS only |

### Eagle State Dispatch Table ($E3BA, indexed from `PowerUpSpawn $E35D`)

| Idx | Handler | Role |
|-----|---------|------|
| 0 | $DC9E | NullHandler — no animation |
| 1 | $E3C6 | Eagle anim frame A (tile $F1) |
| 2 | $E3CB | Eagle anim frame B (tile $F5) |
| 3 | $E3D0 | Eagle anim frame C (tile $F9) |
| 4 | $E3E2 | Eagle wall closed ($69=0, 4 wall sprites) |
| 5 | $E3EA | Eagle wall open ($69=$10, 4 wall sprites) |

### SetSpeedPtr ($E4E8) — corrected

```
if PlayerCount ($46) != 0:
  use speed index 35 ($23) → Y = 34*4 = $88  (2-player always uses max speed tier)
else:
  use GameSpeed ($85)                         → Y = ($85-1)*4
$8B = SpeedTable[Y+0]   ; spawn delay max
$8C = SpeedTable[Y+1]   ; (speed param 2)
$8D = SpeedTable[Y+2]   ; (speed param 3)
$8E = SpeedTable[Y+3]   ; (speed param 4)
```

SpeedTable ($E6A9) raw data (4 bytes per entry, increasing speed → smaller first byte):
| Entry ($85) | Byte0 | Byte1 | Byte2 | Byte3 |
|-------------|-------|-------|-------|-------|
| 1 (slowest) | $12 | $02 | $00 | $00 |
| 2 | $10 | $02 | $00 | $02 |
| 3 | $05 | $05 | $05 | $05 |
| 4 | $08 | $05 | $04 | $03 |
| 5 | $05 | $02 | $08 | $05 |
| … | … | … | … | … |

### EntityMovement ($DC9F) — corrected full description

```
$5A = 7  (entity loop 7→0)

EnemyFreezeDecrement:
  if $0100 != 0 AND ($0B & $3F == 0): DEC $0100  (tick freeze timer every 64 frames)

Entity loop (X = $5A, 7→0):
  if X < 2 (player):
    process if ($0B & 1 != 0) OR ($0B & 3 == 0)  (odd frame or frame%4==0)
    else skip
  if X >= 2 (enemy):
    if $0100 != 0 AND state active ($80–$DF): skip (frozen)
    if EntityType & $F0 == $A0: always process
    if $85 >= $41: always process (max speed)
    else: process only if ($5A XOR $0B) & 1 != 0  (alternating frame)
  → JSR EntityDispatch
DEC $5A; BPL loop
```

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
12. `BulletMoveCollision ($E7A9)` — **bullet movement + tile collision**: for each active bullet, probe tile AHEAD and BEHIND (±4px along dir); if wall hit: destroy tile, stop bullet ($CC,X=$33)
13. `BulletVsBulletCancel ($EAB5)` — **bullet-vs-bullet cancel**: if player bullet (slots 0,1,8,9) within 6×6 px of any enemy bullet → clear both ($CC,X=$CC,Y=0)
14. `EnemyBulletPlayerHit ($E8B1)` — **enemy-bullet→player collision**: if enemy bullet (slots 1–7) within 10×10 px of player: shield → deflect bullet; no shield → EntityState=$73 (death), set $0307
15. `PowerUpCollision ($EB17)` — check effect position ($86/$87) against entities; area-kill within 12px
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

**Key RAM flags at $0100+**:
| Address | Purpose |
|---------|---------|
| $0100 | EnemyFreezeTimer — Timer/Clock power-up counter; set to 10 by $EB9A; decremented every 64 frames by EntityMovement; non-zero = enemy movement and firing disabled |
| $0101,X | EntityStarLevel — per-entity weapon upgrade level (0, $20, $40, $60 = max); updated by Star power-up $EBAC |
| $0103,X | ShieldCountRaw — per-player inner shield counter (bit 7 set = shielded; decremented by ShieldHandler) |

**Key RAM flags at $0300+**:
| Address | Purpose |
|---------|---------|
| $0304-$030A | EntitySlotData — 7-byte entity fill data (copied from $0409–$040F by $8B69) |
| $0307 | CriticalHitFlag — set by: (a) BulletTileCollision hitting eagle tile; (b) EnemyBulletPlayerHit when enemy bullet hits unshielded player; (c) level-init bank 0 code; triggers game-over sequence |
| $030B | Eagle flash trigger |
| $030C | Player bullet wall-penetration flag |
| $030F | Player fired flag (set by FireBullet for player entities) |
| $0311 | Any player has directional input (updated by CheckPlayersMoving) |

### EntitySlotFill3 ($8B9F) and EntitySlotFill4 ($8C00)

These two routines (bank 0) initialize entity sprite and slot data during wave/stage setup.

**EntitySlotFill3 ($8B9F)** — sprite setup loop for 5 entity slots:
```
$34 = $30, $FF = 1, $24 = $0D = 5
Loop X = 4..0 (DEX from 5):
  ZP $01 = $82FA[X]          ; sprite source offset
  ZP $02 = $8300[X]          ; sprite page (high byte)
  ZP $0B = $8306[X]          ; entity type param
  JSR $8DC4                  ; load sprite ptr ($82F4[X]→$00, $830C[X]→$04) + call $9811
  if X=4 or X=2: JSR $988C   ; sprite fill helper (two groups)
  DEX; BPL loop
After loop:
  X = $0D; use $6D to choose $FB/$D0 (direction flags)
  $D2 = $82F4[$0D], $D3 = $82FA[$0D], $0612 = $D3
  if $66 != 1: $43 = $12      ; enemy count override
  $25 = $26; JMP $8B98       ; ($8B98 = STA $35=4, INC $42, RTS)
```

**EntitySlotFill4 ($8C00)** — wave entity slot data init:
```
X = min($6D, 6); DEX      ; clamp entity-count index
if $5E = 0:
  $00 = $8348[X], $01 = $834E[X]   ; ptr table set A -> $8360..$837E
else:
  $00 = $8354[X], $01 = $835A[X]   ; ptr table set B -> $8384..$839E
Y=5..0: $0304,Y = ($00)[Y] ; copy 6-byte entity slot template
  if $0304,Y = 0: $0304,Y = $FE   ; fill zeros with $FE sentinel
X=3..0: $0300,X = $8312[X] ; copy 4 wave-control init bytes
$030A = 0
JMP $8B98
```

**EntitySpriteSetup ($8DC4)** — sprite layout helper called from EntitySlotFill3:
```
ZP $00 = $82F4[X]    ; sprite data ptr low byte
ZP $03 = $32         ; packed tile/attribute byte ($32 = tile $02, attr nibble $03)
ZP $04 = $830C[X]    ; OAM slot base offset for this entity
A = 0; JMP $9811     ; SpriteTileDraw: builds OAM entries from these params
```

---

### Bank 0 Entity Slot Data Tables ($82F4–$83AD)

Six parallel 6-entry tables (indexed by entity slot X = 0..5) used by EntitySlotFill3:

| Table | Size | Values | Role |
|-------|------|--------|------|
| `$82F4` | 6B | $74,$63,$86,$53,$96,$D0 | Sprite data ptr low bytes (ZP $00) |
| `$82FA` | 6B | $4C,$54,$5C,$64,$6C,$78 | Sprite source offsets (ZP $01 / $D3) |
| `$8300` | 6B | $90,$90,$90,$90,$90,$A2 | Ptr page high bytes; combined with $82FA = bank-0 sprite block addresses |
| `$8306` | 6B | $02,$02,$02,$02,$02,$00 | Entity type param per slot (ZP $0B); $02=enemy type 2, $00=empty |
| `$830C` | 6B | $04,$1C,$34,$4C,$64,$7C | OAM base offsets per entity (spaced $18=24 apart) |
| `$8312` | 4B | $09,$23,$54,$06 | Wave control init bytes → $0300–$0303 |

#### EntitySlotData pointer tables (used by EntitySlotFill4):

Two sets of pointer pairs (6 × 2 bytes each), selected by ZP flag `$5E`:

**Set A** ($5E=0):
- `$8348` lo: {$60,$66,$6C,$72,$78,$7E} → target addresses $8360,$8366,$836C,$8372,$8378,$837E
- `$834E` hi: {all $83}

**Set B** ($5E≠0):
- `$8354` lo: {$84,$8A,$90,$96,$9C,$7E} → target addresses $8384,$838A,$8390,$8396,$839C,$837E
- `$835A` hi: {all $83}

#### EntitySlotData blocks ($8360–$837E set A, $8384–$839E set B):
Each block is 6 bytes copied to ZP $0304–$0309. Format:

| Slot | Set A addr | Byte[2] (count field) | Set B addr | Byte[1..2] |
|------|------------|----------------------|------------|------------|
| 0 | $8360 | 5 | $8384 | 0,0 (byte[1]=1) |
| 1 | $8366 | 3 | $838A | 0,6 |
| 2 | $836C | 2 | $8390 | 0,4 |
| 3 | $8372 | 1 | $8396 | 0,2 |
| 4 | $8378 | 0 (byte[3]=5) | $839C | 0,1 |
| 5 | $837E | 0 | $83A2 | (see SpeedDeltaTable) |

#### StageNumLUT ($83AD, 6 bytes):
`{$00,$07,$0B,$02,$05,$01}` — indexed by Y (0–5, derived from `$60` game state and `$4D`/`$51`):
Y=0→stage 0, Y=1→stage 7, Y=2→stage 11, Y=3→stage 2, Y=4→stage 5, Y=5→stage 1.
Used by `$8C52` to select starting stage when entering a new game or after game-over.

---

### $8ADD — StageTransitionHelper

Called at the end of certain level-init phase handlers to advance to the next stage:
```
JSR $D715          ; (unknown — likely stage data clear/setup)
X=5..0: $0620,X = $03F0,X   ; copy 6 bytes of stage-transition data
INC $41            ; StageNum += 1
$40 = $42 = 0      ; clear stage phase flags
RTS
```

---

### $B1E4 — EntityAnimLoop (bank 0)

Entity animation update loop for enemy slots, used in certain bank-0 sub-game contexts:
```
Loop X = 2, 1 (enemy entity slots):
  $80,X -= 2               ; decrement movement counter by 2
  if borrow: DEC $84,X     ; underflow propagates to $84 (speed param)
  $04 = $94,X = $A858[X]   ; load sprite lookup index from $A858 table
  $0B = 1
  JSR $B20A                ; EntitySpriteLayout: build OAM from ZP $80/$90/$A0 params
  JSR $988C                ; SpriteFillHelper: write sprite slot data
  DEX; BNE loop
Y = 2; JMP $B4D9           ; EntityAnimContinue
```

**$B20A — EntitySpriteLayout** sub:
- Reads ZP $80,X (position/speed), $90,X (Y pos), $03A0,X (entity ref)
- Looks up sprite position from `$A82A,Y` → ZP $02; attribute from `$A841,Y` → calls $9811
- Special case Y=$16: adds $0C to $04, $08 to $01, uses nametable high byte $23
- Checks ZP $0E visibility flag to conditionally skip sprite

**$B4D9 — EntityAnimContinue**: iterates entity refs from `$03C8,Y`; loads `$A858,Y` → $07; range-checks `$80,X` in $70–$8F; calls `$AB4A` for further animation processing.

---

### StageLoader ($86E0) and Inner Formation Sub-Tables

**StageLoader dispatch logic** (called from main loop):
```
if $30 != 0:
    X = $41 * 2                       ; stage number
    Ptr0 = $8000[X]                   ; level-init routine pointer (LevelCodePtrs)
    JMP JmpThruPtr0                   ; call level init code

if $30 = 0:
    load outer ptr: ($02/$03) = $801A[stage * 2]  (LevelFormationPtrs)
    Y = SubStageIdx ($42) - 1
    INC $42                            ; advance sub-stage
    if Y < 0 (first call):
        JSR $98E0, $98BE               ; one-time stage init helpers
        zero ZP $68–$EF                ; clear working variables
        ORA $80B6[stage] into $59      ; stage flags
        call $97B1 (palette/init)
    else:
        inner_ptr = ($02)[Y * 2]       ; inner formation table entry
        JMP JmpThruPtr0                ; call phase handler
```

**Inner formation sub-tables** (`$8034+`): Each stage's inner table is a sequence of 16-bit pointers to *phase-handler subroutines*. Not raw position data — each entry is called on successive invocations of StageLoader (via INC $42), implementing multi-phase level initialization. Handler counts per stage:

| Stage | Inner Table | Phases | Notes |
|-------|-------------|--------|-------|
| 0 | $8034 | 4 | $8B22, $892B, $8930, $8A64 |
| 1 | $8078 | 2 | |
| 2 | $806C | 6 | |
| 3 | $803C | 8 | |
| 4 | $804C | 9 | |
| 5 | $805E | 4 | |
| 6 | $8084 | 3 | |
| 7 | $8066 | 3 | |
| 8 | $807C | 4 | |
| 9 | $808A | 6 | |
| 10 | $8096 | 5 | |
| 11 | $80A0 | 2 | |
| 12 | $80A4 | ≥1 | |

**Stage 0 phase handlers** (example):
- `$8B22` Phase 0: Clear $0610–$062F (32 B), clear ZP $5C–$67, set $44=$5F=1, $FD=$80, enable APU ($4015=$0F)
- `$892B` Phase 1: EnemyCount ($43) = $2E
- `$8930` Phase 2: EnemyCount=$08, $D4=$2B, $D3=$A0, $68=1, configure entity-2 slot data
- `$8A64` Phase 3: $44=$40=1, $42=0 (reset sub-stage for next invocation)

---

### $8B–$8E SpeedParams — Enemy Type Group Counts

These four ZP bytes are **enemy type group counts** loaded by `SetSpeedPtr ($E4E8)` from `SpeedTable ($E6A9)`. They are NOT speed parameters — they define how many enemies of each "type slot" (0–3) to spawn in the current wave.

**How EnemySpawn ($E46C) uses them:**
```
Y = EnemyQueueIdx ($8F)          ; slot 0, 1, 2, or 3
LDA $008B,Y                      ; load count for this slot
if count = 0: INC $8F; repeat    ; skip empty slots
DEC $008B,Y                      ; consume one enemy from slot
Y = (GameSpeed − 1) × 4 + $8F   ; index into EnemyTypeTable
EntityType = $E5A9[Y]            ; get type byte for this slot
```

**`EnemyTypeTable` ($E5A9, 40 bytes)** — maps `(GameSpeed-1)*4 + slot` → EntityType byte:

| $85 | Slot 0 | Slot 1 | Slot 2 | Slot 3 |
|-----|--------|--------|--------|--------|
| 1 | $80 Basic | $A0 Fast | $C0 Power | $E0 Armor |
| 2 | $80 Basic | $A0 Fast | $C0 Power | $E0 Armor |
| 3 | $A0 Fast  | $C0 Power | $E0 Armor | $80 Basic |
| 4 | $C0 Power | $A0 Fast  | $80 Basic | $E0 Armor |
| 5 | $C0 Power | $E0 Armor | $80 Basic | $A0 Fast  |
| 6 | $E0 Armor | $A0 Fast  | $C0 Power | $80 Basic |
| 7 | $80 Basic | $A0 Fast  | $C0 Power | $E0 Armor |
| 8 | $C0 Power | $E0 Armor | $A0 Fast  | $80 Basic |
| 9 | $C0 Power | $A0 Fast  | $80 Basic | $E0 Armor |
| 10| $A0 Fast  | $E0 Armor | $C0 Power | $A0 Fast  |

**Full SpeedTable ($E6A9)** — 4 counts per entry, all summing to 20 enemies:

| $85 | $8B | $8C | $8D | $8E | Notes |
|-----|-----|-----|-----|-----|-------|
| 1 | 18 | 2 | 0 | 0 | mostly basics |
| 2 | 16 | 2 | 0 | 2 | |
| 3 | 5  | 5 | 5 | 5 | even mix |
| 4 | 8  | 5 | 4 | 3 | |
| 5 | 5  | 2 | 8 | 5 | |
| 6 | 3  | 4 | 6 | 7 | |
| 7 | 8  | 6 | 4 | 2 | |
| 8 | 7  | 2 | 4 | 7 | |
| 9 | 8  | 6 | 0 | 6 | |
| 10| 5  | 4 | 6 | 5 | |
| 35 (2P) | 4 | 6 | 0 | 10 | hardcoded for 2P mode |

---

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
| $E6A9 | SpeedTable | 144 B | 4-byte entries: enemy type group counts for slots 0–3; entry = (GameSpeed−1); entry 35 ($22) for 2P |
| $E5A9 | EnemyTypeTable | 40 B | Maps (GameSpeed−1)×4+slot → EntityType byte ($80/$A0/$C0/$E0); shuffled per difficulty |

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

All three tables are **16 entries × 2 bytes = 32 bytes** each (not 24). Y = (state>>3)&$FE ranges $00..$1E in steps of 2 → 16 values.

**$E555 — MovementDispatch** (called from EntityDispatch $DCF1 — state-machine logic):
| State range | Y | Entry | Handler | Role |
|-------------|---|-------|---------|------|
| $00–$0F     | $00 | [0]  | $DC9E (Null) | Completely inactive |
| $10–$1F     | $02 | [1]  | $DE9E (StateCountdown) | Countdown toward 0 |
| $20–$2F     | $04 | [2]  | $DE9E | Countdown |
| $30–$3F     | $06 | [3]  | $DE9E | Countdown |
| $40–$4F     | $08 | [4]  | $DE9E | Countdown |
| $50–$5F     | $0A | [5]  | $DE9E | Countdown |
| $60–$6F     | $0C | [6]  | $DE9E | Countdown |
| $70–$7F     | $0E | [7]  | $DE9E | Countdown (death animation; draws via MoveUpdate) |
| $80–$8F     | $10 | [8]  | $DD06 (ShieldHandler) | Shield blink / spawn pause |
| $90–$9F     | $12 | [9]  | $DDFC (RandomDirChange) | 50% SpeedCtrlMove / 25% turn L / 25% turn R |
| $A0–$AF     | $14 | [10] | $DD30 (MoveGridSnap) | **Primary movement state** — move + collision probe |
| $B0–$BF     | $16 | [11] | $DE48 (DirTowardHQ) | Navigate toward eagle |
| $C0–$CF     | $18 | [12] | $DE3D (DirTowardP2) | Navigate toward P2 |
| $D0–$DF     | $1A | [13] | $DE32 (DirTowardP1) | Navigate toward P1 |
| $E0–$EF     | $1C | [14] | $DF18 (StateIncFire) | Spawn: count up, call EnemySpawn at $EE |
| $F0–$FF     | $1E | [15] | $DF09 (StateIncSlot) | Spawn: count up, jump to $E0 at $FE |

**$E575 — MoveUpdateDispatch** (called from MoveUpdate $DF5A — sprite drawing):
| State range | Y | Entry | Handler | Role |
|-------------|---|-------|---------|------|
| $00–$0F     | $00 | [0]  | $DC9E (Null) | Skip |
| $10–$1F     | $02 | [1]  | $DFB1 (DrawSpawnSprite) | "Star" spawn sprite |
| $20–$2F     | $04 | [2]  | $DFE7 (DrawSmallSprite) | Small spawn frame |
| $30–$3F     | $06 | [3]  | $DFFA (DrawExpandSprite) | Expanding spawn |
| $40–$4F     | $08 | [4]  | $DFFA (DrawExpandSprite) | Expanding spawn |
| $50–$5F     | $0A | [5]  | $DF81 (DrawMovingSprite) | Death animation |
| $60–$6F     | $0C | [6]  | $DF81 | Death animation |
| $70–$7F     | $0E | [7]  | $DF81 | Death animation |
| $80–$8F     | $10 | [8]  | $E06A (MoveTank) | Draw active tank sprite |
| $90–$9F     | $12 | [9]  | $E06A | Draw active tank sprite |
| $A0–$AF     | $14 | [10] | $E06A | Draw active tank sprite |
| $B0–$BF     | $16 | [11] | $E06A | Draw active tank sprite |
| $C0–$CF     | $18 | [12] | $E06A | Draw active tank sprite |
| $D0–$DF     | $1A | [13] | $E06A | Draw active tank sprite |
| $E0–$EF     | $1C | [14] | $E0BF (DrawShootSprite) | Shoot animation |
| $F0–$FF     | $1E | [15] | $E0BF | Shoot animation (spawn fire effect) |

**$E595 — BulletDispatch** (called from BulletDispatch $E0F0):
| BulletState | Y | Entry | Handler | Role |
|-------------|---|-------|---------|------|
| $00         | $00 | [0]  | $DC9E (Null) | Inactive |
| $10–$1F     | $02 | [1]  | $E12A (BulletCountdown) | Countdown |
| $20–$2F     | $04 | [2]  | $E12A | Countdown |
| $30–$3F     | $06 | [3]  | $E12A | Countdown (post-hit: $33 set by tile collision) |
| $40–$4F     | $08 | [4]  | $E105 (BulletImpact) | **Active moving bullet** |
| $50–$5F     | $0A | [5]  | $DC9E (Null) | Unused |
| $60–$6F     | $0C | [6]  | $E1C6 (BulletTravel) | Draw bullet sprite (moving) |
| $70–$7F     | $0E | [7]  | $E1C6 | Draw bullet sprite |
| $80–$8F     | $10 | [8]  | $E1C6 | Draw bullet sprite |
| $90–$9F     | $12 | [9]  | $E1AF (BulletExplode) | Explosion animation |
| $A0+        | $14+| [10]+| (data) | Unused states |

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

### Tank movement — MoveGridSnap ($DD30, MovementDispatch state $A0–$AF)
Primary movement handler. Entity positions are pixel coordinates of the **center** of the 16×16 tank sprite.
```
if enemy (X >= 2) AND both (EntityX mod 8 == 0) AND (EntityY mod 8 == 0)
  AND RNG & $0F == 0 (1/16 chance):
    call SpeedCtrlMove → re-evaluate AI mode
    return

dir = EntityState & 3
delta_x = DirDeltaTable[dir]          ; 0/−1/0/+1
delta_y = DirDeltaTable[dir+4]        ; −1/0/+1/0

; Two-point collision probe (check both halves of leading edge):
; Probe 1: (EntityX + deltaX*9 + deltaY*8, EntityY + deltaY*9 + deltaX*8)
; Probe 2: (EntityX + deltaX*9 − deltaY*8, EntityY + deltaY*9 − deltaX*8)
; (i.e. probe leading edge L and R for UP/DOWN, top and bottom for L/R)

if both probes clear (tile <= $11 at each point):
  EntityX[$90,X] = EntityX + deltaX   ; advance 1 pixel
  EntityY[$98,X] = EntityY + deltaY
  EntitySprFrame[$B0,X] ^= 4          ; animate treads
else (blocked):
  if player: skip direction change
  if enemy: RNG & 3:
    0 (25%): reverse direction (flip dir bit 1) or grid-realign
    1–3 (75%): SetStateLo($80) | $08 → state $88 (ShieldHandler for 8 frames)
  EntitySprFrame[$B0,X] ^= 4          ; still animate treads
```

### AI mode selection — SpeedCtrlMove ($DF26)
Called when a direction change is needed (blocked or grid-aligned random chance):
```
slow  (SpawnDelayMax>>2 >= FrameHi): state = $B0 → DirTowardHQ
medium(SpawnDelayMax>>3 >= FrameHi): state = $A0|(RNG&3) → random direction
fast  (else):
  if P1 dead (EntityState[0]=0): state = $C0 → DirTowardP2
  elif even entity slot:          state = $D0 → DirTowardP1
  elif P2 dead (EntityState[1]=0):state = $D0 → DirTowardP1
  else:                           state = $C0 → DirTowardP2
```

### Tank sprite drawing — MoveTank ($E06A, MoveUpdateDispatch state $80–$DF)
```
if enemy (X >= 2):
  if power-up tank ($A8,X & $04): tile = ($0B>>3 & 1) + 2  (flash every 8 frames)
  else: Y = ($0B<<2 + $A8,X) & 7 → EnemySpeedTable[Y] (2-bit frame selector)
  $04 = tile_frame
if player (X < 2):
  if DirTimer[$6F,X] > 0 AND ($0B & $08): return  (throttled)
  $04 = X (entity index)
$53 = ($A8,X & $F0) + $B0,X          ; tile group + animation frame
Y = EntityY, X = EntityX → JSR DrawTank2x2  ; draw 16×16 sprite
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

### Eagle / HQ destruction animation (EagleStateUpdate $E386)

ZP `$68` has a **dual role**:
- `$68 = $80` (128): **GameActive flag** — set by `LevelStart ($C33D)` at level start; checked by `CheckGameOver ($C62F)` and input/spawn code
- `$68 = 1..39`: **Eagle destruction countdown** — set to `$27` (39) by `BulletTileCollision ($E855)` when a bullet hits nametable tile type `$C8` (the eagle/HQ); decrements each frame; reaches 0 → game over
- `$68 = 0`: game over / eagle gone

**Trigger** (`$E855`, inside BulletTileCollision): `LDA $68 / F0 skip / LDA #$27 / STA $68` — only triggers if game active; also sets `$030B=$0307=1` and `$CC,X=$33`.

**Dispatch** (`$E386–$E3B9`):
```
if $68 = 0 or $68 < 0: RTS          ; done
DEC $68
x = $68 >> 2
Y = 2 × ||(x − 5)| − 5|            ; triangle wave 0..10 → 0,2,4,6,8,10,8,6,4,2,0
JMP via EagleHandlerTable[$E3BA, Y]
```

**Handler table** (`$E3BA`, 6 pointer entries):

| Y  | Address | Action |
|----|---------|--------|
| 0  | $DC9E   | NullHandler — no-op (final frames, eagle gone) |
| 2  | $E3C6   | Draw tile $F1 at center (explosion frame 1) |
| 4  | $E3CB   | Draw tile $F5 at center (explosion frame 2) |
| 6  | $E3D0   | Draw tile $F9 at center (explosion frame 3) |
| 8  | $E3E2   | Eagle intact ($69=0) — draw 4-tile 2×2 HQ sprite |
| 10 | $E3EA   | Eagle damaged ($69=$10) — draw HQ with +$10 tile offset |

**Eagle draw** (`$E3F2`): draws 4 × 8×8 sprite tiles at fixed screen positions (X=$70/$80 ≈ 112/128 px, Y=$D0/$E0 ≈ 208/224 px) using `DrawEntityTile ($DABA)`.  Base tile = $D1 (intact) or $E1 (damaged).

**Animation sequence** (39 frames total from $68=$27 to 0):
- Frames 1–12: explosion flash (tiles $F1/$F5/$F9, ~4 frames each)
- Frames 13–28: intact/damaged eagle flicker (~4 frames each state)
- Frames 29–39: explosion flash + NullHandler (eagle disappears)

### Level screen initialization (LevelScreenInit $9764)

Called from game loop after stage transition. Sequence:
```
Wait VBlank clear ($2002 bit 6)
JSR $97D1    ; set PPU$2000 ctrl (NMI flags, nametable from $69/$6B/$6C)
Read $3F & 3 → $61 (BG attribute quadrant)
JSR $D65A    ; write PPU nametable block A (level border/BG tiles)
JSR $D62F    ; write PPU nametable block B
JSR $D6C7    ; write PPU nametable block C
JSR $D6FE    ; write PPU nametable block D
JSR $974A    ; $0300=$12 (cmd count), $0313=0
Zero $0200 OAM shadow to $F8 (Y=$EC..00, step 4) — hides all sprites
JSR $96F1    ; FormationDataLoad: enemy type data → $0360–$036F
JSR $971F    ; HQSpriteInit: set up $0400 eagle tile data
Delay loops (~34×18 iterations)
JMP $97BC    ; set PPU$2000 + scroll from $12/$13/$68
```

### PPU write queue and $0400 tile buffer

`$0400–$07FF` RAM serves as a **background tile state cache** for the playfield:
- Written by level init routines (`$D65A` / `$D62F` / `$D6C7` / `$D6FE`) with tile indices for brick/steel/water/bush/ice/empty
- `$971F` (HQSpriteInit) writes the eagle area specifically:
  - `$0400 = $17` (eagle nametable tile / Y coord), `$0402=$0405=$FB` (hidden), `$0401–$0407` = copied from `$0409–$040F`
  - Sets ptr `$02/$03 = $0400` (source), `$00/$01 = $2356` (PPU nametable destination)
- `$992E` (BuildPPUWriteQueue) reads `($02),Y = $0400+Y`, interprets each byte as `lo_nibble=row_count, hi_nibble=col_count`, and emits PPU nametable write commands into the `$0300+` command buffer
- NMI handler (`FlushPPUQueue $D96D`) applies `$0300+` commands to PPU during VBlank

### CHR sprite tile number map (from code analysis)

All numbers are OAM sprite tile indices (sprite pattern table, PPU $0000–$0FFF):

| Tile(s) | Game object |
|---------|-------------|
| $79–$7B | HUD P1 lives tank icon (2 tiles horizontal) |
| $7D–$7F | HUD P2 lives tank icon (2 tiles horizontal) |
| $B1 + dir×2 | Bullet explosion (4 directional variants) |
| $C3–$CF | Spawn sparkle animation: 3 frames × 4 tiles (`$A8,X`→`(>>3 & $FC)−$10+$B9`) |
| $D1,$D5,$D9,$DD | Eagle HQ 2×2 sprite (intact): TL, TR, BL, BR |
| $E1,$E5,$E9,$ED | Eagle HQ 2×2 sprite (damaged/black): TL, TR, BL, BR |
| $F1 | Eagle explosion animation frame 1 (8×8, center) |
| $F5 | Eagle explosion animation frame 2 |
| $F9 | Eagle explosion animation frame 3 |
| $81–$8F (est.) | Enemy/player tank sprites (direction × animation frame) |

### Extra-life logic (LivesGrantCheck $CF44)

Called from PowerUpCollision. Checks if `$68=$80` (game active):
- **P1**: if `$17 ≥ 2` (score tier) or `$66 ≥ 1`: `INC $51` (P1Lives), `INC $66`; set `$0304=$0305=1`
- **P2**: same check with `$1F` / `$52` / `$67` (P2 score tier / lives / flag)
- Sets `$0304=$0305=1` → triggers HUD lives display update
- `$66` / `$67` act as "extra life already granted" flags to prevent double-grant

### LevelStart ($C33D)

Called with enemy freeze time in A:
```
STA $0100    ; EnemyFreezeTimer (freeze all enemies at level start)
STA $6A      ; also stored in $6A (SpawnRotIdx — reused as init count)
JSR $C625    ; (score/HUD init — not yet decoded)
JSR DrawAllHUDKillIcons
JSR WaitVBlank
JSR $C72D, $C756  ; HUD sprite setup
JSR SetSpeedPtr ($E4E8)
LDA #$80 → STA $68    ; GameActive = true
STA $0312 = 1, STA $4C = 1
Compute $84 (eagle Y-position limit) from player count + $85 (stage count)
```

---

## Next Tasks

- [x] Disassemble bank 0 level init routines ($8A6E, $896A, $91E8, $8B48 etc.) — understand how tile map is populated at level start ($874D partially decoded: has multi-phase sub-stage controller; continues in $B1E4, $8ADD)
- [x] Decode inner formation data tables at $8034+ (per-stage enemy sprite/position blocks)
- [x] Decode $8B–$8E SpeedParams meaning: confirm byte semantics (spawn delay, move rate, fire rate, etc.) from callsites in MoveGridSnap / SpeedCtrlMove
- [x] Disassemble $8B9F+ / $8C00+ (entity slot fill secondary routines; read $82FA/$8300/$8306 tables)
- [x] Decode tables at $82F4, $82FA, $8300, $8306, $8348 (formation data arrays in bank 0)
- [x] Disassemble $B1E4 and $8ADD (level init continuation / game-over from bank 0)
- [x] Validate tile map at game start — trace what values level loaders write to $0400–$07FF
- [x] Identify and label CHR tiles by visual inspection — mapped tile numbers from code analysis
- [x] Disassemble $E3BA dispatch full: eagle animation handlers $E3C6/$E3CB/$E3D0/$E3E2/$E3EA — decoded; $68 initialization traced ($C356 sets $80, $E855 sets $27)
- [ ] Decode power-up type 2 (Shovel $EBA0) fully — understand how $C9BB triggers fortify base and what $68 timing does
- [x] Disassemble $CF44 (called in PowerUpCollision/$EB60) — decoded as LivesGrantCheck (extra life on score threshold)
- [x] Disassemble $C33D (STA $0100 in bank 1) — decoded as LevelStart; sets EnemyFreezeTimer + $68=$80
- [ ] Confirm EntityType tier semantics: what does $0101,X high-nibble $A0/$A0+$20/etc map to in tile graphics

### Completed
- [x] **Session 9**: Eagle destruction system fully decoded: $68 dual role (GameActive=$80 / countdown=1-$27); EagleStateUpdate ($E386) 39-frame triangle-wave animation; 6-handler dispatch table at $E3BA ($E3C6/$E3CB/$E3D0 explosion tiles $F1/$F5/$F9; $E3E2/$E3EA intact/damaged; $DC9E NullHandler final); LevelStart ($C33D) decodes; LevelScreenInit ($9764) sequence traced; $0400 tile cache architecture; CHR sprite tile numbers $79/$7D(HUD)/$B1(bullet-expl)/$C3-$CF(spawn)/$D1-$DD(eagle)/$F1-$F9(eagle-expl) documented; LivesGrantCheck ($CF44) decoded.
- [x] **Session 8**: EntitySlotFill3 ($8B9F) and EntitySlotFill4 ($8C00) decoded — 6 parallel entity slot tables ($82F4/$82FA/$8300/$8306/$830C/$8312) documented; EntitySlotData block pointer tables ($8348/$834E, $8354/$835A) and 12 data blocks ($8360–$839F) decoded; StageNumLUT ($83AD) decoded; StageTransitionHelper ($8ADD) documented; EntityAnimLoop ($B1E4) and EntitySpriteLayout ($B20A) disassembled.
- [x] **Session 7**: StageLoader dispatch ($86E0) fully decoded; inner formation sub-tables identified as phase-handler ptr arrays (not position data); $8B–$8E confirmed as enemy type group counts; EnemyTypeTable ($E5A9) fully decoded; SpeedTable ($E6A9) all 36 entries documented; level init routines $874D/$8A6E/$896A/$91E8/$8B48 disassembled
- [x] **Session 6**: Tile cluster ($D745–$D7CA), EntityMovement freeze, PowerUpCollision, full power-up dispatch table (6 types), eagle state handlers, ScoreAdd/ScoreSetup, EntitySlotFill, SetSpeedPtr
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
- [x] All three dispatch tables corrected to 16 entries × 32 bytes (not 24×48)
- [x] Complete entity state lifecycle: $F0 spawn → $E0 activate → $A0 move → $73 death → $00
- [x] MoveGridSnap ($DD30): 16×16 tank movement with two-tile collision probes; entity pos = center pixel
- [x] SpeedCtrlMove ($DF26): slow→DirHQ, medium→random, fast→DirP1/P2 based on player presence
- [x] RandomDirChange ($DDFC): 50% SpeedCtrlMove / 25% turn left / 25% turn right
- [x] MoveTank ($E06A): sprite-draw only (MoveUpdateDispatch); no position change
- [x] BulletMoveCollision ($E7A9): main bullet movement/collision loop (dual tile probe ahead+behind)
- [x] BulletVsBulletCancel ($EAB5): bullet-vs-bullet cancellation (player slots 0,1,8,9 vs all enemies)
- [x] EnemyBulletPlayerHit ($E8B1): enemy-bullet→player hit detection (10px proximity, shield deflect)
- [x] $0307 = CriticalHitFlag (eagle hit AND player body hit AND level-init)
- [x] $E4C6 = ClearBulletSlots, $E4D0 = ClearEntitySlots (game init routines)
- [x] HUD kill-counter: $C79F/$C7AE draw icons; $C7F8 animates HUD tank countdown
- [x] Tile cluster ($D745–$D791): SubTileBitmask, TileCollidableCheck, TileDestroyBrick, TileDestroyIfNoEntity, TileSetBrick, TileSetIfNoEntity, PPUWriteDirect, WriteTileQueueUpdate, AdvanceTilePtr — brick quarter bit manipulations fully decoded
- [x] $0100 = EnemyFreezeTimer: Timer/Clock power-up; non-zero freezes all enemy movement and firing; decremented every 64 frames by EntityMovement
- [x] PowerUpCollision ($EB17 — previously PowerUpCollision): proximity check 12px; dispatches via $EB87 table indexed by $88 (PowerUpType)
- [x] Power-up dispatch table ($EB87): 6 types — Helmet, Timer, Shovel, Star, Grenade, 1-Up — all handlers disassembled ($EB95–$EBED)
- [x] Eagle state handlers ($E3C6/$E3CB/$E3D0/$E3E2/$E3EA): tile draws + 4-wall composite sprites around eagle base
- [x] PowerUpSpawn ($E35D) fully decoded: 16-frame tick, 64-frame DEC timer, flash pattern when $45<4, eagle $68 counter + dispatch
- [x] SetSpeedPtr ($E4E8) corrected: 2P mode always uses entry 35; 1P uses $85; loads 4 bytes into $8B–$8E
- [x] ScoreAdd ($DA31): 7-digit BCD addition with carry propagation, capped at all-9s
- [x] ScoreSetup ($DA62): unpack byte to $39/$3A; zero $35–$3C buffer
- [x] ZP score storage: P1Score at $15–$1B, P2Score at $1C–$22, increment buffer at $35–$3C
- [x] EntityMovement ($DC9F) corrected: freeze check + player/enemy throttle logic fully documented
- [x] $C9BB/$C912: power-up sprite ON/OFF animators; palette flash via $07F3/$07F4
- [x] $CA44: shovel effect — 64-byte attribute table write to PPU $23C0
