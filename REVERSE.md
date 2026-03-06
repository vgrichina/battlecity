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
| $C159–$C1C4 | — | ~108 | code | InterStageScreen: $4D=4 (palette 4); JSR CurtainClose($CC90); loop: JSR DrawStageInter($CA91); A-held(every 8fr)→INC $85; B-held→DEC $85; $85 wraps 1-35; Start/timeout($4C≠0)→$C1C5 |
| $C1C5–$C1FF | — | ~59 | code | StageStartSetup: sets up nametables, JSR $F000 (load stage?), JSR ConstructionSetup or $CB5D, then JSR $CC27/$CCB2, clear $0C, enable PPU |
| $C1C5–$C222 | — | ~94 | code | StageStartSetup + GameLoop: ConstructionSetup; $F000(A=$85) load tilemap; $CAF5 HUD; $C331 spawn; game loop at $C1F9 (WaitVBlank+ticks+CheckGameOver) |
| $C2BD–$C2E5 | — | ~41 | code | GameVarsInit: clears $66/$67/$4C; STA $51=$52=$6A=3; 1P→$52=0; STA $85=1; STA $46=0 |
| $C2E6–$C31C | — | ~55 | code | GameTickMain: 14+ subsystem JSR calls per frame (enemy AI, movement, collision, spawn, sound) |
| $C331–$C3B4 | — | ~132 | code | StageStartInit: clear entity tables; spawn P1/P2; set enemies=20; calc SpawnDelayBase=$BE-(stage×4); 2P:-20 |
| $C3B5–$C41C | — | ~104 | code | StagePlay: new-game var init; blank map load ($F000/FF); draw STAGE sprites; entity init; StageStartInit; HUD |
| $C41D–$C44A | — | 46 | code | GameOverLoop: post-game animation loop; WaitVBlank+GameTickMain ticks until Start/Select pressed |
| $C44B–$C623 | — | ~472 | code | HiScoreEntryScreen: new hi-score entry; draws label+value; palette flash loop ($4D=($0B&3)+5); waits input; called from $828C when UpdateHiScore Y≠0 |
| $C5D9–$C623 | — | ~75 | code | GameOverBrickScreen: STA $4D=3; LDA #$1C STA $05 (PPU addr offset: $12+$05=$20→$2000, NOT a tile index); WriteNametable→CPU $0400-$07FF=$00; InitEntities copies to PPU $2000→blank black BG; draw GAME/OVER big-text sprites; hold until Start/Select |
| $C624–$C641 | — | 30 | code | GameOverWaitLoop: WaitVBlank; check Start/Select; check $0318≠0; exit: ClearSpriteBuf+WriteNametable+InitEntities+WaitNMI+APUSoundInit+RTS |
| $C728–$C754 | — | ~45 | code | CheckGameOver: returns A=1 if $68=0 (eagle destroyed), $80=0 (stage clear), or $51+$52=0 (all lives lost) |
| $C7AB–$C7C7 | — | 29 | code | TitleWaitLoop |
| $8728–$8754 | — | ~45 | code | ShovelAnimInitCheck: if $68=0 (eagle dead) → set $0105=$70/$0106=$F0/$0107=0/$0108=$11 (init ShovelAnimTick spiral); elif $80=0 (stage clear) → fall through; elif $51+$52=0 → RTS A=0; else → RTS A=1 |
| $8225–$8258 | — | ~52 | code | PostGameAnimLoop: clears $0A/$0B; loop: WaitVBlank+GameTickMain+$E23B+$DEA6+$E0D8+PaletteFlashTick until $0A=2 (~128fr); then APUSoundInit; JSR ResultScreen($CCD4) |
| $8259–$8292 | — | ~58 | code | StageAdvance2P + GameOverBranchCheck: INC $85 (cycle stages 1–70); if $51+$52=0 or eagle dead → JSR GameOverBrickScreen($C5D9); JSR UpdateHiScore; if Y≠0 JSR HiScoreEntryScreen($C44B); JMP $C095 (return to title) |
| $8CD4–$8E?? | — | ~400 | code | ResultScreen: stage-clear/game-over tally screen entry; sums $73–$76 (P1 kills/type) → $7D; $77–$7A (P2 kills/type) → $7E; calls $CEF7 (static strings) + $D0B8 (eagle-star sprites); per-type loop $5A=0–3: decrements kill counts, adds score via AddScoreDigits, draws with FindFirstNonZeroScore+DrawNametableTextOffset; total kills at row 23 col 8+skip. Timing: per-kill tick $CDD8 LDX #$08 (8fr); inter-row pause $CDEC LDX #$14 (20fr); total-row hold $CDF4 LDX #$1E (30fr); final exit $CEE5 LDX #$78 (120fr). |
| $CEE5–$CEF6 | — | 18 | code | ResultScreenExit: LDX #$78 JSR WaitFrames (120fr hold); clear $50/$60/$6B/$4D=0; RTS |
| $CEF7–$D0B7 | — | ~450 | code | ResultScreenInit: draws all static strings for result screen; sets $6B=1/$05=$24/$60=$30/$4D=3; HI-SCORE(col8/row3), STAGE(col12/row5), I-PLAYER(col3/row7), $5B-arrows(col14/rows 12/15/18/21), PTS(col8/rows 12/15/18/21), separator(col12/row22), TOTAL(col6/row23); 2P adds II-PLAYER+$5D-arrows |
| $D276–$D283 | — | 14 | code | WaitFrames: X=count; loop JSR WaitVBlank + JSR $D0B8; DEX; BNE loop; RTS. Generic frame delay. |
| $D138–$D169 | — | 50 | code | BonusLifeCheck: 2P only; if $66=0 and $17≥2 → INC $51/$66; elif $67=0 and $1F≥2 → INC $52/$67; if awarded STA $0304/$0305=1 (bonus-life indicator). |
| $9E48–$9E54 | — | ~13 | code | ShovelPowerupActivate: STA $0108=$0D; STA $0106=$D8; STA $0B=0; RTS — activates ShovelAnimTick countdown |
| $C9B0–$C9BF | — | 16 | code | ConstructionSetup |
| $C9C0–$CA8F | — | ~208 | code | PlayerSelectLoop + helpers (CA6F=Start1P, CA74=Start2P, CA7E=StartConstruction, CA85=UpdateCursorSprite, CA91=DrawStageInter) |
| $CC5C–$CC8F | — | ~52 | code | WriteNametableRow: Y=row → writes 32-tile row to PPU via $0180 buffer; $63!=0 → fill with $63; $63=0 → copy from shadow RAM ($0400-$05FF) |
| $CC90–$CCB1 | — | ~34 | code | CurtainClose: $63=$11; $57=0→$0F loop; JSR WriteNametableRow(row)+WriteNametableRow(29-row) per WaitVBlank; fills all 30 rows with tile $11 (steel). Called from InterStageScreen with palette 4 active. |
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
| $D50E–$D53D | — | 48 | code | PaletteUpdate: A=$4D (index 0-8); X=A×16; Y=$10; set PPU $3F00; write 16B from BGPaletteTable($D565)+X; set $4D=$FF. Called from NMI when $4D≥0 (bit7=0). |
| $D53E–$D554 | — | 23 | code | SpritePaletteInit: X=0; Y=$10; set PPU $3F10; write 16B from SpritePaletteData($D555). One-time init at startup. |
| $D555–$D564 | — | 16 | data/palette | SpritePaletteData: 4 sub-palettes×4 NES colors → PPU $3F10–$3F1F. SP[0]=0F 18 27 38, SP[1]=0F 0A 1B 3B, SP[2]=0F 0C 10 20, SP[3]=0F 04 16 20. |
| $D565–$D5F4 | — | 144 | data/palette | BGPaletteTable: 9×16 bytes; indexed by $4D (0-8); written to PPU $3F00–$3F0F. Sets: 0=in-game, 1/2=game-mode variants, 3=player-select/game-over screen, 4=title animation, 5-8=flash animation (loop at $8486 writes $4D=($0B&3)+5 cycling through four flash palettes). |
| $D5F5–$D5FA | — | 6 | code | WaitVBlank2: LDA $2002; BPL loop (spin for VBlank bit7). Mirror of $D8F6. |
| $D5FB | — | — | code | CalcNametableAddr: Y=row(0-29), X=page(0/1) → A=hi, Y=lo of RAM shadow addr ($04xx–$05xx) |
| $0400–$05FF | — | 512 | RAM | Nametable RAM shadow: 30 rows × 32 cols = 960 bytes at $0400–$05BF; WriteNametableByte ($D784) writes here and queues to VRAM flush buffer |
| $D689 | — | — | code | ReadControllers (mirror of $9689; reads $4016/$4017 → $06-$09; called from NMI; was mislabeled as SoundUpdate) |
| $D6B3–$D705 | — | ~83 | code | DrawNametableText variants |
| $D7B4 | — | — | code | InitEntities |
| $D7CC | — | — | code | ClearEntitySlots |
| $D8D2–$D8F5 | — | 36 | code | DrawSpriteString |
| $D8F6–$D8FC | — | 7 | code | WaitVBlank |
| $D8FD–$D933 | — | ~55 | code | VRAMNametableFlush: terminates VRAM write buffer at $0180[$0C]; iterates triplets (addrH, addrL, data) writing to PPU via $2006/$2006/$2007; resets $0C=0. NOT sprite-related — flushes buffered nametable tile writes each NMI. |
| $D951–$D97C | — | ~44 | code | DrawHiScore: draws hi-score from $3D–$43 buffer; skips leading-zero digits; $60=$30 tile offset; uses DrawSpriteString. |
| $D97D–$D9BD | — | ~65 | code | UpdateHiScore: compare P1 ($15–$1B) then P2 ($1D–$23) against hi-score ($3D–$43); if new record copy to $3D; return Y=1/Y=$FF/Y=0. Called at $8286 post-game. |
| $D9BE–$D9E0 | — | ~35 | code | AddScoreDigits: X=player index (0=P1,1=P2); adds 7-digit scratch score $35–$3B into $15+X*8 with decimal carry; handles result screen kill bonuses too. |
| $D9E1–$D9FD | — | ~29 | code | SetupScoreDigits: A=BCD byte; clears $35–$3B; A=0→$38=1(1000pts); else hi-nibble→$39(hundreds),lo-nibble→$3A(tens). Called before AddScoreDigits. |
| $D9FE–$DA12 | — | ~21 | code | InitEntitySlot (X=slot): zero $00,X..$06,X; set $07,X=$FF (inactive/type marker). |
| $DA13–$DA2A | — | ~24 | code | Div10 helper: converts A to decimal (quotient→$3A, remainder→$3B). |
| $DA2B–$DA92 | — | ~104 | code | Sprite helper routines (coord conversion, SetSpriteXY, misc). |
| $DA93–$DAAC | — | 26 | code | HideSpritePairs: $0D=OAM write ptr, $0E=stride(4). Negates $0E; loops backwards from $0D-4 to OAM+4, writing Y=$F0 (off-screen) at each slot. Updates $0D=4. Hides all unused OAM entries each NMI frame. Identical copy at $9A93. |
| $9A47–$9A63 | — | ~29 | code | WriteSpriteToOAM: writes 4-byte OAM entry at $0200[$0D]: Y=$48, tile=$53, attr=$04, X=$47; advances $0D+=$0E (stride=4). |
| $9A93–$9AAC | — | 26 | code | HideSpritePairs2: identical copy of $DA93 (NROM-128 mirror region duplicate). |
| $E413 | — | — | code | ClearEntitySlots2: clears $A0-$A7 and $0103-$010A (8 entity slots) |
| $EA51–$EA7D | — | ~45 | code | APUSoundInit: STA $4015=$0F (enable sq1+sq2+tri+noise); STA $4017=$C0 (5-step, no IRQ); zero 28 channel blocks at $031C–$03FB and $0300–$031B |
| $EA7E–$ECAD | — | ~560 | code | SoundEngineTick: NMI-called every frame. $6D=PAUSE flag (0=normal→28ch, 1=paused→1ch). Two-pass: Pass 1 ($EA8C) APU register write with priority ($F9 tracking, lower slot wins); Pass 2 ($EB11) sequence processing with 1-frame write delay. Command dispatch via jump table at $EBE6. |
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
| $DC7C–$DC96 | — | ~27 | code | EntityMovementAI fast path: if enemy AND posX&7=0 AND posY&7=0 AND PRNG&$0F=0 → JSR SpeedCtrlMove; RTS (no move/animBit). Otherwise fall to $DC97. |
| $DC97–$DD0E | — | ~120 | code | EntityMovementAI collision check: dir=$A0,X&3; $58=DirDeltaX[dir]×8 $59=DirDeltaY[dir]×8 (probe offsets, NOT movement delta); $56=posX+dX $57=posY+dY (1px step); 2-probe nametable test via $DD6E/$DD76; if passable→update pos + fall to $DD29. **No entity-entity collision** — tanks can freely overlap (confirmed: no $90/$98 cross-slot comparisons in movement path). |
| $DD11–$DD2F | — | ~30 | code | EntityMovementBlocked: player(X<2)→BCC $DD29(toggle animBit); enemy: PRNG&3=0→$DD30(25% flip180°,no animBit); else bump sound+set bit3+toggle animBit($DD29). |
| $DD29–$DD2F | — | 6 | code | AnimBitToggle: LDA $B0,X; EOR #$04; STA $B0,X. Reached from passable path and 75% blocked-enemy path. NOT reached from 25% flip path. |
| $DD30–$DD47 | — | 24 | code | BlockedFlipDir (25% of blocked enemies): check grid-align for sound gate only; always EOR $A0,X #$02 (flip dir 180°); RTS without animBit toggle. |
| $DD48–$DD6D | — | ~34 | code | RandomDirChange: entity state handler for states $90-$9F. PRNG&1=0→SpeedCtrlMove(50%); else PRNG&1→dir+1(25%) or dir-1(25%). |
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
| $E8BA–$E8BD | — | 4 | data | EnemyScoreTable[4]: BCD score per enemy type (in-game kills $A81E): $10=100, $20=200, $30=300, $40=400 pts |
| $D3B1 | — | 2 | data/string | str_CursorArrow: [$5B $FF] — cursor/arrow glyph used as row-pointer on result screen (col 14) and player-select cursor |
| $D3B3 | — | 2 | data/string | str_RightArrow: [$5D $FF] — right-pointing arrow; drawn at col 17 in 2P result screen rows |
| $D3B5–$D3BA | — | 6 | data/string | str_Total: "TOTAL" + $FF — drawn at col=6/row=23 on result screen |
| $D3BB–$D3C2 | — | 8 | data/string | str_Separator: 7× tile $5C + $FF — horizontal-rule separator at col=12/row=22 on result screen |
| $D3CB–$D3CF | — | 6 | data/string | str_Stage: "STAGE" + $FF — drawn at col=12/row=5 on result screen |
| $D3D1–$D3D4 | — | 4 | data | ResultEnemyScoreTable[4]: same BCD values used on result screen ($8D1C): $10/$20/$30/$40 = 100/200/300/400 pts |
| $E578–$E603 | — | 140 | data | StageEnemyCountTable: 35×4 bytes; enemy type counts per stage (always sum to 20); loaded into $8B-$8E |
| $E604–$E68B | — | ~136 | code | BulletTerrainCollision: loops slots 9→0; if $CC,X&$F0=$40 (active): compute next pos ($B8+EA49[dir]×4, $C2+EA4D[dir]×4); JSR BulletHitCheck ($E693) |
| $E693–$E70B | — | ~121 | code | BulletHitCheck: get nametable ptr; read tile; returns A=1 (brick hit: ClearTileBit, SFX $030C, triggers B/D probes) or A=0 (all other cases). Steel ($10): sets $CC,X=$33 (stop) then returns A=0 (no B/D probe). Eagle ($C8/$CC): sets $68=$27+$CC=$33+SFX $030B, returns A=0. Tile >= $12 (water=$12/ice=$21/forest=$22): BCS $E709 → A=0, no stop (bullets pass through). Armor-pierce (D6 bit1): erases steel tile, returns A=0. |
| $E70C–$E77A | — | ~110 | code | EnemyBulletPlayerCollision: loops players 0-1; scan enemy bullets 7→2; proximity check <10px; if hit+no-invincibility: kill player, DEC lives |
| $E910–$E971 | — | ~98 | code | BulletBulletCollision: for slots where $5A&$06==0 (player-owned): inner loop Y=9→0; if |$B8,X-$B8,Y|<6 and |$C2,X-$C2,Y|<6: destroy both bullets |
| $E972–$E9E0 | — | ~111 | code | PowerupCollectTick: checks entity proximity to powerup pos ($86/$87); on pickup: $62=50 duration; adds 500pts; triggers powerup effect |
| $EA49–$EA4C | — | 4 | data | BulletDirDX[4]: bullet X delta per direction (0/-1/0/+1) |
| $EA4D–$EA50 | — | 4 | data | BulletDirDY[4]: bullet Y delta per direction (-1/0/+1/0) |
| $E181–$E1F9 | — | ~121 | code | EntityTileRead: for each active entity, reads nametable ptr at (X-8,Y-8) via $D706 → $E0,X/$E8,X; detects ice tiles |
| $E1FA–$E239 | — | ~64 | code | EntityTileRestore: for each active entity, restores background tile bytes (clear bit7) at offsets $21/$20/$01 |
| $E02E–$E12D | — | ~256 | code | BulletStateMachine: loops 9→0; dispatches bullet state via $E4D8 table; handles move/countdown/explosion states |
| $E4D8–$E4E1 | — | 10 | data | BulletDispatch[5×ptr16]: bullet state dispatch table; indexed by ($CC>>3)&$FE |
| $E2A9–$E27B | — | ~210 | code | ShovelEagleTick: shovel timer countdown + eagle damage animation via $E306 table |
| $E27C–$E2A8 | — | ~45 | code | InvincibilityTick: loops players; if $89,X: DEC/64 frames; draw shield sprite |
| $E122–$E161 | — | ~64 | code | PlayerFireTick: loops players; on A/B press, fire bullet via $E08C; power tank supports 2-bullet save/restore |
| $E162–$E180 | — | ~31 | code | EnemyFireTick: loops enemy slots 7→2; PRNG&$1F==0 → JSR FireBullet |
| $DB0B–$DB47 | — | ~61 | code | PlayerActiveCheck: checks $06/$07 directional bits + $A0,X≠0; sets $0311=1 if only P1 pressing direction |
| $C7C8–$C971 | — | ~426 | code | LivesDisplayTick + related HUD routines: draw P1/P2 life count sprites |
| $C972–$C9AF | — | ~62 | code | ShovelAnimTick: if $0108 countdown active: update eagle-border tiles from $D3D5/$D3D9 table; JSR $C947 |
| $D3D5–$D3D8 | — | 4 | data | ShovelTileDX: X offsets for shovel eagle-border tile animation |
| $D3D9–$D3DC | — | 4 | data | ShovelTileDY: Y offsets for shovel eagle-border tile animation |
| $D706–$D71D | — | ~24 | code | GetNametablePtr + PixelToTile: pixel(X,Y)→tile(col,row) (>>3 each) → nametable addr in $11/$12 |
| $D784–$D7A9 | — | ~38 | code | WriteNametableByte: STA($11),Y + buffer triplet to VRAM flush queue ($0180+$0C×4) for NMI |
| $D743–$D783 | — | ~65 | code | ClearTileBit + related: clears specific tile bits (partial brick destruction) |
| $E306–$E361 | — | ~92 | data/code | EagleAnimTable: ptr16 dispatch table for eagle damage animation routines |
| $C050–$C06F | $0050–$006F | 32 | data/string | DevSignature2: ASCII "TAKEFUMI HYOUDOU JUNKO OZAWA    " (additional developer names) |
| $C070–$C09B | $0070–$009B | 44 | code | ResetEntry: PPU warmup loops; TXS $7F; JSR Init; clear $4F/$50; JSR WaitNMI; JSR DrawTitleScreen; STA $4B=0; fall into MainLoop |
| $C0BE–$C158 | $00BE–$0158 | 155 | code | ConstructionMainLoop: JSR ClearEntitySlots2; init cursor entity $90/$98/$A0=$84; loop: WaitVBlank; handle d-pad movement via $C6D2; A-button→PlaceTileBlock($C6C6) with $5C cycling 0–13 (tile types); B-button→cycle $5C; Start→exit to PlayerSelectLoop ($C0A2) with $4B=1 |
| $C642–$C6C1 | $0642–$06C1 | 128 | code | ConstructionAITarget: scans powerup ($86/$87) then entity slots $A2–$A5 for active enemies; calls CalcDirToTarget ($DDA2); maps result via $C6C2 direction table → sets $06/$08 direction bits. Used by construction cursor auto-move |
| $C6C2–$C6C5 | $06C2–$06C5 | 4 | data | ConstructionDirTable: direction byte lookup [4]; indexed by CalcDirToTarget result |
| $C6C6–$C6D1 | $06C6–$06D1 | 12 | code | PlaceTileBlockFromCursor: LDA $5C AND #$0F → PlaceTileBlock($D80B) at cursor pos ($90,$98); RTS |
| $C6D2–$C71D | $06D2–$071D | 76 | code | ConstructionCursorMove: d-pad held detection ($7B counter, threshold $14=20fr); calls $E451 (direction decode); moves cursor ×16px via ShovelTileDX/DY table |
| $C71E–$C727 | $071E–$0727 | 10 | code | ClearKillCounts: X=7→0; STA $73,X=0; clears P1/P2 per-type kill counts ($73–$7A) |
| $C755–$C7AA | $0755–$07AA | 86 | code | ConstructionConfigDisplay: draws score digits at nametable; handles A(+$10)/B(DEC)/Select(INC) on $0109 config value |
| $CB5E–$CC07 | $0B5E–$0C07 | 170 | code | ConstructionEagleWallDraw: draws eagle-area brick/steel tile patterns to nametable using DrawNametableText; writes attribute table bytes at $07F3/$07F4 for eagle area palette |
| $CC08–$CC26 | $0C08–$0C26 | 31 | code | ConstructionEagleWallDraw2: second variant; draws eagle patterns at col=14/rows 26-27; writes attr $07F3=$3F, $07F4 OR $33 |
| $CC27–$CC5B | $0C27–$0C5B | 53 | code | InitAttrTable: writes 64 attribute bytes from RAM $07C0 to PPU $23C0 via VRAM flush buffer; loops Y=0→$3F |
| $CCB2–$CCD3 | $0CB2–$0CD3 | 34 | code | InitNametableFromRAM (curtain open): $63=0; rows $0F→0: WriteNametableRow(row)+WriteNametableRow(29-row); copies RAM shadow to PPU nametable |
| $D284–$D33E | $1284–$133E | 187 | data/strings | StringTable2: "WRITTEN BY"/$D284, NAMCOT tiles/$D28F, "BATTLE"/$D299, "CITY"/$D2A0, player indicators/$D2A5-$D2B0, "HI-"/$D2B1, "HISCORE"/$D2B5, "HI-SCORE"/$D2BD, "1 PLAYER"/$D2C6, "2 PLAYERS"/$D2CF, "I-PLAYER"/$D2D9, "II-PLAYER"/$D2E2, "CONSTRUCTION"/$D2EB, copyright/$D2F8, "THIS PROGRAM WAS"/$D30F, "ALL RIGHTS RESERVED"/$D320, "OPEN-REACH"/$D334 |
| $D33F–$D36C | $133F–$136C | 46 | data/strings | StringTable3: "."/$D33F, stage-number/$D341, "GAME"/$D343, "OVER"/$D348, "WHO LOVES NORIKO"/$D34D (Easter egg), "PTS"/$D35E, HUD tile pairs/$D362-$D36A, steel tile/$D36B |
| $D36D–$D3A4 | $136D–$13A4 | 56 | data | EagleWallTilePatterns: 6×4 brick-wall rows ($D36D: empty/$0F-brick/$C8-$CB eagle tiles, FF-terminated); 6×4 steel-wall rows ($D390: $10-steel variant); eagle tile pairs ($D3A5: $C8/$CA top, $D3A8: $C9/$CB bottom, $D3AB: $CC/$CE, $D3AE not here) |
| $D3DD–$D3FF | $13DD–$13FF | 35 | data/pad | $FF padding (all bytes = $FF) |
| $DD6E–$DD7D | $1D6E–$1D7D | 16 | code | CollisionProbeHelpers: two 8-byte routines; CMP $56/$57 collision boundary checks used by EntityMovementAI |
| $DD7E–$DDA1 | $1D7E–$1DA1 | 36 | code | AITargetSelect: three entry points selecting target coords → $71/$72: $DD7E=target P1($90/$98), $DD89=target P2($91/$99), $DD94=target eagle($78/$D8); all JMP CalcDirToTarget($DDA2) |
| $DDA2–$DDE4 | $1DA2–$1DE4 | 67 | code | CalcDirToTarget: computes direction from entity X to target ($71/$72); uses abs-delta weighting; players(X<2) use frame-based randomization; enemies use PRNG; indexes DirToStateTable($E486) |
| $DDE5–$DE54 | $1DE5–$1E54 | 112 | code | CalcDirToTarget continued + AI helpers: direction state calculation tail; lookup from $E486 table |
| $DE72–$DEA5 | $1E72–$1EA5 | 52 | code | SpeedCtrlMove: AI goal selector; $84>>2 vs $0A → phase1=$B0(chase eagle), phase2=random dir, phase3=$C0/$D0(chase player); JSR $E420 |
| $DEA6–$DEB7 | $1EA6–$1EB7 | 18 | code | EntityDrawLoop: loops $5A=0→7; JSR $DEB8 per entity; renders all entity sprites |
| $DEB8–$DF98 | $1EB8–$1F98 | 225 | code | EntitySpriteRender: dispatches entity sprite drawing via ($E4B8) table based on $A0,X state; includes spawn blink, death explosion, tank quadrant sprite rendering |
| $DF99–$DFB5 | $1F99–$1FB5 | 29 | code | CalcEntityTileIndex: computes CHR tile index from entity type ($A0) and direction; returns tile in $53, coords in X/Y |
| $DFB6–$E02D | $1FB6–$202D | 120 | code | EntitySpriteAttrCalc: enemy blink ($A8 bit2), powerup-carrier color cycling ($A8+$0B), armor-tier sprite offset; feeds into sprite quadrant drawing |
| $E23B–$E27B | $223B–$227B | 65 | code | PowerupSpriteDraw: if $86≠0 and $62(timer)≠0: DEC $62; draw powerup sprite ($88=type→tile $81+type×4) at ($86,$87); if $62=0 clear $86. Blinks every 8 frames |
| $E486–$E497 | $2486–$2497 | 18 | data | DirToStateTable: 2×9 direction lookup; indexed by CalcDirToTarget delta signs |
| $E498–$E4B7 | already mapped | — | — | (EntityStateTable — already in map) |
| $E4B8–$E4EB | $24B8–$24EB | 52 | data | EntitySpriteDispatch: 16×ptr16 table; sprite rendering dispatch indexed by entity state ($A0>>3)&$FE |
| $E8BE–$E90F | $28BE–$290F | 82 | code | PowerupSpawn: STA $0309=1(SFX); PRNG→$86/$87 (random position via $E902 grid-snap helper); PRNG→$88(type 0-7 from $E8FA table); clears $62; JSR PowerupCollectTick; restores $5A/$5B; RTS |
| $E8FA–$E901 | $28FA–$2901 | 8 | data | PowerupTypeTable[8]: powerup type weights [0,1,2,3,4,5,4,3] |
| $E902–$E90F | $2902–$290F | 14 | code | PowerupGridSnap: A=PRNG&3 → grid-snapped pixel coord (A×10+6)×2 |
| $E9E2–$EA48 | $29E2–$2A48 | 103 | data/code | PowerupEffectTable: 5×ptr16 dispatch ($E9E2); handlers: $E9F0=SetInvincibility(A=$0A→$89,X); $E9F5=FreezeEnemies($0100=$0A); $E9FB=ShovelActivate(JSR $CB9E+$45=$14); $EA07=UpgradeArmor($0101,X += $20); $EA17=KillAllEnemies(loop $A0+7→2, set $73=death); $EA3E=ExtraLife(INC $51,X; set $0304/$0305=1) |
| $ED36–$EFFF | $2D36–$2FFF | 714 | data | SoundSequenceData: 28 channels of note/SFX sequence data; referenced by ChannelPtrTable ($ECFE); not valid code (illegal opcodes throughout) |
| $FD45–$FFF9 | $3D45–$3FF9 | 693 | data | ConstructionDefaultMap + padding: $9D+9×$FF header; ~513 bytes of $2E/$40 grid data (construction mode default map template?); trailing $FF padding to vectors. Only 3 unique tile values ($00/$2E/$40). No xrefs found — may be unreferenced remnant |
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
| $6D | PauseFlag | PAUSE flag: 0=normal gameplay, 1=paused. Toggled by Start button (EOR at $8214). When 1: GameTickMain ($C2E6) is skipped ($81FC); SoundEngineTick processes only 1 channel/frame ($EA7E). Set to 0 at stage setup ($8163); set to 1 at construction setup ($83B5). |
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
| $B8,X | BulletPosX[] | Bullet X pixel position per slot (array $B8–$BF) |
| $C2,X | BulletPosY[] | Bullet Y pixel position per slot (array $C2–$C9) |
| $CC,X | BulletState[] | Bullet state per slot ($CC–$D3): 0=none, $40=active, $33=impact countdown, $60-$70=explosion anim |
| $D6,X | BulletPower[] | Bullet power tier ($D6–$DD): 0=basic, 1=enhanced (breaks bricks), 3=triple (breaks steel) |
| $D4,X | Bullet2State[] | 2nd bullet state save for power-tank double-fire ($D4–$DB); mirrors $CC format |
| $C0,X | Bullet2PosX[] | 2nd bullet X position ($C0–$C7) |
| $CA,X | Bullet2PosY[] | 2nd bullet Y position ($CA–$D1) |
| $DE,X | Bullet2Power[] | 2nd bullet power ($DE–$E5) |
| $E0,X | TilePtrLo[] | Background tile nametable ptr lo under entity ($E0–$E7); set by EntityTileRead |
| $E8,X | TilePtrHi[] | Background tile nametable ptr hi + attr flags ($E8–$EF); bit7=ice tile flag |
| $0F | PRNGSeed | PRNG current value; updated by $D44D each call |
| $10 | PRNGCounter | PRNG counter; indexes zero-page entropy table |
| $45 | ShovelTimer | Shovel power-up timer; counts down; used in ShovelEagleTick to restore eagle base tiles |
| $46 | GameMode | Game variant flag; $02=construction mode |
| $62 | PowerupDuration | Powerup pickup effect duration countdown (set to 50 on collect) |
| $86 | PowerupPosX | X pixel position of active power-up item on screen |
| $87 | PowerupPosY | Y pixel position of active power-up item on screen |
| $88 | PowerupType | Power-up type byte; negative ($80) = no powerup |
| $0100 | EnemyFireInhibit | If non-zero: enemy fire is suppressed (EnemyFireTick skips); set/cleared by game state logic |
| $0105 | ShovelTileAccX | Shovel animation accumulated tile X for eagle border |
| $0106 | ShovelTileAccY | Shovel animation accumulated tile Y (also set to $F0 on shovel expire) |
| $0107 | ShovelTileIdx | Index into ShovelTileDX/DY tables |
| $0108 | ShovelCountdown | Shovel active frame countdown; DEC'd every 16 frames; $0A..→tiles animate; 0=expired |
| $030B | SFX_EagleHit | SFX trigger: set to 1 when eagle is hit; triggers explosion/eagle SFX |
| $030C | SFX_BrickBreak | SFX trigger: set to 1 on brick destruction or power-bullet steel hit |
| $030D | SFX_Ricochet | SFX trigger: set to 1 when bullet bounces off steel tile |
| $030F | SFX_PlayerFire | SFX trigger: set to 1 when player fires bullet |
| $0311 | P1ActiveFlag | Set to 1 if only P1 pressing direction (P2 not); 0 if both or neither; managed by PlayerActiveCheck |

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
  JSR SetupNametableStage ($D16A) — $05=$1C (PPU addr offset), WriteNametable zeros $0400-$07FF, InitEntities copies to PPU $2000 → black BG + palette 3
  JSR TitleWaitLoop       ($C7AB) — spin until SELECT pressed (~240 frame demo timeout)
  JSR PlayerSelectLoop    ($C9C0) — SELECT cycles 1P/2P/CONSTRUCTION, START confirms
  JSR StagePlay           ($C3B5) — actual gameplay
  JSR GameOverLoop        ($C41D) — post-game animation (GameTickMain) until button pressed
  JMP MainLoop

Full game-over sequence (2P path at $8225–$8292):
  $8225: PostGameAnimLoop  — run GameTickMain ~128 frames (palette flash animation)
  $8256: JSR ResultScreen  — kill-count tally screen (same layout as stage-clear)
  $8259: StageAdvance2P    — INC $85; wrap stages 1–70; check loop/game-over
  $8283: JSR GameOverBrickScreen ($C5D9)
           — fill nametable $1C, palette 3; draw GAME/OVER large sprites
           — hold until Start/Select pressed ($0318/$0319/$031A flags)
  $8286: JSR UpdateHiScore
  $828C: JSR HiScoreEntryScreen ($C44B) — only if new record (Y≠0)
  $8292: JMP $C095         — DrawTitleScreen + STA $4B=0 → back to MainLoop

Tile $1C (PT1): CHR offset $1C0; the letter "S" glyph. NOT a brick tile.
$05=$1C is used as a PPU address offset ($12=4 + $05=$1C = $20 → PPU $2000), not as a tile fill value.
Background for game-over and player-select screens is tile $00 (blank = black).
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

Delta tables: `$E46C[dir]` (dX: 0/−1/0/+1), `$E470[dir]` (dY: −1/0/+1/0). Values are ±1; multiplied by 8 at `$DCA0`/`$DCB1` (ASL×3) to produce **probe offsets** `$58`/`$59` only. Actual movement is 1px per step (`$56=posX+dX` where dX=±1); the ×8 is NOT the movement amount.

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

**Channel count selection:** `$6D` (PAUSE flag) controls $F5:
- `$6D = 0` (normal gameplay): `$F5 = $1C = 28` — process all 28 channels per frame
- `$6D ≠ 0` (paused): `$F5 = 1` — process only 1 channel per frame

**Two-pass architecture:**

**Pass 1 ($EA8C): APU register write pass**
- Clears `$F9[0-3]` (hw channel claimed flags)
- Iterates channels 0..$F5-1, reading byte 0 of each channel's data block:
  - byte0 = 0: skip (inactive)
  - byte0 = 5–8: already written; mark `$F9[byte0-5] = 1`; skip APU write
  - byte0 = 1–4: new note ready; if `$F9[byte0-1]` NOT set → claim it, write bytes 1-4 to `$4000+(byte0-1)*4`, set `byte0 += 4` (transitions to 5–8 state)
  - **Priority:** lower slot number wins — if two slots share a hw channel, only the first one to claim `$F9` gets to write APU registers

**Silence pass ($EAF6):** for each hw channel 0-3, if `$F9[X] = 0`, write `$10` to `$4000+X*4` (constant-vol mode, volume=0 → mute)

**Pass 2 ($EB11): Sequence processing pass**
- Iterates channels 0..$F5-1:
  - `$0300[N] = 0`: skip (inactive)
  - `$0300[N] = 1`: newly triggered → increment to 2, read 4–5 header bytes from sequence into channel data
  - `$0300[N] ≥ 2`: active → decrement byte 7 (duration counter); when 0, read commands
- **1-frame delay:** notes decoded in Pass 2 set byte0 = hwchan (1-4), which triggers APU write in the NEXT frame's Pass 1

**Channel data layout** (8 bytes per channel at `$031C + N×8`):

| Byte offset | Purpose |
|-------------|---------|
| 0 | State: 0=inactive, 1-4=pending APU write (hw channel), 5-8=written (hw channel+4) |
| 1 | Duty/Volume register ($4000/$4004/$400C): bits 7-6=duty, bit5=envLoop, bit4=constVol, bits 3-0=vol/envPeriod |
| 2 | Sweep register ($4001/$4005): bit7=enable, bits 6-4=period, bit3=negate, bits 2-0=shift |
| 3 | Timer low byte ($4002/$4006/$400A/$400E) |
| 4 | Timer high + length counter ($4003/$4007/$400B/$400F) |
| 5 | Sequence byte position (offset into ROM sequence data) |
| 6 | Duration value (set by DURATION command, copied to byte 7 on note) |
| 7 | Duration counter (decremented each frame; 0 → read next command) |

**Status array:** `$0300[N]` = active flag for channel N (0=inactive, 1=init pending, ≥2=active)
**APU hardware mapping:** determined by sequence header byte 0 (1=sq1, 2=sq2, 3=tri, 4=noise), NOT by `N mod 4`

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
| Stage select | Not present | Yes — A/B buttons at InterStageScreen ($C159) cycle $85 (1–35); cheat: P1-DOWN+P2-A → $4A+=16 skip, P1-RIGHT+P2-B → DEC $4A |
| Starting lives DIP | Yes ($4016 bit4 → 3 or 5 lives) | No DIP; lives stored separately; $6C=5/7 is entity slot bound, not lives |
| CONSTRUCTION mode | Not present | Yes (menu option 2) |

---

## Score System

### Score memory layout (zero-page)

7-byte BCD digit arrays (most-significant digit first):

| ZP Range | Purpose |
|----------|---------|
| $15–$1B | P1 score (7 digits) |
| $1D–$23 | P2 score (7 digits) |
| $25–$2B | P1 result-screen kill score accumulator |
| $2D–$33 | P2 result-screen kill score accumulator |
| $35–$3B | Scratch score value buffer (filled by SetupScoreDigits) |
| $3D–$43 | Hi-score (7 digits; persistent across soft-resets) |

### Score routines

| Address | Name | Description |
|---------|------|-------------|
| $D9E1 | SetupScoreDigits | A=BCD byte → fills $35–$3B; A=0→$38=1(1000pts); lo nibble→$3A, hi nibble→$39 |
| $D9BE | AddScoreDigits | X=player(0/1); adds scratch $35–$3B to $15+X*8 with decimal carry |
| $D97D | UpdateHiScore | Compare P1/P2 scores to $3D–$43; copy if new record; post-game only |
| $D951 | DrawHiScore | Draw $3D–$43 as sprite digit string, skip leading zeros |

### Score per enemy type

| Enemy | BCD byte | Points |
|-------|----------|--------|
| Basic ($80) | $10 | 100 |
| Fast ($A0) | $20 | 200 |
| Power ($C0) | $30 | 300 |
| Armor ($E3) | $40 | 400 |
| Shovel protect | $50 | 500 |
| 2P winner bonus | 0 (→$38=1) | 1000 |

### Hi-score lifecycle

1. **Init** ($94C1): `LDX #$3D; JSR InitEntitySlot` — zero hi-score on first boot only
2. **In-game**: score added via `SetupScoreDigits($E8BA[type]); AddScoreDigits(X=player)` at $A81E on each kill
3. **Post-game** ($8283): `JSR $C5D9` (result screen) → `JSR $D97D` (UpdateHiScore)
4. **New record**: if Y≠0 after UpdateHiScore, show new-record animation ($C44B)
5. **Persistence**: hi-score survives soft-reset (RAM retained); lost on power-cycle (NROM = no battery)

---

## Palette System

### Sprite Palette — $D555–$D564 (16 bytes → PPU $3F10–$3F1F)

Written once at startup by SpritePaletteInit ($D53E). Format: 4 sub-palettes × 4 NES color indices.

| Sub-palette | Bytes | Colors (hex NES indices) | Usage |
|-------------|-------|--------------------------|-------|
| SP[0] | 0F 18 27 38 | black / dark-tan / yellow-tan / cream | player tank, UI elements |
| SP[1] | 0F 0A 1B 3B | black / yellow / off-white / white | text, digits |
| SP[2] | 0F 0C 10 20 | black / dark-green / dark-gray / light-gray | misc sprites |
| SP[3] | 0F 04 16 20 | black / dark-purple / med-purple / light-gray | misc sprites |

### Background Palette Table — $D565–$D5F4 (9×16 bytes → PPU $3F00–$3F0F)

Updated each NMI when `$4D` is ≥ 0 (bit7=0) by PaletteUpdate ($D50E). Index = `$4D`; then `$4D` is set to `$FF` (inhibit).

| Index ($4D) | ROM addr | Context / Usage |
|-------------|----------|-----------------|
| 0 | $D565 | Normal in-game palette |
| 1 | $D575 | Alternate in-game (mode A) |
| 2 | $D585 | Alternate in-game (mode B) |
| 3 | $D595 | Player-select / game-over screen |
| 4 | $D5A5 | InterStageScreen / curtain animation (set before CurtainClose $CC90); also title demo |
| 5 | $D5B5 | Flash frame 0 (loop at $8486: `$4D = ($0B & 3) + 5`) |
| 6 | $D5C5 | Flash frame 1 |
| 7 | $D5D5 | Flash frame 2 |
| 8 | $D5E5 | Flash frame 3 |

### Palette update flow

```
 Game code writes $4D = index (0-8)
       ↓
 NMI fires → $D416 LDA $4D; BMI skip
       ↓ (bit7=0 → index valid)
 JSR PaletteUpdate ($D50E)
   A = $4D; X = A × 16; Y = $10
   PPU addr $3F00 → write 16B from BGPaletteTable[$D565+X]
   $4D = $FF (inhibit until next write)
```

---

## GameTickMain Subsystems (`$C2E6`)

Called every frame from the main game loop (StageStartSetup at $C1F9). 18 sequential JSR calls:

| # | Address | Name | Description |
|---|---------|------|-------------|
| 1 | $E181 | EntityTileRead | For each active entity: read nametable tile ptr at (X-8,Y-8) → $E0,X/$E8,X; detect ice ($21) |
| 2 | $DB75 | PlayerMoveTick | Move player tanks from D-pad input |
| 3 | $DBF1 | EntityMainLoop | Run AI state machine for all 8 entity slots |
| 4 | $E1FA | EntityTileRestore | Restore background tiles saved by EntityTileRead (clear bit7) |
| 5 | $E02E | BulletStateMachine | Dispatch bullet state per slot via $E4D8 table: move/countdown/explosion |
| 6 | $E2A9 | ShovelEagleTick | Shovel timer countdown; eagle damage animation via $E306 ptr table |
| 7 | $E27C | InvincibilityTick | Flash invincibility shield sprite for players ($89,X countdown) |
| 8 | $E122 | PlayerFireTick | Fire bullet on A/B press; power tank: save/restore 2nd bullet |
| 9 | $E162 | EnemyFireTick | Random enemy fire (PRNG &$1F==0, ≈1/32 chance per frame per slot) |
| 10 | $DB48 | EnemySpawnTick | Decrement spawn delay; spawn next enemy from spawn queue |
| 11 | $E604 | BulletTerrainCollision | Move active bullets; collision check vs nametable tiles via $E693 |
| 12 | $E910 | BulletBulletCollision | Destroy bullet pairs within 6px (player bullets canceling enemy bullets) |
| 13 | $E70C | EnemyBulletPlayerCollision | Enemy bullet hits player: check proximity <10px; kill if not invincible |
| 14 | $E972 | PowerupCollectTick | Entity near powerup (<12px): collect, add 500pts, apply effect |
| 15 | $C972 | ShovelAnimTick | Eagle-border steel animation while $0108 countdown active |
| 16 | $DB0B | PlayerActiveCheck | Track which players are pressing direction buttons → $0311 |
| 17 | $C7C8 | LivesDisplayTick | Draw P1/P2 remaining life count HUD sprites |
| 18 | $C31D | PaletteFlashTick | (inlined) Every 64 frames alternate $4D=1/2 (palette animation) |

### Bullet state machine (`$CC,X`)

| Value | State | Handler |
|-------|-------|---------|
| $00 | No bullet | RTS (skip) |
| $10–$30 | Cooldown countdown | $E076: DEC lo nibble; wrap hi nibble -$10 each 4 ticks |
| $40 | Active (flying) | $E051: move 2px/frame (normal) or 4px/frame (power: D6!=0) |
| $33 | Impact / stop | $E076: count down to $00 over 9 frames |
| $60–$70 | Explosion animation | $E112: draw explosion sprite at $B8,$C2 |

Bullet fired by `FireBullet` ($E08C): $CC,X = $40 | dir; $B8,X = X+dX×8; $C2,X = Y+dY×8.

### Bullet power (`$D6,X`)

| Value | Source | Effect |
|-------|--------|--------|
| 0 | 0-star player; basic/fast/armor enemy | 2px/frame; alternating-frame collision check |
| 1 | 1–2-star player (`$A8&$F0`=$20/$40); power enemy ($C0) | 4px/frame; NO alternating-frame skip |
| 3 | 3-star player (`$A8&$F0`=$60) | 4px/frame; NO frame-skip; armor-pierces steel |

`FireBullet` ($E08C) sets $D6,X: start at 0; `$A8&$F0`=$00→0; =$20/$40→1; =$60→3; =$C0→1; =$80/$A0/$E0→0.

### Bullet terrain collision — 4-probe geometry (`$E604`)

`BulletTerrainCollision` checks **4 positions per bullet per frame**, all at the same travel-axis coordinate, spanning a ±5/+4 pixel range **perpendicular** to movement:

For a RIGHT bullet (DX=+1) at (bx, by):

| Probe | Position | Condition |
|-------|----------|-----------|
| A | (bx, by) | always |
| B | (bx, by+4) | only if A hits brick |
| C | (bx, by−1) | always |
| D | (bx, by−5) | only if C hits brick |

Perpendicular offsets −5, −1, 0, +4 span **10 pixels** — can cross into adjacent CHR tile rows. For UP/DOWN bullets the pattern is identical but in X.

Each probe calls `BulletHitCheck` independently. The bullet is stopped ($CC,X=$33) after probe A or C hits any solid tile (brick or steel). Probes B and D add extra brick destruction without re-stopping the bullet. Note: probes B and D only fire when A/C return A=1 (brick hit) — steel hits return A=0, skipping B/D.

`ClearTileBit` ($D743): mask $00 computed by `ComputeTileBitmask` ($D725):
- bit2 of pixelY selects top/bottom half (rows 0–3 or 4–7 of CHR tile)
- bit2 of pixelX selects left/right half → result: $00 = 1/2/4/8 for TL/TR/BL/BR 4×4 sub-quadrant

### SFX trigger flags (page 3 RAM)

| Address | Trigger |
|---------|---------|
| $030B | Eagle hit (explosion + eagle damage SFX) |
| $030C | Brick broken or power-bullet steel hit |
| $030D | Bullet ricochets off steel |
| $030F | Player fires bullet |

---

## Next Tasks

- [x] Understand what $6C=5/$6C=7 controls exactly. **Done.** $6C = MaxEntityScanIdx (entity slot upper bound). Set at $CA76 to 5 (1P) or 7 (2P/Construction); reset to 5 at $C41A (stage end). Only read by EnemySpawnTick ($DB48): scans $A0+$6C down to $A0+2 for free enemy slot. 1P → 4 enemy slots (2–5); 2P → 6 scan positions (2–7). $7F = enemies remaining, DEC'd on spawn. $E363 = SpawnEnemy.
- [x] Identify GameInit ($C159) — what does it set up? **Done.** $C159 is InterStageScreen, NOT a generic init. Called by Start1P/2P after NewGameSetup. Shows current stage; A button increments $85 (stage), B decrements; $85 wraps between 1 and 35. Pressing Start (or $4C≠0 timeout) exits at $C1C5 to begin actual gameplay. Real game subsystem init happens at $C1C5 onward (JSR ConstructionSetup/$CB5D, $CC27, $CCB2). NewGameSetup itself ($C2B3) initializes $66/$67/$4C/$51/$52/$6A/$85, then returns.
- [x] Map StagePlay ($C3B5) — level data loading, entity init. **Done.** StagePlay ($C3B5) = new-game init (vars, blank map, sprites, entities, $C331 spawn init, HUD). Actual game loop is in StageStartSetup ($C1C5) at $C1F9: WaitVBlank → GameTickMain ($C2E6) → CheckGameOver ($C728) → loop. Stage tilemap loaded by $F000(A=$85) from $F07A (35×91 bytes). Stage nibble types: D-F=empty, 0-3=partial brick, 4=full brick, 5-8=partial steel, 9=full steel, A=water, B=forest, C=ice. Enemy counts per stage from $E578 (35×4 table) → $8B-$8E. SpawnDelayBase=$BE-stage×4. CheckGameOver exits on eagle destroy ($68=0), stage clear ($80=0), or all lives ($51+$52=0).
- [x] Map entity/enemy system: SpawnEnemy ($E363) internals; EntityType table; movement/AI dispatcher; understand $8B-$8E usage in spawn logic. **Done.** Entity state machine: Free(0)→SpawnAnim($F0, 14 ticks via $DE55)→$E0→DeathAnim(14 ticks via $DE64)→FinalizeEntitySpawn($E3B8)→Active($A0/$A2). 8 slots: 0-1=players, 2-7=enemies (2-5 in 1P, 2-7 in 2P). Direction 0=up/1=left/2=down/3=right (dX: $E46C, dY: $E470, ×8 px/frame). Enemy spawns at X=$18/$78/$D8 (round-robin $6A), Y=$18. Type selection: $8F indexes $8B-$8E counts → $E4EC[(stage-1)×4+$8F] ($80=basic $A0=fast $C0=power $E0→$E3=armor). Blink flag at $7F=3/10/17. EntityStateTable($E498): 16 ptrs; AI dispatch at $DC3D. Added 17 new labels, EntityStateTable/EntityTypeTable/spawn tables documented.
- [x] Extract CHR ROM tiles — identify tiles $5E/$5F/$6B (namcot logo?), $60–$68 (credit names). **Done.** Fixed TILE_SZ bug in extract_tiles.py. CHR tiles extracted to tiles/. BG font: $40=©, $41–$5A=A–Z, $6B="-" dash (used in HI-SCORE/I-PLAYER/II-PLAYER). Tiles $5E=Roman-numeral-I (player-1 indicator), $5F=Roman-numeral-II (player-2 indicator), $6B=dash separator. Tiles $60–$68 = 9 NAMCOT logo graphic tiles (monochrome, plane-1=0), displayed as one row on title screen at $D28F — confirmed by raw string table at $D280. Full string table decoded: "© 1980 1985 NAMCO LTD.", "ALL RIGHTS RESERVED", "OPEN-REACH". Added CHR ROM Tile Map section and corrected Title Screen Layout table.
- [x] Map sound engine ($D689 and call sites at $EA7E). **Done.** $D689 = ReadControllers (mislabeled "SoundUpdate" — it reads $4016/$4017). The real sound engine: $EA51=APUSoundInit (enables sq1+sq2+tri+noise; $4017=$C0; zeros 28 channel data blocks at $031C–$03FB). $EA7E=SoundEngineTick (NMI-called; $6D→$F5: 1 channel if game, else 28; iterate channels at $031C, each 8B; $ECAF=GetChannelDataPtr reads $F2/$F3 from ChannelPtrTable at $ECFE; $ECBE=ReadChannelByte reads note sequence; writes APU $4000+X×4). $ECE6=NoteFreqTable (12 note periods). $ECFE=ChannelPtrTable (28 × u16le ptrs to note/SFX seq data). $0300[$F4]=channel active status; $0300–$031B=28-byte status array; $031C–$03FB=28 × 8B channel state blocks. **Sound trigger audit (session 2026-03-05):** All 28 slots mapped with ROM trigger sites. BGM (slots 1-3) triggered once at $81C5 (one-shot, NOT looped). Slot 8 is never triggered in ROM. Slot 15 = player fire (sweep SFX at $A096), slot 17 = tank engine (loops via F9 while player moves, $9B24), slot 18 = eagle alarm (loops via F9 after eagle hit, $838C), slot 6 = powerup collect ($A9C7), slot 27 = tally complete jingle ($8E7E). Command F9 = absolute jump within sequence (set byte5 = param); F3-F8 = NOP-like sub-counter increment. Fixed 5 mismatched sequences in sound.js (slots 17/18/23/25/26).
- [x] Understand CheckSavedState / DefaultConfig ($D4EF / $C040) — continue feature? **Done.** $C040–$C04F = DevSignature "RYOUITI OOKUBO  " (16-byte ASCII dev name as SRAM magic). $D4E3 = WriteDefaultConfig (copies signature to RAM $0110–$011F, called at end of Init). $D4EF = CheckSavedState (compare $0110 vs $C040; A=1→soft-reset, skip $3F/$83 init; A=0→first boot, set $3F=2/$83=0). This is Battle City's "continue" mechanism: on first power-on the RAM won't have the signature so game resets state; on soft-reset the signature survives and state is preserved.
- [x] Locate and map level/stage data (35 stages in Famicom vs 40 in VS). **Done.** StageDataTable confirmed at $F07A (Famicom ROM), 36 × 91 bytes = $F07A–$FD44. Entries 0–34 = stages 1–35 (playable). Entry 35 ($FCEB–$FD44) = blank stage loaded via A=$FF (mostly $DD/empty with eagle-area $6D). LoadStageData ($F000): A<$24→use as stage# directly; A≥$24→wrap (A-=$23); A=$FF→force entry 36. web/levels.js confirmed correct (same 35 stage layouts). REVERSE.md had wrong end ($F4C5→$FD44) and wrong count (1092→3276 bytes). web/levels.js header comment and tile type labels fixed.
- [x] Map entity/enemy system (EntityType table, movement, AI) — covered above
- [x] Identify $DA93 role in NMI more precisely (appears to be sprite hiding, not controller). **Done.** $DA93 = HideSpritePairs: hides all unused OAM sprite slots each NMI by writing Y=$F0 (off-screen) backwards from $0D-4 down to OAM+4 (sprite 1). Input: $0D=current OAM write ptr (incremented by WriteSpriteToOAM at $9A47), $0E=stride(4). Negates $0E then loops. Identical copy at $9A93 (NROM-128 mirror). $D8FD relabeled: NOT sprite-related — it's VRAMNametableFlush (flushes buffered triplet writes addr_hi/addr_lo/data from $0180 to PPU via $2006/$2007). NMI sequence: OAM-DMA→VRAMFlush→PaletteUpdate→PPUCtrl/scroll→ReadControllers→HideSpritePairs→SoundEngineTick.
- [x] Locate high score save/load logic. **Done.** Score arrays at $15–$1B (P1), $1D–$23 (P2), $3D–$43 (hi-score). Routines: SetupScoreDigits ($D9E1, BCD byte→scratch $35–$3B), AddScoreDigits ($D9BE, scratch→player score with decimal carry), UpdateHiScore ($D97D, compare P1/P2 to $3D on game-over), DrawHiScore ($D951, draw $3D buffer). Enemy kill scores: BCD $10/$20/$30/$40 = 100/200/300/400 pts from EnemyScoreTable ($E8BA/$D3D1). Shovel=500pts, 2P-winner bonus=1000pts. Hi-score zeroed at first boot ($94C1), persists across soft-resets in RAM (no SRAM/battery).
- [x] Identify palette data location and format. **Done.** Two palette data blocks: SpritePaletteData ($D555–$D564, 16B fixed, 4 sub-palettes → PPU $3F10-$3F1F via SpritePaletteInit at $D53E) and BGPaletteTable ($D565–$D5F4, 9×16B, indexed by $4D → PPU $3F00-$3F0F via PaletteUpdate at $D50E). $4D is both the palette set index (0-8) and the "update needed" flag (bit7=0 → update on next NMI; $FF = done). Sets 0-2 = in-game variants, 3 = player-select/game-over, 4 = title animation, 5-8 = flash animation (loop at $8486 cycles $4D=($0B&3)+5). WaitVBlank2 ($D5F5) is a 6-byte routine just after the table. NES palette entries use format $XY where X=brightness, Y=hue.
- [x] Understand GameTickMain subsystems ($E181, $E1FA, $E02E, $E2A9, $E27C, $E122, $E162, $DB0B, $C7C8) — bullet/collision/explosion/score logic. **Done.** 18 subsystems fully mapped: EntityTileRead($E181), EntityTileRestore($E1FA), BulletStateMachine($E02E), ShovelEagleTick($E2A9), InvincibilityTick($E27C), PlayerFireTick($E122), EnemyFireTick($E162), BulletTerrainCollision($E604), BulletBulletCollision($E910), EnemyBulletPlayerCollision($E70C), PowerupCollectTick($E972), ShovelAnimTick($C972), PlayerActiveCheck($DB0B), LivesDisplayTick($C7C8), PaletteFlashTick($C31D). Bullet arrays at $B8/$C2 (pos), $CC (state: 0/active$40/impact$33/explosion$60), $D6 (power 0/1/3). SFX flags at $030B-$030D/$030F. FireBullet at $E08C, BulletHitCheck at $E693, PRNG at $D44D.

### Web game update: VS System → Famicom

game.js was originally built from VS System RE (mapper 99, 32KB PRG, 16KB CHR with 2 banks, 40 stages).
The active ROM is now Famicom (mapper 0 NROM, 16KB PRG mirrored, 8KB CHR single bank, 35 stages).
The following tasks update web/game.js to match the Famicom ROM findings in catalog.html and REVERSE.md.

- [x] **Remove mapper-99 bank-switching from game.js.** **Done.** Removed STAGE_CHR_BANK[35], chrSheets[2], chrBankIdx, setCHRBank(), the chr_all_alt.png load path, and the setCHRBank(stageIdx) call in initLevel(). initCHR() now loads only tiles/chr_all.png. File header updated to reference Famicom mapper-0 ROM.
- [x] **Decode all 9 Famicom BGPaletteTable sets** ($D565–$D5F4, 9×16 bytes). **Done.** All 9 sets decoded and added to game.js as `BG_PALETTE_SETS[9]`. Sprite palettes split into `SP_PALETTE_DATA[4]`. Added `activeBGSet` variable and `setBGPaletteSet(n)` function. Per-screen switching: set 0 on initLevel(), set 3 on gameover/select, set 4 on enterTitle(). Water animation fixed to use correct ROM colors (was $37, now $3C for yellow). Full table:
  - Set 0 ($D565, in-game base):  BG0=[0F,17,06,00] BG1=[0F,3C,10,12] BG2=[0F,29,09,0B] BG3=[0F,00,10,20]
  - Set 1 ($D575, water anim A):  BG1=[0F,3C,12,12] (col1=$3C yellow, col2=$12 blue)
  - Set 2 ($D585, water anim B):  BG1=[0F,12,3C,12] (col1=$12 blue, col2=$3C yellow)
  - Set 3 ($D595, select/gameover): BG0=[0F,16,16,30] BG1=[0F,3C,10,16] BG2=[0F,29,09,27]
  - Set 4 ($D5A5, title):          BG0=[0F,17,06,00] BG1=[0F,3C,10,00] BG2=[0F,29,09,00] BG3=[0F,00,10,00]
  - Set 5 ($D5B5, flash A):        BG0=[0F,0F,06,00]
  - Set 6 ($D5C5, flash B):        BG0=[0F,12,06,00]
  - Set 7 ($D5D5, flash C):        BG0=[0F,00,06,00]
  - Set 8 ($D5E5, flash D):        BG0=[0F,30,06,00]
- [x] **Fix HUD palette: BG0 (palIdx 0) not BG3.** **Done.** Changed all HUD and border drawCHRTile/drawNesText calls from palIdx=3 to palIdx=0. Affected: drawBorderTiles() $FC tiles, drawHUD() $FC/$6A/$11/$14/$6C/$6D/$FD tiles and "IP"/"IIP"/stage-number text. Famicom nametable attribute byte for HUD cols 28-31 and border area is $00 → BG palette 0 ([0x0F,0x17,0x06,0x00]). Updated misleading comment in drawBorderTiles().
- [x] **Verify Famicom enemy-type-per-stage table.** **Done.** Decoded EntityTypeTable ($E4EC, 35×4 bytes: $80=basic/$A0=fast/$C0=power/$E0=armor) and StageEnemyCountTable ($E578, 35×4 counts, each row sums to 20). Spawn order: emit count[slot] of type[slot] for slots 0–3. Found 24/35 stages differed from VS-derived game.js table. Updated ENEMY_TYPE_TABLE in game.js with all 35 ROM-correct sequences. Notable: stage 7 has two basic-type slots (B×3+F×4+P×6+B×7), stage 11 has two fast-type slots (F×5+A×6+P×4+F×5), stage 28 has only 1 armor tank (F×2+A×1+B×15+P×2), stage 31 has two power-type slots (P×3+F×8+A×6+P×3).
- [x] **Verify Famicom spawn-delay formula.** **Done.** ROM at $839C–$83B4: `LDA $85; ASL; ASL; STA $00; LDA #$BE; SEC; SBC $00; STA $84` → $84 = $BE − $85×4 = 190 − stageNum×4 (stageNum is 1-based). Stage 1→186, stage 35→50. No explicit min clamp — $85 is capped at 35 ($23) by stage-end handler ($8195–$8199: INC $85; CMP #$24; reset to $23). 2P mode: additional SBC #$14 (−20). Max-on-screen: 4 in 1P ($6C=5, scan slots 5→2); already correct in game.js. **Fix:** game.js was using `190 − stageIdx×4` (0-based); corrected to `186 − stageIdx×4` (= 190 − (stageIdx+1)×4) in both initLevel() and tickEnemySpawn().
- [x] **Verify Famicom eagle-wall geometry** (EAGLE_WALL in game.js). **Done.** Geometry confirmed correct: 5-cell Π-shape at metatile rows 11–12, cols 5–7. Eagle is at pixel ($78,$D8)=(120,216) → metatile (row=12,col=6); wall cells confirmed by pixel-position analysis. Row 11 cols 5-7 = top bar (only bottom quadrants present); row 12 cols 5,7 = left/right legs. brickBits: row11/col5=0b1000(BR), row11/col6=0b1100(BL+BR), row11/col7=0b0100(BL), row12/col5=0b1010(TR+BR=BRICK_R), row12/col7=0b0101(TL+BL=BRICK_L). Stage data rows 11–12 are all empty nibbles (eagle wall NOT in LoadStageData nibble table for any stage). Eagle wall placed by a separate nametable-write routine not yet identified. **ROM address correction:** game.js comment `$C912 BrickWallInit` is WRONG for Famicom — $C912 draws 4 OAM sprites (JSR $DA2B×4) and has no callers; $C9BB is not a valid entry point (mid-instruction bytes). The actual eagle-wall init routine is unlocated. ShovelAnimTick init: $8728 sets $0105=$70/$0106=$F0/$0107=0/$0108=$11 (on stage-end or eagle-death); $9E48 sets $0108=$0D/$0106=$D8. RAM nametable shadow at CPU $0400–$05FF (2 pages, 30 rows × 32 cols); CalcNametableAddr ($D5FB) maps tile (row,col) → $04xx–$05xx; WriteNametableByte ($D784) writes both RAM shadow and VRAM flush buffer. game.js EAGLE_WALL and brickBits are correct; removed wrong ROM address comments.
- [x] **Decode Famicom title-screen nametable** from string table at $D280–$D345 (17 FF-terminated rows). **Done.** Fully traced DrawTitleScreen ($D17F) and decoded all positions. Score strip row 3: $5E at col=2, $6B at col=3, P1 score col=4 (x=32), "HI-" col=11 (x=88), HI score col=14 (x=112). Big sprites: "BATTLE" at (x=26,y=46), "CITY" at (x=60,y=86) via DrawSpriteString. Menu items: "1 PLAYER" col=11 row=17 (x=88,y=136), "2 PLAYERS" col=11 row=19 (x=88,y=152), "CONSTRUCTION" col=11 row=21 (x=88,y=168). Cursor sprite ($5B) blinks every 4 frames ($B0 bit2) at col=8. Credits names tile $60–$68 at col=11 row=23. Copyright "@1980 1985 NAMCO LTD" col=4 row=25 (x=32,y=200). "ALL RIGHTS RESERVED" col=6 row=27 (x=48,y=216). Also decoded: $D934 FindFirstNonZeroScore (scan RAM from Y, advance X for each zero, set $11=$Y as address for DrawNametableTextOffset); PlayerSelectLoop ($C9C0) uses $83=0/1/2 for cursor; SELECT cycles it, START dispatches via SelectDispatchTable at $CA69. Fixed game.js: P1 score x=24→32, copyright x=40→32, ALL RIGHTS x=56→48; replaced VS coin/credit system with Famicom-style menu navigation (up/down cursor, START to select); tile $5B used as cursor glyph.
- [x] **Decode Famicom stage-clear tally screen** nametable from $CAF1 StageClearTallyScreen / $CD04 TallyScreenInit. Verify exact col/row positions used in drawStageClear() against Famicom ROM. Confirm tile $5B is the arrow/cursor glyph (not bracket), $5C is horizontal rule. **Done.** Entry point is $8CD4 (ResultScreen); static strings drawn by $CEF7 (ResultScreenInit); per-type tally loop at $8D10. Full layout: HI-SCORE at col=8/row=3 ($CF2D), hi-score value col=18+skip ($CF34); STAGE at col=12/row=5 ($CF44), number col=14+skip ($CF54); I-PLAYER at col=3/row=7 ($CF67); P1 score col=5+skip/row=9 ($CF72); tile $5B arrows (cursor, confirmed) at col=14 rows 12/15/18/21 ($CF7A–$CFB3); PTS at col=8 rows 12/15/18/21 ($D023–$D050); per-type result score col=1+skip ($8D6E), kill count col=8+skip right-justified-2 ($8D85); separator 7× tile $5C (horizontal rule, confirmed) at col=12/row=22 ($D099); TOTAL at col=6/row=23 ($D0B2); total kills col=8+skip/row=23 ($8DFE). CalcNametableAddr ($D5FB) confirmed: lo=(row&7)*32+col, hi=$04+(row>>3)+$05. All game.js col/row positions verified correct. ROM address comments in drawStageClear() updated to Famicom addresses. Added labels: ResultScreen/$8CD4, ResultScreenInit/$CEF7, str_Separator/$D3BB, str_Total/$D3B5, str_Stage/$D3CB, str_RightArrow/$D3B3.
- [x] **Verify Famicom water-animation palette cycling.** **Done** (covered by BG palette task above). PaletteFlashTick ($C31D) cycles $4D between sets 1 and 2 every 32 frames (64-frame period). tickPaletteFlash() now calls setBGPaletteSet(1) at f&0x3F==0 and setBGPaletteSet(2) at f==32. Water BG1 flips between col1=$3C/col2=$12 (set 1) and col1=$12/col2=$3C (set 2).
- [x] **Update all ROM address comments in game.js** from VS System addresses to Famicom addresses. **Done.** Previous sessions (003-004) corrected: $E8B1→$E70C, $EAB5→$E910, $DEBA/$DEBC→$DE0D, $DECC→$DE26/$DE38, $C29F→$C2E6, $EC23→$EA7E, $C62F→$C728, $C7F8→$C972, $DEC9→$C728, $DB79→$DACB, $F239→$F000, $EBF6→$EA51, $D3BF→$D491, $C402→$C09C, $C7CD removed, $E417→$E363, $E989→$E70C, $EBA0/$C912→$E2A9, $D9F0→$D97D, $CF44 generalized. This session corrected: $D2C6/$D2CA (wrong string-table addrs for WIGGLE tables) → $D3D5/$D3D9 (ShovelTileDX); $E543 (wrong for DirToStateTable) → $E486; $DE56 (mid-SpawnAnimTick) → $DDA0 (CalcDirToTarget); $DDFC (mid-instruction) → $DDA0 (RandomDirChange); $DF26 → $DE72 (SpeedCtrlMove: stage-tier AI goal selector $84>>2 vs $0A); $DE72 aiTimer comment → $DC7C EntityMovementAI; $E073 (BulletApplyDelta tail) → $DE64 (DeathAnimTick).

### Title screen visual fixes (from emulator comparison)

- [x] **Fix title screen palette set and palette index (VS→Famicom migration bug).** PlayerSelectLoop ($C9C0) writes `$4D=3` → palette set 3: BG0=[0F,16,16,30] (color3=$30=white, color1=$16=orange-red). enterTitle() was wrongly using set 4 (no white anywhere); all drawNesText/drawCHRTile calls in drawTitleScreen() were using palIdx=3 (→ BG3=[0F,00,10,20] → color3=$20=gray). **Fix:** setBGPaletteSet(3) in enterTitle(); all title screen draws changed to palIdx=0. Text → white ($30), NAMCOT → orange-red ($16), BATTLE/CITY → orange-red/white brick. Palette index assignments in game.js were inherited from VS System RE; this is the systematic cause of wrong colors on the title screen.
- [x] **Fix score display: minimum 2 digits.** ROM $D934 FindFirstNonZeroScore skips leading zeros but always shows ≥2 digits. Added `fmtScore(n, width=6)` helper: `n.toString().padStart(2,'0').padStart(width,' ')`. Replaced all `score.toString().padStart(6,' ')` calls with `fmtScore(score)`.
- [x] **Fix copyright period: "NAMCO LTD."** ROM string at $D2F8 ends with tile $69 (period glyph). Added `'.'→0x69` to `NES_TILE_OVERRIDE` map and appended `.` to copyright string `'@ 1980 1985 NAMCO LTD.'`.
- [x] **Fix dash rendering in drawNesText.** ROM font uses tile $6B for `-` (ASCII $2D → tile $2D was wrong). Added `NES_TILE_OVERRIDE = {'-': 0x6B, '.': 0x69}` map; drawNesText now checks override before using raw ASCII code. Extended tile range check to allow tiles ≥$60 (needed for override targets). Fixes "HI-" dash and any other dashed text.
- [x] **Map full game-over sequence.** Done. Sequence: (1) post-game animation loop ($8225, ~128 frames GameTickMain+palette flash); (2) ResultScreen ($8256/$CCD4, kill-count tally); (3) GameOverBrickScreen ($C5D9/$8283): $05=$1C is PPU addr offset (NOT tile fill), WriteNametable zeros $0400-$07FF → black BG + palette 3, GAME/OVER big-text sprites; (4) UpdateHiScore; (5) JMP $C095 → title.
- [x] **Fix drawGameOver() background** — was incorrectly drawing tile $1C (the "S" glyph) as background fill. Corrected: background is black (tile $00 = blank). $05=$1C is the PPU address offset used by InitEntities to target nametable $2000, not a tile index.
- [x] **Confirm stage selection in Famicom ROM** — disassembled InterStageScreen ($C159). ROM DOES allow stage select: sets palette 4 ($C16D: STA $4D=#$04), calls CurtainClose ($CC90 fills all 30 rows with tile $11), then loops calling DrawStageInter ($CA91: writes "STAGE" tiles+number to nametable row 14). A-button held (bit0/$06, every 8 frames) → INC $85; B-button held (bit1/$06) → DEC $85; $85 wraps 1-35. REVERSE.md VS table corrected. web/game.js curtain+select fixed: palette 4 set at curtain start; palIdx=3 (ROM's BG3) for steel tiles; black fill (NES_PAL[0][0]); drawStageSelect now renders frozen curtain background; auto-repeat added to stage cycling.
- [ ] **Locate eagle-wall init routine** — tile patterns found at $D36D (brick) and $D390 (steel) but no pointer refs. The patterns are 6-byte FF-terminated rows: empty/$0F-brick/$C8-$CB eagle. Construction mode draws them via $CB5E/$CB9E (DrawNametableText). The gameplay init path likely uses a different routine — search for inline LDA #$0F/STA sequences near $F000 LoadStageData call chain, or trace $C1C5 StageStartSetup forward.

### Unmapped PRG ROM ranges

The following byte ranges have no classification in the Data-Range Map. ~20-30% of PRG remains unaccounted for.

| CPU Range | Size (est.) | Context |
|-----------|-------------|---------|
| $C050–$C09B | ~76 | Between DevSignature and MainLoop |
| $C0BE–$C158 | ~155 | Between ConstructionEntry and InterStageScreen |
| $C642–$C727 | ~230 | Between GameOverWaitLoop and CheckGameOver |
| $C755–$C7AA | ~86 | Between CheckGameOver and TitleWaitLoop |
| $CB5E–$CC5B | ~254 | Between ConstructionSetup area and WriteNametableRow |
| $CCB2–$CCD3 | ~34 | Between CurtainClose and ResultScreen |
| $D284–$D3B0 | ~301 | Between title string table end and str_CursorArrow |
| $D3DD–$D3FF | ~35 | After ShovelTileDY data |
| $D44D–$D466 | ~26 | PRNG routine to WaitNMI |
| $DA13–$DABA | ~168 | Sprite helper routines (partially covered) |
| $DD48–$DE54 | ~269 | Movement AI / RandomDirChange to SpawnAnimTick |
| $DE72–$E02D | ~444 | SpeedCtrlMove area (partially referenced) |
| $E23A–$E2A8 | ~111 | ShovelEagleTick / InvincibilityTick area |
| $E362–$E413 | ~178 | SpawnEnemy internals (partially covered) |
| $E486–$E4EB | ~102 | Between EntityStateTable and EntityTypeTable |
| $E8BE–$E90F | ~82 | Between EnemyScoreTable and BulletBulletCollision |
| $E9E1–$EA48 | ~104 | Between PowerupCollectTick and BulletDirDX |
| $ED36–$EFFF | ~714 | Between ChannelPtrTable and LoadStageData — likely sound sequence data |
| $FD45–$FFF9 | ~693 | Between StageDataTable end and vectors — unknown (padding? more data?) |

- [x] **Classify $C050–$C09B** — **Done.** $C050–$C06F = DevSignature2 "TAKEFUMI HYOUDOU JUNKO OZAWA" (ASCII dev names). $C070–$C09B = ResetEntry (PPU warmup, TXS, JSR Init, JSR DrawTitleScreen, fall into MainLoop).
- [x] **Classify $C0BE–$C158** — **Done.** ConstructionMainLoop: init cursor entity; loop handles d-pad movement ($C6D2), A=place tile ($C6C6 via $5C type 0–13), B=cycle tile type, Start=exit to PlayerSelectLoop.
- [x] **Classify $C642–$C727** — **Done.** $C642–$C6C1=ConstructionAITarget (scan entities→CalcDirToTarget→direction table $C6C2). $C6C6–$C6D1=PlaceTileBlockFromCursor. $C6D2–$C71D=ConstructionCursorMove (d-pad with 20fr delay, ×16px steps). $C71E–$C727=ClearKillCounts (zero $73–$7A).
- [x] **Classify $C755–$C7AA** — **Done.** ConstructionConfigDisplay: draws score digits; A/B/Select adjust $0109 config value.
- [x] **Classify $CB5E–$CC5B** — **Done.** $CB5E–$CC07=ConstructionEagleWallDraw (draws brick/steel patterns via DrawNametableText + attr writes). $CC08–$CC26=second variant. $CC27–$CC5B=InitAttrTable (64 attr bytes from $07C0→PPU $23C0).
- [x] **Classify $CCB2–$CCD3** — **Done.** InitNametableFromRAM: curtain-open animation; $63=0; rows $0F→0 WriteNametableRow pairs; copies RAM shadow $0400–$05FF to PPU.
- [x] **Classify $D284–$D3B0** — **Done.** StringTable2 ($D284–$D33E): "WRITTEN BY", NAMCOT tiles, "BATTLE"/"CITY", player indicators, "HI-SCORE", menu options, copyright, "THIS PROGRAM WAS", "ALL RIGHTS RESERVED", "OPEN-REACH". StringTable3 ($D33F–$D36C): "GAME"/"OVER", "WHO LOVES NORIKO" (Easter egg!), "PTS", HUD tiles. EagleWallTilePatterns ($D36D–$D3AA): brick-wall 6×4 rows + steel-wall 6×4 rows + eagle tile pairs.
- [x] **Classify $D3DD–$D3FF** — **Done.** All $FF padding bytes (35 bytes).
- [x] **Classify $DD48–$DE54** — **Done.** RandomDirChange ($DD48, already mapped). CollisionProbeHelpers ($DD6E–$DD7D). AITargetSelect ($DD7E–$DDA1: 3 entry points for P1/P2/eagle targeting). CalcDirToTarget ($DDA2–$DDE4: abs-delta direction calculation using DirToStateTable $E486).
- [x] **Classify $DE72–$E02D** — **Done.** SpeedCtrlMove ($DE72–$DEA5: stage-tier AI goal selector). EntityDrawLoop ($DEA6–$DEB7: loops 8 slots). EntitySpriteRender ($DEB8–$DF98: state-based sprite dispatch). CalcEntityTileIndex ($DF99–$DFB5). EntitySpriteAttrCalc ($DFB6–$E02D: blink, color cycling, armor-tier offset).
- [x] **Classify $ED36–$EFFF** — **Done.** SoundSequenceData: 714 bytes of note/SFX sequence data for 28 channels; referenced by ChannelPtrTable ($ECFE). Not valid code.
- [x] **Classify $FD45–$FFF9** — **Done.** ConstructionDefaultMap + padding: $9D header + 9×$FF + ~513 bytes grid data ($2E/$40 values) + trailing $FF padding. No xrefs found; likely unreferenced construction mode remnant or dev artifact.
- [ ] **Classify remaining small gaps** — $D44D–$D466 (PRNG+helpers), $DA13–$DABA (Div10+sprite helpers), $E23B–$E27B (PowerupSpriteDraw), $E362–$E413 (SpawnEnemy internals), $E486–$E4EB (DirToStateTable+EntitySpriteDispatch), $E8BE–$E90F (PowerupSpawn+helpers), $E9E2–$EA48 (PowerupEffectTable+handlers)
