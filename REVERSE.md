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
| 0x08010 | 0x09010 | 4 KB   | CHR bank 0 | PPU $1000–$1FFF (BG pattern table / PT1) — chr_pt0.png tiles 0–255 |
| 0x09010 | 0x0A010 | 4 KB   | CHR bank 1 | PPU $0000–$0FFF (sprite pattern table / PT0) — chr_pt0.png tiles 256–511 |
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
| $0300–$031B   | Sound slot priority array: 28 bytes; $0300,X (X=0–27) is the active-priority counter for sound slot X; 0=inactive, >0=active; zeroed by SoundResetInit ($EBF6); **slot 0** ($0300)=CoinEventFlag; **slots 1–3** ($0301–$0303)=main game music channels (all set to $01 simultaneously at GameLoopTop $C18A to trigger sq1/sq2/triangle music; during gameplay Level0Init also continuously writes $D4/$D3/$60 to these); **slots 4–5** ($0304–$0305)=life-gained jingle (set to $01 at $EBE7/$EBEA for P1 and $CF8F/$CF92 for P2); $0310=enemy fire slot 16; $0313–$0314=kill event slots 19–20; **dual-use during level init as PPU tile write queue**: $0300 = queue head index (set to $12 by PPUQueueHeadInit $974A), $0301+$12=$0313 onward = queue entries (format: PPU_hi, PPU_lo, count, N×tile_bytes, $00-terminator); queue built by BuildPPUWriteQueue ($992E, capacity $3E entries); head reset and $0313 cleared at LevelScreenInit ($9764) via PPUQueueHeadInit; **triple-use during bank 0 entity/wave init**: EntitySlotFill4 ($8C00) writes 6-byte entity slot template to $0304–$0309 and WaveCtrlInit table ($8312: $09,$23,$54,$06) to $0300–$0303 before JMP $8B98 (these are temporary staging writes; per-frame music engine overwrites $0301–$0303 afterward) |
| $031C–$03F3   | Sound slot data structures: 28×8 bytes; slot N at $031C+(N×8); each entry: [channel_select, 4×APU_regs, duration, ...]; channel_select 1–4=write ch 0–3, 5–8=silence ch 0–3; zeroed by SoundResetInit; slot 0 channel_select at $031C set to 1 (sq1) from $CC93/$CCEA (kill-event sound trigger paired with $031B priority=1) |
| $03F4–$03FF   | Possibly slot 27 data area (slot 27 = $031C+27×8=$03F4); set to 1 at $CC90/$CCE7 via priority-counter $031B=1 |
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

### PPU Write Queue / Nametable Tile Draw Subsystem

All background nametable tile updates go through a deferred write queue at $0180 (index maintained in $0C). During NMI, `FlushPPUQueue` ($D96D) drains the queue to PPU $2006/$2007.

#### PPU queue packet format (written by PPUQueueTiles $D6D3 and others)

```
[ppu_addr_hi] [ppu_addr_lo] [tile_byte_0] [tile_byte_1] … [$FF]
```

- `ppu_addr_hi`: high byte of nametable address = ($D5FC_A + $05); for $05=$1C: rows 0–7→$20, 8–15→$21, 16–23→$22, 24–29→$23
- `ppu_addr_lo`: low byte = col | ((row & 7) << 5); for row=3,col=29: $7D → addr $207D
- Tile bytes are CHR tile indices for a **horizontal run** (PPU auto-increment=1)
- Terminated by $FF

#### FlushPPUQueue ($D96D) packet processing

```
X = 0
while X ≠ $0C (end):
  STA $2006 ← ppu_addr_hi
  STA $2006 ← ppu_addr_lo
  loop: STA $2007 ← tile byte until FF (single $FF = end of this packet)
  next packet starts at X
$0C reset to 0 after flush
```

#### CalcPPUAddr ($D5FC) — tile coords → PPU address

```
Input:  X = tile column (0–31), Y = tile row (0–29)
Output: A = (row >> 3) | $04   [+ $05=$1C to get actual PPU addr high byte]
        Y = col | ((row & 7) << 5)  [PPU addr low byte]
```

#### PPUQueueTiles ($D6D3) calling convention

```
X = tile column (0–31)
Y = tile row (0–29)
$11/$12 = pointer to tile byte array (CHR tile indices), terminated by $FF
Side effect: same tile bytes written to RAM shadow at ($0400 + ppu_lo) via ($13/$14)
```

#### Data string examples

| Addr | Content | Drawn by |
|------|---------|---------|
| $D1A7 | "PLEASE INSERT COIN" (18 bytes) + $FF | BlinkTitleSprite (on half-cycle) |
| $D1BA | blank spaces + $FF | BlinkTitleSprite (off half-cycle) |
| $D212 | $14, $FF | StartGame nametable update |
| $D222 | $6A, $6A, $FF | DrawHUDKillIconA (2 tiles, row 3–12 col 29) |
| $D22B | $11, $FF | DrawHUDKillIconB (1 tile) |

#### PPUQueueTilesB ($D6FD) variant

Same as PPUQueueTiles but adds $60 to any tile index < $80 before writing. Used for player-2 or alternate CHR bank graphics.

#### PPUAddrFromXY ($D726) + PixelToTile ($D733)

Use when source coordinates are **pixel-based**: $D733 converts pixel→tile (>>3 each), then $D5FC computes PPU address stored into $11/$12. A subsequent PPUQueueTiles call uses the preset $11/$12.

#### RAM nametable shadow ($0400–$07FF)

Every PPUQueueTiles call also mirrors tile bytes to `RAM[$0400 + ppu_lo]` via `STA ($13),Y`. The mapping is: PPU $2000 → RAM $0400, PPU $2100 → RAM $0500, PPU $2200 → RAM $0600, PPU $2300 → RAM $0700. This area is zeroed by `ClearSpriteBuf` ($D3AC) each frame and rebuilt by all tile-draw calls.

---

### NMI Handler ($D300) — Full Frame Timing

#### Complete call sequence (every frame, ~60Hz)

```
$D300  PHA / TXA,PHA / TYA,PHA / PHP   ; save A, X, Y, P on stack

$D306  STA $2001 = $06                  ; disable rendering (bits 1+2 only = left-8px enables,
                                        ;   bits 3+4 clear → bg+sprites off) prevents PPU glitch

$D30B  JSR NMI_Sub ($D352)             ; VS System coin/service input handler (always runs)

; ── OAM DMA guard ($4D = NMISyncFlag) ──
$D30E  LDA $4D; BNE $D338              ; if $4D≠0 skip OAM+PPU section (use during load screens)

; ── PPU / OAM block (only when $4D=0) ──
$D312  STA $2001 = $1E                  ; enable full rendering (bits 1+2+3+4 = bg+sprites+left-8px)
$D317  STA $2003 = $00                  ; OAM write address = 0
$D31C  STA $4014 = $02                  ; OAM DMA: transfer $0200–$02FF → PPU OAM (513 cycles)
$D321  LDA $2002                        ; clear VBlank flag + reset PPU address latch
$D324  JSR FlushPPUQueue ($D96D)       ; drain $0180 nametable tile queue → $2006/$2007

; ── Scroll / PPU ctrl ──
$D32B  LDA $50; ORA #$B0; STA $2000   ; PPU ctrl: NMI=on(b7), 8×16 sprites(b5), bg@$1000(b4),
                                        ;   nametable from $50 bits 1:0
$D330  STA $2005 = $00                  ; horizontal scroll = 0
$D335  LDA $4F; STA $2005              ; vertical scroll from ZP $4F (ScrollX)

; ── Always-run section ──
$D338  JSR NMI_Sub2 ($D68A)           ; controller read + edge detection (both players)
$D33B  JSR SoundEngine ($EC22)         ; sound engine tick (1 slot per frame)
$D33E  JSR NMI_Sub4 ($DB22)           ; OAM sprite hider (walks OAM writing Y=$F0 off-screen)

; ── Frame counter ──
$D341  INC $0B                          ; increment FrameLo
$D345  AND #$3F; BNE skip; INC $0A    ; every 64 frames, increment FrameHi

$D34B  PLP / PLA,TAY / PLA,TAX / PLA  ; restore P, Y, X, A
$D351  RTI
```

#### NMI_Sub ($D352) — VS System coin/service handler

Called unconditionally at NMI start; reads $4016 twice (AND for noise rejection):
1. **Route protection bit to $4020**: shift result right 4 times, AND #$01, STA $4020 (VS hardware unlock)
2. **Detect coin/service press**: AND #$24 (bit 2=coin, bit 5=service button)
   - If pressed: INC $4A (CoinHeldCounter)
   - If released (was non-zero): INC $4B (CoinCredits) + STA $0300=#$01 (CoinEventFlag) + clear $4A

#### FlushPPUQueue ($D96D) — nametable tile queue drain

Called `NMI_Scroll` in labels (misleadingly named; handles both tiles and scroll setup):
```
Terminate queue: STA $0180+$0C = $00
X = 0
while X ≠ $0C:
  hi  = $0180,X++  → STA $2006
  lo  = $0180,X++  → STA $2006
  loop: byte = $0180,X++
        if byte ≠ $FF: STA $2007; continue
        if next_byte ≠ $FF: start next packet (back to outer while)
        else: (double-$FF = alternate end path)
After flush: $0C = 0; JSR $D439 (reset PPU addr to $3F00 palette area)
```
- Single `$FF` = end of one packet's tile stream → start next packet
- Outer `X == $0C` check is the primary queue terminator
- `$D439` writes `$3F,$00,$00,$00` to $2006 (leaves PPU addr pointing at palette) to prevent stray writes

#### NMI_Sub4 ($DB22) — OAM sprite hider

Hides OAM sprites by setting Y coordinate to $F0 (240, below screen):
```
step  = -$0E (two's-complement negate of $0E each call, toggles direction)
X     = $0D (OAMHideIdx, persisted between calls)
loop:
  X += step (wraps mod 256)
  $0200,X = $F0       ; hide sprite at OAM offset X
  if X == 4: exit
$0D = X               ; save position for next call
```
- Step negation (`EOR #$FF; ADC #$01`) causes the walk direction to reverse each NMI call
- Loop terminates when X reaches OAM slot 4 ($0200+4 = 2nd sprite); after a full circuit this hides all 64 OAM sprite Y positions except slot 0 ($0200)
- Also called from `WaitNMI ($D3A1)` and `WaitFrame ($D394)` during load screens (with $4D=1 to block OAM DMA in NMI)

#### $2000 (PPU Control) value written each frame

```
$50 (ScrollY high bits / nametable select) | $B0
$B0 = %10110000:
  bit 7 = 1  : NMI enabled
  bit 5 = 1  : Sprite size 8×16
  bit 4 = 1  : Background CHR from $1000
  bits 1:0   : Base nametable select (from $50 & $03)
```

#### WaitVBlank ($D95F)

Spin-waits for frame counter $0B to increment (i.e., for NMI to fire):
```
LDA $0B; CMP $0B; BEQ loop  ; spin until $0B changes
```
`WaitVBlankX ($D966)` calls WaitVBlank X times (loop with DEX).

---

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
| $C69A | BlinkTitleSprite | Wait VBlank; test $0B&$20 (frame bit 5, ~1 Hz); if set ptr=$D1A7 ("PLEASE INSERT COIN" text, 18 bytes) else $D1BA (blank spaces); PPUQueueTiles(X=7,Y=$12) — blinking achieved by toggling background tile text each ~1 Hz |
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
| $D5FC | CalcPPUAddr | Convert (X=tile_col, Y=tile_row) → A=(row>>3)\|$04 (PPU addr hi base), Y=(col\|(row&7)<<5) (PPU addr lo); combined with $05 base offset gives full nametable address |
| $D6D3 | PPUQueueTiles | Queue horizontal tile run to nametable: X=tile_col, Y=tile_row, ($11/$12)=tile bytes terminated by $FF; writes packet [ppu_hi, ppu_lo, tile0…tileN, $FF] to $0180 queue at $0C index; also mirrors tile bytes to RAM shadow at ($13/$14) = ($0400+ppu_lo, ppu_hi_base); 66 callers |
| $D6FD | PPUQueueTilesB | Same as $D6D3 but adds $60 to tile indices < $80 (selects CHR bank 1 tile set for player-2 or alternate graphics) |
| $D726 | PPUAddrFromXY | Init $11/$12 from pixel coords: calls $D733 (pixel→tile: >>3), then $D5FC (tile→PPU addr) → stores result to $12/$11, Y=0; used before PPUQueueTiles when starting from pixel position |
| $D733 | PixelToTile | Divide Y and X each by 8: TAY/TAX after 3 LSRs each; converts pixel coordinates to tile coordinates |
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
| $E7A9 | BulletMoveCollision | 10-slot loop; for each active bullet ($CC,X&$F0==$40): compute |delta| and |delta|*4 for the direction; probe1 = BulletTileCollision at current (BX,BY); if hit → also probe $E83F at (BX+4*|dy|, BY+4*|dx|); probe2 = BulletTileCollision at (BX−|dx|, BY−|dy|) (1px behind); if hit → also probe (BX−4*|dx|−|dx|, BY−4*|dy|−|dy|); alternating-frame skip for non-double-shot bullets via (X XOR $0B) & $01 |
| $E838 | BulletTileCollision | (X=px, Y=py) → TilePosLookup → SubTileBitmask → TileCollidableCheck; flow: (1) eagle tile ($C8) AND $68≠0: set $68=$27, $030B=$0307=1, $CA25, $CC,X=$33, RTS A=0; (2) tile≥$12: no collision, RTS A=0; (3) bullet state→$33 (explode); (4) tile=$11 (water): player bullet → STA $030D=1, RTS A=0; (5) armor-piercing bit ($D6,X&$02): erase tile ($D7A4), $030C=1, RTS A=0; (6) tile=$10 (steel): player bullet → STA $030D=1, RTS A=0; (7) normal brick: $030C=1 if player bullet, JSR TileDestroyBrick ($D763), RTS A=1 |
| $E8B1 | EnemyBulletPlayerHit | **Dual loop; falls through to PlayerBulletEnemyHit at $E923** — Loop 1 (players $5A=1→0): if entity active AND state<$E0; inner loop (enemy bullets $5B=7→1): if active ($CC&$F0=$40) and within 10×10px → $CC,Y=$33; if ShieldTimer($89,X)>0 → deflect; else → $A0,X=$73, $0307=1, clear $0101/$A8. Falls through to PlayerBulletEnemyHit ($E923): outer $5A=7→2 (enemy entities), inner $5B=9→0 (player bullets Y&$06==0): proximity check; if armor (EntityType bit2): JSR PowerUpSpawnPickPos ($EA63) if type==$E4 then DEC; check EntityType&$03: if 0 → $A0,X=$73 death, $030A=1, kill tally/score; else DEC EntityType, $030E=1 (armor survives). RTS at $EA5E. |
| $E923 | PlayerBulletEnemyHit | (fall-through from $E8B1) Outer loop enemies $5A=7→2, inner loop player bullets $5B=9→0 (slots with Y&$06==0 = slots 0,1,8,9); 10×10px proximity; armor-hit→$030E; kill→$030A |
| $EA63 | PowerUpSpawnPickPos | Called when power-up tank first hit: STA $0309=1 (power-up appear sound); RNG loop picks random coord via RNGToCoord ($EAA7) for $86/$87 until PowerUpCollision finds empty spot; STA $88=$FF (flag); continues to complete power-up placement |
| $EAA7 | RNGToCoord | Maps 2-bit RNG value (0–3) to power-up pixel coordinate: `coord = ((A+1)×6)<<3 = (A+1)×48`; outputs {48, 96, 144, 192} px |
| $EAB5 | BulletVsBulletCancel | Loop $5A=9→0; only process if $5A&$06==0 (player bullet slots 0,1,8,9); check state $40–$4F; inner loop $5B=9→0 all slots; skip if $5A&$07==$5B&$07 (same entity); if both active and |BX−BX|<6 AND |BY−BY|<6 → both cleared ($CC=0) |
| $EB17 | PowerUpCollision | Effect-position ($86/$87) vs player proximity check (12px); if EffectTimer ($62)=0: loop players X=1→0; if active and state<$E0 and |EntityX−$86|<12 AND |EntityY−$87|<12: set EffectTimer=50, dispatch via $EB87 power-up table |
| $EBF6 | SoundResetInit | APU + sound-RAM reset: STA $4015=$0F (enable sq1/sq2/tri/noise), STA $4017=$C0 (5-step frame counter, IRQ inhibit); zero 28 sound slots in $031C–$03F3 (stride 8 via $F0/$F1 ptr) and clear $0300–$031B |
| $EC23 | SoundEngine | Per-frame sound engine: iterates 28 channel slots ($031C–$03F3, 8 bytes each) pointed by $F0/$F1; reads $0300,X active flag; if slot active loads sequence data and writes 4 regs via STA $4000,X (X=0/4/8/12); channel silence via bit-4 XOR at $ECAC; ZP $F4=slot idx, $F5=limit, $F9–$FC=active flags |
| $EC80 | SoundAPUWrite | `STA $4000,X` — core APU register write; X=channel_base (0=sq1,4=sq2,8=tri,12=noise); writes 4 consecutive regs from sequence data at ($F0),Y |
| $EE54 | SoundSeqPtrLoad | Load sound sequence pointer for channel $F4 from table $EEA3 → ZP $F2/$F3 |
| $EE63 | SoundSeqReadByte | Read one byte from sound sequence at ($F2),Y; advance sequence offset in ($F0)+5 |
| $EEA3 | SoundSeqPtrTable | 28 × 2-byte little-endian pointers to sound sequence data (one per slot 0–27); slot 0→$EFD1 (coin), slot 1→$EEDB (music sq1), slot 2→$EF02 (music sq2), slot 3→$EF2D (music tri), slot 4→$F044 (life-jingle A), slot 5→$F053 (life-jingle B) |
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
| $D8F7 | DrawSpriteString | Draw large-font letter string from ($13/$14) ptr at pixel pos ($56/$57); per non-$FF byte: adds $60 tile-offset, calls DrawBigSpriteTile($D87E) with A=tile_idx, X=$56, Y=$57; advances $56 by $20 (32 px per char); terminates at $FF; used for GAME/OVER/HiScore/PTS strings |
| $D87E | DrawBigSpriteTile | Magnified CHR tile renderer: A=tile_idx, X=pixelX, Y=pixelY; computes CHR addr $1000+(tile_idx×$10) via $D7CA loop into $11/$12; reads 8 bytes (plane 0) from PPU $2007; for each of 8 rows × 8 pixel bits: calls $D73E/$D784/$D76D to write 4×4 OAM sprite block; result is one 8×8 CHR tile magnified to 32×32 pixels as sprite grid; CHR tile indices are ASCII-ordered (tile $47='G', $41='A', etc.) |
| $D9A7 | SkipLeadingZeros | Leading-zero suppressor for score/stage-number display; scans $0000+Y for first non-zero byte (skipping leading BCD zeros); increments both X (column) and Y (offset); on $FF end-marker: backs up 1 or 2 positions depending on $6B (GameActive); sets $11=Y (ptr lo), $12=$00; 26 call sites: score HUD, stage-number, tally screen digits |
| $D9C4 | DrawHiScoreSprite | Draw hi-score value as large sprites: sets DrawX=$30 (px 48), DrawY=$64 (px 100), tile-offset $60=$30; scans ZP $3E onward for first non-zero hi-score digit (skipping leading zeros, advancing DrawX by $20 per skipped digit); sets ($13)=Y ptr; calls DrawSpriteString ($D8F7) to render remaining digits; used on new-hi-score screen ($C50C) |
| $D214 | StrGAME | Tile index string for large "GAME": $47,$41,$4D,$45,$FF (ASCII 'G','A','M','E'+term); used by DrawGameOverScreen ($C53E) at pixel (60,70) |
| $D219 | StrOVER | Tile index string for large "OVER": $4F,$56,$45,$52,$FF (ASCII 'O','V','E','R'+term); used by DrawGameOverScreen at pixel (60,120) |
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
| $8010–$8FFF | $1000–$1FFF | 0–255  | BG pattern table (PT1) — chr_pt0.png tiles 0–255 |
| $9010–$9FFF | $0000–$0FFF | 256–511| Sprite pattern table (PT0) — chr_pt0.png tiles 256–511 |
| $A010–$AFFF | (bank 1) | 512–767 | BG tiles, bank 1  |
| $B010–$BFFF | (bank 1) | 768–1023| Sprite tiles, bank 1      |

**Bank mapping note**: PPUCTRL $B0 (bit4=1 → BG at $1000, bit5=1 → 8×16 sprites).
In 8×16 mode, even OAM tile byte T → PT0 ($0000 = file $9010) → PNG index 256+T;
odd OAM tile byte T → PT1 ($1000 = file $8010) → PNG index T&$FE.
This is consistent with data-range map (lines 33–34) and game.js `drawCHRTile(256+T)` for sprite bank.
**Previous version of this section had $0000/$1000 swapped — now corrected.**

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

**Eagle draw** (`$E3F2`): draws **8 OAM entries in a 4×2 grid** (32×32px) at fixed screen positions using `$DB0A` (each call draws 2 side-by-side 8×16 entries):
- 4 calls × 2 OAM entries each = 8 entries: X=104/112/120/128 px, Y=200/216 (OAM Y= Y−8)
- OAM tile bytes (all ODD → PT1 / BG bank): intact=$D1,$D3,$D5,$D7,$D9,$DB,$DD,$DF; damaged=$E1,$E3,$E5,$E7,$E9,$EB,$ED,$EF
- PT1 tiles used: intact=$D0–$DF (PNG BG-bank indices 208–223); damaged=$E0–$EF (224–239)
- `$69=0` (intact) or `$69=$10` (damaged): added to base tile byte $D1 before draw.

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

#### 8×16 OAM mode tile byte → CHR index rule (`$2000=$B0` → bit5=1)

For every OAM sprite, the tile byte selects which 4KB pattern table and which tile pair:
- **Even tile byte T** (bit0=0) → **PT0** (CHR $0000, sprite bank):  top=PT0[T], bottom=PT0[T+1] → PNG indices 256+T, 256+T+1
- **Odd tile byte T** (bit0=1) → **PT1** (CHR $1000, BG bank):  top=PT1[T&$FE], bottom=PT1[(T&$FE)+1] → PNG indices T&$FE, (T&$FE)+1

All numbers below are **OAM sprite tile bytes** (not raw PT0/PT1 indices):

#### Tank sprites — all EVEN tile bytes → PT0 (sprite bank, PNG 256+T)

Formula (`$E06A` MoveTank): tile = (`$A8,X` & $F0) + dir×8; two OAM entries: T (left) and T+2 (right).

| `$A8,X` | Type | Up | Left | Down | Right | PT0 tile range |
|---------|------|-----|------|------|-------|----------------|
| $00 | Player star-0 | $00 | $08 | $10 | $18 | $00–$1F |
| $20 | Player star-1 | $20 | $28 | $30 | $38 | $20–$3F |
| $40 | Player star-2 | $40 | $48 | $50 | $58 | $40–$5F |
| $60 | Player star-3 | $60 | $68 | $70 | $78 | $60–$7F |
| $80 | Enemy tier-0 (basic) | $80 | $88 | $90 | $98 | $80–$9F |
| $A0 | Enemy tier-1 (fast) | $A0 | $A8 | $B0 | $B8 | $A0–$BF |
| $C0 | Enemy tier-2 (power) | $C0 | $C8 | $D0 | $D8 | $C0–$DF |
| $E0/$E3 | Enemy tier-3 (armor) | $E0 | $E8 | $F0 | $F8 | $E0–$FF |

Each direction: 2 side-by-side 8×16 OAM entries using tile bytes T and T+2 (drawing 4 PT0 CHR tiles: T, T+1, T+2, T+3 = 16×16px).  Animation: attribute-only cycle via `$E0B7[Y]` table (palette index 0/1/2), no tile change.

`$A8,X` set by: `$E4B7` ORA for enemy type; `$E419` init=0; `$EBBA` star power-up (+$20 each).  `$B0,X` always=0 (`$E4C3`).

#### Other sprites — ODD tile bytes → PT1 (BG bank, PNG index T&$FE)

| OAM tile byte(s) | Game object | PT1 tiles | PNG BG-bank |
|-----------------|-------------|-----------|-------------|
| $79, $7B | HUD P1 tank icon left half | $78–$7B | 120–123 |
| $7D, $7F | HUD P2 tank icon right half (+$10 from left) | $7C–$7F | 124–127 |
| $B1+dir×2 ($B1/$B3/$B5/$B7) | Bullet explosion up/left/down/right | $B0–$B7 | 176–183 |
| $A1,$A3,$A5,$A7,$A9,$AB,$AD,$AF | Spawn animation (triangle-wave, 8 frames: N=7→0→7) | $A0–$AF | 160–175 |
| $D1,$D3,$D5,$D7,$D9,$DB,$DD,$DF | Eagle intact (8 OAM entries, 4×2 grid, 32×32px) | $D0–$DF | 208–223 |
| $E1,$E3,$E5,$E7,$E9,$EB,$ED,$EF | Eagle damaged (+$10 from intact) | $E0–$EF | 224–239 |
| $F1 | Eagle explosion frame 1 (center, single 8×16 OAM) | $F0–$F1 | 240–241 |
| $F5 | Eagle explosion frame 2 | $F4–$F5 | 244–245 |
| $F9 | Eagle explosion frame 3 | $F8–$F9 | 248–249 |

**Spawn animation** (`$E0BF`): called for entity states $F0–$FE; tile = `(|lower_nibble − 7| × 2) + $A1` → triangle wave from $AF (state $F0) → $A1 (state $F7) → $AF (state $FE).  **Previous docs claimed $C3–$CF → INCORRECT.**

**Eagle** (`$E3F2`/$DABA): 4 calls to draw 2 OAM entries each = 8 entries, 4 wide × 2 tall. Covers 32×32px (NOT 2×2=16×16px as previously stated).

**HUD tank** (`$C7CD`): $53=$79 → $DB0A → entry1=$79, entry2=$7B; then $53=$7D → entry3=$7D, entry4=$7F. Two separate 16×16px icons at X=$0105 and X=$0105+$10.

### HUD Pixel Layout (for web port)

The HUD occupies the **right sidebar** (nametable cols 27–31, pixel X 216–255) and the **top/bottom border rows** (rows 0–2, 28–29).

#### Enemy Kill-Counter Icons (nametable background, right sidebar)

| Nametable Col | Nametable Rows | Tiles | Notes |
|---------------|---------------|-------|-------|
| 29–30 | 3–12 (10 rows) | $6A,$6A (2 tiles/row) | One enemy icon pair per row |

- **DrawAllHUDKillIcons ($C7BD)**: loop A=18,16,...,0 (10 even values); for each: col=29, row=A/2+3 → draws `[$6A,$6A]` (2 tiles) across cols 29–30.
- **DrawHUDKillIconB ($C7AE)**: called at enemy spawn with A=$7F (new EnemiesRemaining); draws `[$11]` (blank, steel tile) at col=29+(A&1), row=A/2+3 — erases one icon (bottom-right to top-left order).
- Pattern: enemies initially fill all 20 slots ($7F=20); as each enemy spawns (DEC $7F), its icon at the corresponding position is blanked.
- CHR tile $6A = small enemy tank icon; tile $11 = blank/steel square (erased slot).

#### Player Lives Display (nametable, right sidebar)

| Row | Col 29 | Cols 29–30 | Notes |
|-----|--------|------------|-------|
| 18 | Tile $14 (P1 icon) | 1–2 digit lives count | P1 lives (via StartGame $C6C5) |
| 21 | Tile $14 (P2 icon) | 1–2 digit lives count | P2 only if $46=2 or $83≠0 |

- **StartGame ($C6C5)**: runs every frame from GameUpdate2; draws player icon tile $14 at col 29 then lives−1 as BCD digits starting at col 25, advancing right per leading zero skipped. Result columns: 1-digit lives → col 30, row 18/21; 2-digit lives → col 29–30.
- Digits are CHR tile indices: `digit + $60` (= 0+$60=$60, 1+$60=$61, …, 9+$60=$69) — BCD digit offset by $60 for alternate CHR bank page.

#### Stage Icons (nametable, right sidebar)

| Row | Tiles at cols 29–30 | Data |
|-----|---------------------|------|
| 23 | $6C, $FC | SrcPtr=$D225; top half of flag icon |
| 24 | $6D, $FD | SrcPtr=$D228; bottom half of flag icon |
| 25 | 1–2 BCD digits | Stage number ($85), starting at col 29–30 |

#### Score Header Row (nametable row 3, stage-start screen nametable $24)

Drawn during PreLoop ($CFAA) and StageStartDraw ($D071) on nametable $24:

| Col range | Content | Data source |
|-----------|---------|-------------|
| 2–3 | P1 player icon: tiles $5E,$6B | $D15B |
| ~4–9 | P1 score digits (BCD, SkipLeadingZeros Y=$16 X=4) | ZP $16...$1B |
| 11–13 | "HI" label + tile $6B: tiles $48,$49,$6B | $D167 |
| ~14–19 | Hi-score digits (SkipLeadingZeros Y=$3E X=$0E) | ZP $3E...$43 |
| 21–22 | P2 player icon: tiles $5F,$6B | $D15E (2P only) |
| ~23–28 | P2 score digits (SkipLeadingZeros Y=$1E X=$17) | ZP $1E...$23 (2P only) |

#### HUD Bouncing Enemy Tank (OAM sprites)

**DrawHUDTanks ($C7CD)** draws 2 OAM sprites from RAM $0105/$0106:

| Sprite | OAM offset | CHR tile | Attr (palette) | X position | Y position |
|--------|------------|----------|----------------|------------|------------|
| Left half | $0200+$0D | $79 | 3 | $0105−8 | $0106−8 |
| Right half | $0200+$0D+4 | $7D | 3 | $0105 | $0106−8 |

- **Normal visible position**: $0105=$70=112, $0106=$70=112 → sprites at pixel (96, 104) and (112, 104).
- **Hidden (off-screen)**: $0106=$F0=240 → sprites at Y=232 (off bottom).
- **HUDTankAnimation ($C7F8)**: decrements $0108 (enemy count display) every 16 frames; when $0108≥$0A applies wiggle deltas (HUDTankWiggleX $D2C6, HUDTankWiggleY $D2CA); when $0108=0 → Y=$F0 to hide.
- **SetHUDSprites ($C43F)**: initialises $0105=$0106=$70, $0108=$70.
- **ClearAndRespawn ($C301)**: clears $0106=$F0, $0108=0.
- $0107 = wiggle animation index (cycles through 4-direction wiggle table).

#### Large-Sprite Score/Text Screens (OAM sprites, not gameplay HUD)

| Text | DrawX (pixel X) | DrawY (pixel Y) | Routine | Data |
|------|----------------|----------------|---------|------|
| "BATTLE" | 26 | 46 | DrawSpriteString | $D14F |
| "CITY" | 60 | 86 | DrawSpriteString | $D156 |
| "GAME" | 60 | 70 | DrawSpriteString | $D214 |
| "OVER" | 60 | 120 | DrawSpriteString | $D219 |
| "HISCORE" | 16 | 50 | DrawSpriteString | $D16B |
| Hi-score digits | 48 | 100 | DrawHiScoreSprite | ZP $3E–$43 |

Each character is rendered as a 32×32 magnified tile (4×4 OAM sprites per CHR pixel row). DrawSpriteString advances DrawX by $20=32px per character. Tile indices are ASCII-mapped.

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
- Sound sequences pointed by `$EEA3` table (28 × 2-byte LE pointers, one per slot); each sequence is a stream of header bytes + command/note bytes + loop bytes

### Sound Sequence Format (fully decoded — $EC23 engine)

#### Slot data structure ($031C + N×8, 8 bytes)

| Offset | Field | Description |
|--------|-------|-------------|
| +0 | `channel_select` | 0=inactive; 1=pulse1($4000); 2=pulse2($4004); 3=triangle($4008); 4=noise($400C); 5–8 = silence (same channels) |
| +1 | APU reg at base+0 | Duty/volume ($4000/$4004/$4008/$400C) — duty bits 7-6, halt bit 5, const-vol bit 4, vol bits 3-0 |
| +2 | APU reg at base+1 | Sweep ($4001/$4005) / linear counter ($4009) / unused ($400D) |
| +3 | APU reg at base+2 | **Timer low** ($4002/$4006/$400A/$400E) — updated each note by pitch decode |
| +4 | APU reg at base+3 | **Timer hi + length counter** ($4003/$4007/$400B/$400F) — bits 7-3 = length counter load index; bits 2-0 = timer hi (updated per note) |
| +5 | `seq_offset` | Current byte index into sequence stream (incremented as bytes consumed) |
| +6 | `dur_remaining` | Note duration countdown (frames); decremented each frame; on 0 → read next command |
| +7 | `dur_saved` | Total note duration (copied from +6 when note first played) |

#### Sequence stream layout

**Header** (read once when slot priority first set to 1, before command stream):
- byte 0: `channel_select` (1–4)
- byte 1: initial APU[+1] (duty/volume)
- byte 2: initial APU[+2] (sweep/linear)
- byte 3: initial APU[+4] template (length counter + timer hi bits)
- byte 4 *(noise/channel=4 only)*: initial APU[+3] ($400E noise period/mode)

**Command stream** (one or more bytes consumed per note event):
```
$00–$5F  NOTE: bits 7-3 = semitone index 0-11 (A=0 A#=1 B=2 C=3 C#=4 D=5 D#=6 E=7 F=8 F#=9 G=10 G#=11);
               bits 2-0 = octave shift 0-7 (right-shift pitch table value N times)
$60      HOLD: sustain current note; use stored duration (no new pitch written)
$61–$E7  DURATION: frames = byte − $60 (range 1–$87); stored at slot[+6]
$E8      STOP: deactivate slot ($0300,X ← 0; channel_select ← 0)
$E9      MODIFY VOL low-6: slot[+1] = (slot[+1] & $3F) | next_byte
$EA      MODIFY VOL high-2: slot[+1] = (slot[+1] & $C0) | next_byte
$EB      MODIFY VOL low-4: slot[+1] = (slot[+1] & $F0) | next_byte
$EC      SET SWEEP: slot[+2] = next_byte (replaces $4001 sweep register)
$ED      SET TIMER-HI: slot[+4] = next_byte (replaces $4003 entirely)
$EE      SET DUTY/VOL: slot[+1] = next_byte (replaces $4000 entirely)
$EF      LOOP-RESET: clears loop counters ZP $F6/$F7/$F8 to 0
$F0      INNER-LOOP (counter 0/$F6): next_byte=repeat_count; byte_after=restart_offset
$F1      MID-LOOP   (counter 1/$F7): next_byte=repeat_count; byte_after=restart_offset
$F2      OUTER-LOOP (counter 2/$F8): next_byte=repeat_count; byte_after=restart_offset
$F3–$F7  SKIP: advance seq_offset by 1 (skip one byte)
```
Loop commands: on each pass, increment counter; if counter == repeat_count → clear counter and skip (fall through); else → set `seq_offset` = restart_offset and re-execute from there.

#### Note pitch table ($EE8B, 12 × 2 bytes)

Indexed as `X = semitone_index * 2`. Each entry: FD = hi byte (bits[10:8] of period in bits[2:0]), FE = lo byte (bits[7:0]).
Effective 11-bit timer period = `((FD & 7) << 8) | FE`. After `octave` right-shifts: `period >>= octave`.

| Idx | Note | Raw FD/FE | Period (oct 0) | Base freq |
|-----|------|-----------|---------------|-----------|
| 0 | A  | $07/$F2 | 2034 | 55.0 Hz (A1) |
| 1 | A# | $07/$80 | 1920 | 58.3 Hz |
| 2 | B  | $07/$14 | 1812 | 61.7 Hz |
| 3 | C  | $06/$AE | 1710 | 65.3 Hz (C2) |
| 4 | C# | $06/$43 | 1603 | 69.6 Hz |
| 5 | D  | $05/$F4 | 1524 | 73.2 Hz |
| 6 | D# | $05/$9E | 1438 | 77.6 Hz |
| 7 | E  | $05/$4E | 1358 | 82.2 Hz |
| 8 | F  | $05/$02 | 1282 | 87.1 Hz |
| 9 | F# | $04/$BA | 1210 | 92.3 Hz |
| 10 | G  | $04/$76 | 1142 | 97.8 Hz |
| 11 | G# | $04/$36 | 1078 | 103.6 Hz |

Base octave (shift=0) plays the note at A1–G#2 range. Each +1 octave shift doubles the frequency (one octave up).

#### Sound Sequence Pointer Table ($EEA3)

28 × 2-byte LE pointers (slots 0–27):
| Slot | Sequence addr | Channel | Usage |
|------|--------------|---------|-------|
| 0 | $EFD1 | — | Coin-insert jingle |
| 1 | $EEDB | pulse1 | BGM channel 1 |
| 2 | $EF02 | — | BGM channel 2 |
| 3 | $EF2D | — | BGM channel 3 |
| 4 | $F044 | — | Life-up jingle P1 |
| 5 | $F053 | — | Life-up jingle P2 |
| 6 | $EFBE | — | SFX slot 6 |
| 7 | $EF58 | — | SFX slot 7 |
| 8 | $EF7A | — | SFX slot 8 |
| 9 | $EFED | pulse2 | Power-up appear (triggered by $0309=1 at PowerUpSpawnPickPos $EA63) |
| 10 | $EFA8 | — | Entity kill SFX (triggered by $030A=1 at $E99D when armored tank last armor removed; also bank-0 level-init) |
| 11 | $EF99 | — | Eagle first-hit SFX (triggered by $030B=1 at $E859 in BulletTileCollision) |
| 12 | $F003 | — | Brick/pass-through hit (triggered by $030C=1: player bullet hits brick $E89C or armor-piercing pass-through $E88A) |
| 13 | $EFFB | pulse2 | Steel/water hit: duty=$D5(75%/vol5) sweep=$7F; `dur=2, note[C2/oct4≈C6], note[C2/oct5≈C7], STOP` (4 frames) — triggered by $030D=1 at $E8AB |
| 14 | $F00C | pulse2 | Armor tank hit (tank survives): duty=$40(25%/envelope) sweep=$7F; `dur=1, note[E2/oct5≈E7], dur=2, note[F2/oct5], CmdModVolHi2($10), note[D2/oct0], STOP` (~5 frames) — triggered by $030E=1 at $E991 |
| 15 | $EFB7 | — | SFX slot 15 |
| 16 | $F03A | — | Enemy-fire SFX |
| 17 | $F031 | — | SFX slot 17 |
| 18 | $F027 | — | SFX slot 18 |
| 19 | $F018 | — | Kill sound |
| 20 | $F01F | — | Kill sound 2 |
| 21 | $F066 | — | SFX slot 21 |
| 22 | $F084 | — | SFX slot 22 |
| 23 | $F0AF | — | SFX slot 23 |
| 24 | $F0E1 | — | SFX slot 24 |
| 25 | $F0F4 | — | SFX slot 25 |
| 26 | $F107 | — | SFX slot 26 |
| 27 | $EFDF | — | SFX slot 27 |

#### BGM sequence $EEDB (slot 1) — partial decode

Header: channel=1 (pulse1), $4000=$81 (duty=50%, vol=1, envelope), $4001=$7F (sweep off), $4003 template=$40 (length=8).
Command stream (starting at offset 4):
```
$EF           ; clear loop counters
$68 $1B       ; dur=8, note C5 (idx=3, oct=3, period=213 ≈ 523 Hz)
$2B           ; note D5  (idx=5, oct=3, period≈190 ≈ 587 Hz)
$33           ; note D#5 (idx=6, oct=3, period≈179 ≈ 622 Hz)
$F0 $02 $06   ; inner-loop ×2 back to offset 6 (repeat C5/D5/D#5)
$33 $43 $53   ; D#5, F5, G5
$F0 $02 $0C   ; inner-loop ×2 back to offset 12
$43 $53 $04   ; F5, G5, A5 (oct=4 → period≈127 ≈ 880 Hz)
$F0 $02 $12   ; inner-loop ×2 back to offset 18
$5B $0C $1C   ; G#5, Bb5, C6
…             ; ascending melody continues
```
Ascending chromatic scalar melody is Battle City's main in-game BGM.

### Sound slot priority array ($0300–$031B)

28 bytes, one per sound slot.  `$0300,X` (X = 0–27) is the priority counter for slot X.  Zero = slot inactive; non-zero = slot wants to play.  `SoundResetInit` ($EBF6) zeroes all 28 on level-start/game-over.

Known slot assignments:
| Slot | Address | Trigger | Sound |
|------|---------|---------|-------|
| 0 | $0300 | `CoinEventFlag`: set to 1 by NMI_Sub ($D374) on coin release; also sound slot 0 (coin-insert jingle). | Coin jingle ($EFD1) |
| 1–3 | $0301–$0303 | Set to 1 at `GameLoopTop` ($C18A) at the top of every game-loop frame (background music / tick channels). | BGM sq1/sq2/tri |
| 4–5 | $0304–$0305 | Set to 1 by `LivesGrantCheck` ($CF8F) and power-up code ($EBE7) when player gains a life (life-up jingle + HUD redraw trigger). | Life-up jingle |
| 9 | $0309 | Set to 1 at `PowerUpSpawnPickPos` ($EA63) when a power-up tank takes its first hit (power-up appears). | Power-up appear ($EFED) |
| 10 | $030A | Set to 1 at $E99D (armored tank last-armor hit → death) and at bank-0 level-init ($88A2/$8C4C/$8EB7); also ROL'd at $D4EC for multi-frame effect. | Entity kill SFX ($EFA8) |
| 11 | $030B | Set to 1 at $E859 (BulletTileCollision): player bullet hits eagle (tile $C8 with $68≠0 = first hit, starts 39-frame countdown). Also triggers $0307=1 ($CriticalHitFlag). | Eagle first-hit ($EF99) |
| 12 | $030C | Set to 1 at $E88A (armor-piercing bullet passes through tile) or $E89C (player bullet hits brick wall, non-steel). | Brick hit / pass-through ($F003) |
| 13 | $030D | Set to 1 at $E8AB (BulletTileCollision): player bullet (slot X<2) hits **steel tile** ($10) **or water tile** ($11) — indestructible tiles, bullet absorbed. | Steel/water hit ($EFFB): pulse2 duty=$D5 sweep=$7F; 2 notes C2/oct4→C2/oct5 (≈C6→C7), 4 frames |
| 14 | $030E | Set to 1 at $E991 (PlayerBulletEnemyHit): player bullet hits **armored/power-up tank** (EntityType bit2 set) AND armor tier (EntityType & $03) > 0 after DEC; tank survives. | Armor hit ($F00C): pulse2 duty=$40 sweep=$7F; E2/oct5→F2/oct5 rising then D2/oct0 low, ~5 frames |
| 16 | $0310 | Enemy bullet-fire trigger ("enemy fire trigger" per earlier notes). | Enemy fire SFX ($F03A) |
| 19–20 | $0313–$0314 | Set to 1 at kill-tally ($CB47/$CB65) when enemy destroyed (kill sound). Also noted: `$9751` zeroes $0313 at level-screen init. | Kill sound ($F018/$F01F) |

Sound slot data structures: slot N lives at `$031C + N×8` (8 bytes).

**Dual use during level init (bank 0 only, before SoundResetInit):**

`$0300` acts as a **PPU tile write queue head index**.  `BuildPPUWriteQueue` ($992E):
1. Reads `LDX $0300` (write position).
2. Appends entries to `$0301,X++`: format `[ppu_addr_hi, ppu_addr_lo, count, tile×count]`.
3. Saves X back → `STX $0300`.
4. Boundary: if X ≥ $3F → abort (queue full sentinel).
`$974A` initialises head to `$12` (=18) before `HQSpriteInit` appends HQ sprite tiles from $0313 onward.
After all bank-0 level-init code completes, `SoundResetInit` zeroes $0300–$031B, wiping the queue and initialising the sound priority array for gameplay.

**Bank 0 $0301–$0305 usage map (traced session 10):**

| Site | Address range written | Values / Source | Context |
|------|-----------------------|-----------------|---------|
| `Level0Init` tick ($874D, $87F8) | $0301–$0305 | $D4→$0301, $D3→$0302, #$60→$0303, #$FC→$0304, #$00→$0305 | Per-frame music pitch update (when $D2≠2); $D3/$D4 are scroll/phase accumulators cycling per-step |
| `EntitySlotFill4` ($8C00, $8C24–$8C48) | $0304–$0309, $0300–$0303 | 6-byte entity template from ($00),Y → $0304–$0309; WaveCtrlInit ($8312: $09,$23,$54,$06) → $0300–$0303 | One-time staging write during wave init; temporal separation ensures music engine overwrites afterward |
| Music reset ($8CF2) | $0301–$0308 | Table $82EA ($23,$15,$04,$2C,$FE,$FE,$FE,$00) | Reset 8 sound slots to initial priorities (Y=7..0 bulk copy) |
| Kill-jingle trigger ($8CCC) | $0301–$0305 | $21→$0301, $1A→$0302, $01→$0303, computed→$0304 | Music phrase start; computed = (enemy-kill count + 1) base-10 digit |
| Level-3 init ($91CA, $91CD) | $0301–$0306 | Table $8129 ($20,$D4,$02,$9B,$00,$00) then digits of ($5D+$0613+1)÷10 | Wave-specific sound init; $0304/$0305 get hundreds/tens digits of score-like sum |
| Music sequence engine ($BC80+, $BCC8–$BCD4) | $0301–$0303 | ZP $EA→$0301, ZP $E9→$0302, #$8F→$0303 | Per-note update; $E9/$EA are channel pitch registers, #$8F = triangle linear-counter hold |
| Note data loop ($BD36–$BD44) | $0304–$0312 | $FC fill then music-seq bytes via ($05),Y | Initialise 15 priority slots (4–18) for a chord/polyphonic note block |
| Score-display ($8D03–$8D1C) | $0305–$0307 | Digit decomposition of $6D via ÷10 helper $AFA8 | Decimal-digit encoding; written to sound priority slots used as HUD digit index |

**Key insight**: $0301–$0305 are legitimately the NMI sound priority counters during gameplay.  Bank 0 level-init code exploits the same addresses as temporary scratch/staging storage before the per-frame music engine takes over.  `SoundResetInit` ($EBF6) provides the clean transition point.  The music engine in bank 0 ($BC80 seq-player, $87F8 pitch-update) writes to these slots every frame to keep music channels active; `SoundEngine` ($EC23) in the NMI reads them and writes 4 APU regs from slot data at $031C+N×8.

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

### Tile Passability — Collision Map Boundary

The collision map at $0400–$07FF stores **CHR tile index bytes** directly (from DrawNametableTile writes). The passability test in `MoveGridSnap ($DD30)` is:
```
if tile == $00: passable (empty / fully-destroyed brick)
if tile  < $20 AND != 0: BLOCKED  → tiles $01–$1F
if tile >= $20: passable           → tiles $20–$7F
if tile bit 7 set: BLOCKED         → entity-occupied ($80–$FF)
```
This maps to terrain types:
| CHR tile | Value | Terrain | Passable? |
|----------|-------|---------|-----------|
| $00 | 0 | Empty (open ground) | ✓ |
| $01–$0F | 1–15 | Brick sub-tile bits (partial/full) | ✗ |
| $10 | 16 | Steel wall | ✗ |
| $12 | 18 | Water | ✗ |
| $21 | 33 | Ice | ✓ (no slide mechanic; normal speed) |
| $22 | 34 | Trees / forest | ✓ |
| $80+ | 128+ | Entity-occupied (bit 7 set by CalcTilePos) | ✗ |

**Ice tile**: CHR $21 ≥ $20 → passable; **no slide mechanic in this game** — tanks move at normal speed on ice, it is purely a visual terrain type.

**Water tile**: CHR $12 = 18 < $20 → blocks tank movement AND bullets; BulletTileCollision at $E87B checks `CMP #$11` (tank-map water sentinel) → $030D=1 (player bullet water-hit flag), no tile destroy.

**Steel tile**: CHR $10 = 16 < $20 → blocks tank movement. BulletTileCollision at $E892 checks `CMP #$10` → $030D=1 (player bullet steel-hit flag); armored bullet ($D6 bit1) destroys steel: calls $D7A4 to clear tile to $00.

### MoveGridSnap — Two-Corner Leading-Edge Probe

`MoveGridSnap ($DD30)` checks two corners of the 16×16 tank's leading edge (9 pixels ahead of center):

```
For direction dir:
  dx = DirDeltaTable[$E529+dir]    ; +1/-1/0/0 (x component)
  dy = DirDeltaTable[$E52D+dir]    ; 0/0/-1/+1 (y component)

Probe1 X = EntityX + dx   + |dy|*8   (leading edge + right-perpendicular)
Probe1 Y = EntityY + dy   + |dy|*8   (leading edge)
Probe2 X = EntityX + dx   - |dy|*8   (leading edge + left-perpendicular)
Probe2 Y = EntityY + dy   - |dy|*8

Each probe: TilePosLookup → SubTileBitmask → TileCollidableCheck
```
If BOTH probes clear → advance entity 1 pixel in direction → animate tread (`$B0,X XOR $04`).
If EITHER probe blocked → enemy: 75% pause (state $88), 25% reverse/random-dir; player: no direction change.

### Bullet Slot Assignment (player vs enemy)

10 bullet slots total (indexed 0–9), mapped to entity/player ownership:
| Slot | Owner | Notes |
|------|-------|-------|
| 0 | P1 primary | Set by FireBullet (entity 0) |
| 1 | P2 primary | Set by FireBullet (entity 1) |
| 2–7 | Enemy slots | One per enemy entity 2–7 |
| 8 | P1 secondary | Double-shot second bullet (entity 0) |
| 9 | P2 secondary | Double-shot second bullet (entity 1) |

Player bullet test: `slot & $06 == 0` (used by BulletVsBulletCancel $EAB5, EnemyBulletPlayerHit $E8B1).
Enemy bullet test: `slot & $06 != 0` OR use slot range 2–7.

### RAM flags $030A–$030E (game event triggers)
| Address | Set by | Role |
|---------|--------|------|
| $030A | $E99D (EnemyBulletPlayerHit after kill) | Enemy kill event flag; ROL'd each frame at $D4EC |
| $030C | $E88D, $E89C (BulletTileCollision) | Player bullet wall-penetration flag (set when player bullet hits brick or non-water/steel) |
| $030D | $E8AB, $E8AB (BulletTileCollision) | Player bullet hits water or steel (no tile destruction); likely triggers sound slot |
| $030E | $E991 (EnemyBulletPlayerHit armor hit) | Armor tank hit without destroy; likely triggers armor-hit sound |

### Metatile System (DrawNametableTile — $D82B)

`DrawNametableTile(A=tile_type, X=pixel_x, Y=pixel_y)`:
1. Converts pixel coords to tile coords via $D733 (`PixelToTileCoord`: each coord >> 3)
2. Calls $D613 to compute nametable address
3. Rounds both tile coords to even (AND #$FE) → start of 2×2 block
4. Looks up palette via `TileAttrTable` ($DB69, 1 byte per type) and writes attribute byte
5. Looks up 4 CHR tile IDs from `TileCHRTable` ($DB79, 4 bytes per type = TL/TR/BL/BR) and writes them to the nametable via $D7A4/$D7CA

**TileAttrTable ($DB69, 16 bytes)** — NES palette slot (0–3) per tile type (dumped from ROM $DB69–$DB78):
| Type | Palette | Terrain |
|------|---------|---------|
| 0–4  | 0       | Brick variants (partial and full) |
| 5–9  | 3       | Steel variants (partial and full) |
| 10   | 1       | Water / river |
| 11   | 2       | Trees / forest |
| 12   | 3       | Ice |
| 13–15| 0       | Open (empty) |

**TileCHRTable ($DB79, 64 bytes = 16 × 4)** — CHR tile IDs [TL, TR, BL, BR] (dumped from ROM $DB79–$DBB8):
| Type | TL  | TR  | BL  | BR  | Terrain | Notes |
|------|-----|-----|-----|-----|---------|-------|
| 0    | $00 | $0F | $00 | $0F | Brick: right col only  | TL+BL blank, TR+BR brick |
| 1    | $00 | $00 | $0F | $0F | Brick: bottom row only | TL+TR blank, BL+BR brick |
| 2    | $0F | $00 | $0F | $00 | Brick: left col only   | TL+BL brick, TR+BR blank |
| 3    | $0F | $0F | $00 | $00 | Brick: top row only    | TL+TR brick, BL+BR blank |
| 4    | $0F | $0F | $0F | $0F | Solid brick (all 4 quads) | |
| 5    | $20 | $10 | $20 | $10 | Steel: right col solid | $20=open, $10=solid steel |
| 6    | $20 | $20 | $10 | $10 | Steel: bottom row solid | |
| 7    | $10 | $20 | $10 | $20 | Steel: left col solid  | |
| 8    | $10 | $10 | $20 | $20 | Steel: top row solid   | |
| 9    | $10 | $10 | $10 | $10 | Solid steel (all 4 quads) | |
| 10   | $12 | $12 | $12 | $12 | Water                  | ROM type 10 = water, NOT trees |
| 11   | $22 | $22 | $22 | $22 | Trees/forest           | ROM type 11 = trees, NOT water |
| 12   | $21 | $21 | $21 | $21 | Ice                    | |
| 13   | $00 | $00 | $00 | $00 | Open (blank)           | |
| 14   | $00 | $00 | $00 | $00 | Open (blank)           | |
| 15   | $00 | $00 | $00 | $00 | Open ground            | Used to clear spawn tile |

CHR tile key: $00=blank, $0F=brick quad, $10=solid steel, $20=steel open/frame, $12=water, $22=tree, $21=ice

**Web port bugs confirmed from this dump:**
- `BRICK_QUAD = [0x00, 0x0F, 0x00, 0x0F]` in web code is ROM type 0 (right-col brick), not full brick; full brick type 4 = [$0F,$0F,$0F,$0F]
- Steel partial types 5–8 in web are rotated one step vs ROM: web STEEL_TL(5)=[0x20,0x20,0x10,0x10]=ROM type 6; web STEEL(9)=[0x20,0x10,0x20,0x10]=ROM type 5 (partial!)
- T.TREES=10 and T.WATER=11 are swapped in web: ROM type 10=water ($12 CHR), ROM type 11=trees ($22 CHR); web passability treats type 10 as passable trees when it should block (water)

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
- [x] Trace usage of $0301–$0305 initialized in bank 0 (likely initialization queue)
- [x] Research what else is missing from ROM research and update next tasks; ensure enough info for a pixel-perfect web port — decoded BulletMoveCollision ($E7A9), EnemyBulletPlayerHit ($E8B1), BulletVsBulletCancel ($EAB5); confirmed tile passability boundary ($20), ice=passable/no-slide, bullet slot ownership; documented RAM flags $030A-$030E; added 7 new critical tasks below

### New tasks (session 11 — web port gap fill)
- [x] Decode SoundEngine sequence format ($EC23): fully documented — 5-field slot structure ($031C+N×8), 4-byte header (ch, duty/vol, sweep, timer-hi template), note bytes $00-$5F (semitone idx 3 bits + octave 3 bits), duration $61-$E7, 8 special cmds $E8-$EF, 3-level loop cmds $F0-$F2; 12-note pitch table at $EE8B (A1–G#2); 28-slot SoundSeqPtrTable at $EEA3; BGM slot 1 ($EEDB) decoded as ascending chromatic scalar melody (C5→D5→D#5→F5→G5→A5→…)
- [x] Disassemble DrawSprites ($D6D3): **corrected — NOT OAM sprites but PPU nametable queue writer (PPUQueueTiles)**. Calling convention: X=tile_col (0–31), Y=tile_row (0–29), ($11/$12)=CHR tile bytes terminated $FF. Writes packet [ppu_hi, ppu_lo, tile0…$FF] to $0180 queue. Helper $D5FC converts (col,row)→PPU addr. Variant $D6FD adds $60 for alt CHR bank. RAM shadow at $0400–$07FF mirrors each write. 66 call sites; data strings include "PLEASE INSERT COIN" at $D1A7. See PPU Write Queue subsystem section.
- [x] Disassemble score display routines $D9A7 (2-digit stage/score draw) and $D9C4 (hi-score display); $D8F7 (draw tile-string to nametable) — SkipLeadingZeros ($D9A7): scans $0000+Y for first non-zero BCD digit, backs up 1-2 positions at $FF end based on $6B (GameActive), returns $11=ptr lo; DrawHiScoreSprite ($D9C4): DrawX=$30 DrawY=$64 $60=$30, scan ZP $3E for first nonzero hi-score digit, call DrawSpriteString; DrawSpriteString ($D8F7): reads tile indices from ($13/$14) ptr, calls DrawBigSpriteTile ($D87E) per tile, advances DrawX by $20; DrawBigSpriteTile ($D87E): computes CHR addr $1000+(idx×$10) via AdvanceTilePtr loop, reads 8 plane-0 bytes from PPU $2007, renders each bit as 4×4 OAM sprite block → 32×32 magnified tile; CHR tiles are ASCII-indexed (tile $47='G', $41='A', etc.); StrGAME ($D214)=$47,$41,$4D,$45,$FF; StrOVER ($D219)=$4F,$56,$45,$52,$FF
- [x] Map HUD exact pixel layout: enemy kill-counter icons (DrawAllHUDKillIcons $C7BD, 10 pairs at rows 3–12 cols 29–30); blank icon on spawn via DrawHUDKillIconB ($C7AE, tile $11) ordered $7F/2+3 row; P1 lives tile $14 at col 29 row 18, digit at col 29–30 row 18; P2 at row 21; stage flag tiles $6C/$FC/$6D/$FD at rows 23–24 col 29–30; stage# at row 25; OAM HUD tank sprites tiles $79/$7D at px ($0105−8, $0106−8)/($0105, $0106−8), palette 3, init pos (96,104); score row 3 nametable $24: P1 icon $5E,$6B at col 2, P1 score col 4+, HI $48,$49,$6B at col 11, hi-score col 14+, P2 icon $5F,$6B at col 21, P2 score col 23+ (2P only); large sprite screens: GAME(60,70)/OVER(60,120)/BATTLE(26,46)/CITY(60,86) via DrawSpriteString, HISCORE(16,50)+digits(48,100)
- [x] Disassemble $030D/$030E sound triggers: **$030D** (slot 13 $EFFB) = player bullet hits steel($10) or water($11) tile, set at $E8AB in BulletTileCollision; pulse2 duty=$D5 sweep=$7F, 2-note C6→C7 ping, 4 frames. **$030E** (slot 14 $F00C) = player bullet hits armored tank (EntityType bit2 set, armor tier>0 after DEC), set at $E991 in PlayerBulletEnemyHit; pulse2 duty=$40 sweep=$7F, E→F rising then D low, ~5 frames. Also decoded: $030B=slot11(eagle hit), $030C=slot12(brick hit), $030A=slot10(entity kill), $0309=slot9(power-up appear). PowerUpSpawnPickPos ($EA63): picks random {48,96,144,192}px X/Y via RNGToCoord($EAA7) with collision retry.
- [x] Disassemble power-up spawn location logic: **PowerUpSpawnPickPos ($EA63)**: STA $0309=1 (power-up-appear sound); pick X($86)/Y($87) each: RNG&$03 → RNGToCoord($EAA7): A=(A*6+6)*8 → {48,96,144,192}px (grid-aligned quarter-field positions); set $88=$FF/$62=0; call PowerUpCollision($EB17) to test overlap → retry from $EA68 if collision; then pick type: RNG&$07 → PowerUpTypeRNG[$EA9F]: [0,1,2,3,4,0,4,3] (types 0-4 weighted; 1-Up never appears randomly); store type→$88/$62=0. **PowerUpDraw ($E2EF)**: if $86=0 skip; if $62≠0 (collection flash): DEC $62; draw flash-tile $3B/$3D; on zero → clear $86; else if $0B&$08 (blink gate): draw type sprite. **Sprite tiles**: game runs $2000=$B0 → 8×16 OAM mode; $DB0A draws 2 OAM entries side-by-side → 16×16px total; tile = $81+type*4 (left) and tile+2 (right); CHR tiles: type0(Helmet)=$80-$83, type1(Timer)=$84-$87, type2(Shovel)=$88-$8B, type3(Star)=$8C-$8F, type4(Grenade)=$90-$93, type5(1-Up)=$94-$97; flash=$3A-$3D. **PowerUpCollision ($EB17)**: proximity 12px; on hit: $62=$32 (50-frame flash), score+500pts, dispatch to type handler. **ShovelTimerUpdate ($E35D)**: $45=Shovel countdown; every 16 frames: at 64-frame tick DEC $45 (zero→$C912 restore walls); when $45<4: alternate $C9BB fortify/$C912 restore (steel border flashes before expiry). **PlayerShieldDraw ($E330)**: loops X=1→0; $89,X=shield timer; every 64 frames DEC $89,X; draws tile $29 or $2D (alternates on $0B&$02) via $DB0A at player pos.
- [x] Disassemble NMI handler body ($D300) fully: sequence of sub-calls (save regs → $D304 branch → OAM DMA $4014 → scroll writes → FlushPPUQueue → NMI_Sub2 $D68A → restore → RTI); NMI_Sub1 ($D352) exact flow; needed for accurate frame timing in web port

### Web port rendering fixes (session 12)

- [x] Decode full TileCHRTable ($DB79) for all 16 tile types — **DONE**: dumped all 64 bytes ($DB79–$DBB8); types 0–3=brick partial (right-col/bottom-row/left-col/top-row); type 4=full brick [$0F×4]; types 5–8=steel partial (right-col/bottom-row/left-col/top-row with $10=solid,$20=open); type 9=full steel [$10×4]; type 10=water[$12×4],pal=1; type 11=trees[$22×4],pal=2; type 12=ice[$21×4],pal=3; types 13–15=blank; web port has 3 bugs: (a) BRICK_QUAD wrong, (b) steel types 5–9 cycled by 1, (c) TREES/WATER type numbers swapped
- [x] Fix web TREES/WATER type-number swap — **DONE**: swapped enum to `WATER:10, TREES:11` in web/game.js; TILE_CHR and TILE_PAL values at indices 10/11 were already ROM-correct ($12=water,pal1 at idx10; $22=trees,pal2 at idx11); only the enum names were wrong causing passable() to allow walking on water and blocking trees; fix: swap names in T enum, update TILE_CHR comments accordingly — passability, collision (bullet vs water), and rendering all correct after name fix
- [x] Fix web BRICK_QUAD CHR indices — **DONE**: re-verified from ROM decode_tables.py 0 DB79 64 u8; type4 (BRICK_FULL) is at $DB89 = [$0F,$0F,$0F,$0F] (all four quadrants use CHR tile $0F = solid brick half); the old `BRICK_QUAD=[0x00,0x0F,0x00,0x0F]` was ROM type0 (right-col partial), making TL/BL quadrants render CHR $00 (empty tile) even for intact bricks; fixed to `[0x0F,0x0F,0x0F,0x0F]` in web/game.js line ~156; also corrected wrong ROM address comment ($DB79→$DB89) in two places
- [x] Fix web TILE_CHR for steel types 5–9 — **DONE**: re-verified from ROM `decode_tables.py 0 DB79 64 u8`; $DB8D–$DBA0 gives: type5(right-col)=[$20,$10,$20,$10], type6(bottom-row)=[$20,$20,$10,$10], type7(left-col)=[$10,$20,$10,$20], type8(top-row)=[$10,$10,$20,$20], type9(full)=[$10,$10,$10,$10]; old web code had all 5 entries cycled one slot forward (web[5]=ROM[6],…,web[9]=ROM[5]); fixed in `web/game.js` TILE_CHR array lines ~144–148; added ROM addresses as comments ($DB8D/$DB91/$DB95/$DB99/$DB9D)
- [x] Verify chr_pt0.png tile layout — **DONE**: `extract_tiles.py` source confirms `pt0 = all_tiles[:512]` → **512 tiles** (32×16 grid, 289×145 px). File $8010–$8FFF (CHR bank 0) = PPU $1000–$1FFF = **BG bank** = chr_pt0.png tiles 0–255; file $9010–$9FFF (CHR bank 1) = PPU $0000–$0FFF = **sprite bank** = chr_pt0.png tiles 256–511. PPU CTRL $B0 (bit4=1 → BG@$1000, bit5=1 → 8×16 sprites) confirmed via $D32B NMI handler. Web code's 0–255/256–511 split is **correct**: BG `drawCHRTile(T, ...)` → PNG index T (BG bank), even sprite `drawCHRTile(256+T, ...)` → PNG index 256+T (sprite bank). Initial data-range map had BG/sprite PPU labels swapped — corrected above. Note: odd sprite tiles (eagle $D1–$EF, HUD $79–$7F, spawn $A1–$AF, bullets $B1–$B7) use PT1 → PNG index T&$FE (no +256), but web `drawSprite16` always adds 256 — pre-existing bug documented in session 4.
- [x] Verify entity position convention — **DONE**: ROM uses **CENTER-pixel convention**. Proven by MoveGridSnap ($DD30) collision probes at $DD4B–$DDAA: for RIGHT movement, dx=+1 so $58=8, $59=0; first probe_X = entity_X+8 (one past right edge), probe_Y_bot = entity_Y+7 (bottom edge), probe_Y_top = entity_Y-8 (top edge); for UP, dx=0 dy=-1 so $58=0, $59=0xF8=-8; probe_Y = entity_Y-9 (one past top edge), probe_X_left = entity_X-8 (left edge), probe_X_right = entity_X+7 (right edge). Tank body spans **X: entity_X-8 to entity_X+7, Y: entity_Y-8 to entity_Y+7 (16×16px)**. Probe division by 8 in $D733 (3×LSR) converts pixel coords to NES tile indices. Spawn values ($E537–$E53A): P1=(88,216), P2=(152,216) are centers; field starts at (24,24), so P1 center→tile (4,12) = standard Battle City spawn position ✓. **Web port bugs**: (1) e.x/e.y treated as top-left → all tanks 8px right+down from ROM position; (2) TANK_SZ=14 should be 16 (ROM hitbox is entity_X±8 = 16px wide); (3) web `canMove()` checks 4 corners of 14×14 box at 16px game-tile granularity while ROM checks two leading-edge points at 8px NES-tile granularity → partial brick variants (left-col, right-col, etc.) may allow/block movement incorrectly.
- [x] Decode sprite tile layout for 8×16 OAM mode — **DONE** (Session 10): even OAM byte T→PT0 (PNG 256+T); odd OAM byte T→PT1 (PNG T&$FE). Tank tiles all EVEN (→PT0): formula `($A8,X&$F0)+dir×8`, left OAM=T, right OAM=T+2; player star 0/1/2/3→bases $00/$20/$40/$60; enemy tier 0/1/2/3→bases $80/$A0/$C0/$E0; animation is attribute-only (palette $E0B7, no tile change). Non-tank sprites all ODD (→PT1/BG-bank): spawn animation ($E0BF) uses $A1–$AF (triangle wave, NOT $C3–$CF as previously stated); bullet expl ($E1AF) uses $B1/$B3/$B5/$B7; eagle ($E3F2) uses $D1–$DF intact / $E1–$EF damaged, 8 OAM entries 4×2=32×32px (NOT 2×2=16×16px); HUD tank ($C7CD) uses $79/$7B / $7D/$7F, 4 entries = 2 icons of 16×16px. Web bugs: eagle drawn as 16×16 (should be 32×32), uses sprite-bank (+256) for PT1 tiles (should use BG-bank, no offset), tile byte T used directly instead of T&$FE for top half.
- [x] Audit all web/game.js ROM references — **DONE**. Full audit of all major subsystems against ROM disassembly. Findings below:

  **CONFIRMED CORRECT (web matches ROM):**
  - Enemy frame alternation: `(i ^ frameCount) & 1` matches ROM `($5A EOR $0B) & 1` at $DCE3 ✓
  - Enemy move delta: 1 px/step, alternating → 0.5 px/frame effective ✓
  - Freeze timer: every 64 frames (`frameCount & 63 === 0`) ✓; Timer power-up sets `freezeTimer=10` (×64=640 frames) ✓
  - Kill score table ($D2C2): BCD $10/$20/$30/$40 = 100/200/300/400 pts; web `(1+type)*100` ✓
  - Spawn position cycling: `spawnRot % 3` → 3 X positions matches $E531/$6A ✓
  - Power-up types 0–4 dispatch matches ROM $EB87 6-handler table ✓
  - Helmet shield: ROM $EB95 stores $0A→$89,X (10 ticks × 64 frames = 640 frames); web 640 → same duration ✓
  - Freeze timer: ROM $EB9A stores $0A→$0100 (10 × 64 = 640 frames); web `freezeTimer=10` with every-64-frame decrement ✓
  - Player frame-skip: skip when `(frameCount & 3) === 2` (3 of 4 frames) matches ROM `$DC25–$DC2D` ✓
  - Direction encoding (0=UP,1=LEFT,2=DOWN,3=RIGHT) matches $E529/$E52D DirDeltaTable ✓

  **BUGS / DISCREPANCIES:**

  1. **Player move speed 2× too fast** (line ~429): `e.x += DX[e.dir] * 2` uses 2 px/step; ROM MoveGridSnap ($DD4B–$DDBC) sets `$56 = entity_X + DX[dir]` = entity_X + 1 → 1 px/step. Combined with 3/4 frame rate: web=1.5 px/frame, ROM=0.75 px/frame.

  2. **shieldTimer decremented every frame** (line ~746): comment says "every 64 frames" but code does `e.shieldTimer--` unconditionally. ROM $E330 `AND #$3F; BNE skip; DEC $89,X` → decrements every 64 frames. Spawn shield: ROM stores $03 → 3×64=192 frames; web=180 frames (close but different scale). Fix: add `(frameCount & 63) === 0` guard, change spawn `shieldTimer=3`, helmet `shieldTimer=10`.

  3. **BULLET_SPD=4 applied every frame** (line ~520 comment + 530): ROM BulletMoveCollision ($E7A9) applies delta×4 but with frame alternation for bullets where `$D6,X=0` (`TXA EOR $0B AND #$01 BEQ skip`): move 4 px every other frame = 2 px/frame average for regular bullets. Web moves 4 px every frame → 2× too fast for regular bullets.

  4. **spawnDelay fixed at 120** (line ~277, 737): ROM LevelStart ($C33D, $C35F–$C387) computes `SpawnDelayMax ($84) = 190 - $85×4` where $85 = stage# (capped at 35). Range: stage 0 → 190 frames (3.2 s), stage 35 → 50 frames (0.83 s). Web uses fixed 120 (≈ stage 17-18). 2-player mode subtracts 20 more.

  5. **Power-up type includes 1-Up (type 5) randomly** (line ~688): `Math.floor(Math.random() * 6)` allows type 5 (1-Up). ROM PowerUpTypeRNG ($EA9F): [0,1,2,3,4,0,4,3] — only types 0–4, never type 5. 1-Up only appears via LivesGrantCheck ($CF44) at certain kill thresholds.

  6. **Pre-existing known bugs** (documented in prior sessions):
     - e.x/e.y treated as top-left vs ROM center convention → tanks offset 8px right+down
     - TANK_SZ=14 should be 16 (ROM hitbox entity_X±8 = 16px)
     - canMove() 4-corner check vs ROM 2-leading-edge-point check
     - Eagle drawn 16×16 (should be 32×32)
     - drawSprite16 always uses +256 offset for PT1 tiles (should use 0 for odd OAM tiles)
- [x] Meta-audit: verify web port completeness and ROM fidelity — **DONE**. Full cross-check of all web/game.js subsystems against ROM disassembly. Findings below.

  **FULLY CORRECT (web matches ROM):**
  - CHR tile bank split: 0–255 BG bank, 256–511 sprite bank ✓ (session 6)
  - All tile type constants T.* (WATER=10, TREES=11, ICE=12, EMPTY=13) ✓ (session 5+12 fixes applied)
  - TILE_CHR, TILE_PAL for all 16 types; BRICK_QUAD=[0x0F×4] ✓ (sessions 5+12)
  - Brick sub-tile bitmask: bit0=TL, bit1=TR, bit2=BL, bit3=BR ✓ ($D745)
  - Direction encoding: 0=UP, 1=LEFT, 2=DOWN, 3=RIGHT ✓ ($E529)
  - P1/P2 spawn (88,216)/(152,216), Eagle=(120,216) ✓ ($E537–$E53A)
  - Enemy spawn X=[24,120,216], Y=24 ✓ ($E531)
  - Player frame throttle: skip when `(frameCount & 3) === 2` ✓ ($DC25)
  - Direction snap on turn: `(x+4)&$F8` ✓ ($DC23)
  - Enemy frame alternation: `(i ^ frameCount) & 1` ✓ ($DCE3)
  - Enemy move: 1px/step every other frame (0.5px/frame) ✓
  - Freeze timer: dec every 64 frames, Timer power-up sets 10 → 640 frames ✓ ($EB9A)
  - Kill score: (1+type)×100 = 100/200/300/400 pts ✓ ($D2C2 KillScoreTable)
  - SpawnRotIdx cycling: `(spawnRot+1) % 3` ✓ ($6A)
  - Max 4 active enemies on screen simultaneously ✓
  - 20 enemies per stage total ✓ ($7F EnemiesRemaining)
  - Bullet slot = entity slot index; secondary slot 8/9 for double-shot ✓ ($CC,X)
  - Double-shot gate: starLevel >= $40 ✓ ($D6,X bit0)
  - Armor-piercing bullet at starLevel >= $60 ✓ ($D6,X bit1)
  - Bullet vs steel/water: stop bullet; bullet vs brick: destroy quadrant ✓ ($E838)
  - Bullet-bullet cancel: player vs enemy within 6px ✓ ($EAB5)
  - Eagle tile blocks canMove() ✓ ($E838)
  - Spawn animation blocks movement (spawnAnim > 0) ✓ ($DF09)
  - Power-up type dispatch cases 0–5 match ROM $EB87 table ✓
  - Helmet shield: stores 640 frames (10×64) ✓ ($EB95) — coincidentally correct (see bug #2 below)
  - p1Lives initial = 2 (displays 3 with +1) ✓

  **PARTIALLY CORRECT — BUGS WITH SPECIFIC DELTAS:**
  1. **Player speed 2× too fast** (line ~429): `DX[e.dir] * 2` → 2px/step × 3/4 frames = 1.5px/frame; ROM MoveGridSnap = 1px/step × 3/4 frames = 0.75px/frame.
  2. **shieldTimer decremented every frame** (line ~746): ROM $E330 decrements every 64 frames (`AND #$3F; BNE skip; DEC $89,X`). Web stores raw frame counts (180/640) and subtracts 1/frame; helmet (640) is accidentally correct in duration, but spawn shield (web=180 vs ROM $03×64=192 frames) is 6% off. Fix: guard with `(frameCount & 63) === 0`, change spawn to 3, helmet to 10.
  3. **Bullet speed 2× too fast** (line ~530): `BULLET_SPD=4` applied every frame; ROM $E7A9 applies 4px every other frame (alt-frame skip `TXA EOR $0B AND #1 BEQ skip`) = 2px/frame effective for regular bullets.
  4. **Spawn delay fixed at 120** (line ~277/737): ROM computes `190 − stage# × 4` (range 50–190 frames); web uses fixed 120 (≈ stage 17–18 difficulty).
  5. **Power-up type includes 1-Up randomly** (line ~688): `Math.random() * 6`; ROM $EA9F weight table [0,1,2,3,4,0,4,3] → only types 0–4, 1-Up only from LivesGrantCheck.
  6. **Power-up spawn position = dead entity position**: ROM $EA63 picks random {48,96,144,192}px grid via RNGToCoord ($EAA7) with collision retry; web uses `e.x, e.y` directly.
  7. **Enemy type distribution**: web uses `Math.min(3, kills/5)` universal formula; ROM loads per-stage distributions from EnemyTypeTable ($E5A9) via stage-specific group counts ($8B–$8E in each level block).
  8. **Shovel timer 3.75× too long** (line ~715/749): web sets `20 * 60 = 1200` frames decremented every frame = 20s; ROM $EBA0 sets $45=20 decremented every 16 frames → 320 frames (5.3s).
  9. **canMove() tile granularity**: web checks 4 corners at 16px metatile granularity; ROM probes 2 leading-edge points at 8px NES-tile granularity → partial brick variants (BRICK_TL/TR/BL/BR) may block/pass incorrectly.
  10. **Entity position convention** (known): e.x/e.y = top-left; ROM = center. All tanks 8px right+down from ROM positions.
  11. **TANK_SZ=14** (known): ROM hitbox entity_X±8 = 16px wide; affects all collision boxes.

  **MISSING / UNIMPLEMENTED:**
  1. **Sound engine**: silent. ROM has 28-slot APU engine ($EC23), 14 sound sequences ($EEA3), 12 sound triggers ($030A–$030E). All SFX and BGM absent.
  2. **Tank CHR sprite rendering**: web draws colored rectangles; ROM uses CHR sprites `($A8,X&$F0)+dir×8` for direction×animation via sprite bank (even OAM = +256 offset). No actual tile rendering for tanks.
  3. **Spawn star CHR animation**: web draws colored shrinking squares; ROM uses PT1 CHR tiles $A1–$AF (triangle wave, 8-frame sequence via drawSprite16 without +256 offset).
  4. **Bullet explosion CHR animation**: web has no explosion effect; ROM uses 4-frame PT1 sequence $B1/$B3/$B5/$B7 on bullet destruction ($E1AF).
  5. **Eagle size wrong** (known): web draws 16×16px; ROM eagle = 8 OAM entries = 32×32px at center-(16,16).
  6. **Eagle CHR bank wrong** (known): `drawSprite16` adds +256; eagle tiles $D1–$DF/$E1–$EF are PT1 (odd OAM → no +256, use T&$FE). Tiles render from wrong bank.
  7. **Title / attract screen** ($C65C AttractWait, $CFAA PreGameDraw): web starts directly into level 1; no attract loop, title sprite, or coin/credit flow.
  8. **Stage-clear tally screen** ($CAF1 StageClearTallyScreen): web shows "STAGE CLEAR!" text; ROM animates per-type kill drain (4 types × score × count) + P1/P2 totals + bonus.
  9. **Victory screen** ($C44D DrawVictoryScreen): "PEACE BE WITH YOU" + 240-frame ScrollX slide after all stages — not implemented.
  10. **Hi-score tracking** ($D9F0 CompareAndUpdateHiScore): not tracked or displayed; ROM compares 7-digit BCD $15/$1D vs $3D, shows "NEW HI SCORE" with palette flash.
  11. **2-player mode**: P2 slot (entity 1) never spawned or controlled; ROM supports alternating 2-player with separate lives/score.
  12. **Enemy speed tables** ($E6A9 SpeedTable, 36 entries, 9 tiers × 4 types): web uses fixed 1px/frame for all enemies; ROM assigns move+fire rates per stage/type from SpeedTable.
  13. **Ice sliding mechanic**: ICE passable but no momentum/slide. ROM behavior on ICE not yet fully reversed (possibly no slide in NES version; unconfirmed).
  14. **Shovel flash warning**: ROM alternates fortify/restore 4× when $45<4 ($EBA0 ShovelTimerUpdate); web has static fortify with no expiry warning.
  15. **Power-up collection flash**: ROM $62=50-frame flash drawing tiles $3B/$3D after collection; web removes power-up instantly.
  16. **LivesGrantCheck score thresholds** ($CF44): extra life at score milestones; web never grants score-based lives.
  17. **Grenade screen flash** ($EBBC): ROM has screen flash effect; web just kills all active enemies.
  18. **HUD top score strip**: ROM nametable $24 has P1 score + hi-score + P2 score at top rows; web puts score only in side HUD.
  19. **Enemy power-up tank flashing**: ROM uses OAM palette attribute toggle (no tile change); web approximates with color alternation only.

### Sprite / CHR extraction verification (session 13 — do first)

Before fixing the web port rendering, verify that the CHR PNG is correct and that tile indices map properly to visual content. All RE evidence suggests the extraction is correct, but the web port rendering visually looks broken — so we must confirm ground truth.

- [x] **Visually audit chr_pt0.png against emulator**: Bank mapping verified from code analysis (session 14): `chr_pt0.png` tiles 0–255 = file $8010 = PPU **$1000–$1FFF** = BG/PT1; tiles 256–511 = file $9010 = PPU **$0000–$0FFF** = Sprite/PT0. Confirmed consistent across: data-range map (lines 33–34), PPUCTRL $B0 (bit4=1→BG@$1000, bit5=1→8×16 sprites), `game.js` `drawCHRTile(256+T)` for sprite bank, and REVERSE.md lines 1754–1756. **Bug fixed**: CHR-ROM Layout table (former lines 1178–1183) had PPU addresses swapped — now corrected. Specific tile content (a–f) still needs visual confirmation via `web/tile_viewer.html` (now available — open in browser while serving `python3 -m http.server 8000`). No discrepancy found in tile bank order or PNG index math.

- [x] **Verify PT0/PT1 bank order in extract_tiles.py**: Confirmed by source inspection. `extract_tiles.py`: `chr_off = 16 + prg_size = 0x8010`; `pt0 = all_tiles[:512]` → tiles 0–255 from file $8010–$8FFF (BG/PT1, PPU $1000) and tiles 256–511 from file $9010–$9FFF (sprite/PT0, PPU $0000). `game.js` `drawCHRTile(T < 256 → BG, 256+T → sprite)` matches. Output dimensions: 32×16 grid × 9px cell = 289×145 px (chr_pt0.png).

- [x] **Verify tank sprite tile layout in chr_pt0.png**: Confirmed via visual inspection of chr_pt0.png (289×145px, 32×16 grid, 9px/cell). **Player tank tiles** (sprite bank, PNG index 256+T): tiles 256+0x00–256+0x1F occupy all of row 8 (pixel y=72–80). Four direction groups × 8 tiles each: up (cols 0–7), left (cols 8–15), down (cols 16–23), right (cols 24–31). Each group holds 2 animation frames split into left/right 8×16 halves (e.g., up frame0: tiles 256+$00/+$02; up frame1: tiles 256+$04/+$06; lower halves at +$10/+$12 offsets). **All tile positions confirmed non-blank** with distinct tank outlines per direction. **Enemy tier tiles** at sprite bank: tier 0 base $80 → row 12 (tiles 384–399), tier 1 base $A0 → row 13 (tiles 416–431), tier 2 base $C0 → row 14 (tiles 448–463), tier 3 base $E0 → row 15 (tiles 480–495). All four tiers present with visually distinct designs (tier 3/armor tanks have distinctly heavier outline). **BG bank tiles for reference**: spawn anim $A0–$AF at row 5 cols 0–15 (confirmed sparkle/star shapes); eagle intact $D0–$DF at row 6 cols 16–31 (eagle silhouette visible); eagle damaged $E0–$EF at row 7 cols 0–15 (broken variant). CHR extraction is correct; PNG index math matches ROM DrawTank2x2 formula `T = base + dir*8 + anim_bit`.

- [x] **Verify spawn animation tiles in chr_pt0.png**: Confirmed via visual inspection of chr_pt0.png. BG bank tiles 0xA0–0xAF occupy **row 5 (pixel y=45–53), cols 0–15** in the 32×16 grid (9px/cell). The 16 tiles form **8 animation frames × 2 tiles** (top+bottom pair per frame): frame0=$A0/$A1, frame1=$A2/$A3, …, frame7=$AE/$AF. Each pair shows an expanding/contracting **star/sparkle shape**: frame0=smallest (single-pixel cross), frames 1–3 progressively larger diamond outline, frame4=full 16×16 starburst, frames 5–7 mirror contraction. Distinct shapes visible in all 16 tile positions (non-blank). The ROM uses odd tile indices ($A1,$A3,…) with & 0xFE to get the even PNG address; bottom tile = top+1. Animation sequence from `$E0BF DrawSpawnSprite`: triangle wave `[$A1,$A3,$A5,$A7,$A9,$AB,$AD,$AF,$AD,$AB,$A9,$A7,$A5,$A3,$A1]`.

- [x] **Verify eagle tiles in chr_pt0.png**: Confirmed via visual inspection of chr_pt0.png. **Eagle intact** (BG bank tiles 0xD0–0xDF): **row 6 cols 16–31** (pixel y=54–62, x=144–287). 16 tiles in 4-col × 2-row layout showing spread-wings eagle silhouette — recognizable bird shape with extended wings, tail, and head visible across the 8×16 tile pairs. **Eagle damaged** (BG bank tiles 0xE0–0xEF): **row 7 cols 0–15** (pixel y=63–71, x=0–135). 16 tiles in same 4×2 layout showing broken/collapsed eagle — wing fragments, visibly shattered design vs. intact. Both sets non-blank with clear graphical content. ROM tiles accessed via `T & 0xFE` (PT1/BG bank, no +256 offset). Intact tiles `$D1/$D5/$D9/$DD/$D3/$D7/$DB/$DF` (4 cols × 2 rows of 8×16 OAM entries); damaged `$E1/$E5/$E9/$ED/$E3/$E7/$EB/$EF`.

- [x] **Write a standalone tile viewer** (`web/tile_viewer.html`): Created (session 14). 512-tile 32×16 grid with NES palette selector (8 slots), hover tooltip showing tile index + OAM byte + category name, category border color coding (player tanks yellow, enemy tiers red/orange, spawn cyan, eagle green/red, bullet magenta, HUD blue, BG terrain light blue), grayscale raw mode. Open at `http://localhost:8000/web/tile_viewer.html`.

### Web port pixel-perfect fixes (session 13+)

The following bugs are fully documented from ROM disassembly. Tasks are implementation-only — no further RE needed unless noted.

**Rendering — CHR sprite tile bank (highest visual impact):**

- [x] Fix `drawSprite16` PT1 tile bank: odd OAM sprites (spawn $A1–$AF, bullet-expl $B1–$B7, eagle $D1–$EF, HUD $79–$7F) must use PNG index `T & 0xFE` (no +256 offset — these come from PT1/BG bank). Even OAM sprites (tanks) continue to use `256+T`. Fixed: added `pt1=false` param to `drawSprite16`; uses `t => t & 0xFE` when pt1=true, `t => 256+t` otherwise. Updated both eagle calls (intact $D1/$D5/$D9/$DD and damaged $E1/$E5/$E9/$ED) to pass `pt1=true`.

- [x] Fix eagle size and tiles: ROM `$E3F2` draws eagle as **8 OAM entries in a 4×2 grid = 32×32 px**, top-left at `(EAGLE.x−16, EAGLE.y−16)`. Tiles intact `$D1/$D5/$D9/$DD/$D3/$D7/$DB/$DF` (4 columns × 2 rows, each entry is an 8×16 sprite), damaged `$E1/$E5/$E9/$ED/$E3/$E7/$EB/$EF`. All are PT1 (no +256). Fixed: replaced `drawSprite16` (16×16) with direct `drawCHRTile` loop over 4×2 OAM entries; each entry T draws top=`T&0xFE` and bottom=`(T&0xFE)+1` at 8px column offsets from `ex−16`, row y positions `ey−16` and `ey`. Wall sections changed from 3×8×8 tiles to 4×`drawMetatile` calls (16×16 each) at the 4 documented corner positions.

- [x] Fix spawn animation CHR tiles: ROM `$E0BF DrawSpawnSprite` uses PT1 tiles `$A1–$AF` in an 8-frame triangle wave (`$A1,$A3,$A5,$A7,$A9,$AB,$AD,$AF,$AD,$AB,$A9,$A7,$A5,$A3,$A1`). Each frame draws a single 16×16 sprite (2 OAM entries: top `T`, bottom `T+1`, PT1 bank). Fixed: `drawEntity` now uses `SPAWN_SEQ=[0xA1…0xA1]` (15-entry triangle wave), `seqIdx=Math.min(14,Math.floor((60-spawnAnim)/4))`, draws `drawCHRTile(T&0xFE, 4, e.x+4, e.y, true)` + `drawCHRTile((T&0xFE)+1, 4, e.x+4, e.y+8, true)` (8-wide sprite centered in 16-wide entity area, palIdx 4=SP0); falls back to colored rectangle when CHR not loaded.

- [x] Fix bullet explosion animation: ROM `$E1AF BulletExplode` draws a single 8×8 PT1 sprite at `bullet.x−5, bullet.y` using tile `$B1 + dir*2` ($B1=up, $B3=left, $B5=down, $B7=right), palette SP0, for ~4 frames. Fixed: added `explodeTimer/ex/ey/edir` fields to bullet; `triggerBulletExplosion(b)` sets timer=4, ex=b.x−5, ey=b.y, edir=b.dir; called at all collision deactivation sites (tile hit, eagle hit, entity hit, bullet-cancel); `drawBullet` draws CHR tile `(0xB1+edir*2)&0xFE` PT1 palIdx=4 transparent when explodeTimer>0; timer decremented each frame in `moveBullets`; explodeTimer reset to 0 in `tryFire` to prevent stale displays.

- [x] Fix tank CHR sprite rendering: ROM `$DB02 DrawTank2x2` draws a 16×16 tank as 2 OAM entries (8×16 each): left tile `T = ($A8,X & $F0) + dir*8`, right tile `T+2`; NES 8×16 sprite mode → bottom half of left = T+1, bottom half of right = T+3. Player base = starLevel (0/$20/$40/$60); enemy base = $80+type×$20; all sprite bank (+256 offset). Fixed: `drawEntity` computes `entityBase` and `tileBase`, draws 4 CHR tiles when chrOff loaded: `drawCHRTile(256+T, palIdx, e.x, e.y)`, `drawCHRTile(256+T+2, palIdx, e.x+8, e.y)`, `drawCHRTile(256+T+1, palIdx, e.x, e.y+8)`, `drawCHRTile(256+T+3, palIdx, e.x+8, e.y+8)`; palIdx 4=SP0 (P1 yellow), 5=SP1 (P2 lime), 6=SP2 (enemy grey), 7=SP3 (enemy power-up flash); falls back to colored rectangles when CHR not loaded. Note: "+$10/+$12" in original task description was incorrect — NES 8×16 mode uses T+1/T+3 for bottom halves (session 10 confirms "4 CHR tiles T,T+1,T+2,T+3").

**Physics — entity position convention:**

- [x] Fix entity position convention: ROM `MoveGridSnap ($DD30)` uses **center-pixel** coordinates — `entity_X` is the center of the 16×16 tank (spans `entity_X−8` to `entity_X+7`). Web treats `e.x/e.y` as top-left corner. Fixed: spawn values unchanged (already ROM centers: P1=88,216; P2=152,216; enemy X=24/120/216, Y=24). Updated all render calls to draw at `e.x−8, e.y−8`; updated `canMove()` boundary/eagle/corner/entity-entity checks to use top-left = `nx−8, ny−8`; updated `tryFire()` to use `e.x + DX*9` (removed `+7`); updated `bulletEntityCollision()` and `checkPowerUpCollision()` to compare against `e.x/e.y` directly (removed `+7`). Fallback colored-rect barrel point: `bx=e.x−1, by=e.y−1` (mechanical −8 applied; will be corrected to `e.x,e.y` when TANK_SZ→16 in next task).

- [x] Fix TANK_SZ 14→16 and canMove() probe logic: ROM `MoveGridSnap ($DD4B–$DDBC)` checks **2 leading-edge probe points** at 8px NES-tile granularity, not 4 corners at 16px metatile. For RIGHT: probes `(entity_X+8, entity_Y−8)` and `(entity_X+8, entity_Y+7)` — i.e., one past the right edge, top and bottom of tank. Each probe divided by 8 → 8px tile index → check `tileMap[ty][tx]`. Fixed: `TANK_SZ=16`; added `passable8(px,py)` that checks 8px sub-quadrant for partial brick tiles; replaced 4-corner loop in `canMove()` with 2 leading-edge probes (UP: top-left/top-right corners; LEFT: top-left/bottom-left; DOWN: bottom-left/bottom-right; RIGHT: top-right/bottom-right); changed `DX[d]*2` → `DX[d]` (1px probe ahead matches 1px movement); fixed fallback barrel point `bx=e.x−1,by=e.y−1` → `bx=e.x,by=e.y`.

**Physics — speed and timing:**

- [x] Fix player move speed: changed `e.x += DX[e.dir] * 2` → `e.x += DX[e.dir]` (and Y). ROM `MoveGridSnap` advances 1px per step; with 3/4 frame skip = 0.75px/frame average. Fixed in game.js line ~440.

- [x] Fix bullet speed alternation: ROM `$E7A9 BulletMoveCollision` skips bullet movement every other frame via `TXA EOR $0B AND #$01 BEQ skip` — bullet slot index XOR framecount parity → only half the frames do 4px move = 2px/frame effective. Fixed in game.js `moveBullets()`: added `if ((b.slot ^ frameCount) & 1) continue;` before the position update, replacing the "Simplified: all bullets move every frame" stub.

- [x] Fix shield timer decrement frequency: ROM `$E330 PlayerShieldDraw` decrements `$89,X` only when `frameCount & $3F === 0` (every 64 frames). Web decrements every frame. Fixed: added `(frameCount & 63) === 0` guard in `tickTimers()` (game.js:785); spawn shield changed to `shieldTimer=3` (game.js:336); helmet power-up changed to `shieldTimer=10` (game.js:748). Shield durations now correct: spawn=192 frames, helmet=640 frames.

- [x] Fix spawn delay formula: ROM `LevelStart ($C33D, $C35F–$C387)` computes `SpawnDelayMax = 190 − stageNum × 4` (capped at min 50). Web uses fixed 120. Fixed: `spawnDelay = Math.max(50, 190 - stageIdx * 4)` at level start (game.js:304) and after each spawn (game.js:776).

- [x] Fix shovel timer: ROM `$EBA0` sets `$45=20`, decremented every 16 frames → 20×16=320 frames (~5.3s). Web sets 1200 frames (~20s, 3.75× too long). Fixed: `shovelTimer=20` tick counter (game.js:754); decrement guarded by `(frameCount & 15) === 0` (game.js:788–789); rendering uses `isFort = shovelTimer >= 4 || (shovelTimer > 0 && (frameCount>>3)&1)` to flash steel↔brick in last 64 frames (game.js:962–977).

**Game logic:**

- [x] Fix power-up type distribution: line ~688 `Math.floor(Math.random() * 6)` allows type 5 (1-Up) randomly. ROM `PowerUpTypeRNG ($EA9F)` weight table: `[0,1,2,3,4,0,4,3]` — 8 entries, only types 0–4. 1-Up (type 5) never spawns randomly; it only appears via `LivesGrantCheck ($CF44)`. Fixed: added `const POWERUP_RNG=[0,1,2,3,4,0,4,3]` and changed `spawnPowerUp` to `type=POWERUP_RNG[Math.floor(Math.random()*8)]` (game.js:727–730).

- [x] Fix power-up spawn position: line ~680 `spawnPowerUp(e.x, e.y)` spawns at dead entity location. ROM `PowerUpSpawnPickPos ($EA63)` picks independently: `RNG & 0x03 → RNGToCoord`: `coord = ((A+1)*6)*8` → values `{48,96,144,192}` for both X and Y, with collision retry if overlaps existing power-up. Fixed: added `const POWERUP_COORDS=[48,96,144,192]`; `spawnPowerUp()` now picks x/y independently from POWERUP_COORDS with up to 8 retries on overlap; call site changed from `spawnPowerUp(e.x,e.y)` to `spawnPowerUp()` (game.js:719,728–743).

- [x] Fix enemy type distribution per stage: web used `Math.min(3, Math.floor(kills/5))` as universal formula. ROM `SpeedTable ($E6A9)` 36 entries give per-stage group counts [s0,s1,s2,s3]; `EnemyTypeTable ($E5A9)` 140 bytes give type-byte at `(stage-1)*4+slot` → $80=Basic/0, $A0=Fast/1, $C0=Power/2, $E0=Armor/3. Note: table is 140 bytes (35 stages × 4), not just 40 ($E5A9–$E634); all bytes are multiples of $20, confirming intentional data. Fixed: added `const ENEMY_TYPE_TABLE` (35 rows × 20 values) to game.js:341–382 with exact ROM-derived sequences; changed spawn code from formula to `typeRow[20 - enemiesLeft]` (game.js:402–403). Also documented: SpeedTable entries 0–34 cover stages 1–35; entries 34 and 35 are identical (both 4P/6F/0P/10A = same distribution for 2P mode).

- [x] Fix enemy move speed per type: web applied alternating frame skip to ALL enemies, giving all 0.5px/frame. ROM `EntityMovement ($DC9F)`: `if EntityType & $F0 == $A0: always process` — Fast type ($A0, e.type===1) skips the alternating check and moves every frame (1px/frame); Basic/Power/Armor still alternate (0.5px/frame). Note: earlier task description referencing SpeedTable bytes as "move-counter/fire-counter/move-delta/fire-delta" was incorrect — those bytes are enemy type group counts (confirmed session 7); actual speed is purely type-based. Fixed: changed `if ((i ^ frameCount) & 1) continue` → `if (e.type !== 1 && ((i ^ frameCount) & 1)) continue` (game.js:507).

### Session 19 — Sprite rendering regression audit

All sprites are visually broken (screenshot 2026-02-22): player tank shows garbled multi-colored tiles, enemy HUD icons show wrong gray/checkered patterns, spawn animations appear white/gray. CHR rendering was supposedly fixed in sessions 13–15 but is still wrong. Investigate each subsystem bottom-up, fix, then verify.

**META — systematic verification pass (do first):**

- [x] **Build `render_sprites.py`**: Done. Decodes CHR tiles directly from ROM, applies ROM `PaletteData ($D44A)` via NES master palette, renders `output_gfx/sprite_test.png` (528×316). Groups: player tanks (SP0/SP1, 4 dirs × 4 star levels), enemy tanks (SP2, 4 dirs × 4 types), spawn anim (8 frames BG $A0-$AE), eagle intact+damaged (BG $D0-$DF/$E0-$EF), bullet explosion (BG $B0-$B7), power-ups (SP3, sprite $80-$97), HUD icons (BG $6A/$78-$7E). **All 8 palette slots in game.js differ from ROM — ROM-derived values documented below.**

**ROM-derived NES_PAL (all 8 slots differ from game.js):**
```
  ['#000000', '#783C00', '#540400', '#545454'],  // BG0-brick
  ['#000000', '#A0D6E4', '#989698', '#3032EC'],  // BG1-trees
  ['#000000', '#74C400', '#083A00', '#003C00'],  // BG2-water
  ['#000000', '#545454', '#989698', '#ECEEEC'],  // BG3-steel
  ['#000000', '#545A00', '#D48820', '#CCD278'],  // SP0-P1yel
  ['#000000', '#004000', '#007628', '#98E2B4'],  // SP1-P2grn
  ['#000000', '#00323C', '#989698', '#ECEEEC'],  // SP2-enemy
  ['#000000', '#440064', '#982220', '#ECEEEC'],  // SP3-spcl
```

- [x] **Methodically audit each rendering layer against tile_viewer.html and ROM**: Full ROM disassembly audit of all rendering layers (Session 19). Results:

  **CONFIRMED CORRECT:**
  - BG terrain tiles: `TILE_CHR` (all 13 types) matches ROM `TileCHRTable ($DB79)` exactly ✓
  - BG terrain palette: `TILE_PAL` matches ROM `TileAttrTable ($DB69)` exactly ✓ (brick=BG0, steel/ice=BG3, water=BG1, trees=BG2)
  - Brick quad tile 0x0F ✓; steel partial variants ✓; water $12 ✓; trees $22 ✓; ice $21 ✓
  - Tank sprite bank: +256 (sprite bank) ✓
  - Tank tile formula: `($A8,X & $F0) + dir×8` ✓ (before animBit fix)
  - Player palette: slot 0 → SP0 (palIdx 4), slot 1 → SP1 (palIdx 5) ✓
  - Bullet explosion tile: `($B1 + dir×2) & $FE` ✓; drawn as single 8×8 BG bank tile (1 OAM entry) ✓
  - Spawn animation base tile: $A1 ✓; BG bank (T & 0xFE) ✓
  - Eagle tile indices: $D0–$DF intact, $E0–$EF damaged ✓; BG bank (T & 0xFE) ✓
  - HUD kill icons: drawn as PPU nametable (BG tiles), palIdx=3 (BG3) likely correct ✓

  **BUGS FOUND:**
  - **Spawn animation palette WRONG**: ROM `DrawShootSprite ($E0BF)` sets $04=3 → SP3 (palIdx 7). game.js uses palIdx=4 (SP0). Also tile sequence: ROM uses only 4 levels {$A1,$A5,$A9,$AD} (AND #$FC coarsening) cycling large→small→large; game.js uses 8 levels $A1…$AF small→large→small.
  - **Bullet explosion palette WRONG**: ROM `BulletExplode ($E1AF)` sets $04=2 → SP2 (palIdx 6). game.js uses palIdx=4 (SP0).
  - **Eagle sprite palette WRONG**: ROM `EagleStateUpdate ($E386)` sets $04=3 → SP3 (palIdx 7) before dispatching all eagle draw handlers. game.js uses palIdx=6 (SP2).
  - **Enemy palette cycling**: ROM `MoveTank ($E06A)` uses `EnemySpeedTable ($E0B7)` [02,00,00,01,02,01,02,02] indexed by `($0B×4 + $A8,X) & 7` — cycles SP0/SP1/SP2 for animation. game.js fixes all enemies at SP2 except powerup→SP3. (Low priority, close approximation.)
  - **HUD tank icons**: ROM `DrawHUDTanks ($C7CD)` draws OAM sprites tiles $79/$7B and $7D/$7F (2×8×16 = 16×16px total) with SP3 (palIdx 7). game.js uses colored rectangle only.

**Investigation — root causes:**

- [x] **Audit `chr_pt0.png` pixel gray levels and tile grid geometry**: Static analysis of `extract_tiles.py` confirms: PALETTE = `[(0x00,0x00,0x00), (0x55,0x55,0x55), (0xAA,0xAA,0xAA), (0xFF,0xFF,0xFF)]` for indices 0–3. `grayToIdx` thresholds `0x2B/0x7F/0xD5` correctly map these: 0x00→0, 0x55→1, 0xAA→2, 0xFF→3 (midpoints are 0x2B, 0x7F, 0xD5 which are well-centered in each range). `CHR_CELL=9, CHR_BORDER=1` matches `extract_tiles.py` constants `cell=TILE_SZ+BORDER=8+1=9, BORDER=1`. Tile origin formula identical in both: `ox=tx*9+1`. PNG is written with `color_type=2` (RGB), 8-bit depth, no gamma chunk — browser treats as sRGB; `drawImage`+`getImageData` is lossless for exact 8-bit integers. **No mismatch — CHR tile decoding pipeline is correct.**

- [x] **Audit NES_PAL color values in game.js vs ROM PaletteData ($D44A)**: `decode_tables.py 1 D44A 32 u8` → 32 raw NES color bytes. Mapped through NES master palette via `render_sprites.py`. All 8 slots in game.js differed from ROM. Fixed in same session (see Fix NES_PAL task below).

- [x] **Investigate tank sprite tile-bank mismatch**: Tank sprite bank is +256 (sprite bank) — correct. Tile formula `($A8,X & $F0) + dir×8` correct. Palette: players 0/1 use SP0/SP1 correctly; enemy palette cycling via EnemySpeedTable is an approximation. No tile-bank mismatch exists.

- [x] **Investigate spawn animation visual (appears white, should be colored)**: ROM `$E0BF DrawShootSprite` confirmed: base tile $A1 (BG bank, no +256, T & 0xFE for 8×16). **Palette is SP3 ($04=3, palIdx 7), NOT SP0.** Tile sequence uses AND #$FC coarsening: only 4 frames {$A1,$A5,$A9,$AD}, starting large→small→large (ROM counter 0→14). game.js SPAWN_SEQ is wrong direction and granularity.

- [x] **Investigate HUD enemy icon tile 0x6A**: ROM `$C7BD DrawAllHUDKillIcons` calls `PPUQueueTiles` ($D6D3) writing to PPU nametable address $22D2 — these are background tiles, not OAM sprites. BG3 palette (palIdx=3) is plausible for the HUD background region. No immediate fix needed.

- [x] **Verify HUD OAM tank icon rendering**: ROM `$C7CD DrawHUDTanks` confirmed: draws two 8×16 OAM sprites with tiles $79 and $7D (both BG bank, via DrawTank at $DB0A), palette SP3 ($04=3, palIdx 7). game.js uses colored rectangle — this is a missing CHR rendering (fix tracked below).

**Fix tasks (implement after investigation above):**

- [x] **Fix `grayToIdx` thresholds and/or `extract_tiles.py` gray levels**: Audit (see above) confirmed no mismatch — no fix needed. PNG gray levels (0x00/0x55/0xAA/0xFF) and thresholds (0x2B/0x7F/0xD5) are correct.

- [x] **Fix NES_PAL palette slots** to match ROM `PaletteData ($D44A)` values. Fixed all 8 slots in game.js:25–33. ROM-derived values: BG0 `[$0F,$17,$06,$00]`→`#000/#783C00/#540400/#545454`; BG1 `[$0F,$3C,$10,$12]`→`#000/#A0D6E4/#989698/#3032EC`; BG2 `[$0F,$29,$09,$0B]`→`#000/#74C400/#083A00/#003C00`; BG3 `[$0F,$00,$10,$20]`→`#000/#545454/#989698/#ECEEEC`; SP0 `[$0F,$18,$27,$38]`→`#000/#545A00/#D48820/#CCD278`; SP1 `[$0F,$0A,$1B,$3B]`→`#000/#004000/#007628/#98E2B4`; SP2 `[$0F,$0C,$10,$20]`→`#000/#00323C/#989698/#ECEEEC`; SP3 `[$0F,$04,$16,$20]`→`#000/#440064/#982220/#ECEEEC`.

- [x] **Fix spawn animation palette and tile sequence**: ROM `DrawShootSprite ($E0BF)` uses SP3 (palIdx 7). Change game.js `drawEntity` spawn block from `palIdx=4` to `palIdx=7`. Also fix tile sequence: ROM uses 4 levels {$A1,$A5,$A9,$AD} large→small→large (counter & 0x0F, formula `(|counter-7|*2 & 0xFC) + 0xA1`). Change `SPAWN_SEQ` to `[0xAD,0xAD,0xA9,0xA9,0xA5,0xA5,0xA1,0xA1,0xA1,0xA5,0xA5,0xA9,0xA9,0xAD,0xAD]` and update seqIdx to use `Math.floor((60 - e.spawnAnim) / 4)`. **Done (game.js:1076–1082): SPAWN_SEQ corrected to 4-level large→small→large sequence, palIdx changed 4→7 (SP3).**

- [x] **Fix bullet explosion palette**: ROM `BulletExplode ($E1AF)` sets $04=2 → SP2 (palIdx 6). Change game.js `drawBullet` from `palIdx=4` to `palIdx=6`. **Done (game.js:1174): palIdx changed 4→6 (SP2).**

- [x] **Fix eagle sprite palette**: ROM `EagleStateUpdate ($E386)` sets $04=3 → SP3 (palIdx 7) for all eagle OAM draws (intact, damaged, explosion). Change game.js `drawEagleBase` from `palIdx=6` to `palIdx=7`. **Done (game.js:1048–1049): palIdx changed 6→7 (SP3).**

- [x] **Fix tank sprite `tileBase` animation frame**: ROM `$DB02 DrawTank2x2` uses `($A8,X & $F0) + dir×8 + animBit×4` where `animBit = $B0,X & 4` (alternates every ~8 frames via XOR). Game.js uses `entityBase + dir*8` with no animation frame offset → always draws frame 0. **Done (game.js:1105–1107)**: Added per-entity `animBit` field (0 or 4) to entity factory; in `moveEntities()`, XOR `e.animBit ^= 4` when `bit 3` of the moving coordinate flips (i.e., `((e.x ^ px) | (e.y ^ py)) & 8`) — mirrors ROM `$DD18`/`$DDE1 EOR #$04` per 8px step. `tileBase` updated to `entityBase + e.dir * 8 + e.animBit`. ROM code verified: `$E0A4–$E0AB` computes `tileBase = ($A8,X & $F0) + $B0,X` where `$B0,X` holds `dir×8 + animBit`; animBit XOR'd at `$DD18` and `$DDE1`.

- [x] **Fix power-up CHR sprite rendering**: currently drawn as colored rectangle + text label. ROM uses 16×16 CHR sprites from sprite bank: type0(Helmet)=$80–$83, type1(Timer)=$84–$87, type2(Shovel)=$88–$8B, type3(Star)=$8C–$8F, type4(Grenade)=$90–$93, type5(1-Up)=$94–$97. Flash uses tiles $3A–$3D. **Done (game.js:1191–1200)**: Replaced `fillRect`+text with `drawSprite16([base, base+2, base+1, base+3], 7, x-8, y-8)` where `base = 0x80 + type*4`. Sprite bank tiles (pt1=false, PNG index=256+T). Removed unused `C.POWERUP` and `C.PU_LABEL` color constants.

- [x] **Fix HUD rendering to use CHR tiles**: HUD enemy kill icons (tile $6A), P1/P2 life icons, and animated HUD tank ($79/$7D OAM entries, SP3 palIdx 7) should use `drawCHRTile`/`drawSprite16` instead of colored rectangles where possible. **Done (game.js:1228–1229, 1290–1291)**: P1 life icon: replaced `fillRect` with `drawCHRTile(0x14, 3, ...)` (BG tile $14, BG3 palette, chrOff fallback preserved). HUD animated tank: added `drawSprite16([0x79, 0x7D, 0x7B, 0x7F], 7, 104, 104, true)` in render() before drawHUD(), visible during 'play'/'start' phases (ROM: visible while $0108≥$0A; init $0105=$0106=$70 → NES pixel 104,104). Kill icons ($6A) were already using drawCHRTile.

---

## Pixel-Perfect Audit — CHR Extraction → Web Rendering

Goal: verify every sprite/tile rendered in game.js matches the ROM pixel-for-pixel. Work through each subsystem in order; mark `[x]` when confirmed correct or fixed.

### 1 — CHR extraction pipeline

- [x] **Audit extract_tiles.py output geometry vs game.js assumptions**: Verified. `python extract_tiles.py` outputs `chr_pt0.png (289x145)` — 32×16 = 512 tiles, cell=9px, border=1px. `make_tile_sheet`: `ox=tx*9+1, oy=ty*9+1`. game.js: `CHR_CELL=9, CHR_BORDER=1`, `sx=tcol*9+1, sy=trow*9+1`. All consistent — no fix needed.

- [x] **Audit CHR bank-to-PNG-index mapping end-to-end**: Verified correct. `extract_tiles.py`: `chr_off = 0x10 + 2×16384 = 0x8010`; `all_tiles[:512]` → `chr_pt0.png`. Tiles 0–255 come from ROM file `$8010–$9010` (BG/PT1 bank per PPUCTRL $B0 bit4=1). Tiles 256–511 come from ROM file `$9010–$A010` (Sprite/PT0 bank). game.js: `pt1=true → t & 0xFE` maps to PNG rows 0–7 (BG bank) ✓; `pt1=false → 256+t` maps to PNG rows 8–15 (sprite bank) ✓. `grayToIdx` round-trip confirmed: `0x00→0, 0x55→1, 0xAA→2, 0xFF→3` with thresholds `0x2B/0x7F/0xD5` — no off-by-one. Eagle tile $D1 (odd→PT1): PNG index = $D1&$FE = $D0 = 208 ✓. Tank tile $00 (even→PT0): PNG index = 256+$00 = 256 ✓. `drawCHRTile` cell lookup `tcol=tileAbs%32, trow=tileAbs//32, sx=tcol*9+1, sy=trow*9+1` consistent with extract_tiles.py `ox=tx*9+1, oy=ty*9+1` ✓. No fixes needed.

- [x] **Audit gray-level encoding round-trip**: Verified. `extract_tiles.py` `write_png` emits only `IHDR+IDAT+IEND` — no `sRGB`, `gAMA`, `iCCP`, or `cHRM` chunks → browsers treat as sRGB by default. Thresholds `0x2B/0x7F/0xD5` sit exactly at the midpoints: (0+85)/2=42.5→0x2B ✓; (85+170)/2=127.5→0x7F ✓; (170+255)/2=212.5→0xD5 ✓. Edge cases: 0x2A→0, 0x2B→1, 0x54→1, 0x56→1, 0x7E→1, 0x7F→2, 0xD4→2, 0xD5→3 — all correct. macOS Color Profile concern: `getImageData` returns values in canvas's logical color space (sRGB), not the display color space; macOS ColorSync affects only physical display rendering. `chrOff = oc.getContext('2d')` (no `colorSpace` arg) defaults to `'srgb'` per Canvas 2D Level 2 spec; both Chrome and Safari treat untagged PNGs as sRGB, so no conversion occurs and values `0x00,0x55,0xAA,0xFF` are returned unchanged. No fix needed.

### 2 — Tank sprite rendering

- [x] **Audit tank 2×2 tile draw order vs ROM `DrawTank2x2 ($DB02)`**: Verified correct. Key finding: **PPUCTRL = $B0 during gameplay** (`$C0A0: LDA #$B0; STA $2000`; bit 7=NMI on, bit 5=1 = **8×16 sprite mode**, bit 4=BG from $1000). ROM uses 8×16 OAM sprites, so DrawTank draws only **2 OAM entries**: (1) tile T at (entity_x-8, entity_y-8) → 8×16 auto-covers left column (T=top, T+1=bottom); (2) tile T+2 at (entity_x, entity_y-8) → right column (T+2=top, T+3=bottom). game.js emulates 8×16 with 4 explicit `drawCHRTile` calls at lines 1118–1121: T→(x-8,y-8), T+2→(x,y-8), T+1→(x-8,y), T+3→(x,y) — all 4 sub-tiles at correct positions ✓. Offsets confirmed: entity x/y are center coords; top-left = (e.x-8, e.y-8) matching ROM `DrawEntityTile` which stores `OAM_Y = Y-8, OAM_X = X-8` (entity_x-8 for left column). `DrawTank2x2` also computes `$53 += ($A0,X & $03)×8`; for enemies this is 0 (no-op); for players `$A0,X & $03` encodes some state bits (star level already baked into `entityBase = e.starLevel` in game.js). No fixes needed.

- [x] **Audit tank `tileBase` formula vs ROM `$E0A4–$E0AB`**: Verified fully correct. **Mask IS `$F0`** (not $FC) — `$E0A6: AND #$F0`. ROM formula: `$53 = ($A8,X & $F0) + $B0,X`; then `DrawTank2x2 ($DB02)` adds `dir×8` via `ASL×3 + ADC $53`. Final: `tile = ($A8,X & $F0) + $B0,X + dir×8`. `$B0,X` is **animBit only** (not dir×8+animBit as old comment said) — initialized to 0 at `EnemySpawn ($E4C3): STA $B0,X`, toggled by `EOR #$04` at `$DDE1` each 8px movement step → values ∈ {0,4}. `entityBase = $A8,X & $F0`: for enemies, `EnemySpawn ($E4AE)` loads `EnemyTypeTable[$80/$A0/$C0/$E0]` into $A8,X → `& $F0 = $80+type×$20` ✓; for players, `EnemySpawn ($E479)` loads `$0101,X` (starLevel = 0/$20/$40/$60) into A, ORs with $A8,X, stores → `& $F0 = starLevel` ✓. game.js `entityBase + e.dir*8 + e.animBit` is **correct**. Fixed misleading comment at game.js:1106.

- [x] **Audit enemy palette per entity type vs ROM `EnemySpeedTable ($E0B7)`**: Verified. Full analysis:
  - **Table** at `$E0B7`: `[02,00,00,01,02,01,02,02]`, indexed by `(($0B<<2) + $A8,X) & 7` (`$E081–$E08D`).
  - **All enemy types ($80/$A0/$C0/$E0) have bottom 3 bits = 0**, so the effective index = `(($0B<<2) & 7)` = either 0 or 4. `Table[0]=2` and `Table[4]=2` — **always SP2 for normal enemies**. No palette cycling occurs in practice.
  - **Power-up tank flash** (`$A8,X & $04` set at `$E455`): code branches at `$E06E–$E072`; palette = `2 + (($0B>>3) & 1)` (`$E074–$E07C`) → toggles SP2↔SP3 every **8 frames**.
  - **Power-up bit origin** (`$E447–$E457`): `$7F` (enemiesLeft) ∈ {3,10,17} → `STA #$04 → $A8,X`. Then `EnemySpawn ($E4AE)` ORs the type base value in, so final `$A8,X` = `(type_base | $04)`.
  - **Bug found**: game.js used `(frameCount >> 2) & 1` (4-frame toggle) instead of `(frameCount >> 3) & 1` (8-frame toggle per ROM). **Fixed** `game.js:1113` and `game.js:1130`: changed `>> 2` → `>> 3`.

- [x] **Audit power-up tank (armor) visual**: Verified. Key findings:
  - **entityBase for type 3 = `$E0`**: ROM `$E4AE` loads `EnemyTypeTable` value, `CMP #$E0 → ORA #$03` only for type 3 → `$A8,X = $E3`. `entityBase = $A8,X & $F0 = $E0` ✓. game.js `0x80 + 3*0x20 = 0xE0` ✓. Tiles `$E0–$EF` (sprite bank, PNG index 256+$E0 to 256+$EF) are correct armor tank sprites.
  - **Armor bits only for type 3**: `$E4B1: CMP #$E0; $E4B3: BNE skip; $E4B5: ORA #$03`. Types 0/1/2 (`$80/$A0/$C0`) get 0 armor bits. **Bug found**: game.js line 408 had `e.type >= 2 ? 1 : 0` — type 2 incorrectly got 1 armor hit. **Fixed** to `e.type >= 3 ? 3 : 0`.
  - **4 total hits to kill type 3**: ROM `$E989: AND #$03; BEQ kill; DEC $A8,X`. Starting at `$E3` (armor bits=3): 3 decrements + 1 kill hit = 4 total. game.js `armorHits=3` with `if armorHits>0: dec; else: kill` also yields 4 total hits ✓.
  - **Type 3 power-up tank**: starts at `$E4` (`$E0 | $04`, no armor). First hit: `PowerUpSpawnPickPos` called, then `$E4 → $E3 → $E2` (2 DECs). Total hits still 4. game.js doesn't special-case this but result is same (armorHits=3 → 4 hits) ✓.

### 3 — Eagle and special sprites

- [x] **Audit eagle tile draw order and offsets vs ROM `$E3E2/$E3EA`**: Verified. **BUG FIXED** — game.js had wrong tile ordering in `intactTiles`/`damagedTiles` arrays.

  **ROM `EagleDrawIntact ($E3E2)`**: Sets `$69=0`, calls `EagleDrawFull ($E3F2)`.
  **ROM `EagleDrawDamaged ($E3EA)`**: Sets `$69=$10`, calls `EagleDrawFull ($E3F2)`.
  **ROM `EagleDrawFull ($E3F2)`**: 4 calls to `EagleDrawSingle ($E3DC)` → `DrawTank ($DB0A)`.
  Each call draws 2 OAM 8×16 entries (left col = X-8, right col = X):
  - Call1: X=$70, Y=$D0, tile=$D1 → OAM (104,200)=$D1, (112,200)=$D3
  - Call2: X=$80, Y=$D0, tile=$D5 → OAM (120,200)=$D5, (128,200)=$D7
  - Call3: X=$70, Y=$E0, tile=$D9 → OAM (104,216)=$D9, (112,216)=$DB
  - Call4: X=$80, Y=$E0, tile=$DD → OAM (120,216)=$DD, (128,216)=$DF

  **Correct tile grid (intact, $69=0)**:
  ```
  OAM_Y=200: col104→$D1, col112→$D3, col120→$D5, col128→$D7
  OAM_Y=216: col104→$D9, col112→$DB, col120→$DD, col128→$DF
  ```
  Damaged (+$10): $E1,$E3,$E5,$E7 / $E9,$EB,$ED,$EF

  **game.js had**: `[0xD1,0xD5,0xD9,0xDD, 0xD3,0xD7,0xDB,0xDF]` (wrong — tiles were interleaved by 4, misplacing all but col0)
  **Fixed to**: `[0xD1,0xD3,0xD5,0xD7, 0xD9,0xDB,0xDD,0xDF]` (correct consecutive left-to-right order)

  OAM_X positions: [ex-16, ex-8, ex, ex+8] = [104,112,120,128] ✓
  OAM_Y positions: [ey-16, ey] = [200, 216] ✓  palIdx=7 (SP3) ✓
  Eagle handler table at `$E3BA` (6 entries): NullHandler($DC9E), EagleExplosion1($E3C6), EagleExplosion2($E3CB), EagleExplosion3($E3D0), EagleDrawIntact($E3E2), EagleDrawDamaged($E3EA).

- [x] **Audit eagle explosion tile sequence vs ROM `$E3C6/$E3CB/$E3D0`**: **FIXED** — game.js had no eagle explosion animation at all; gameover triggered immediately on eagle hit. ROM uses `$68` (eagleExpTimer=39→0) driving `EagleStateUpdate ($E386)` each frame: phase = `||(($68>>2)-5)|-5|` → 0=null/1=Expl1/2=Expl2/3=Expl3/4=intact/5=damaged. Explosion phases draw a 16×16 sprite (2 OAM 8×16 entries) at `(ex-8, ey-8)` = `(112,208)`: left-col OAM tile $F1/$F5/$F9 → CHR tiles $F0,$F1 (top/bot); right-col OAM tile $F3/$F7/$FB → CHR tiles $F2,$F3 (top/bot). Full 39-frame sequence: Expl1(3f)→Expl2(4f)→Expl3(4f)→Intact(4f)→Damaged(4f)→Intact(4f)→Expl3(4f)→Expl2(4f)→Expl1(4f)→Null(4f). Gameover delayed until timer=0. Added `eagleExpTimer` state, `eagleAnimPhase()` helper, updated `drawEagleBase`, `tickTimers`, `bulletTileCollision` eagle-hit handler, and gameover check.

### 4 — Spawn and bullet explosion

- [x] **Audit spawn animation 8×16 tile draw vs ROM `DrawShootSprite ($E0BF)`**: **VERIFIED CORRECT** — ROM draws TWO 8×16 OAM entries (not one), via `DrawTank ($DB0A)` → `DrawEntityTile ($DABA)` called twice. Left entry: OAM_X = entity_x−8, OAM_Y = entity_y−8, tile=T (8×16: top=T&$FE, bottom=(T&$FE)+1). Right entry: OAM_X = entity_x, OAM_Y = entity_y−8, tile=T+2 (8×16: top=(T+2)&$FE, bottom=(T+2)&$FE+1). Entity X/Y from $90,X/$98,X (confirmed: `STA $90,X/$98,X` in PlayerRespawn $E422/$E427). Palette $04=3 → SP3. **sx = e.x − 8** (not e.x − 4; the sprite is 16px wide), **sy = e.y − 8** ✓. game.js lines 1145–1150 draw exactly this: tl=T&$FE, tr=(T+2)&$FE, at (sx,sy),(sx+8,sy),(sx,sy+8),(sx+8,sy+8) — **no changes needed**.

- [ ] **Audit bullet explosion position vs ROM `BulletExplode ($E1AF)`**: ROM draws one 8×8 OAM sprite at tile `($B1 + dir×2) & $FE`, palette SP2, position `bullet_x - 5` (X offset) and `bullet_y - N` (Y offset, check exact value). game.js draws at `b.ex, b.ey` — verify these match ROM pixel offsets. Disassemble `$E1AF` and extract the hardcoded OAM X/Y adjustments.

### 5 — Power-up sprites

- [ ] **Audit power-up 16×16 tile order vs ROM `$C9BB` OAM writes**: ROM writes 4 OAM entries for each power-up icon. Extract the exact tile order from `$C9BB` disassembly. game.js uses `drawSprite16([base, base+2, base+1, base+3], 7, x-8, y-8)` — verify this tile ordering and `[base, base+2, base+1, base+3]` matches ROM OAM layout (top-left, top-right, bottom-left, bottom-right).

- [ ] **Audit power-up flash tiles vs ROM**: ROM flash animation uses tiles `$3A–$3D`. Verify these are in the sprite bank (PT0, PNG index 256+$3A = 314+). Check `tile_viewer.html` that tiles 314–317 show a valid flash pattern.

### 6 — HUD rendering

- [ ] **Audit P2 life icon tile**: ROM draws P2 life icon using BG tile `$14` same as P1 (or a different tile). Disassemble `$C79F/$C7AE DrawAllHUDKillIcons` fully to confirm P2 life icon tile index and position. game.js only draws P1 life icon (`drawCHRTile(0x14, 3, ...)`); if P2 icon uses a different tile or position, add it.

- [ ] **Audit HUD kill icon spacing and tile $6A position**: ROM `DrawAllHUDKillIcons ($C7BD)` writes to PPU nametable address `$22D2`. Map this to pixel coordinates: nametable $22xx = right panel; `$22D2 = base $2000 + $02D2` → row `$02D2 / 32 = 22`, col `$02D2 % 32 = 18` → pixel (144+18×8, 176+22×8)? Verify game.js HUD x/y offsets and 9px spacing match the nametable tile grid exactly.

- [ ] **Audit HUD animated tank position and tile order vs ROM `DrawHUDTanks ($C7CD)`**: ROM draws at pixel positions derived from `$0105/$0106` initialized to `$70,$70` = (112,112) — but with the 4-directional wiggle delta at `$D2C6/$D2CA`. Disassemble `$C7CD` to get exact OAM tile indices `$79/$7B/$7D/$7F` and X/Y positions. Compare with game.js `drawSprite16([0x79, 0x7D, 0x7B, 0x7F], 7, 104, 104, true)` — the X=104 may be wrong (ROM init = $70 = 112).

### 7 — BG terrain tiles

- [ ] **Audit all 13 TILE_CHR entries vs ROM `TileCHRTable ($DB79)`**: Dump 52 bytes at `$DB79` with `decode_tables.py 1 DB79 13 u32` (or 52×u8). Compare each 4-byte group against `TILE_CHR` in game.js line ~145. Flag any mismatch. Session 19 confirmed correct but re-verify after the PT0/PT1 swap fix.

- [ ] **Audit brick partial-quad rendering**: ROM tracks which 8×8 sub-tiles of a brick metatile are intact via the nametable shadow bits. game.js uses `BRICK_QUAD` with tile `$0F` for each quadrant. Verify from tile_viewer.html that tile `$0F` (BG bank) is indeed the solid brick sub-tile and that the 4 brick destruction variants (3 bricks, 2 bricks, etc.) are rendered correctly.

### 8 — Coordinate system

- [ ] **Audit NES OAM coordinate mapping to canvas**: NES OAM Y field is `sprite_y - 1` (sprite top pixel = OAM_Y + 1); OAM X is the left pixel. NES play field is 256×240 but HUD occupies right 64px → game area is 192×208 effective. Canvas is scaled by `SCALE`. Verify game.js entity coordinates (center-based) are correctly converted to top-left for `drawCHRTile` calls, and that the HUD panel starts at canvas X=192 (pixel 192).

- [ ] **Visual side-by-side comparison**: Load the web version at `localhost:8000` and take a screenshot. Load the ROM in an NES emulator (FCEUX/Mesen). Compare pixel-by-pixel for: (a) tank sprites at all 4 directions, (b) eagle intact/damaged/exploding, (c) spawn animation, (d) power-up icons, (e) bullet explosion, (f) HUD icons. Document any remaining visual differences as new tasks.

### Completed
- [x] **Session 14**: CHR bank mapping fully verified and documented: tiles 0–255 = file $8010 = PPU $1000 = BG/PT1; tiles 256–511 = file $9010 = PPU $0000 = Sprite/PT0. Fixed long-standing documentation error in CHR-ROM Layout table (PPU $0000/$1000 were swapped). Created `web/tile_viewer.html` — 512-tile viewer with NES palette selector, hover tile info, and category color-coding for visual verification of all sprite assignments.
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
