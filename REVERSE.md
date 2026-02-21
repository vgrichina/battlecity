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
| $0300–$031B   | Sound slot priority array: 28 bytes; $0300,X (X=0–27) is the active-priority counter for sound slot X; 0=inactive, >0=active; zeroed by SoundResetInit ($EBF6); $0300=CoinEventFlag/slot 0, $0304–$0305=life-gained/HUD, $0310=enemy fire slot 16, $0313–$0314=kill event slots 19–20; dual-use during level init as PPU tile write queue (head index + entries) |
| $031C–$03F3   | Sound slot data structures: 28×8 bytes; slot N at $031C+(N×8); each entry: [channel_select, 4×APU_regs, duration, ...]; channel_select 1–4=write ch 0–3, 5–8=silence ch 0–3; zeroed by SoundResetInit |
| $03F4–$03FF   | Possibly unused / padding at end of sound workspace |
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
| $06–$07 | P1Buttons / P2Buttons | Per-slot raw NES controller byte written each NMI by NMI_Sub2 ($D68A); bits 7=Right,6=Left,5=Down,4=Up,3=Start,2=Select,1=B,0=A |
| $08–$09 | P1Edges / P2Edges | Per-slot just-pressed edge bits this frame; NMI_Sub2 computes (~old AND new); used for single-frame button events |
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
| $4A | CoinHeldCounter | VS System coin/service button held counter; INC each NMI while bit 2 or 5 of $4016 set; cleared on release; drives $4B |
| $4B | CoinCredits | VS System credits counter; INC by NMI_Sub on coin-button release (was non-zero $4A); sets $0300=1 (CoinEventFlag) |
| $4C | GameSessionActive | Set to 1 by LevelStart ($C35D); cleared to 0 by NewGameInit ($C272); checked at $C0E8 to choose between direct-game-start and player-input paths |
| $4D | NMISyncFlag | 0 = do OAM DMA in NMI; 1 = skip OAM DMA |
| $4E | DIPBits | DIP switch high 2 bits (from $4017 AND $C0); affects palette |
| $4F–$50 | ScrollX/Y | PPU scroll X/Y; written to $2005 in NMI |
| $51 | P1Lives | Player 1 lives remaining |
| $52 | P2Lives | Player 2 lives remaining |
| $53 | SprTileBase | Sprite tile index base (set before $DABA / $DB02 calls) |
| $54–$55 | SprSaveX/Y | Saved X/Y for two-part sprite draw ($DB02) |
| $56–$57 | DrawX / DrawY | Draw target X/Y (used by nametable routines) |
| $5A | EntityIdx | Entity loop counter (temp, counts 7→0 or 9→0) |
| $60 | GameState | Game state machine: $00=gameplay active, $30=stage-start banner (STAGE XX screen), $6E=attract/title mode |
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
| $73–$7A | KillTallyBuf | Per-type enemy kill counts (8 bytes); zeroed by ClearKillTallies at LevelStart; decremented during end-of-level score tally ($CB41/$CB5F); drives $5D/$5E tally display |
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
| $14–$17 | CtrlRaw | ControllerDoubleRead ($99D2) output: $14=P1|P2 OR'd raw, $15=P1|P2 OR'd filtered (deglitched), $16=P2 raw, $17=P2 filtered; title-screen wait ($85D4) and gameplay NMI body ($8670) |
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
| $D0 | Level0PhaseFlag | Level0Init ($874D) top-level phase: 0=entry/intro phase (animate tanks entering), non-zero=active scroll-wave phase. Init'd to 0 by EntitySlotFill3 ($8BDF: LDA #$02; EOR #$02). Also used as Y-index into pointer tables $820A/$8212 at $89F6. INC at $878E (entry done) and $8A07 (wave advance). |
| $D1 | Level0SubState | Level0Init sub-wave state index (1-based). Controls which 16-bit pointer from $8153 table is dispatched (DEX; ASL; TAX → $8153,X). Preset: D2=1→D1=5, D2=4→D1=3; cleared to 0 on sub-task complete ($882D); INC at $8854, $888A, $8A11. Capped at 7. |
| $D2 | Level0WavePhase | Level0Init scroll-wave counter (0–7, capped). Counts animation waves; phase 5 triggers `StageNum=$0B; JMP StageTransitionHelper`. Init'd from $0613 (capped at 7) at $89D1. INC at $87AB and $8A0F. |
| $D3 | Level0ScrollPos | Level0Init animation horizontal scroll position (sub-byte). Starts $A0; ADC #$20 each step; range $00–$BF. Overflow or carry → reset to $00, advance $D4. Written to $0302 (animation data buffer). Also init'd as SlotSprOffset ($8BEB) and saved to $0612. |
| $D4 | Level0ScrollAttr | Level0Init animation attribute/pattern byte. Starts $2B; cycled EOR #$0B when $D3 overflows and ($D4 AND #$03)=$03. Written to $0301. Also tested as tile-index at $8CC3 (CMP #$10/$11 for sprite variant). **Note**: $D4,X (below) and $D6,X overlap these addresses during gameplay; this region serves dual purpose at different game phases. |
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

### Controller Read Chain

Two independent read paths; both ultimately source NES $4016/$4017 serial shift-register.

#### Path A — NMI_Sub2 ($D68A, bank 1): runs every NMI

Reads both controllers twice (VS System noise rejection), produces per-frame edge bits.

```
NMI ($D300) → ... → NMI_Sub2 ($D68A)
```

Algorithm:
1. Save $06/$07 as "old" values (swap into each other via LDX/LDY/STX/STY)
2. Strobe $4016 high then low (latch serial data)
3. Read loop (X=1 downto 0, Y=8 bits): `LDA $4016,X; AND #$03; CMP #$01; ROR $00,X` — shift bit into $00/$01 (VS System uses bit1|bit0, CMP trick puts OR into carry)
4. Edge detect: `LDA $06,X EOR #$FF AND $00,X → STA $08,X` (newly pressed = ~old AND new)
5. Store new raw: `LDA $00,X → STA $06,X`
6. Repeat steps 2–5 a second time (second double-read for further glitch rejection); edges computed against first-read values
7. Final swaps: $06↔$07, $08↔$09

Output after NMI_Sub2:
| ZP | Content |
|----|---------|
| $06 | Slot-0 current frame buttons (raw NES byte) |
| $07 | Slot-1 current frame buttons |
| $08 | Slot-0 just-pressed edge bits (0→1 transitions only) |
| $09 | Slot-1 just-pressed edge bits |

Consumers:
- `$DC4B`: `LDA $06,X` (X=1) → `JSR DecodeDirection ($E50E)` → entity direction for slot 1 (EnemyAI/PlayerAI)
- `$DBE6` (PlayerMovingCheck): `LDA $06,X; AND #$F0` — non-zero = any d-pad button held

#### Path B — ControllerDoubleRead ($99D2, bank 0): called from NMI body

Callers: `$85D4` (title-screen wait loop) and `$8670` (gameplay NMI body at $862A).

Algorithm:
1. Snapshot old $14/$16 → $05/$06
2. `JSR $9A23` (StrobeControllers) → fills $14/$15/$16/$17 with new data
3. Snapshot new $14/$16 → $03/$04
4. `JSR $9A23` again (second read)
5. Compare: if $16≠$04 or $14≠$03, retry from step 2 (spin until two consecutive reads agree)
6. Fire-button deglitch: if $14 has bits[7:6] set AND old $05 also had them → mask $15 &= $3F (clears fire bits in filtered copy). Same for P2 ($16/$06 → $17)
7. `$14 |= $16; $15 |= $17` — OR P1 and P2 together into $14/$15 (so either player pressing Start works)

**StrobeControllers ($9A23)**: sets $4016 bit 0 (strobe ON → latch), clears it (strobe OFF), then calls ReadControllerBits ($9A3F) with X=0 (P1=$4016) and X=1 (P2=$4017).

**ReadControllerBits ($9A3F)**: 8-bit serial read loop.
```
Y=8 loop:
  LDA $4016,X  ; read one bit
  STA $00      ; temp
  LSR          ; shift bit0 to carry
  ORA $00      ; OR with original (combines D0+D1 for VS System dual-line output)
  LSR          ; shift again; carry = D0|D1
  PLA; ROL     ; rotate carry into accumulator (builds byte MSB first)
  DEY; BNE
Result → $14,X*2 (raw) and $15,X*2 (filtered); in-place deglitch: if fire bits set in both new and old → mask filtered copy to $3F
```

Output after ControllerDoubleRead:
| ZP | Content |
|----|---------|
| $14 | P1\|P2 OR'd raw combined button byte |
| $15 | P1\|P2 OR'd filtered (fire-button deglitched) |
| $16 | P2 raw button byte |
| $17 | P2 filtered button byte |

Title-screen usage (`$85D7`): `LDA $14; ORA $15; AND #$10` — bit 4 = Start; spins at `$85DF` until Start released, then continues to game init.

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
| $90C8   | Code | SoundReset — LDA #$00 → SoundOff |
| $90CA   | Code | SoundOff — STA $4015=$00 (disable APU); zero $5D/$5E/$5F; STA $0614=$0F |
| various | Code/Data | Level init routines and tile/sprite data for all 13 stages |
| $F239   | Code | LevelTileLoader — reads nibble-packed stage data at $F27D via ($13),Y; calls DrawNametableTile per 16×16 metatile; 13×13 grid |
| $F27D   | Data | LevelMapData — 35 × 91-byte nibble-packed stage tile grids (all 35 stages) |

### Level Map Pointer Table ($8000, 13 entries)
Dispatched via `StageLoader` ($86E0) when flag $40≠0: loads LevelCodePtrs[$41*2] into Ptr0 → JmpThruPtr0 ($8B63).
Entries 5–8 point into bank 1 addresses that land mid-instruction relative to other code (6502 byte-overlap technique)
or into title-screen string data interpreted as code; the LevelCodePtrs dispatch path may never be triggered for
stage indices 5–8 in normal play (flag $40 is only set by specific conditions checked in `$86BA`/`StageAdvance`).

| Stage | Ptr   | Label | Notes |
|-------|-------|-------|-------|
| 0  | $874D | Level0Init | Level 0 init code (bank 0) |
| 1  | $8A6E | Level1Init | Level 1 init code (bank 0) |
| 2  | $896A | Level2Init | Level 2 init code (bank 0) |
| 3  | $91E8 | Level3Init | Level 3 init code (bank 0) |
| 4  | $8B48 | Level4Init | Level 4 init code (bank 0) |
| 5  | $D309 | —      | Bank 1: lands 3 bytes into `STA $2001` in NMI body; executes `ORA ($20,X)` + `JSR NMI_Sub` — likely unused |
| 6  | $D184 | —      | Bank 1: lands inside title-screen string data (PLAYER…); executed as code if dispatched — likely unused |
| 7  | $D309 | —      | Same as entry 5 — likely unused |
| 8  | $D19F | —      | Bank 1: lands inside title-screen string data (CREDIT…); executed as code if dispatched — likely unused |
| 9  | $BB32 | Level9Init  | Level 9 init code (bank 0) |
| 10 | $BE65 | Level10Init | Level 10 init code (bank 0) |
| 11 | $90BC | Level11Init | Level 11 init code (bank 0) |
| 12 | $91E8 | Level3Init  | Level 12 shares Level 3 init (bank 0) |

### Enemy-Formation Outer Pointer Table ($801A, 13 entries)
Each entry → inner table of 16-bit phase-handler pointers (dispatch via `JmpThruPtr0`).
`SubStageIdx` ($42) counts which phase within the stage; on first call (Y<0) → `StageFirstTimeInit` ($871C).
Inner tables are stored non-sequentially in ROM (interleaved). `$8A64` (Stage0InitPhase3) reused as final cleanup.
Bank 1 sub-routines ($D0BD etc.) are valid code using overlapping-byte technique; $D396 = Init2 utility.

| Stage | Outer Ptr | Inner Size | Phase sub-routines (in order) |
|-------|-----------|------------|-------------------------------|
| 0  | $8034 | 4 entries | $8B22 (Phase0), $892B (Phase1), $8930 (Phase2), $8A64 (Phase3) |
| 1  | $8078 | 2 entries | $8B22 (Phase0/shared), $8AFF |
| 2  | $806C | 6 entries | $89B6, $89C9, $89D1, $89F6, $8A29, $8A4C |
| 3  | $803C | 8 entries | $90D9, $9755, $90DF, $9100, $9139, $9134, $9141, $915D |
| 4  | $804C | 9 entries | $8E42, $8E47, $8E69, $8E4F, $8E9F, $8ED5, $8F5D, $8F7F, $8A64 |
| 5  | $805E | 4 entries | $D0BD, $D344, $D13A, $D107 |
| 6  | $8084 | 3 entries | $D0BD (shared), $D143, $D107 (shared) |
| 7  | $8066 | 3 entries | $D0BD (shared), $D396 (Init2), $D1F9 |
| 8  | $807C | 4 entries | $D0BD (shared), $D1F4, $D1AC, $D1BF |
| 9  | $808A | 6 entries | $90DF, $BA96, $BAA2, $BAC9, $BB1A, $8A64 |
| 10 | $8096 | 5 entries | $BA96, $BE33, $BAC9, $BE38, $8A64 |
| 11 | $80A0 | 2 entries | $90A4, $8A64 |
| 12 | $80A4 | 9 entries | $90C8 (SoundReset), $90D9, $9755, $90DF, $9100, $9139, $9134, $9141, $915D |

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
| $C65C | AttractWait | Loop 240 frames calling BlinkTitleSprite ($C69A); NametableId=$24; exits on credits ($4B≠0) → PLA×2+JMP $C0BB |
| $C67B | MainLoop_3 | Wait 8 frame-counter ticks or until coin |
| $C6C5 | StartGame | Transition to game state $6E; set $5A=$6B=1; draw player sprites; check 1/2P; count down lives |
| $C69A | BlinkTitleSprite | Wait VBlank; test $0B&$20 (frame bit 5, ~1 Hz); if set ptr=$D1A7 else $D1BA; DrawSprites(X=7,Y=$12) |
| $CFAA | PreGameDraw | WaitNMI+ClearSpriteBuf; NametableId=$24; draw nametable blocks; set $60=$30 (stage banner); draw STAGE/XX sprites; if P2 draw P2 indicator; clear $60=$00 |
| $CF96 | MainLoop | Per-frame: call D5AF, D3A1, D3AC, D7D4, Init2 |
| $CFAA | PreLoop | Pre-game sequence: draw title elements, wait |
| $D300 | NMI | Save regs; trigger rendering; OAM DMA; scroll; flush PPU queue |
| $D352 | NMI_Sub | First NMI sub (to be disassembled) |
| $D37C | RNG | PRNG: A = ($0F×8 − $0F + $0A + ZP[$10]) & $FF; updates $0F, $10 |
| $D396 | Init2 | Clear NMI sync flag; wait VBlank |
| $D3A1 | WaitNMI | Set NMI sync flag; wait VBlank |
| $D3AC | ClearSpriteBuf | Zero pages $04–$07 (sprite work buffer) |
| $D3BF | Init | Hardware init: clear ZP vars, read DIP, init PPU, clear OAM |
| $D41E | InitPalette | WaitVBlank; set PPU addr $3F00; loop X 0→$1F: load PaletteData[X], call PaletteApplyDIP, write $2007; reset $2006 |
| $D44A | PaletteData | 32-byte base NES palette: 8 sub-palettes × 4 colours (4 BG + 4 sprite) |
| $D46A | PaletteApplyDIP | STY $00; ORA $4E; TAY; LDA PaletteColorTable,Y; LDY $00; RTS — saves/restores Y; maps raw colour via DIP variant |
| $D475 | PaletteColorTable | 256-byte remap table (4 variants × 64 colours); see Palette Subsystem note |
| $D575 | WaitVBlank | LDA $2002; BPL *; RTS — spin until VBlank flag set (bit 7 of $2002) |
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
| $DC23 | PlayerInputUpdate | Per-frame player input handler (was mislabeled EnemyAI): loops X=1→0 (P2/P1 tank slots); reads $06,X (P1/P2 buttons) → DecodeDirection; on turn: snap position to (+4)&$F8 tile boundary; updates $A0,X=$A0\|dir; AI-mode via $0103,X bit7 |
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
| $EBF6 | SoundResetInit | APU + sound-RAM reset: STA $4015=$0F (enable sq1/sq2/tri/noise), STA $4017=$C0 (5-step frame counter, IRQ inhibit); zero 28 sound slots in $031C–$03F3 (stride 8 via $F0/$F1 ptr) and clear $0300–$031B |
| $EC23 | SoundEngine | Per-frame sound engine: iterates 28 channel slots ($031C–$03F3, 8 bytes each) pointed by $F0/$F1; reads $0300,X active flag; if slot active loads sequence data and writes 4 regs via STA $4000,X (X=0/4/8/12); channel silence via bit-4 XOR at $ECAC; ZP $F4=slot idx, $F5=limit, $F9–$FC=active flags |
| $EC80 | SoundAPUWrite | `STA $4000,X` — core APU register write; X=channel_base (0=sq1,4=sq2,8=tri,12=noise); writes 4 consecutive regs from sequence data at ($F0),Y |
| $EE54 | SoundSeqPtrLoad | Load sound sequence pointer for channel $F4 from table $EEA3 → ZP $F2/$F3 |
| $EE63 | SoundSeqReadByte | Read one byte from sound sequence at ($F2),Y; advance sequence offset in ($F0)+5 |
| $EEA3 | SoundSeqPtrTable | 14 × 2-byte little-endian pointers to sound sequence data (one per slot) |
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
| $C625 | ClearKillTallies | Zero ZP $73–$7A (8 bytes): kill-tally buffer for all enemy types; called from LevelStart before DrawAllHUDKillIcons |
| $C7BD | DrawAllHUDKillIcons | Loop $5A=$12→0 step−2 (10 pairs), call $C79F: draw all 10 HUD kill-counter icons |
| $C7CD | DrawHUDTanks | Draw two tank sprites (tiles $79/$7D) at $0105/$0106 and $0105+$10/$0106; used for HUD enemy-count animation |
| $C7F8 | HUDTankAnimation | Count down $0108 (HUDTankCount) every 16 frames; when ≥$0A: apply HUDTankWiggleX/Y[$0107] delta to $0105/$0106 (tank X/Y); call DrawHUDTanks; when $0108→0 set $0106=$F0 (off-screen) |
| $D2C6 | HUDTankWiggleX | 4-entry s8 table: X deltas for HUD tank wobble animation {0,−1,0,+1} (N/W/S/E) |
| $D2CA | HUDTankWiggleY | 4-entry s8 table: Y deltas for HUD tank wobble animation {−1,0,+1,0} (N/W/S/E) |
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
        JSR HideAllSprites ($98E0)     ; fill OAM shadow $0200-$02FF with $F8
        JSR ClearNametablesInit ($98BE); disable rendering; clear nametables $20/$24/$28
        zero ZP $68–$EF                ; clear working variables
        ORA $80B6[stage] into $59      ; stage flags — bit 2 = VS coin-counter-2 output
        JSR ResetScrollToZero ($97B1)  ; reset PPU scroll to (0,0); returns A=0
        A=0 → $12/$6B/$13/$6C/$FC      ; zero scroll/nametable params
        LDA #$10 → WritePPUCtrl($8747) ; enable NMI; set PPU ctrl = $10
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

### StageFirstTimeInit Helpers ($98E0, $98BE, $97B1) — Bank 0

Three helper routines called exclusively from `StageFirstTimeInit` ($871C) on the first invocation of each stage's outer loop.

#### `HideAllSprites` ($98E0)
```
LDA #$F8
LDY #$00
loop: STA $0200,Y; DEY; BNE loop
RTS
```
Fills all 256 bytes of the OAM shadow buffer ($0200–$02FF) with `$F8` (Y=248), hiding all 64 hardware sprites off the visible screen before stage render begins.

#### `ClearNametablesInit` ($98BE)
Clears game-visible nametables and disables rendering. Sequence:
1. `STA $0300 = $00` (clear CoinEventFlag); `STA $0301 = $00` (clear PPU queue head)
2. Loop X = 1, 2, 3:
   - **`DisableRendering` ($98DA)**: `LDA #$00; STA $2001; RTS` — turns off both BG and sprite rendering
   - **`ClearNametableSlot` ($98EB)**: resets PPU latch; clears bit 2 of `$10`; calls `WritePPUCtrl ($8747)`; computes nametable VRAM base = `$1C + $04×$01` (→ `$20`, `$24`, `$28` for X=1,2,3); writes 1024 bytes of `$FC` (blank tile) + 64 bytes `$00` (clear attributes) directly via `$2006/$2007`

After this call all three name tables ($20/$24/$28) contain blank tiles and zero attributes.

#### `ResetScrollToZero` ($97B1)
```
LDA $2002       ; reset PPU address latch
LDA #$00
STA $2005       ; X scroll = 0
JMP $97CD       ; STA $2005; RTS  (Y scroll = 0, returns A=0)
```
Returns A=0 which the caller (`StageFirstTimeInit`) immediately uses to zero ZP `$12/$6B/$13/$6C/$FC` (scroll shadow registers and nametable config byte). Then `LDA #$10 / JSR WritePPUCtrl` re-enables NMI and sets PPU control = `$10`.

#### `WritePPUCtrl` ($8747)
```
STA $2000
STA $10
RTS
```
Entry point within `StageFirstTimeInit`; also called from `ClearNametableSlot` and 4 other bank-0 sites. Writes A to PPU control register `$2000` and saves shadow copy in ZP `$10`.

---

### PPU Scroll Write Cluster ($97B1–$9810) — Bank 0

A cluster of entry points for writing the PPU scroll registers (`$2005` × 2) and updating `$2000` PPU control. All paths funnel through the two-write sequence at `$97CD` (write A to `$2005` / RTS).

| Entry | Label | Action |
|-------|-------|--------|
| `$97B1` | `ResetScrollToZero` | Reset latch; write `$00` twice → scroll (0,0); return A=0 |
| `$97BC` | `WritePPUCtrlScroll12` | `$2000 = $10 OR $68`; reset latch; write `$12`/`$13` → scroll X/Y |
| `$97C3` | `WriteScroll12` | Reset latch; write `$12` then `$13` to `$2005` (no ctrl update) |
| `$97CD` | `WriteScrollY` | Write A to `$2005` (second/Y scroll byte); RTS — shared tail |
| `$97D1` | `WritePPUCtrlScroll6B` | `$2000 = $10 OR $69`; reset latch; write `$6B`/`$6C` → scroll X/Y |
| `$97E5` | `VBlankScrollApply6B` | Wait `$2002` bit 7; `LDA $10 AND #$FE`; JSR `$97D3`; extract `$3F[1:0]`→`$61`; delay loop (`$70×$12`); reconstruct `$10`; JMP `WriteScroll12` |
| `$9803` | `PPUCtrlRefreshScroll12` | `$10 = ($10 AND $7C) OR $68`; write to `$2000`; JMP `WriteScroll12` |

**ZP scroll shadow registers:**
- `$12/$13` — primary X/Y scroll (used by `WriteScroll12`, `WritePPUCtrlScroll12`)
- `$6B/$6C` — secondary X/Y scroll (used by `WritePPUCtrlScroll6B`, `VBlankScrollApply6B`)
- `$68` / `$69` — nametable select bits OR'd into PPU control word

**Callers:**
- `VBlankScrollApply6B ($97E5)`: called from $8662 (gameplay NMI body alternative)
- `WritePPUCtrlScroll6B ($97D1)`: called from `LevelScreenInit ($9764)`
- `ResetScrollToZero ($97B1)`: called from `StageFirstTimeInit ($871C)`
- `PPUCtrlRefreshScroll12 ($9803)`: called from $8668 (third per-frame PPU path)

---

### StageFlagsTable ($80B6) — VS. System Coin Counter Output

13-byte table indexed by stage number (X = `$41` StageNum). Each byte is OR'd into ZP `$59` after clearing bit 2 (`AND #$FB; ORA $80B6,X; STA $59`).

**ZP $59** is the shadow register for `$4016` (controller port / VS. System output). It is written to `$4016` on every controller strobe in `StrobeControllers` ($9A23) and `ControllerDoubleRead` ($99D2). Bit 2 of `$59` → bit 2 of `$4016`.

**Bit 2 of `$4016` on the VS. System** = Coin Counter output 2 (physical mechanical counter in the arcade cabinet). When this bit is set in `$59`, every strobe cycle drives the coin-counter-2 output high alongside the strobe signal.

**Table values** (13 stages, $80B6–$80C2):

| Stage | Addr | Value | Bit 2 | Note |
|-------|------|-------|-------|------|
| 0 | $80B6 | $04 | 1 | coin-counter-2 active |
| 1 | $80B7 | $04 | 1 | coin-counter-2 active |
| 2 | $80B8 | $04 | 1 | coin-counter-2 active |
| 3 | $80B9 | $00 | 0 | coin-counter-2 inactive |
| 4 | $80BA | $04 | 1 | coin-counter-2 active |
| 5 | $80BB | $04 | 1 | coin-counter-2 active |
| 6 | $80BC | $04 | 1 | coin-counter-2 active |
| 7 | $80BD | $04 | 1 | coin-counter-2 active |
| 8 | $80BE | $04 | 1 | coin-counter-2 active |
| 9 | $80BF | $00 | 0 | coin-counter-2 inactive |
| 10 | $80C0 | $00 | 0 | coin-counter-2 inactive |
| 11 | $80C1 | $04 | 1 | coin-counter-2 active |
| 12 | $80C2 | $00 | 0 | coin-counter-2 inactive |

**Key finding**: No game logic reads `$59` bit 2 back — no branch, no AND check anywhere tests this bit for gameplay decisions. It only drives the VS. System hardware output. **Web reimplementation: ignore this table entirely** — no game logic depends on it.

The separate `NMI_Sub2` ($D68A) controller path writes `$4016` directly (STX #$01 / STY #$00) and does NOT use `$59`, so NMI controller reads are unaffected by this flag.

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
| $D475 | PaletteColorTable | 256 B | DIP colour remap: 4 variants × 64 NES colour entries; indexed as `(base_color | $4E)` where $4E ∈ {$00,$40,$80,$C0} |
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

### Palette Subsystem

**Overview**: On startup (`Init` at $D3BF), the game reads DIP switches ($4017 AND $C0 → $4E), then calls `InitPalette` ($D41E) which writes all 32 NES palette entries to PPU $3F00-$3F1F with per-entry colour remapping.

**DIP switch colour variants** (`$4E` ∈ {$00, $40, $80, $C0}): VS. System arcade cabinets used four different PPU chips with different colour output; the four DIP variants compensate for this.

**Call chain**:
```
Init ($D3BF): LDA $4017 / AND #$C0 / STA $4E
  → InitPalette ($D41E)
      → WaitVBlank ($D575)       ; spin on $2002 bit 7
      → STA $2006 #$3F / STX $2006 #$00  ; set PPU address to $3F00
      → loop X=0..31:
            LDA PaletteData,X    ; base colour ($D44A+X)
            JSR PaletteApplyDIP  ; remap via DIP table
            STA $2007            ; write to PPU palette RAM
```

**PaletteApplyDIP ($D46A)**:
```asm
STY $00          ; save Y
ORA $4E          ; A = base_color | dip_offset  ($4E ∈ $00/$40/$80/$C0)
TAY              ; Y = remap index
LDA $D475,Y      ; A = PaletteColorTable[Y]  (remapped NES colour)
LDY $00          ; restore Y
RTS
```

**PaletteData ($D44A)** — 32 base NES colours (8 sub-palettes × 4 colours):
```
BG0: $0F $17 $06 $00   (black, med-grey, green, black)
BG1: $0F $3C $10 $12   (black, pink, grey, blue)
BG2: $0F $29 $09 $0B   (black, purple, tan, dark-green)
BG3: $0F $00 $10 $20   (black, black, grey, white)
SP0: $0F $18 $27 $38   (black, yellow, pink, orange)
SP1: $0F $0A $1B $3B   (black, dark-red, cyan, lime)
SP2: $0F $0C $10 $20   (black, dark-blue, grey, white)
SP3: $0F $04 $16 $20   (black, magenta, red, white)
```

**PaletteColorTable ($D475)** — 256 bytes; 4 variants × 64 NES colour remap entries:

| Variant | $4E | Address range | Description |
|---------|-----|---------------|-------------|
| 0 | $00 | $D475–$D4B4 | Default (RP2C04-0001 or standard) |
| 1 | $40 | $D4B5–$D4F4 | Alternate (RP2C04-0002) |
| 2 | $80 | $D4F5–$D534 | Alternate (RP2C04-0003) |
| 3 | $C0 | $D535–$D574 | Alternate (RP2C04-0004) |

Each variant entry at index `i` maps NES colour `i` to the output NES colour for that PPU hardware type.

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
Used by RandomDirChange handler (enemy random direction 1-in-4) and EnemyFireCheck (1-in-32 fire chance).

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

### Game-over sequence (StageEndHandler $C1A0)

**StageEndHandler ($C1A0)** — entry point for end-of-stage logic; dispatches to tally, victory, or game-over screen:

```
; --- Phase 1: Clear state, reset bullets/entities, respawn players ---
$0C = $60 = $6B = 0              ; clear PPU queue idx, GameState, GameActive
JSR $CA44                         ; (curtain helper, exact role TBD)
JSR TallyCloseCurtain ($CACF)
JSR $D595                         ; reset helper
JSR ClearAndRespawn ($C301)       ; clear bullets/entities; respawn players if lives > 0

; --- Phase 2: Wait for eagle explosion to finish ---
Loop:
  JSR WaitVBlank; GameUpdate2 ($C29F); EntityUpdate ($E2EF)
  JSR CollisionUpdate ($E18C); MoveUpdate ($DF5A)
  JSR CheckGameOver ($C62F)        ; A=0 (Z=1) = ongoing; A=1 (Z=0) = done
  BEQ loop                         ; repeat while still animating

; --- Phase 3: PaletteFlash animation loop ---
$0A = $0B = 0
if $0108 != 0: $0A = $FE           ; pre-load counter if enemy killed player
Loop:
  JSR WaitVBlank; $C249 (input block); GameUpdate2; EntityUpdate; MoveUpdate; CollisionUpdate
  JSR PaletteFlash ($C2D9)          ; toggles bg colour via FrameLo bits every 32 frames
  if $0A != 2: loop                  ; repeat until $0A == 2 (flash animation complete)

; --- Phase 4: Tally and decide next stage or game-over ---
JSR SoundResetInit ($EBF6)
JSR StageClearTallyScreen ($C1F5)   ; kills tally + score tally screen
INC $85                              ; advance internal stage counter
if ($51 + $52) == 0: → game-over path ($C20A)   ; no lives remain
if $68 == $80: JMP $C0C1            ; lives remain and HQ active → load next stage

; --- Game-over path ---
$C20A: if ($15 | $1D) != 0: JSR DrawVictoryScreen ($C44D)  ; enemies still on field
JSR DrawGameOverScreen ($C53E)
JSR CompareAndUpdateHiScore ($D9F0) ; returns Y=0 (no), Y=1 (P1 new), Y=$FF (P2 new)
TYA / BEQ $C222                      ; Y=0 → skip hi-score display
  JSR NewHiScoreDisplay ($C4E9)      ; draw hi-score with flashing palette
  JSR GameOverCleanup ($C225)        ; WaitNMI + ClearSpriteBuf + WriteNametable + Init2
$C222: JMP $C0A6                     ; return to attract loop
```

**CheckGameOver ($C62F)**:
```
LDA $68 / BEQ showOAM                ; $68==0 → eagle gone, trigger OAM
LDA $80 / BEQ return_A1             ; timer $80==0 → animation done, game over
LDA $51+$52 / BNE return_A0         ; lives remain → loop continues
showOAM: $0105=$70 $0106=$F0 $0107=$00 $0108=$11 ; explosion OAM entries
         $0B = 0
return_A1: LDA #$01 / RTS           ; Z=0 → exit StageEndHandler loop (game over)
return_A0: LDA #$00 / RTS           ; Z=1 → BEQ taken → continue looping
```

**ClearAndRespawn ($C301)**:
```
JSR ClearBulletSlots ($E4C6)
JSR ClearEntitySlots ($E4D0)
$0106 = $F0 (hide eagle OAM Y); $0108 = 0 (clear HUD tank count)
if $51 > 0: JSR PlayerRespawn ($E417) X=0 (P1)
if $52 > 0: JSR PlayerRespawn ($E417) X=1 (P2)
$7F=$80=$14 (timers); $8F=$0A=$45=0
```

**DrawGameOverScreen ($C53E)**:
```
JSR WaitNMI; NametableId=$1C; ScrollX=ScrollY=0; ClearSpriteBuf
DrawX=$3C DrawY=$46 SrcPtr=$D214 → JSR $D8F7   ; draw "GAME" tile-index string
DrawX=$3C DrawY=$78 SrcPtr=$D219 → JSR $D8F7   ; draw "OVER" tile-index string
JSR WriteNametable; Init2; SetGamePalette
$0A=0; $0318=$0319=$031A=1           ; set animation trigger bytes
Loop: JSR WaitVBlank until $0318==0  ; NMI decrements/clears $0318
JSR WaitNMI; ClearSpriteBuf; WriteNametable; Init2; RTS
```
"GAME" and "OVER" are sequences of tile indices (not ASCII) drawn by `$D8F7`. Animation timers `$0318/$0319/$031A` are decremented by the NMI handler each VBlank.

**CompareAndUpdateHiScore ($D9F0)** — not a display routine; pure compare + update:
```
Compare 7 BCD bytes P1 score ($15–$1B) vs hi-score ($3D–$43)
  P1 > hi-score: copy $15→$3D (7 bytes); Y=1
Compare 7 BCD bytes P2 score ($1D–$23) vs hi-score ($3D–$43)
  P2 > hi-score: copy $1D→$3D (7 bytes); Y=$FF
No update: Y=0
```
Hi-score buffer is ZP `$3D–$43` (7-byte BCD). Returns Y=0/1/$FF.

**NewHiScoreDisplay ($C4E9)**:
```
JSR WaitNMI; NametableId=$1C; ScrollX=ScrollY=0; ClearSpriteBuf
DrawX=$10 DrawY=$32 SrcPtr=$D16B → JSR $D8F7   ; draw "HI-SCORE" label
JSR $D9C4                            ; draw hi-score numeric value to nametable
JSR WriteNametable; Init2
$0315=$0316=$0317=1                  ; animation timers
Loop: WaitVBlank → JSR RNG; AND #$3F; JSR QueuePaletteWrite  ; random colour flash
      until timers clear
```

**DrawVictoryScreen ($C44D)** — final victory screen shown when all stages are cleared (called when $15|$1D ≠ 0 at $C210):
```
JSR WaitNMI; ScrollX=ScrollY=0; JSR SetPPUState
NametableId=$1C → JSR WriteNametable    ; clear nametable 1
NametableId=$24 → JSR WriteNametable    ; clear nametable 2
JSR Init2; JSR ClearSpriteBuf
SrcPtr=$D291, X=7, Y=$0A → JSR DrawSprites   ; "PEACE BE WITH YOU" at col7 row10
SrcPtr=$D145, X=$0C, Y=$0E → JSR DrawSprites ; 9 deco tiles $60-$68 at col12 row14
JSR WaitVBlank
($13)=$D2A4, col=$0A, row=$07 → JSR DrawRowTiles ; "NOW LONG WAR" at row7 col10
($13)=$D2B1, col=$0C, row=$0A → JSR DrawRowTiles ; "COMES TO" at row10 col12
($13)=$D2BA, col=$0D, row=$0D → JSR DrawRowTiles ; "AN END" at row13 col13
LDX #$F0 → JSR WaitVBlankX             ; hide sprites
; 240-frame horizontal scroll slide
Loop: JSR WaitVBlank; INC $4F(ScrollX); until $4F==$F0
ScrollX=0; ScrollY=2
LDX #$F0 → JSR WaitVBlankX; RTS
```
**String data at $D291** (ASCII, $FF-terminated lines):
- `$D291` = "PEACE BE WITH YOU" + $15 + $FF (9 ASCII chars; $15 may be a punctuation tile)
- `$D2A4` = "NOW LONG WAR" + $FF
- `$D2B1` = "COMES TO" + $FF
- `$D2BA` = "AN END" + $69 + $FF ($69 likely '!' or '.' tile index)
- `$D2C2–$D2CF` = animation/palette timing bytes (not string data)

**Tile data at $D145** (mixed tile indices and ASCII, $FF-terminated):
- `$D145` = tile indices $60–$68 + $FF → 9 decorative graphic tiles (used by DrawVictoryScreen)
- `$D14F` = "BATTLE" + $FF; `$D156` = "CITY" + $FF (used by PreGameDraw/other callers)
- `$D16B` = "HISCORE" + $FF (used by NewHiScoreDisplay $C4E9)

**DrawRowTiles ($D91B)** — draws a horizontal run of tiles from a ZP-indirect ptr:
```
Y=0; $5F=0
Loop: A = ($13/$14)[Y]; if A==$FF → RTS
  PHA; LDX=$5D(col), LDY=$5E(row) → JSR $D5FC (calc PPU addr)
  enqueue (PPU addr hi, PPU addr lo, tile) + $FF sentinel to $0180 queue
  $0313=$0314=1 (trigger PPU flush); INC $5D (advance col); INC $5F (advance byte); loop
```

**GameOverScoreScreen ($CF96)** — *not a score display*; called every attract-loop iteration at `$C0A9`:
```
JSR SetGamePalette; WaitNMI; NametableId=$1C
JSR ClearSpriteBuf; WriteNametable; Init2; RTS
```
This is the **attract-mode nametable reset** step, not a score screen. The label is misleading.

**Full return path**: `StageEndHandler → JMP $C0A6 → PreLoop ($CFAA) → GameOverScoreScreen ($CF96) → MainLoop_2 ($C65C) → MainLoop_3 ($C67B) → MainLoop_4 ($C389) → GameFrame ($C402) → JMP $C0A9` (attract loop)

**$C249 (input block during flash)**:
```
LDA $68 / CMP #$80 / BEQ skip   ; if HQ active ($68=$80), leave inputs alone
$06=$07=$08=$09=0                ; zero P1Dir/P2Dir/P1Fire/P2Fire (block input during game-over animation)
```

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
| $08–$10 | Basic enemy tank sprite (3×3 OAM grid, all 9 slots filled) |
| $10–$18 | Player tier-1 tank sprite (3×3 OAM grid) |
| $11–$19 | Player tier-2 tank sprite (1-star upgrade) |
| $82–$8A | Player tier-3 tank sprite (2-star upgrade) |
| $85–$8D | Fast enemy tank sprite (3×3 grid, 2 slots transparent) |
| $F6–$FE | Power enemy tank sprite (CHR tile base $F6; overlaps eagle-expl range) |
| $AC–$B4 | Armor enemy tank sprite (base $AC; tier changes on each hit) |

### Level tile map data and loader ($F27D, $F239)

Level tile maps are stored at **CPU $F27D** (file offset `0x728D`, PRG bank 1):
- **35 stages** × **91 bytes each** = 3185 bytes total, ending at ~$FFEE
- Each stage encodes a **13 × 13 metatile grid** as nibble-packed bytes
  - 14 nibbles per row (13 columns + 1 padding nibble), 13 rows = 182 nibbles = 91 bytes
  - High nibble first: `tile = (byte >> 4)` for even nibble, `tile = byte & $0F` for odd
- Tile type values match `DrawNametableTile` ($D82B) type table: 0–3=brick partial, 4=brick full, 5–8=steel partial, 9=steel full, 10=trees, 11=water, 12=ice, 13–15=empty

**Loader loop ($F239)**:
```
$13/$14 = pointer into $F27D + stage_offset  (set by level init)
$5A = nibble index (0 → 169)
$56/$57 = current pixel X/Y (starts $10/$10, steps by $10 = 16px per metatile)

Loop:
  Y = $5A >> 1 (byte index)
  if $5A & 1: tile = ($13),Y & $0F   (low nibble)
  else:        tile = ($13),Y >> 4    (high nibble)
  X = $56, Y = $57 → JSR DrawNametableTile ($D82B)
  $56 += $10; if $56 == $E0: wrap, $57 += $10
  INC $5A; continue until $57 == $E0 (all 13 rows done)
```

All 35 stage maps already extracted and decoded in **`extract_level_maps.py`** (ASCII art + JS constants).

### APU sound engine

**Initialization ($EBF6 / SoundResetInit)** — called at level start, game over, attract entry:
```
STA $4015 = $0F   ; enable channels: pulse1, pulse2, triangle, noise
STA $4017 = $C0   ; 5-step frame counter; bit 6 = IRQ inhibit
; Zero 28 sound slots: $031C–$03F3 (stride 8) and counters $0300–$031B
```

**Disable ($90CA / SoundOff)**:
```
STA $4015 = $00   ; disable all APU channels
STA $5D = $5E = $5F = $00
STA $0614 = $0F
```

**Per-frame engine ($EC23 / SoundEngine)** — called each frame from main loop:
- ZP `$F0/$F1` = pointer into sound slot workspace (starts $031C)
- ZP `$F4` = current slot index (0–27), `$F5` = slot limit ($1C=28 or $01 in service)
- ZP `$F9–$FC` = 4 channel active flags (one per APU channel)
- For each active slot: reads sequence byte from ($F0)+5; values 1–4 = channels 0–3; ≥5 = stop channel
- **APU write** (`$EC80`): `STA $4000,X` with X = channel × 4 (0=sq1, 4=sq2, 8=tri, 12=noise); writes 4 consecutive registers from sequence data at `($F0),Y`
- **Channel silence** (`$ECAC`): writes `((channel_idx << 2) & $10) XOR $10` to `$4000,X` (clears bit 4 of vol/duty register → volume=0)
- Sound sequences pointed by `$EEA3` table (14 × 2-byte LE pointers); each sequence is a stream of register bytes + duration + next-pointer

### Sound slot priority array ($0300–$031B)

28 bytes, one per sound slot.  `$0300,X` (X = 0–27) is the priority counter for slot X.  Zero = slot inactive; non-zero = slot wants to play.  `SoundResetInit` ($EBF6) zeroes all 28 on level-start/game-over.

Known slot assignments:
| Slot | Address | Trigger |
|------|---------|---------|
| 0 | $0300 | `CoinEventFlag`: set to 1 by NMI_Sub ($D374) on coin release; also sound slot 0 (coin-insert jingle). |
| 1–3 | $0301–$0303 | Set to 1 at `GameLoopTop` ($C18A) at the top of every game-loop frame (background music / tick channels). |
| 4–5 | $0304–$0305 | Set to 1 by `LivesGrantCheck` ($CF8F) and power-up code ($EBE7) when player gains a life (life-up jingle + HUD redraw trigger). |
| 10 | $030A | ROL'd at $D4EC (bitwise carry-shift, multi-frame animated effect). |
| 16 | $0310 | Enemy bullet-fire trigger ("enemy fire trigger" per earlier notes). |
| 19–20 | $0313–$0314 | Set to 1 at kill-tally ($CB47/$CB65) when enemy destroyed (kill sound). Also noted: `$9751` zeroes $0313 at level-screen init. |

Sound slot data structures: slot N lives at `$031C + N×8` (8 bytes).

**Dual use during level init (bank 0 only, before SoundResetInit):**

`$0300` acts as a **PPU tile write queue head index**.  `BuildPPUWriteQueue` ($992E):
1. Reads `LDX $0300` (write position).
2. Appends entries to `$0301,X++`: format `[ppu_addr_hi, ppu_addr_lo, count, tile×count]`.
3. Saves X back → `STX $0300`.
4. Boundary: if X ≥ $3F → abort (queue full sentinel).
`$974A` initialises head to `$12` (=18) before `HQSpriteInit` appends HQ sprite tiles from $0313 onward.
After all bank-0 level-init code completes, `SoundResetInit` zeroes $0300–$031B, wiping the queue and initialising the sound priority array for gameplay.

### Title screen / attract mode

**AttractWait ($C65C)**:
```
NametableId ($05) = $24  (second nametable)
$4F = $50 = 0            (scroll reset)
Loop:
  JSR BlinkTitleSprite ($C69A)
  INC $4F
  if $4B != 0: PLA; PLA; JMP $C0BB  (credits → exit attract)
  if $4F != $F0: loop               (wait 240 frames ~4 sec)
RTS
```

**BlinkTitleSprite ($C69A)**:
```
JSR WaitVBlank ($D95F)
if $0B & $20 != 0:             (frame counter bit 5 = ~1 Hz toggle)
  ptr = $D1A7 (sprite table A) ; "1UP" / "2UP" frame A
else:
  ptr = $D1BA (sprite table B) ; frame B (blinking)
JSR DrawSprites ($D6D3, X=7 sprites, Y=$12 dest row)
```

**PreGameDraw ($CFAA)**:
```
JSR WaitNMI; ClearSpriteBuf
NametableId = $24
Draw nametable block pair at ($D14F/$D156)  ; border/title elements row 1
Draw nametable block pair at ($D163/$D16A)  ; row 2
JSR $D7D4 (tile map flush); JSR Init2 ($D396)
$60 = $30            ; enter stage-start banner state
DrawSprites ("STAGE" text at col$02, row$03) from ptr $D15B, X=2 tiles
DrawSprites (stage number) via $D9A7 (2-digit Y=$16, X=$04)
JSR $D6FD (draw row)
if $83 != 0: DrawSprites (P2 indicator at col$15/$17, row$03)
$60 = $00            ; back to gameplay state
JSR WaitVBlank
DrawSprites (level border sprites from $D145/$D1E7/$D1FE)
```

### Extra-life logic (LivesGrantCheck $CF44)

Called from PowerUpCollision. Checks if `$68=$80` (game active):
- **P1**: if `$17 ≥ 2` (score tier) or `$66 ≥ 1`: `INC $51` (P1Lives), `INC $66`; set `$0304=$0305=1`
- **P2**: same check with `$1F` / `$52` / `$67` (P2 score tier / lives / flag)
- Sets `$0304=$0305=1` → triggers HUD lives display update
- `$66` / `$67` act as "extra life already granted" flags to prevent double-grant

### Shovel power-up / FortifyBase ($EBA0, $C9BB, $C912)

Power-up type 2 handler at **`$EBA0`**:
```
LDA $68 / BPL $EBAB   ; skip if game NOT active (bit 7 of $68 clear)
JSR $C9BB             ; FortifyBase: draw steel walls around eagle
LDA #$14 / STA $45    ; FortifyTimer = 20
RTS
```

**FortifyBase (`$C9BB`)** — draws 4 rows of steel wall tiles around the base:
- Calls `DrawSprites` at nametable rows $18–$1B (rows 24–27), source data at $D249/$D250/$D257/$D25E
- Writes PPU attribute byte `$3F` to `$07F3` and PPU write queue at `$23F3` (attribute table entry for the base 4×4 region)
- `$3F` = palette 3 for all four 2×2 sub-blocks → steel visual palette

**RevertBricks (`$C912`)** — mirror of FortifyBase but with brick tile data ($D22D/$D234/$D23B/$D242):
- Same 4-row DrawSprites at rows $18–$1B; sets attribute `$00` (palette 0) at $07F3/$23F3

**FortifyTimer (`$45`) countdown** (in `PowerUpSpawn $E35D`):
- Decremented by `DEC $45` ($E36D) once every 64 frames (`FrameLo AND $3F == 0`)
- Total duration: 20 × 64 = **1280 frames ≈ 21 seconds** at 60 fps
- When `$45 < 4` (last ~192 frames): flashing mode — alternate steel/brick every 16 frames based on `FrameLo AND $10`
- When `$45 == 0` (after decrement): call `$C912` to revert walls to brick permanently

**$68 role in shovel**: `$68 >= $80` (bit 7 set) = game active; fortify only activates during live gameplay, not attract/game-over.

### EntityType tier semantics ($A8,X / $0101,X)

The unified **entity type byte** is stored in `$A8,X` (ZP). It encodes:

| High bits [7:5] | Entity class | Score index |
|-----------------|-------------|-------------|
| $20–$2F | Player tier 1 (basic, no star) | — |
| $40–$4F | Player tier 2 (1 star upgrade) | — |
| $60–$6F | Player tier 3 (2 star upgrade) | — |
| $80–$8F | Enemy: Basic tank (1 hit) | 0 → 100 pts |
| $A0–$AF | Enemy: Fast tank (1 hit, fast speed) | 1 → 200 pts |
| $C0–$CF | Enemy: Power tank (1 hit, fast bullets) | 2 → 300 pts |
| $E0–$EF | Enemy: Armor tank (low nibble = hits remaining) | 3 → 400 pts |

**Armor tank hit tracking** (low nibble of $A8,X):
- Spawns at `$E3` (ORA #$03 applied at `$E4B5` to EnemyTypeTable value $E0)
- Each bullet hit: `DEC $A8,X` (at `$E985`) then `AND #$03 / BEQ destroy`
- Hit sequence: `$E3 → $E2 → $E1 → $E0` → destroyed (4 hits total)
- Bit 2 of $A8,X (i.e., $E4): triggers color-flash effect via `$EA63` on next hit

**Score formula** (at `$E9A2`): `($A8,X >> 5) − 4` → index 0/1/2/3 into score table `$EA5F`

**Sprite tile mapping** (via `$A82A[entity_type]`):
- `$B26B` returns raw `$A8,X` when entity is in movement state (`$70,X` nonzero and ≠ $0D; path via `$B2D9`)
- This indexes `$A82A` (bank 0 data table) to get starting CHR tile:

| Entity type ($A8,X) | `$A82A` base tile | `$A841` bitmask | Visible slots |
|---------------------|------------------|-----------------|---------------|
| $20 (player 1)      | $10              | $00             | all 9         |
| $40 (player 2)      | $11              | —               | all 9         |
| $80 (basic enemy)   | $08              | $A0             | all 9         |
| $A0 (fast enemy)    | $85              | $18             | 7 of 9        |
| $C0 (power enemy)   | $F6              | —               | —             |
| $E3 (armor enemy)   | $AC              | —               | —             |

- Sprite grid is always 3×3 = 9 OAM slots (from attribute $03=$33 → $06=3 cols, $07=3 rows)
- `$A841[entity_type]` bitmask: each set bit (for even slots 0,2,4,6,8) writes transparent tile $FC instead of incrementing tile counter
- `$0101,X` stores the player upgrade tier ($20/$40/$60); also mirrored into `$A8,X` via ORA at spawn (`$E4B7`)

### Metatile System (DrawNametableTile — $D82B)

`DrawNametableTile(A=tile_type, X=pixel_x, Y=pixel_y)`:
1. Converts pixel coords to tile coords via $D733 (`PixelToTileCoord`: each coord >> 3)
2. Calls $D613 to compute nametable address
3. Rounds both tile coords to even (AND #$FE) → start of 2×2 block
4. Looks up palette via `TileAttrTable` ($DB69, 1 byte per type) and writes attribute byte
5. Looks up 4 CHR tile IDs from `TileCHRTable` ($DB79, 4 bytes per type = TL/TR/BL/BR) and writes them to the nametable via $D7A4/$D7CA

**TileAttrTable ($DB69, 16 bytes)** — NES palette slot (0–3) per tile type:
| Type | Palette | Terrain |
|------|---------|---------|
| 0–4  | 0       | Open ground / brick half-variants |
| 5–9  | 3       | Steel wall variants |
| 10   | 1       | Water / river |
| 11   | 2       | Trees / forest |
| 12   | 3       | Ice |
| 13–15| 0       | Open (empty) |

**TileCHRTable ($DB79, 64 bytes = 16 × 4)** — CHR tile IDs [TL, TR, BL, BR]:
| Type | TL  | TR  | BL  | BR  | Terrain |
|------|-----|-----|-----|-----|---------|
| 4    | $0F | $0F | $0F | $0F | Solid brick |
| 9    | $10 | $10 | $10 | $10 | Solid steel |
| 10   | $12 | $12 | $12 | $12 | Water |
| 11   | $22 | $22 | $22 | $22 | Trees |
| 12   | $21 | $21 | $21 | $21 | Ice |
| 15   | $00 | $00 | $00 | $00 | Open ground (blank tiles) |
(Types 0–3 and 5–8 are half-brick / half-steel variants with mixed CHR IDs)

Tile type $0F (15) = open ground: drawn with CHR tiles $00 everywhere. Used at $E461 to clear the spawn position before an enemy appears, and at $F25B during level tile loading.

---

### GameState Machine ($60)

| Value | Name | When set | Description |
|-------|------|----------|-------------|
| $00 | Gameplay | $C1A4 (game start), $D03B (banner end) | Normal game running |
| $30 | StageStart | $CFE2 (PreLoop), $D087 (StageStartDraw) | "STAGE XX" banner + player-count display |
| $6E | Attract | $C0CD | Title/demo mode before coin insert |

**CoinScreen flow** ($C840): loops displaying credits; on fire-press → PLA×2 (discard JSR return) + dispatch via JMP($0011) → `TwoPlayerStart` ($C8A7, $6C=5) or `OnePlayerStart` ($C8AC, $6C=7) → `NewGameInit` ($C25A: clears $4C=0, sets lives) → JMP $C0C1 (never returns to $C0BE).

---

### LevelStart ($C33D)

Called with enemy freeze time in A:
```
STA $0100    ; EnemyFreezeTimer (freeze all enemies at level start)
STA $6A      ; also stored in $6A (SpawnRotIdx — reused as init count)
JSR $C625    ; ClearKillTallies — zeros ZP $73-$7A (8 kill-tally bytes for per-type enemy kill counts)
JSR DrawAllHUDKillIcons
JSR WaitVBlank
JSR $C72D, $C756  ; HUD sprite setup
JSR SetSpeedPtr ($E4E8)
LDA #$80 → STA $68    ; GameActive = true
STA $0312 = 1, STA $4C = 1  ; GameSessionActive = true
Compute $84 (eagle Y-position limit) from player count + $85 (stage count)
```

---

## Next Tasks

- [x] Disassemble $D352 (NMI_Sub) — VS System coin/service input handler; double-reads $4016; detects bits $24 (coin/service buttons); $4A=CoinHeldCounter, $4B=CoinCredits, $0300=CoinEventFlag
- [x] Disassemble $C7F8 — HUDTankAnimation: counts down $0108 (HUDTankCount) every 16 frames; when ≥$0A applies D2C6/D2CA 4-directional wiggle delta to $0105/$0106; calls DrawHUDTanks
- [x] Disassemble $C625 — ClearKillTallies: zeros ZP $73-$7A (8 bytes of per-type kill tallies) at level start before DrawAllHUDKillIcons
- [x] Disassemble $D82B — `DrawNametableTile(A=tile_type, X=pixel_x, Y=pixel_y)`: divides coords by 8 via $D733; palette from $DB69[type]; 4 CHR tiles from $DB79[type*4]; writes 2×2 metatile to nametable+attribute. Called from $E461 to clear spawn tile ($0F=open ground) and from $F25B during level load
- [x] Identify GameState $60 value $30 — **stage start screen**: set by PreLoop ($CFE2) and StageStartDraw ($D087) while "STAGE XX" banner is displayed; cleared to $00 once banner finishes; $60 values: $00=gameplay, $30=stage-start banner, $6E=attract/title
- [x] Identify $4C purpose — **GameSessionActive**: set to 1 by LevelStart ($C35D) when a level is initialized; cleared to 0 by NewGameInit ($C272 via $C25A); CoinScreen ($C840) dispatches via PLA×2+JMP to OnePlayerStart/TwoPlayerStart; both call NewGameInit (clearing $4C) then JMP $C0C1; checked at $C0E8 in post-attract sequence
- [x] Extract all 13 level tile maps — level data at $F27D (35 stages × 91 bytes, nibble-packed 13×13 metatile grids); loader $F239 reads nibbles via ($13),Y, calls DrawNametableTile ($D82B) per tile; complete decoder in `extract_level_maps.py` (all 35 ASCII maps + JS constants)
- [x] Map APU usage — APU init at $EBF6: STA $4015=$0F (enable sq1/sq2/tri/noise), STA $4017=$C0 (5-step frame, IRQ inhibit); per-frame engine $EC23: 28 sound slots in $031C–$03F3; APU write: `STA $4000,X` (X=0/4/8/12 per channel) at $EC80; channel silence at $ECAC (bit-4 XOR); sound seq ptr table at $EEA3 (14 pointer pairs); SoundOff at $90CA: STA $4015=0
- [x] Disassemble title screen / attract mode — $C65C: AttractWait loop 240 frames (INC $4F, call $C69A), exits on credits ($4B≠0); $C69A: BlinkTitleSprite, checks $0B&$20 (frame bit 5) → alternates sprite ptr $D1A7/$D1BA → DrawSprites(X=7,Y=$12); $CFAA: PreGameDraw — draw nametable blocks, set $60=$30 (stage banner), draw "STAGE XX" sprite at col$02/row$03, draw stage number, check P2, clear $60=$00
- [x] Disassemble stage-clear score tally screen — **StageClearTallyScreen ($CAF1)**; called from $C1F5 after all enemies cleared; TallyScreenInit ($CD04) sets up nametable $24, draws P1/P2 headers + 4 tank-type icon rows (sprites); sums kills $73-$76→$7D (P1 total) $77-$7A→$7E (P2 total); per-type loop ($5A=0-3): load KillScoreTable score ($10/$20/$30/$40 = 100/200/300/400 pts), drain tally one-at-a-time (DEC $73,X INC $5D + ScoreAdd $DA31 + LivesGrantCheck), draw count via BCD_Div+DrawNametableWithOffset; DelayXFrames ($D137) paces animation; after 4 types draw totals; 2P: award bonus score to higher-kill player; wait 100 frames; return
- [x] Disassemble game-over sequence fully — StageEndHandler ($C1A0): 4-phase flow (clear+respawn → eagle-explosion loop → palette-flash loop → tally+decision); CheckGameOver ($C62F) exits loop when A=1 (eagle gone or no lives); DrawGameOverScreen ($C53E) draws "GAME"($D214)+"OVER"($D219) tile strings via $D8F7, waits on anim timers $0318-$031A; CompareAndUpdateHiScore ($D9F0) compares 7-byte BCD $15/$1D vs $3D, updates hi-score buffer $3D-$43, returns Y=0/1/$FF; NewHiScoreDisplay ($C4E9) draws $D16B label + $D9C4 value with random palette flash; GameOverScoreScreen ($CF96) is attract-loop nametable reset (not a score screen); return path → JMP $C0A6 → PreLoop → attract loop
- [x] Disassemble controller read fully — ControllerDoubleRead ($99D2): NES $4016/$4017 latch+read loop, callers $85D4 (title) and $8670 (gameplay NMI body); Path A (NMI_Sub2 $D68A): double-read with edge-detect → $06/$07 (raw buttons per slot), $08/$09 (just-pressed edges); Path B (ControllerDoubleRead $99D2 → StrobeControllers $9A23 → ReadControllerBits $9A3F): double-read with retry until stable → $14/$15 P1|P2 OR'd raw/filtered, $16/$17 P2 raw/filtered; DecodeDirection ($E50E) called from $DC4D (EnemyAI) to convert raw byte to 0–3 dir value
- [x] Decode PaletteColorTable ($D475) — 256-byte table ($D475–$D574); 4 variants × 64 NES colour entries; indexed as `base_color | $4E` where $4E = $4017 & $C0 ∈ {$00,$40,$80,$C0}; PaletteApplyDIP ($D46A): saves Y, ORA $4E, TAY, LDA $D475,Y, restores Y, RTS; InitPalette ($D41E): WaitVBlank ($D575) → PPU addr $3F00 → 32-entry DIP-remapped write loop; PaletteData ($D44A): 32 base colours (8 sub-palettes × 4)
- [x] Disassemble DrawVictoryScreen ($C44D) — full sequence confirmed; called from $C210 when $15|$1D ≠ 0 (enemies still on field at game over); clear nametables $1C+$24; draw "PEACE BE WITH YOU" (DrawSprites from $D291, col7 row10) + 9 deco tiles $60-$68 (DrawSprites from $D145, col12 row14); draw "NOW LONG WAR"/$D2A4, "COMES TO"/$D2B1, "AN END"/$D2BA via DrawRowTiles ($D91B); then 240-frame ScrollX slide (INC $4F until $F0); ScrollX=0 ScrollY=2; hide sprites; RTS
- [x] Decode text strings at $D291 and $D145 — encoding is ASCII with $FF terminator; $D291 data: $D291="PEACE BE WITH YOU"+$15+FF, $D2A4="NOW LONG WAR"+FF, $D2B1="COMES TO"+FF, $D2BA="AN END"+$69+FF; $D145 data: $D145=9 graphic tile indices $60-$68+FF, $D14F="BATTLE"+FF, $D156="CITY"+FF, $D16B="HISCORE"+FF (plus tile-pair entries for decoration)
- [x] Disassemble PlayerUpdateDispatch ($DC23, mislabeled EnemyAI) — per-frame player input dispatcher; relabeled PlayerInputUpdate; loops X=1→0 (P2/P1 slots); frame-throttled (odd frames OR frame%4==0); reads $06,X (P1/P2 buttons) → DecodeDirection($E50E) → 0=Up/1=Left/2=Down/3=Right/$FF=idle; no-input: SetStateLo($80)+OR $08 into $A0,X; on direction change: snap $90,X/$98,X to (+4)&$F8 grid boundary for clean turns; updates $A0,X=$A0|dir (bits7-5=101=running; bits1-0=direction); AI-mode: if $0103,X bit7+countdown=0 → reload $9C, set $0310=1; EntityDispatch($DCF1) further dispatches all 8 entities via MovementDispatch[$A0,X>>3&$FE] table; EnemyFireCheck($E216) loops X=7→2 (enemy slots only); NOTE: $E2AE is ClearTileFlags (clears bit7 of nametable tile ptr for each active entity)
- [x] Decode score-weight table at $D2C2 — **KillScoreTable**: 4 nibble-BCD bytes $10/$20/$30/$40 → 100/200/300/400 pts per tank type (basic/fast/power/armor); used by SetScoreWeight ($DA62) which stores hi-nibble→$3A lo-nibble→$3B; ScoreAdd ($DA31) does 7-digit BCD add into $15,X..$1A,X (X=2 for P1, X=3 for P2)

- [x] Disassemble bank 0 level init routines ($8A6E, $896A, $91E8, $8B48 etc.) — understand how tile map is populated at level start ($874D partially decoded: has multi-phase sub-stage controller; continues in $B1E4, $8ADD)
- [x] Decode inner formation data tables at $8034+ (per-stage enemy sprite/position blocks)
- [x] Decode $8B–$8E SpeedParams meaning: confirm byte semantics (spawn delay, move rate, fire rate, etc.) from callsites in MoveGridSnap / SpeedCtrlMove
- [x] Disassemble $8B9F+ / $8C00+ (entity slot fill secondary routines; read $82FA/$8300/$8306 tables)
- [x] Decode tables at $82F4, $82FA, $8300, $8306, $8348 (formation data arrays in bank 0)
- [x] Disassemble $B1E4 and $8ADD (level init continuation / game-over from bank 0)
- [x] Validate tile map at game start — trace what values level loaders write to $0400–$07FF
- [x] Identify and label CHR tiles by visual inspection — mapped tile numbers from code analysis
- [x] Disassemble $E3BA dispatch full: eagle animation handlers $E3C6/$E3CB/$E3D0/$E3E2/$E3EA — decoded; $68 initialization traced ($C356 sets $80, $E855 sets $27)
- [x] Decode power-up type 2 (Shovel $EBA0) fully — understand how $C9BB triggers fortify base and what $68 timing does
- [x] Disassemble $CF44 (called in PowerUpCollision/$EB60) — decoded as LivesGrantCheck (extra life on score threshold)
- [x] Disassemble $C33D (STA $0100 in bank 1) — decoded as LevelStart; sets EnemyFreezeTimer + $68=$80
- [x] Confirm EntityType tier semantics: what does $0101,X high-nibble $A0/$A0+$20/etc map to in tile graphics

- [x] Map all 13 entries in `LevelCodePtrs` ($8000) and `LevelFormationPtrs` ($801A)
- [x] Identify bitmask meanings for `StageFlagsTable` ($80B6)
- [x] Disassemble `StageLoader` helpers at $98E0, $98BE, and $97B1 (Bank 0)
- [x] Investigate ZP variables $D0–$D4 in `Level0Init` ($874D) and their roles
- [ ] Trace usage of $0301–$0305 initialized in bank 0 (likely initialization queue)
- [ ] Research what else is missing from ROM research and update next tasks; ensure enough info for a pixel-perfect web port (e.g., precise timing, sound sequences, hidden variables)

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
