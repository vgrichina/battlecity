'use strict';
/* ================================================================
 * Battle City — Web Port  (v1)
 * RE reference commit: 973e914
 * ROM: VS. Battle City (1985)(Namco).nes  iNES mapper 99  32KB PRG  16KB CHR
 * All ROM addresses cited as // ROM $XXXX  label
 * ================================================================ */

// ─── Canvas  ─────────────────────────────────────────────────────────────────
const SCALE   = 3;
const NES_W   = 292;   // 256 NES + 36 HUD strip
const NES_H   = 240;
const canvas  = document.getElementById('game');
canvas.width  = NES_W * SCALE;
canvas.height = NES_H * SCALE;
const ctx     = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ─── CHR tile engine ──────────────────────────────────────────────────────────
// Tile sheets: ../tiles/chr_all.png (banks 0+1) + chr_all_alt.png (banks 2+3)
// 512 tiles each in 32×16 grid, 9px cell (8px+1px border). Mapper 99 per-stage bank switch.
// BG tile N: col=N%32 row=N/32   Sprite tile N: abs=N+256
const CHR_CELL = 9, CHR_BORDER = 1;

// ROM $D44A PaletteData (8 NES palette slots)
const NES_PAL = [
  ['#000000','#783C00','#540400','#545454'],  // BG0 brick  (ROM $D44A: $0F,$17,$06,$00)
  ['#000000','#A0D6E4','#989698','#3032EC'],  // BG1 water  (ROM $D44E: $0F,$3C,$10,$12)
  ['#000000','#74C400','#083A00','#003C00'],  // BG2 trees  (ROM $D452: $0F,$29,$09,$0B)
  ['#000000','#545454','#989698','#ECEEEC'],  // BG3 steel  (ROM $D456: $0F,$00,$10,$20)
  ['#000000','#545A00','#D48820','#CCD278'],  // SP0 P1 yel (ROM $D45A: $0F,$18,$27,$38)
  ['#000000','#004000','#007628','#98E2B4'],  // SP1 P2 grn (ROM $D45E: $0F,$0A,$1B,$3B)
  ['#000000','#00323C','#989698','#ECEEEC'],  // SP2 enemy  (ROM $D462: $0F,$0C,$10,$20)
  ['#000000','#440064','#982220','#ECEEEC'],  // SP3 spcl   (ROM $D466: $0F,$04,$16,$20)
];

// Grayscale level → palette index (extract_tiles.py: 0→0, 0x55→1, 0xAA→2, 0xFF→3)
function grayToIdx(r) { return r < 0x2B ? 0 : r < 0x7F ? 1 : r < 0xD5 ? 2 : 3; }

let chrOff = null;                // offscreen canvas 2d context for active CHR sheet
const tileCache = new Map();      // cached offscreen canvases keyed by "abs_pal_transp"

// Mapper 99 per-stage CHR bank select via StageFlagsTable ($80B6).
// D2=1 ($04) → banks 0+1 (default), D2=0 ($00) → banks 2+3 (alt).
// Index = stageIdx % 14 (StageFlagsTable has 14 entries; stages 14+ repeat).
// 0=default (chr_all.png), 1=alt (chr_all_alt.png)
const STAGE_CHR_BANK = [0,0,0,1,0,0,0,0,0,1,1,0,1,1]; // 14 entries from $80B6

const chrSheets = [null, null];   // [0]=default (banks 0+1), [1]=alt (banks 2+3)
let chrBankIdx = 0;               // which bank pair is currently active

function initCHR() {
  const paths = ['../tiles/chr_all.png', '../tiles/chr_all_alt.png'];
  paths.forEach((src, idx) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      const oc = document.createElement('canvas');
      oc.width = img.width; oc.height = img.height;
      const octx = oc.getContext('2d');
      octx.drawImage(img, 0, 0);
      chrSheets[idx] = octx;
      // Activate default bank on first load
      if (idx === chrBankIdx) {
        chrOff = octx;
        tileCache.clear();
      }
    };
  });
}

function setCHRBank(stageIdx) {
  const bankIdx = STAGE_CHR_BANK[stageIdx % STAGE_CHR_BANK.length];
  if (bankIdx !== chrBankIdx || chrOff !== chrSheets[bankIdx]) {
    chrBankIdx = bankIdx;
    chrOff = chrSheets[bankIdx];
    tileCache.clear();
  }
}

// Draw one 8×8 CHR tile at NES pixel (destX, destY).
// tileAbs: 0–255 = BG bank, 256–511 = sprite bank.
// transparent: skip color-0 pixels (sprites show BG underneath).
// Uses offscreen canvas cache + drawImage for proper alpha compositing.
function drawCHRTile(tileAbs, palIdx, destX, destY, transparent = false) {
  if (!chrOff) return;
  const key = `${tileAbs}_${palIdx}_${transparent ? 1 : 0}`;
  let cached = tileCache.get(key);
  if (!cached) {
    const tcol = tileAbs % 32, trow = (tileAbs / 32) | 0;
    const sx = tcol * CHR_CELL + CHR_BORDER;
    const sy = trow * CHR_CELL + CHR_BORDER;
    const pdata = chrOff.getImageData(sx, sy, 8, 8).data;
    const pal = NES_PAL[palIdx];
    const w = 8 * SCALE, h = 8 * SCALE;
    cached = document.createElement('canvas');
    cached.width = w; cached.height = h;
    const cctx = cached.getContext('2d');
    const idata = cctx.createImageData(w, h);
    for (let py = 0; py < 8; py++) {
      for (let px2 = 0; px2 < 8; px2++) {
        const cidx = grayToIdx(pdata[(py * 8 + px2) * 4]);
        if (transparent && cidx === 0) continue;
        const hex = pal[cidx];
        const rr = parseInt(hex.slice(1, 3), 16);
        const gg = parseInt(hex.slice(3, 5), 16);
        const bb = parseInt(hex.slice(5, 7), 16);
        for (let sy2 = 0; sy2 < SCALE; sy2++)
          for (let sx2 = 0; sx2 < SCALE; sx2++) {
            const i = ((py * SCALE + sy2) * w + (px2 * SCALE + sx2)) * 4;
            idata.data[i] = rr; idata.data[i+1] = gg; idata.data[i+2] = bb; idata.data[i+3] = 255;
          }
      }
    }
    cctx.putImageData(idata, 0, 0);
    tileCache.set(key, cached);
  }
  ctx.drawImage(cached, Math.round(destX * SCALE), Math.round(destY * SCALE));
}

// Draw 2×2 BG metatile (16×16px): chrTiles = [TL, TR, BL, BR] BG tile indices
function drawMetatile(chrTiles, palIdx, px, py) {
  drawCHRTile(chrTiles[0], palIdx, px,   py);
  drawCHRTile(chrTiles[1], palIdx, px+8, py);
  drawCHRTile(chrTiles[2], palIdx, px,   py+8);
  drawCHRTile(chrTiles[3], palIdx, px+8, py+8);
}

// Draw 2×2 sprite (16×16px): sprTiles = [TL, TR, BL, BR] tile indices (0–255)
// pt1=false (default) → sprite bank: PNG index = 256+T
// pt1=true  → BG/PT1 bank (power-ups, eagle, spawn, bullet-expl): PNG index = T directly
function drawSprite16(sprTiles, palIdx, px, py, pt1 = false) {
  const ti = pt1 ? (t => t) : (t => 256 + t);
  drawCHRTile(ti(sprTiles[0]), palIdx, px,   py,   true);
  drawCHRTile(ti(sprTiles[1]), palIdx, px+8, py,   true);
  drawCHRTile(ti(sprTiles[2]), palIdx, px,   py+8, true);
  drawCHRTile(ti(sprTiles[3]), palIdx, px+8, py+8, true);
}

// Draw a single CHR tile magnified 4× (8×8 → 32×32 NES pixels) for big text
// ROM $D87E DrawBigSpriteTile: renders each CHR tile as 4×4 OAM sprites
function drawBigCHRTile(tileAbs, palIdx, destX, destY) {
  if (!chrOff) return;
  // Reuse the normal transparent-mode cached tile (8*SCALE px)
  const key = `${tileAbs}_${palIdx}_1`;
  let cached = tileCache.get(key);
  if (!cached) {
    drawCHRTile(tileAbs, palIdx, -100, -100, true);
    cached = tileCache.get(key);
    if (!cached) return;
  }
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cached,
    Math.round(destX * SCALE), Math.round(destY * SCALE),
    32 * SCALE, 32 * SCALE);
  ctx.imageSmoothingEnabled = prev;
}

// Draw NES-style text using BG-bank CHR font tiles
// ROM $D8F7 DrawSpriteString: ASCII-indexed tiles ($41='A'..$5A='Z', $30='0'..$39='9', $20=space)
// x,y = top-left corner in NES pixels; palIdx = BG palette index
function drawNesText(str, x, y, palIdx) {
  const s = str.toUpperCase();
  if (chrOff) {
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (code >= 0x21 && code <= 0x5F) {
        drawCHRTile(code, palIdx, x + i * 8, y, true);
      }
    }
  } else {
    // Canvas font fallback (before CHR sheet loads)
    ctx.fillStyle = NES_PAL[palIdx][3];
    ctx.font = `bold ${8 * SCALE}px monospace`;
    ctx.fillText(s, Math.round(x * SCALE), Math.round((y + 7) * SCALE));
  }
}

// Draw magnified NES text (4×: each 8×8 char → 32×32 NES pixels)
// ROM $C53E DrawGameOverScreen uses DrawBigSpriteTile for "GAME"/"OVER"
function drawBigNesText(str, x, y, palIdx) {
  const s = str.toUpperCase();
  if (chrOff) {
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (code >= 0x21 && code <= 0x5F) {
        drawBigCHRTile(code, palIdx, x + i * 32, y);
      }
    }
  } else {
    ctx.fillStyle = NES_PAL[palIdx][3];
    ctx.font = `bold ${28 * SCALE}px monospace`;
    ctx.fillText(s, Math.round(x * SCALE), Math.round((y + 28) * SCALE));
  }
}

// ─── Playfield geometry  ──────────────────────────────────────────────────────
// ROM $D5FC TileAddrCompute, ROM $F27D LevelMapData comment (16 px origin)
const FX   = 16;   // ROM $10 — playfield left edge (NES pixels)
const FY   = 16;   // ROM $10 — playfield top edge
const META = 16;   // 2×2 CHR tiles × 8 px = 16 px per metatile
const GW   = 13;   // ROM $F27D grid columns
const GH   = 13;   // ROM $F27D grid rows

// ─── Key positions  ───────────────────────────────────────────────────────────
// ROM $E537 PlayerSpawnX  $E539 PlayerSpawnY  $E531 EnemySpawnX  $E3E2 eagle pos
const P1_SPAWN   = { x: 0x58, y: 0xD8 };   // (88, 216)
const P2_SPAWN   = { x: 0x98, y: 0xD8 };   // (152, 216)
const EAGLE      = { x: 0x78, y: 0xD8 };   // (120, 216)
const EN_SPAWN_X = [0x18, 0x78, 0xD8];     // ROM $E531 — 3 X positions (24,120,216)
const EN_SPAWN_Y = 0x18;                    // 24

// ─── Direction encoding  ──────────────────────────────────────────────────────
// ROM $E529 DirDeltaTable  $E50E DecodeDirection
// 0=UP  1=LEFT  2=DOWN  3=RIGHT
const DX = [ 0, -1,  0,  1];
const DY = [-1,  0,  1,  0];

// ─── Tile type constants  ─────────────────────────────────────────────────────
// ROM $DB79 CHR table  extract_level_maps.py
const T = {
  BRICK_TL:0, BRICK_TR:1, BRICK_BL:2, BRICK_BR:3,
  BRICK:4,
  STEEL_TL:5, STEEL_TR:6, STEEL_BL:7, STEEL_BR:8,
  STEEL:9,
  WATER:10, TREES:11, ICE:12,
  EMPTY:13,
};

// ROM $DB69 TileAttrTable: tile type → BG palette index (indexed by game.js T values)
const TILE_PAL = [0,0,0,0,0, 3,3,3,3,3, 1,2,3];

// ROM $DB79 TileCHRTable: tile type → [TL,TR,BL,BR] BG CHR tile indices
// Brick types (0–4) are null — handled via brickBits in drawTile().
const TILE_CHR = [
  null, null, null, null, null,       // T.BRICK_TL=0 .. T.BRICK=4
  [0x20,0x10,0x20,0x10],              // T.STEEL_TL=5  ROM $DB8D right-col partial
  [0x20,0x20,0x10,0x10],              // T.STEEL_TR=6  ROM $DB91 bottom-row partial
  [0x10,0x20,0x10,0x20],              // T.STEEL_BL=7  ROM $DB95 left-col partial
  [0x10,0x10,0x20,0x20],              // T.STEEL_BR=8  ROM $DB99 top-row partial
  [0x10,0x10,0x10,0x10],              // T.STEEL=9     ROM $DB9D full solid
  [0x12,0x12,0x12,0x12],              // T.WATER=10
  [0x22,0x22,0x22,0x22],              // T.TREES=11
  [0x21,0x21,0x21,0x21],              // T.ICE=12
];

// Brick quadrant CHR tiles from BRICK_FULL metatile [TL,TR,BL,BR]
// ROM $DB89: BRICK_FULL (type4) = [0x0F, 0x0F, 0x0F, 0x0F] (all solid-brick CHR)
// (ROM $DB79 is type0 right-col = [0x00,0x0F,0x00,0x0F] — was incorrectly used before)
const BRICK_QUAD = [0x0F, 0x0F, 0x0F, 0x0F];

// ─── Passability  ─────────────────────────────────────────────────────────────
// ROM $DD30 MoveGridSnap: passable if tile byte >= $12 in ROM tile map
// Our mapping: EMPTY(13), TREES(10), ICE(12) passable; brick/steel/water block
function passable(col, row) {
  if (col < 0 || col >= GW || row < 0 || row >= GH) return false;
  const t = grid[row][col];
  return t === T.EMPTY || t >= 13 || t === T.ICE || t === T.TREES;
}

// ROM MoveGridSnap ($DD4B–$DDBC): probe a single 8×8 pixel point at 8px tile resolution
// Checks sub-quadrant for partial brick tiles (BRICK_TL/TR/BL/BR)
function passable8(px, py) {
  const col = Math.floor((px - FX) / META);
  const row = Math.floor((py - FY) / META);
  if (col < 0 || col >= GW || row < 0 || row >= GH) return false;
  const t = grid[row][col];
  if (t === T.EMPTY || t === T.ICE || t === T.TREES) return true;
  if (t <= T.BRICK) {  // BRICK_TL=0 .. BRICK=4: check 8px sub-quadrant
    const qx = Math.floor(((px - FX) % META) / 8);
    const qy = Math.floor(((py - FY) % META) / 8);
    return !(brickBits[row][col] & (1 << (qy * 2 + qx)));
  }
  return false;  // STEEL variants, WATER block
}

// ─── NES color palette approximations  ────────────────────────────────────────
// ROM $D44A PaletteData  $D475 PaletteColorTable
const C = {
  BG:        '#000000',
  FIELD:     '#000000',
  BRICK:     '#b03000',
  BRICK_HL:  '#e84000',
  STEEL:     '#607090',
  STEEL_HL:  '#a0c0d8',
  TREES:     '#006000',
  TREES_DK:  '#003800',
  WATER:     '#0000b8',
  WATER_HL:  '#2244ff',
  ICE:       '#98c8f8',
  ICE_HL:    '#ffffff',
  EAGLE_OK:  '#c0b000',
  EAGLE_DEAD:'#600000',
  BASE_WALL: '#808080',
  BASE_FORT: '#607090',   // steel walls during shovel power-up
  P1:        '#f8e800',   // yellow
  P2:        '#48c840',   // green
  ENEMY:     '#c8c8c8',
  ENEMY_PU:  '#ff8800',   // flashing power-up tank
  BULLET:    '#ffffff',
  SHIELD:    '#ffff80',
  SPAWN_A:   '#ffffff',
  SPAWN_B:   '#ffff00',
  SPAWN_C:   '#ff8800',
  SPAWN_D:   '#ff4400',
  HUD_BG:    '#000000',
  HUD_TEXT:  '#e8e8e8',
  SCORE_COL: '#f8e800',
  GAMEOVER:  '#f80000',
};

// ─── Game state  ──────────────────────────────────────────────────────────────
let stageIdx;       // ROM $41 StageNum
let frameCount;     // ROM $0A/$0B FrameHi/FrameLo
let gamePhase;      // 'title' | 'start' | 'play' | 'clear' | 'gameover' | 'victory'
let titleFrame;     // frame counter for title screen blink animation
let titleSelect;    // 0 = 1 PLAYER, 1 = 2 PLAYERS (title screen menu cursor)
let titleSelectHeld = false;  // edge-detect for title menu navigation
let numPlayers;     // 1 or 2; set at title screen before game start
let p1Score;        // ROM $15–$1B P1Score (int; BCD in ROM)
let p1Lives;        // ROM $51 P1Lives
let p1NextLifeScore; // ROM $CF44 LivesGrantCheck: next score multiple of 20000 to award a life
let p2Score;        // ROM $1C–$22 P2Score
let p2Lives;        // ROM $52 P2Lives
let p2NextLifeScore;
let hiScore;        // ROM $3D–$43 HiScore (7-digit BCD in ROM; plain int here)
let newHiScorePlayer; // ROM CompareAndUpdateHiScore ($D9F0): 0=none, 1=P1, 2=P2
let enemiesLeft;    // ROM $7F EnemiesRemaining (total to spawn)
let activeEnemyCount;
let freezeTimer;    // ROM $0100 EnemyFreezeTimer (Timer power-up)
let shovelTimer;    // ROM $45 PowerUpTimer for shovel/fortify
let eagleAlive;
let eagleExpTimer;   // ROM $68 EagleDestructionTimer: 39→0 over 39 frames; drives EagleStateUpdate ($E386)
let spawnRot;       // ROM $6A SpawnRotIdx (0→1→2→0 cycling)
let spawnDelay;     // ROM $82 SpawnDelay countdown
let phaseTimer;     // stage-start / clear / gameover display timer
let powerUp;        // { x, y, type } or null
let puFlashTimer;   // ROM $62: 50-frame countdown after power-up collected; flash sprite shown
let puFlashPos;     // { x, y } position where flash is drawn
let grid;           // GH×GW array of tile types (mutable, brick quarters get cleared)
let brickBits;      // GH×GW 4-bit brick sub-tile masks  ROM $D745 SubTileBitmask
let entities;       // 8 entity objects (slots 0-7)
let bullets;        // 10 bullet slots (0-7 primary per entity; 8-9 player double-shot)
let playerRespawnTimer = [0, 0];  // per-player respawn timers
let goScrollX;       // ROM $0105: X position of in-field "GAME OVER" sprites
let goScrollY;       // ROM $0106: Y position of in-field "GAME OVER" sprites (240=off-screen)
let goScrollDir;     // ROM $0107: direction index (0=up,1=left,2=down,3=right) into wiggle tables
let goScrollTimer;   // ROM $0108: countdown (17→0, decrements every 16 frames; 0=inactive)
let goScrollFrame;   // frame counter for 16-frame decrement interval
let killCounts;             // [4] per-type enemy kills this stage  ROM $C625 ClearKillTallies
let tallyState;             // tally animation state during 'clear' phase
let victoryPhase;           // ROM $C44D DrawVictoryScreen phases: 0=peace text, 1=scroll, 2=war-end text, 3=wait
let victoryTimer;           // frame counter for current victory phase
let victoryScrollX;         // ROM $4F: horizontal scroll offset (0→240 over 240 frames)

// ─── Brick sub-tile init  ─────────────────────────────────────────────────────
// ROM $D745 SubTileBitmask: bit0=TL, bit1=TR, bit2=BL, bit3=BR
// ROM $DB79 TileCHRTable types 0–3 are half-wall metatiles (2 of 4 sub-tiles filled):
//   Type 0 right-col  [00,0F,00,0F] → TR+BR = 0b1010
//   Type 1 bottom-row [00,00,0F,0F] → BL+BR = 0b1100
//   Type 2 left-col   [0F,00,0F,00] → TL+BL = 0b0101
//   Type 3 top-row    [0F,0F,00,00] → TL+TR = 0b0011
function brickInitBits(t) {
  if (t === T.BRICK_TL) return 0b1010;  // TR+BR (right col)
  if (t === T.BRICK_TR) return 0b1100;  // BL+BR (bottom row)
  if (t === T.BRICK_BL) return 0b0101;  // TL+BL (left col)
  if (t === T.BRICK_BR) return 0b0011;  // TL+TR (top row)
  if (t === T.BRICK)    return 0b1111;
  return 0;
}

// ─── Entity factory  ──────────────────────────────────────────────────────────
function makeEntity(slot) {
  return {
    slot,
    x: 0, y: 0,
    dir: 0,           // ROM $A0,X bits 1:0  (0=UP 1=LEFT 2=DOWN 3=RIGHT)
    alive: false,
    type: 0,          // ROM $A8,X enemy tier 0-3 (affects score + armor)
    starLevel: 0,     // ROM $0101,X  0/$20/$40/$60 — player weapon upgrade
    shieldTimer: 0,   // ROM $89,X  countdown; >0 = shielded
    armorHits: 0,     // remaining armor hits before death  ROM $E8B1
    powerUpTank: false,// flashing tank carrying power-up  ROM $E417 $7F==17/10/3
    blinkFrame: 0,    // armor-hit blink countdown
    spawnAnim: 0,     // spawn star animation frames  ROM $DF09 StateIncSlot
    animBit: 0,       // track animation frame: 0 or 4; XOR'd each 8px movement step  ROM $DD18/$DDE1 EOR #$04
    aiTimer: 0,       // AI direction-change countdown  ROM $DDFC RandomDirChange
    fireTimer: 0,     // unused; ROM $E216 uses per-frame 1/32 check instead
    deathTimer: 0,    // death explosion countdown: 12→0, drawn even while alive=false  ROM $E073 EntityKillDispatch
    lastHitBy: 0,     // player slot that last hit this entity (for score routing in 2P)
    isPlayer: slot < 2,
  };
}

// ─── Bullet factory  ──────────────────────────────────────────────────────────
// ROM $CC,X BulletState  $B8,X BulletX  $C2,X BulletY  $D6,X BulletDouble
function makeBullet(slot) {
  return { slot, x: 0, y: 0, dir: 0, active: false, armor: false, owner: -1, explodeTimer: 0, ex: 0, ey: 0, edir: 0 };
}

// ROM $E1AF BulletExplode: 4-frame explosion sprite at bullet hit position
function triggerBulletExplosion(b) {
  b.explodeTimer = 4;
  b.ex    = b.x - 5;   // ROM $DAF3: OAM X = bullet.x − 5
  b.ey    = b.y - 8;   // ROM $DABA DrawEntityTile: OAM Y = bullet.y − 8
  b.edir  = b.dir;
}

// ─── Level init  ──────────────────────────────────────────────────────────────
// ROM $F239 LevelTileLoader  $E4D0 ClearEntitySlots  $E4C6 ClearBulletSlots
// ROM $C33D LevelStart  $C625 ClearKillTallies
function initLevel(idx) {
  stageIdx          = idx % LEVEL_MAPS.length;  // ROM loops back to stage 1 after stage 35
  setCHRBank(stageIdx);                         // Mapper 99: select CHR bank pair per stage
  frameCount        = 0;
  gamePhase         = 'start';
  phaseTimer        = 180;   // ~3 s stage-start banner  ROM $CFAA PreGameDraw
  eagleAlive        = true;
  eagleExpTimer     = 0;
  freezeTimer       = 0;
  shovelTimer       = 0;
  powerUp           = null;
  puFlashTimer      = 0;
  puFlashPos        = null;
  spawnRot          = 0;     // ROM $6A SpawnRotIdx
  spawnDelay        = Math.max(50, 190 - stageIdx * 4); // ROM $84 SpawnDelayMax: 190 - stageNum*4, min 50
  enemiesLeft       = 20;    // ROM $7F EnemiesRemaining: 20 per stage
  activeEnemyCount  = 0;
  playerRespawnTimer = [0, 0];
  goScrollX     = 0x70;  // ROM $0105 = $70 (center X = 112)
  goScrollY     = 240;   // off-screen
  goScrollDir   = 0;     // ROM $0107 = 0 (up)
  goScrollTimer = 0;     // inactive
  goScrollFrame = 0;
  killCounts = [0, 0, 0, 0];   // ROM $C625 ClearKillTallies: four counters reset each stage
  tallyState = null;

  // Copy level grid from ROM data  ROM $F27D LevelMapData
  const raw = LEVEL_MAPS[stageIdx];
  grid      = raw.map(r => [...r]);

  // Brick sub-tile bits  ROM $D745
  brickBits = grid.map(r => r.map(t => brickInitBits(t)));
  // Normalize partial-brick display types 0–3 → T.BRICK (4) in the grid;
  // brickBits already captures the correct 2-quadrant pattern above.
  grid.forEach((r, ri) => r.forEach((t, ci) => {
    if (t >= T.BRICK_TL && t < T.BRICK) grid[ri][ci] = T.BRICK;
  }));

  // Init entity slots  ROM $E4D0 ClearEntitySlots
  entities = Array.from({ length: 8 }, (_, i) => makeEntity(i));

  // Init bullet slots  ROM $E4C6 ClearBulletSlots
  bullets  = Array.from({ length: 10 }, (_, i) => makeBullet(i));

  // Spawn players  ROM $E417 PlayerRespawn
  spawnPlayer(0);
  if (numPlayers === 2) spawnPlayer(1);
}

// ─── Player respawn  ──────────────────────────────────────────────────────────
// ROM $E417 PlayerRespawn (player branch)  $E539 PlayerSpawnX/Y
function spawnPlayer(slot) {
  const e   = entities[slot];
  const pos = slot === 0 ? P1_SPAWN : P2_SPAWN;
  e.x           = pos.x;
  e.y           = pos.y;
  e.dir         = 0;      // UP  ROM $E53B InitState players=$A0
  e.alive       = true;
  e.spawnAnim   = 60;     // spawn star anim  ROM $DF09 StateIncSlot/$DF18 StateIncFire
  e.shieldTimer = 3;      // spawn shield: 3 ticks × 64 frames = 192 frames  ROM $89,X
  e.starLevel   = 0;      // ROM $0101,X reset on death
  e.blinkFrame  = 0;
}

// ─── Enemy type table  ────────────────────────────────────────────────────────
// ROM $E5A9 EnemyTypeTable (140 B) + $E6A9 SpeedTable (36 entries × 4 B)
// EnemySpawn ($E46C): slot counts from SpeedTable[$85-1]; type = EnemyTypeTable[($85-1)*4+slot]
// $80=Basic(0), $A0=Fast(1), $C0=Power(2), $E0=Armor(3)
// 35 stages × 20 enemies; slots emitted in order (slot0 count times, then slot1, etc.)
const ENEMY_TYPE_TABLE = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1],  // stage 1
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,3,3],  // stage 2
  [1,1,1,1,1,2,2,2,2,2,3,3,3,3,3,0,0,0,0,0],  // stage 3
  [2,2,2,2,2,2,2,2,1,1,1,1,1,0,0,0,0,3,3,3],  // stage 4
  [2,2,2,2,2,3,3,0,0,0,0,0,0,0,0,1,1,1,1,1],  // stage 5
  [3,3,3,1,1,1,1,2,2,2,2,2,2,0,0,0,0,0,0,0],  // stage 6
  [0,0,0,0,0,0,0,0,1,1,1,1,1,1,2,2,2,2,3,3],  // stage 7
  [2,2,2,2,2,2,2,3,3,1,1,1,1,0,0,0,0,0,0,0],  // stage 8
  [2,2,2,2,2,2,2,2,1,1,1,1,1,1,3,3,3,3,3,3],  // stage 9
  [1,1,1,1,1,3,3,3,3,2,2,2,2,2,2,1,1,1,1,1],  // stage 10
  [2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,3,3,3,3],  // stage 11
  [2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,3,3,3,3],  // stage 12
  [2,2,2,2,2,2,2,2,3,3,3,3,1,1,1,1,1,0,0,0],  // stage 13
  [0,0,0,0,0,0,0,0,1,1,1,2,2,2,2,2,2,2,3,3],  // stage 14
  [0,0,1,1,1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3],  // stage 15
  [0,0,0,0,0,0,2,2,1,1,1,1,1,1,1,1,3,3,3,3],  // stage 16
  [3,3,1,1,2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0],  // stage 17
  [3,3,3,3,3,0,0,2,2,2,2,1,1,1,1,1,1,1,1,1],  // stage 18
  [1,1,1,1,3,3,3,3,3,3,3,3,0,0,0,0,2,2,2,2],  // stage 19
  [1,1,1,1,1,1,3,3,3,3,3,3,3,3,2,2,1,1,1,1],  // stage 20
  [2,2,2,2,2,2,2,1,1,1,0,0,0,0,0,0,0,0,3,3],  // stage 21
  [1,1,1,1,1,1,1,1,1,0,0,2,2,2,2,2,3,3,3,3],  // stage 22
  [3,3,3,3,3,3,2,2,2,2,1,1,1,1,1,1,1,1,1,1],  // stage 23
  [2,2,3,3,3,3,3,3,1,1,1,1,1,1,1,1,1,1,1,1],  // stage 24
  [2,2,1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3],  // stage 25
  [3,3,3,3,3,3,3,3,1,1,1,1,1,1,1,1,0,0,2,2],  // stage 26
  [2,2,3,3,3,3,3,3,3,3,1,1,1,1,1,1,1,1,1,1],  // stage 27
  [1,1,1,1,1,1,1,3,3,3,3,0,0,0,0,2,2,2,2,2],  // stage 28
  [2,2,2,2,2,2,2,2,2,2,1,1,1,1,3,3,3,3,3,3],  // stage 29
  [0,0,1,1,1,1,1,1,1,1,2,2,3,3,3,3,3,3,3,3],  // stage 30
  [2,2,2,1,1,1,1,1,1,1,1,3,3,3,3,3,3,2,2,2],  // stage 31
  [3,3,3,3,3,3,3,3,0,0,0,0,2,2,1,1,1,1,1,1],  // stage 32
  [1,1,1,1,1,1,1,1,3,3,3,3,1,1,1,1,1,1,1,1],  // stage 33
  [2,2,1,1,1,1,1,1,1,1,1,1,1,3,3,3,3,3,3,3],  // stage 34
  [2,2,2,2,1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3],  // stage 35
];

// ─── Enemy spawn  ─────────────────────────────────────────────────────────────
// ROM $DBF6 EnemySpawnDispatch  $E417 PlayerRespawn (enemy branch)  $E531 EnemySpawnX
function spawnEnemy() {
  if (enemiesLeft <= 0)        return;
  if (activeEnemyCount >= 4)   return;   // max 4 on screen simultaneously

  for (let i = 2; i <= 7; i++) {
    const e = entities[i];
    if (e.alive || e.deathTimer > 0) continue;

    e.x          = EN_SPAWN_X[spawnRot % 3];  // ROM $6A SpawnRotIdx → $E531
    e.y          = EN_SPAWN_Y;
    e.dir        = 2;     // DOWN  ROM $E53B InitState enemies=$A2
    e.alive      = true;
    e.spawnAnim  = 60;

    // Enemy type: per-stage sequence from ROM $E5A9 EnemyTypeTable + $E6A9 SpeedTable
    // spawnIdx = enemies already spawned = 20 - enemiesLeft (0..19)
    const typeRow = ENEMY_TYPE_TABLE[Math.min(stageIdx, ENEMY_TYPE_TABLE.length - 1)];
    e.type       = typeRow[20 - enemiesLeft];

    // Power-up tank: flag at 17/10/3 remaining  ROM $E417 $7F==17/10/3
    e.powerUpTank = (enemiesLeft === 17 || enemiesLeft === 10 || enemiesLeft === 3);

    // Armor hits: only type 3 gets armor (bits 0-1 of $A8,X; set at $E4B5: ORA #$03)
    // ROM $E4B1: CMP #$E0; only type 3 gets ORA #$03. Types 0/1/2 have 0 armor bits.
    // Armor check at $E989: AND #$03; BEQ kill; DEC. Start=3 → 4 total hits.
    e.armorHits  = e.type >= 3 ? 3 : 0;
    e.shieldTimer = 0;
    e.aiTimer    = 40 + Math.floor(Math.random() * 80);
    e.fireTimer  = 0; // not used; firing uses per-frame 1/32 check
    e.blinkFrame = 0;

    spawnRot = (spawnRot + 1) % 3;   // ROM $6A INC SpawnRotIdx
    enemiesLeft--;
    activeEnemyCount++;
    return;
  }
}

// ─── Input  ───────────────────────────────────────────────────────────────────
// ROM $D68A NMI_Sub2  $DC23 PlayerInputUpdate
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyM') toggleSound();  // M = mute/unmute
  e.preventDefault();
});
window.addEventListener('keyup',   e => { keys[e.code] = false; });

// Returns direction (0-3) or -1 if no d-pad held
// P1: Arrows (+ WASD in 1P mode); P2: WASD
function p1Dir() {
  if (keys['ArrowUp'])    return 0;
  if (keys['ArrowLeft'])  return 1;
  if (keys['ArrowDown'])  return 2;
  if (keys['ArrowRight']) return 3;
  if (numPlayers === 1) {
    if (keys['KeyW']) return 0;
    if (keys['KeyA']) return 1;
    if (keys['KeyS']) return 2;
    if (keys['KeyD']) return 3;
  }
  return -1;
}
function p2Dir() {
  if (keys['KeyW']) return 0;
  if (keys['KeyA']) return 1;
  if (keys['KeyS']) return 2;
  if (keys['KeyD']) return 3;
  return -1;
}

// ─── Collision helpers  ───────────────────────────────────────────────────────
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Can entity e move 1 px in direction d?
// ROM $DD30 MoveGridSnap: probes 2 leading-edge points at 8px tile resolution
const TANK_SZ = 16;  // ROM 16×16 tank; entity_X/Y are center coords

function canMove(e, d) {
  const nx = e.x + DX[d];
  const ny = e.y + DY[d];

  // Playfield boundary  ROM $DE22 ClampXMove  $DE2A ClampYMove
  // nx/ny are center coords; top-left = nx-8, ny-8
  if (nx - 8 < FX || nx - 8 + TANK_SZ > FX + GW * META) return false;
  if (ny - 8 < FY || ny - 8 + TANK_SZ > FY + GH * META) return false;

  // Eagle zone  ROM $E838 eagle tile check ($C8)
  if (eagleAlive && rectsOverlap(nx - 8, ny - 8, TANK_SZ, TANK_SZ, EAGLE.x - 8, EAGLE.y - 8, 24, 16)) return false;

  // Tile collision: 2 leading-edge probe points at 8px tile resolution
  // ROM MoveGridSnap ($DD4B–$DDBC): probes top and bottom of leading edge
  // UP: (nx-8,ny-8),(nx+7,ny-8)  LEFT: (nx-8,ny-8),(nx-8,ny+7)
  // DOWN: (nx-8,ny+7),(nx+7,ny+7)  RIGHT: (nx+7,ny-8),(nx+7,ny+7)
  let p1x, p1y, p2x, p2y;
  if      (d === 0) { p1x = nx - 8; p1y = ny - 8; p2x = nx + 7; p2y = ny - 8; }  // UP
  else if (d === 1) { p1x = nx - 8; p1y = ny - 8; p2x = nx - 8; p2y = ny + 7; }  // LEFT
  else if (d === 2) { p1x = nx - 8; p1y = ny + 7; p2x = nx + 7; p2y = ny + 7; }  // DOWN
  else              { p1x = nx + 7; p1y = ny - 8; p2x = nx + 7; p2y = ny + 7; }  // RIGHT
  if (!passable8(p1x, p1y) || !passable8(p2x, p2y)) return false;

  // Entity–entity collision  ROM $DC23 position-snap prevents overlap
  for (let i = 0; i < 8; i++) {
    const o = entities[i];
    if (!o.alive || o === e || o.spawnAnim > 0) continue;
    if (rectsOverlap(nx - 8, ny - 8, TANK_SZ, TANK_SZ, o.x - 8, o.y - 8, TANK_SZ, TANK_SZ)) return false;
  }
  return true;
}

// ─── Entity movement  ─────────────────────────────────────────────────────────
// ROM $DC23 PlayerInputUpdate  $E06A MoveTank  $DD30 MoveGridSnap
function moveEntities() {
  for (let i = 0; i < 8; i++) {
    const e = entities[i];
    if (!e.alive || e.spawnAnim > 0) continue;

    // ROM $DD30 MoveGridSnap: ice tile ($1B/$1C) causes momentum/sliding
    const icol = Math.floor((e.x - FX) / META);
    const irow = Math.floor((e.y - FY) / META);
    const onIce = irow >= 0 && irow < GH && icol >= 0 && icol < GW && grid[irow][icol] === T.ICE;

    if (e.isPlayer) {
      // Skip P2 slot in 1P mode
      if (e.slot === 1 && numPlayers === 1) continue;
      // ROM $DC23 frame throttle: process on 3 of every 4 frames
      if ((frameCount & 3) === 2) continue;

      const d = e.slot === 0 ? p1Dir() : p2Dir();
      if (!onIce) {
        // Off ice: normal input — stop if no key, allow direction change
        if (d === -1) continue;
        // Direction change: snap to 8-px grid  ROM $DC23  (+4)&$F8
        if (d !== e.dir) {
          e.x = (e.x + 4) & 0xF8;
          e.y = (e.y + 4) & 0xF8;
          e.dir = d;
        }
      }
      // On ice: ignore input — keep sliding in current direction, no direction change
      if (canMove(e, e.dir)) {
        const px = e.x, py = e.y;
        e.x += DX[e.dir];
        e.y += DY[e.dir];
        if (((e.x ^ px) | (e.y ^ py)) & 8) e.animBit ^= 4;  // ROM $DD18/$DDE1: EOR #$04 each 8px step
      }
    } else {
      // Enemy: frozen during Timer power-up  ROM $0100 EnemyFreezeTimer
      if (freezeTimer > 0) continue;

      // ROM $DC9F: Fast type ($A0, EntityType&$F0==$A0) always processes; others alternate
      if (e.type !== 1 && ((i ^ frameCount) & 1)) continue;

      // AI: change direction when blocked or timer expires (suppressed on ice)
      // ROM $DDFC RandomDirChange  $DE48 DirTowardHQ
      e.aiTimer--;
      const blocked = !canMove(e, e.dir);
      if (!onIce && (blocked || e.aiTimer <= 0)) {
        // 50% navigate toward eagle, 50% random  ROM $DF26 SpeedCtrlMove
        if (Math.random() < 0.5) {
          e.dir = dirToward(e.x, e.y, EAGLE.x, EAGLE.y);
        } else {
          // ROM $DDFC: 25% turn right, 25% turn left, 50% random
          const r = Math.random();
          if (r < 0.33)      e.dir = (e.dir + 1) & 3;
          else if (r < 0.66) e.dir = (e.dir + 3) & 3;
          else               e.dir = Math.floor(Math.random() * 4);
        }
        e.aiTimer = 20 + Math.floor(Math.random() * 80);
      }
      if (canMove(e, e.dir)) {
        const px = e.x, py = e.y;
        e.x += DX[e.dir];   // enemies 1 px/step vs player 2 px/step
        e.y += DY[e.dir];
        if (((e.x ^ px) | (e.y ^ py)) & 8) e.animBit ^= 4;  // ROM $DD18/$DDE1: EOR #$04 each 8px step
      }
    }
  }
}

// ROM $DE56 CalcDirToTarget: sign(targetX-entityX)×dx + sign(targetY-entityY)×dy
function dirToward(ex, ey, tx, ty) {
  const adx = Math.abs(tx - ex), ady = Math.abs(ty - ey);
  if (adx > ady) return tx > ex ? 3 : 1;  // horizontal dominant
  return ty > ey ? 2 : 0;                  // vertical dominant
}

// ─── Firing  ──────────────────────────────────────────────────────────────────
// ROM $E140 FireBullet  $E1D6 PlayerFireCheck  $E216 EnemyFireCheck
let fireHeld = [false, false];  // per-player fire-held state

function handlePlayerFire() {
  // P1 fire: Space / X / J (+ E in 1P mode)
  const p1press = !!(keys['Space'] || keys['KeyX'] || keys['KeyJ'] || (numPlayers === 1 && keys['KeyE']));
  if (p1press && !fireHeld[0]) {
    const e = entities[0];
    if (e.alive && e.spawnAnim === 0) tryFire(e);
  }
  fireHeld[0] = p1press;

  // P2 fire: E / Q  (only in 2P mode)
  if (numPlayers === 2) {
    const p2press = !!(keys['KeyE'] || keys['KeyQ']);
    if (p2press && !fireHeld[1]) {
      const e = entities[1];
      if (e.alive && e.spawnAnim === 0) tryFire(e);
    }
    fireHeld[1] = p2press;
  }
}

// ROM $E216 EnemyFireCheck: for each active enemy, fire if RNG & $1F == 0 (1/32 per frame)
function handleEnemyFire() {
  if (freezeTimer > 0) return;
  for (let i = 2; i <= 7; i++) {
    const e = entities[i];
    if (!e.alive || e.spawnAnim > 0) continue;
    if ((Math.random() * 32 | 0) === 0) tryFire(e);
  }
}

// ROM $E140 FireBullet: set $CC,X = dir|$40; compute start pos from entity center
function tryFire(e) {
  // Primary bullet slot = entity index  ROM $CC,X BulletState
  let b = bullets[e.slot];
  if (b.active) {
    // Double-shot: starLevel >= $40  ROM $D6,X bit0  $0101,X >= $40
    if (e.starLevel < 0x40) return;
    const sec = e.slot < 2 ? 8 + e.slot : null;
    if (sec === null || bullets[sec].active) return;
    b = bullets[sec];
  }
  // Bullet spawn position: from entity center toward direction  ROM $E140
  // e.x/e.y are center coords (ROM convention)
  b.x      = e.x + DX[e.dir] * 9;
  b.y      = e.y + DY[e.dir] * 9;
  b.dir    = e.dir;
  b.active       = true;
  b.explodeTimer = 0;
  b.armor        = e.starLevel >= 0x60;  // armor-piercing at max star  ROM $D6,X bit1
  b.owner        = e.slot;
  if (e.isPlayer) sfxPlayerFire(); else sfxEnemyFire();  // ROM sound triggers
}

// ─── Bullet movement + tile collision  ────────────────────────────────────────
// ROM $E7A9 BulletMoveCollision  $E838 BulletTileCollision
const BULLET_SPD = 4;   // ROM $E117 BulletDelta: applies delta × 4

function moveBullets() {
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b.active) continue;

    // Alternating-frame skip  ROM $E7A9: TXA EOR $0B AND #$01 BEQ skip
    // slot index XOR frameLo parity → move only on even (slot^frame) frames
    if ((b.slot ^ frameCount) & 1) continue;

    b.x += DX[b.dir] * BULLET_SPD;
    b.y += DY[b.dir] * BULLET_SPD;

    // Out of field bounds  ROM $E838 boundary
    if (b.x < FX - 4 || b.x > FX + GW * META + 4 ||
        b.y < FY - 4 || b.y > FY + GH * META + 4) {
      b.active = false;
      continue;
    }

    // Eagle hit  ROM $E838: eagle tile $C8 → set $68=$27=39 (eagle-destruction timer)
    if (eagleAlive &&
        Math.abs(b.x - EAGLE.x) < 12 &&
        Math.abs(b.y - EAGLE.y) < 8) {
      eagleAlive    = false;
      eagleExpTimer = 39;  // ROM $E838 STA #$27 → $68; $27=39 decimal
      sfxEagleHit();  // ROM $030B=1
      triggerBulletExplosion(b);
      b.active = false;
      continue;
    }

    // Tile collision  ROM $E838 BulletTileCollision
    if (bulletHitsTile(b)) {
      triggerBulletExplosion(b);
      b.active = false;
    }
  }
  // Decrement explosion timers for inactive (just-destroyed) bullets
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b.active && b.explodeTimer > 0) b.explodeTimer--;
  }
}

// ROM $E838 BulletTileCollision: checks tile at bullet position
// Returns true if bullet should be stopped
function bulletHitsTile(b) {
  const col = Math.floor((b.x - FX) / META);
  const row = Math.floor((b.y - FY) / META);
  if (col < 0 || col >= GW || row < 0 || row >= GH) return false;

  const t = grid[row][col];

  // Steel: stop bullet  ROM $E838 steel check  $030D=1 if player bullet
  // Armor-piercing (starLevel >= $60): destroy steel  ROM $E83E TileDestroyIfNoEntity ($D77F)
  if (t === T.STEEL || (t >= T.STEEL_TL && t <= T.STEEL_BR)) {
    if (b.armor) grid[row][col] = T.EMPTY;
    if (b.owner < 2) sfxSteelHit();  // ROM $030D=1 player bullet hits steel
    return true;
  }

  // Water: stop bullet, no destroy  ROM $E838 water check
  if (t === T.WATER) { if (b.owner < 2) sfxSteelHit(); return true; }  // ROM $030D=1

  // Brick: destroy quarter  ROM $D763 TileDestroyBrick  $D745 SubTileBitmask
  if (t === T.BRICK || (t >= T.BRICK_TL && t <= T.BRICK_BR)) {
    destroyBrick(row, col, b.x, b.y);
    if (b.owner < 2) sfxBrickHit();  // ROM $030C=1
    return true;
  }
  return false;
}

// ROM $D763 TileDestroyBrick  $D745 SubTileBitmask
// Quarter mask: bit0=TL  bit1=TR  bit2=BL  bit3=BR
function destroyBrick(row, col, bx, by) {
  const localX = bx - (FX + col * META);
  const localY = by - (FY + row * META);
  const qx = localX >= 8 ? 1 : 0;
  const qy = localY >= 8 ? 1 : 0;
  const mask = 1 << (qy * 2 + qx);

  brickBits[row][col] &= ~mask;
  const bits = brickBits[row][col];

  // Update tile type to reflect remaining quarters  ROM $D763
  if      (bits === 0)      grid[row][col] = T.EMPTY;
  else if (bits === 0b0001) grid[row][col] = T.BRICK_TL;
  else if (bits === 0b0010) grid[row][col] = T.BRICK_TR;
  else if (bits === 0b0100) grid[row][col] = T.BRICK_BL;
  else if (bits === 0b1000) grid[row][col] = T.BRICK_BR;
  else                      grid[row][col] = T.BRICK;
}

// ─── Bullet–entity collision  ─────────────────────────────────────────────────
// ROM $E8B1 EnemyBulletPlayerHit: 10×10 px proximity check
function bulletEntityCollision() {
  for (let bi = 0; bi < bullets.length; bi++) {
    const b = bullets[bi];
    if (!b.active) continue;

    const isPlayerBullet = b.owner < 2;

    for (let ei = 0; ei < 8; ei++) {
      const e = entities[ei];
      if (!e.alive || e.spawnAnim > 0) continue;
      if ((ei < 2) === isPlayerBullet) continue;  // same team
      if (ei === b.owner) continue;

      // 10×10 px hit check  ROM $E8B1  (e.x/e.y are center coords)
      if (Math.abs(b.x - e.x) >= 10) continue;
      if (Math.abs(b.y - e.y) >= 10) continue;

      triggerBulletExplosion(b);
      b.active = false;

      if (!isPlayerBullet) {
        // Enemy bullet → player  ROM $E8B1
        if (e.shieldTimer > 0) continue;  // shield deflects
        killEntity(e);
      } else {
        // Player bullet → enemy  ROM $E8B1 armor check  $EA63 flash
        e.lastHitBy = b.owner;  // track which player gets the kill score
        if (e.armorHits > 0) {
          e.armorHits--;
          e.blinkFrame = 20;   // brief blink to signal hit  ROM $EA63
          sfxArmorHit();  // ROM $030E=1 player bullet hits armored tank
        } else {
          killEntity(e);
        }
      }
    }
  }
}

// ─── Bullet–bullet cancel  ────────────────────────────────────────────────────
// ROM $EAB5 BulletVsBulletCancel: player bullet vs enemy bullet within 6 px
function bulletBulletCancel() {
  // Player bullet slots: 0, 8 (P1), 1, 9 (P2)  ROM $EAB5: slot&$06==0
  const playerSlots = numPlayers === 2 ? [0, 1, 8, 9] : [0, 8];
  for (const pi of playerSlots) {
    const pb = bullets[pi];
    if (!pb.active) continue;
    for (let ei = 2; ei <= 7; ei++) {
      const eb = bullets[ei];
      if (!eb.active) continue;
      if (Math.abs(pb.x - eb.x) < 6 && Math.abs(pb.y - eb.y) < 6) {
        triggerBulletExplosion(pb);
        triggerBulletExplosion(eb);
        pb.active = false;
        eb.active = false;
      }
    }
  }
}

// ROM $C62F/$C63E CheckGameOver: start in-field "GAME OVER" scroll
// Center-up when both players dead; called from main gameplay loop
function checkGameOverScroll() {
  // In 2P, only trigger center scroll when BOTH players are out of lives
  if (numPlayers === 2 && (p1Lives >= 0 || p2Lives >= 0)) return;
  if (goScrollTimer === 0) {
    goScrollX     = 0x70;  // ROM $0105 = $70 (center X = 112)
    goScrollY     = 0xF0;  // ROM $0106 = $F0 (off-screen bottom)
    goScrollDir   = 0;     // ROM $0107 = 0 (up)
    goScrollTimer = 0x11;  // ROM $0108 = $11 (17)
    goScrollFrame = 0;     // ROM $0B = 0
  }
}

// ROM $DECC: Single-player death in 2P mode — scroll from dead player's side
// P1 dies (playerIdx=0): scroll from X=$20 moving right toward P2
// P2 dies (playerIdx=1): scroll from X=$C0 moving left toward P1
function startPlayerDeathScroll(playerIdx) {
  if (goScrollTimer > 0) return;  // already scrolling
  if (!eagleAlive) return;        // ROM $DECC: only when eagle intact ($68=$80)
  if (playerIdx === 0 && p2Lives >= 0) {
    // P1 out of lives, P2 still alive → scroll from left moving right
    goScrollDir   = 3;     // ROM $0107 = 3 (right)
    goScrollX     = 0x20;  // ROM $0105 = $20 (X = 32)
    goScrollY     = 0xD8;  // ROM $0106 = $D8 (Y = 216)
    goScrollTimer = 0x0D;  // ROM $0108 = $0D (13)
    goScrollFrame = 0;
  } else if (playerIdx === 1 && p1Lives >= 0) {
    // P2 out of lives, P1 still alive → scroll from right moving left
    goScrollDir   = 1;     // ROM $0107 = 1 (left)
    goScrollX     = 0xC0;  // ROM $0105 = $C0 (X = 192)
    goScrollY     = 0xD8;  // ROM $0106 = $D8 (Y = 216)
    goScrollTimer = 0x0D;  // ROM $0108 = $0D (13)
    goScrollFrame = 0;
  }
}

// ─── Entity death  ────────────────────────────────────────────────────────────
// ROM $DEBA PlayerKilled  $DEC9 EnemyKilled
function killEntity(e) {
  if (!e.alive) return;
  e.alive = false;
  e.deathTimer = 12;  // ROM $E073: 3-phase explosion × 4 frames each

  if (e.isPlayer) {
    // ROM $DEBA/$DEBC: DEC $51/$52 lives for P1/P2
    const slot = e.slot;
    if (slot === 0) {
      p1Lives--;
      if (p1Lives < 0) {
        if (numPlayers === 2) startPlayerDeathScroll(0);  // ROM $DECC: P1 dead in 2P
        checkGameOverScroll();
      } else {
        playerRespawnTimer[0] = 120;
      }
    } else {
      p2Lives--;
      if (p2Lives < 0) {
        if (numPlayers === 2) startPlayerDeathScroll(1);  // ROM $DECC: P2 dead in 2P
        checkGameOverScroll();
      } else {
        playerRespawnTimer[1] = 120;
      }
    }
  } else {
    // ROM $DEC9: DEC $80 EnemyKillsPool; ROM $D2C2 KillScoreTable
    activeEnemyCount--;
    const pts = (1 + Math.min(e.type, 3)) * 100;  // 100/200/300/400
    // Award score to whichever player's bullet killed this enemy
    // (tracked by e.lastHitBy set in bulletEntityCollision; default P1)
    const killer = e.lastHitBy || 0;
    if (killer === 0) {
      p1Score += pts;
      while (p1Score >= p1NextLifeScore) { p1Lives++; sfxLifeUp(0); p1NextLifeScore += 20000; }
    } else {
      p2Score += pts;
      while (p2Score >= p2NextLifeScore) { p2Lives++; sfxLifeUp(1); p2NextLifeScore += 20000; }
    }
    killCounts[Math.min(e.type, 3)]++;  // ROM $CD04 TallyScreenInit: per-type kill counter

    sfxEntityKill();  // ROM $030A=1 entity kill explosion + noise burst

    // Power-up tank drops power-up  ROM $E35D PowerUpSpawn
    if (e.powerUpTank && !powerUp) {
      spawnPowerUp();
    }
  }
}

// ─── Power-ups  ───────────────────────────────────────────────────────────────
// ROM $E35D PowerUpSpawn  $EB17 PowerUpCollision  $EB87 dispatch table
// ROM $EA9F PowerUpTypeRNG weight table: 8 entries, types 0–4 only; type 5 (1-Up) never random
const POWERUP_RNG = [0, 1, 2, 3, 4, 0, 4, 3];
// ROM $EA63 PowerUpSpawnPickPos: RNG & 0x03 → RNGToCoord: coord = ((A+1)*6)*8
// → 4 possible values: {48, 96, 144, 192} for both X and Y, independent of entity position
// Collision retry if new position overlaps existing power-up.
const POWERUP_COORDS = [48, 96, 144, 192];
function spawnPowerUp() {
  const type = POWERUP_RNG[Math.floor(Math.random() * 8)];
  let x, y;
  for (let attempt = 0; attempt < 8; attempt++) {
    x = POWERUP_COORDS[Math.floor(Math.random() * 4)];
    y = POWERUP_COORDS[Math.floor(Math.random() * 4)];
    if (!powerUp || Math.abs(x - powerUp.x) >= 8 || Math.abs(y - powerUp.y) >= 8) break;
  }
  powerUp = { x, y, type };
  sfxPowerUpAppear();  // ROM $0309=1
}

function checkPowerUpCollision() {
  if (!powerUp) return;
  for (let i = 0; i < 2; i++) {
    const e = entities[i];
    if (!e.alive || e.spawnAnim > 0) continue;
    // ROM $EB17: within 12 px of effect position ($86/$87)  (e.x/e.y are center coords)
    if (Math.abs(e.x - powerUp.x) < 12 && Math.abs(e.y - powerUp.y) < 12) {
      applyPowerUp(e, powerUp.type);
      // ROM $EB4D: STA $62 #$32 — start 50-frame flash at collect position
      puFlashPos = { x: powerUp.x, y: powerUp.y };
      puFlashTimer = 50;
      powerUp = null;
      return;
    }
  }
}

// ROM $EB87 power-up dispatch: 6 handlers indexed by $88
function applyPowerUp(e, type) {
  switch (type) {
    case 0:  // Helmet   ROM $EB95: $89,X = 10 (10 ticks × 64 frames = 640 frames shield)
      e.shieldTimer = 10;
      break;
    case 1:  // Timer/Clock  ROM $EB9A: $0100 = 10 (~640 frames freeze)
      freezeTimer = 10;
      break;
    case 2:  // Shovel  ROM $EBA0: $45=20 tick counter, dec every 16 frames → 320 frames total
      shovelTimer = 20;
      break;
    case 3:  // Star  ROM $EBAC: $0101,X += $20 (max $60)
      e.starLevel = Math.min(e.starLevel + 0x20, 0x60);
      break;
    case 4:  // Grenade  ROM $EBBC: all 8 entities → state $73 (instant kill-all)
      for (let i = 2; i <= 7; i++) {
        if (entities[i].alive) killEntity(entities[i]);
      }
      break;
    case 5:  // Tank/1-Up  ROM $EBE3: INC $51/$52
      if (e.slot === 0) { p1Lives++; sfxLifeUp(0); } else { p2Lives++; sfxLifeUp(1); }
      break;
  }
}

// ─── Enemy spawn dispatch  ────────────────────────────────────────────────────
// ROM $DBF6 EnemySpawnDispatch: dec $82 SpawnDelay; if $7F>0 find free slot
function tickEnemySpawn() {
  if (enemiesLeft <= 0 || activeEnemyCount >= 4) return;
  if (spawnDelay > 0) { spawnDelay--; return; }
  spawnEnemy();
  spawnDelay = Math.max(50, 190 - stageIdx * 4); // ROM $84 SpawnDelayMax
}

// ─── Shield + freeze tick  ────────────────────────────────────────────────────
// ROM $E330 DrawPlayerShield: shieldTimer decremented every 64 frames
// ROM $DC9F EnemyFreezeDecrement: freezeTimer dec every 64 frames
function tickTimers() {
  for (let i = 0; i < 2; i++) {
    const e = entities[i];
    if (e.shieldTimer > 0 && (frameCount & 63) === 0) e.shieldTimer--;
  }
  if (freezeTimer > 0 && (frameCount & 63) === 0) freezeTimer--;
  // ROM $EBA0/$E3E8: $45 decremented every 16 frames; <4 ticks flash steel↔brick
  if (shovelTimer > 0 && (frameCount & 15) === 0) shovelTimer--;
  if (puFlashTimer > 0) puFlashTimer--;
  for (const e of entities) {
    if (e.spawnAnim > 0)  e.spawnAnim--;
    if (e.blinkFrame > 0) e.blinkFrame--;
    if (!e.alive && e.deathTimer > 0) e.deathTimer--;
  }
  for (let pi = 0; pi < numPlayers; pi++) {
    if (playerRespawnTimer[pi] > 0) {
      playerRespawnTimer[pi]--;
      if (playerRespawnTimer[pi] === 0 && !entities[pi].alive) {
        spawnPlayer(pi);  // ROM $DEE8 SpawnP1/$DEEB SpawnP2
      }
    }
  }
  if (eagleExpTimer > 0) eagleExpTimer--;  // ROM $E390 DEC $68
}

// ─── Stage-clear check  ───────────────────────────────────────────────────────
// ROM $DEC9: when $80 EnemyKillsPool → 0 → stage clear
function checkStageClear() {
  if (gamePhase !== 'play') return;
  if (enemiesLeft === 0 && activeEnemyCount === 0) {
    gamePhase  = 'clear';
    phaseTimer = 25;    // ROM $CAF4: LDX #$19 = 25 frames initial pause
    sfxStageClear();  // ROM stage-clear melody (stops BGM, plays slots 21-23)
    tallyState = {
      countsLeft: [...killCounts],  // counts down to 0 as score is tallied
      row:        0,                // current row being drained (0-3)
      frameTimer: 7,                // ROM $CBF5: LDX #$07 = 7 frames per kill tick
      done:       false,            // all rows drained flag
    };
  }
}

// ─── Main update  ─────────────────────────────────────────────────────────────
// ROM $C402 GameFrame  $C29F GameUpdate2 — 18-subsystem sequence
function update() {
  frameCount++;

  // ROM $C65C AttractWait: loop until credits, blinking title sprite
  if (gamePhase === 'title') {
    titleFrame++;
    // Up/Down toggles 1P/2P selection (edge-detect via titleSelectHeld)
    const selDown = !!(keys['ArrowDown'] || keys['KeyS']);
    const selUp   = !!(keys['ArrowUp']   || keys['KeyW']);
    if (selDown && !titleSelectHeld) titleSelect = 1;
    if (selUp   && !titleSelectHeld) titleSelect = 0;
    titleSelectHeld = selDown || selUp;
    if (keys['Space'] || keys['Enter']) {
      initAudio();  // Web Audio requires user gesture
      numPlayers = titleSelect + 1;  // 1 or 2
      p1Score = 0; p1Lives = 2; p1NextLifeScore = 20000;
      p2Score = 0; p2Lives = 2; p2NextLifeScore = 20000;
      newHiScorePlayer = 0;
      initLevel(0);   // sets gamePhase='start'
    }
    return;
  }

  if (gamePhase === 'start') {
    phaseTimer--;
    if (phaseTimer <= 0) { gamePhase = 'play'; startBGM(); }
    return;
  }
  if (gamePhase === 'clear') {
    if (phaseTimer > 0) { phaseTimer--; return; }  // initial banner pause
    const ts = tallyState;
    if (!ts.done) {
      // Skip rows with no kills
      while (ts.row < 4 && killCounts[ts.row] === 0) ts.row++;
      if (ts.row >= 4) {
        ts.done = true;
        phaseTimer = 100;  // ROM $CCF3: LDX #$64 = 100 frames final hold
      } else {
        ts.frameTimer--;
        if (ts.frameTimer <= 0) {
          ts.countsLeft[ts.row] = Math.max(0, ts.countsLeft[ts.row] - 1);
          ts.frameTimer = 7;  // ROM $CBF5: LDX #$07 = 7 frames per kill tick
        }
        if (ts.countsLeft[ts.row] === 0) {
          ts.row++;
          ts.frameTimer = 18;  // ROM $CC09: LDX #$12 = 18 frames inter-row pause
        }
      }
    } else {
      phaseTimer--;
      if (phaseTimer <= 0) {
        if (stageIdx === LEVEL_MAPS.length - 1) {
          // ROM $C44D: victory screen after all 35 stages cleared
          gamePhase      = 'victory';
          victoryPhase   = 0;
          victoryTimer   = 180;   // ~3s on "PEACE BE WITH YOU" screen
          sfxVictory();  // ROM victory melody (stops BGM, plays slots 24-26)
          victoryScrollX = 0;
        } else {
          initLevel(stageIdx + 1);
        }
      }
    }
    return;
  }
  if (gamePhase === 'gameover') {
    phaseTimer--;
    if (phaseTimer <= 0 && (keys['Space'] || keys['Enter'])) enterTitle();
    return;
  }
  // ROM $C44D DrawVictoryScreen: 4-phase victory sequence
  if (gamePhase === 'victory') {
    victoryTimer--;
    if (victoryPhase === 0) {
      // Phase 0: "PEACE BE WITH YOU" held for ~3s
      if (victoryTimer <= 0) { victoryPhase = 1; victoryTimer = 240; }
    } else if (victoryPhase === 1) {
      // Phase 1: 240-frame horizontal scroll (ROM: INC $4F until $F0)
      victoryScrollX = 240 - victoryTimer;
      if (victoryTimer <= 0) { victoryPhase = 2; victoryTimer = 240; victoryScrollX = 0; }
    } else if (victoryPhase === 2) {
      // Phase 2: "NOW LONG WAR" / "COMES TO" / "AN END" held ~4s
      if (victoryTimer <= 0) victoryPhase = 3;
    } else {
      // Phase 3: wait for keypress → return to title
      if (keys['Space'] || keys['Enter']) enterTitle();
    }
    return;
  }

  // ── Active gameplay subsystems  ROM $C29F GameUpdate2 order ──────────────
  soundTick();                    // ROM $EC23 SoundEngine per-frame
  tickBGM();                      // ROM $C18A re-trigger BGM channels
  tickTimers();                   // shield/freeze/spawn timers
  moveEntities();                 // ROM $DC9F EntityMovement
  moveBullets();                  // ROM $E7A9 BulletMoveCollision
  bulletBulletCancel();           // ROM $EAB5 BulletVsBulletCancel
  bulletEntityCollision();        // ROM $E8B1 EnemyBulletPlayerHit
  tickEnemySpawn();               // ROM $DBF6 EnemySpawnDispatch
  handlePlayerFire();             // ROM $E1D6 PlayerFireCheck
  handleEnemyFire();              // ROM $E216 EnemyFireCheck
  checkPowerUpCollision();        // ROM $EB17 PowerUpCollision

  // ROM $C62F CheckGameOver: eagle destroyed ($68→0) → start in-field scroll
  if (!eagleAlive && eagleExpTimer === 0 && goScrollTimer === 0 && gamePhase === 'play') {
    goScrollX     = 0x70;  // ROM $0105 = $70 (center)
    goScrollY     = 0xF0;  // ROM $0106 = $F0
    goScrollDir   = 0;     // ROM $0107 = 0 (up)
    goScrollTimer = 0x11;  // ROM $0108 = $11
    goScrollFrame = 0;
  }

  // ROM $C7F8 HUDTankAnimation: 4-direction wiggle scroll for "GAME OVER" sprites
  // $0108 decrements every 16 frames; while ≥$0A, direction delta applied each frame
  // WiggleX $D2C6: {0,-1,0,+1}  WiggleY $D2CA: {-1,0,+1,0}
  if (goScrollTimer > 0) {
    goScrollFrame++;
    if ((goScrollFrame & 0x0F) === 0) {   // every 16 frames
      goScrollTimer--;
      if (goScrollTimer === 0) {
        goScrollY = 0xF0;                   // ROM: hide sprite off-screen
        // Transition to gameover only if all players dead or eagle destroyed
        const allDead = p1Lives < 0 && (numPlayers === 1 || p2Lives < 0);
        if (allDead || !eagleAlive) {
          gamePhase  = 'gameover';
          phaseTimer = 240;
          sfxGameOver();
          newHiScorePlayer = 0;
          if (p1Score > hiScore) { hiScore = p1Score; newHiScorePlayer = 1; }
          if (numPlayers === 2 && p2Score > hiScore) { hiScore = p2Score; newHiScorePlayer = 2; }
        }
      }
    }
    if (goScrollTimer >= 10) {
      const WIGGLE_X = [0, -1, 0, 1];   // ROM $D2C6 HUDTankWiggleX
      const WIGGLE_Y = [-1, 0, 1, 0];   // ROM $D2CA HUDTankWiggleY
      goScrollX += WIGGLE_X[goScrollDir];
      goScrollY += WIGGLE_Y[goScrollDir];
    }
  }

  checkStageClear();              // ROM $DEC9 EnemyKillsPool → 0
}

// ─── Rendering helpers  ───────────────────────────────────────────────────────
function fillRect(nx, ny, nw, nh, color) {
  ctx.fillStyle = color;
  ctx.fillRect(nx * SCALE, ny * SCALE, nw * SCALE, nh * SCALE);
}
function fillRectI(nx, ny, nw, nh, color) {  // integer snap
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(nx * SCALE), Math.round(ny * SCALE),
               Math.round(nw * SCALE), Math.round(nh * SCALE));
}
function text(str, nx, ny, color, sz = 7) {
  ctx.fillStyle = color;
  ctx.font = `bold ${sz * SCALE}px monospace`;
  ctx.fillText(str, nx * SCALE, ny * SCALE);
}

// ─── Tile rendering  ──────────────────────────────────────────────────────────
// ROM $D82B DrawNametableTile  $DB79 CHR tile table  $D745 SubTileBitmask
function drawTile(col, row) {
  const t  = grid[row][col];
  const px = FX + col * META;
  const py = FY + row * META;

  fillRect(px, py, META, META, C.FIELD);  // always fill black first
  if (t === T.EMPTY || t >= 13) return;

  if (chrOff) {
    if (t <= T.BRICK) {
      // Brick (full or partial): draw ALL 4 quadrants
      // ROM $DB79 TileCHRTable: set bit → tile $0F (solid brick), clear bit → tile $00 (shadow/mortar)
      // Tile $00 is NOT blank — 23 non-zero pixels; must be drawn with brick palette (same as render_level.py)
      const bits = brickBits[row][col];
      for (let q = 0; q < 4; q++) {
        const tileIdx = (bits & (1 << q)) ? 0x0F : 0x00;
        drawCHRTile(tileIdx, TILE_PAL[T.BRICK], px + ((q & 1) ? 8 : 0), py + (q >= 2 ? 8 : 0));
      }
      return;
    }
    const chr = TILE_CHR[t];
    if (chr) { drawMetatile(chr, TILE_PAL[t], px, py); return; }
  }

  // ── Fallback: colored-rect rendering ─────────────────────────────────────
  if (t === T.BRICK || (t >= T.BRICK_TL && t <= T.BRICK_BR)) {
    const bits = brickBits[row][col];
    const drawQ = (mask, ox, oy) => {
      if (!(bits & mask)) return;
      fillRect(px + ox,     py + oy,     8, 8, C.BRICK);
      fillRect(px + ox + 1, py + oy + 1, 6, 3, C.BRICK_HL);
      fillRect(px + ox + 1, py + oy + 4, 6, 3, C.BRICK);
    };
    drawQ(1, 0, 0); drawQ(2, 8, 0); drawQ(4, 0, 8); drawQ(8, 8, 8);
    return;
  }
  if (t === T.STEEL || (t >= T.STEEL_TL && t <= T.STEEL_BR)) {
    fillRect(px, py, META, META, C.STEEL);
    fillRect(px + 1, py + 1, 6, 6, C.STEEL_HL);
    fillRect(px + 9, py + 9, 6, 6, C.STEEL_HL);
    fillRect(px + 1, py + 8, 6, 1, C.STEEL);
    fillRect(px + 8, py + 1, 1, 6, C.STEEL);
    return;
  }
  if (t === T.TREES) {
    fillRect(px, py, META, META, C.TREES);
    ctx.fillStyle = C.TREES_DK;
    ctx.fillRect((px + 2) * SCALE, (py + 2)  * SCALE, 3 * SCALE, 3 * SCALE);
    ctx.fillRect((px + 9) * SCALE, (py + 2)  * SCALE, 3 * SCALE, 3 * SCALE);
    ctx.fillRect((px + 5) * SCALE, (py + 6)  * SCALE, 3 * SCALE, 3 * SCALE);
    ctx.fillRect((px + 1) * SCALE, (py + 10) * SCALE, 3 * SCALE, 3 * SCALE);
    ctx.fillRect((px +10) * SCALE, (py + 10) * SCALE, 3 * SCALE, 3 * SCALE);
    return;
  }
  if (t === T.WATER) {
    fillRect(px, py, META, META, C.WATER);
    if ((frameCount >> 4) & 1) {
      fillRect(px + 2, py + 5,  4, 2, C.WATER_HL);
      fillRect(px + 9, py + 11, 4, 2, C.WATER_HL);
    } else {
      fillRect(px + 2, py + 11, 4, 2, C.WATER_HL);
      fillRect(px + 9, py + 5,  4, 2, C.WATER_HL);
    }
    return;
  }
  if (t === T.ICE) {
    fillRect(px, py, META, META, C.ICE);
    fillRect(px + 1, py + 1, 8, 1, C.ICE_HL);
    fillRect(px + 9, py + 3, 5, 1, C.ICE_HL);
    fillRect(px + 2, py + 9, 4, 1, '#c8e8ff');
    return;
  }
}

// ROM nametable border: tile $00 (mortar pattern) with BG0 palette at all
// positions outside the 26×26 playfield grid (cols 2–27, rows 2–27).
// NES nametable = 32 cols × 30 rows of 8×8 tiles = 256×240.
function drawBorderTiles() {
  if (!chrOff) return;
  // Top 2 rows (rows 0–1, all 32 cols)
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 32; c++)
      drawCHRTile(0x00, 0, c * 8, r * 8);
  // Bottom 2 rows (rows 28–29, all 32 cols)
  for (let r = 28; r < 30; r++)
    for (let c = 0; c < 32; c++)
      drawCHRTile(0x00, 0, c * 8, r * 8);
  // Left 2 cols (rows 2–27, cols 0–1)
  for (let r = 2; r < 28; r++)
    for (let c = 0; c < 2; c++)
      drawCHRTile(0x00, 0, c * 8, r * 8);
  // Right 4 cols (rows 2–27, cols 28–31)
  for (let r = 2; r < 28; r++)
    for (let c = 28; c < 32; c++)
      drawCHRTile(0x00, 0, c * 8, r * 8);
}

// ROM $F239 LevelTileLoader: draws all 13×13 metatiles
function drawField() {
  // NES PPU nametable: playfield is pure black, border gets tile $00 mortar
  fillRect(FX, FY, GW * META, GH * META + 8, C.FIELD);
  drawBorderTiles();

  for (let row = 0; row < GH; row++)
    for (let col = 0; col < GW; col++)
      drawTile(col, row);

  drawEagleBase();
}

// ROM $E386 EagleStateUpdate: phase = abs(abs(($68>>2)-5)-5)
// 0=null, 1=expl1(tile$F1), 2=expl2(tile$F5), 3=expl3(tile$F9), 4=intact, 5=damaged
function eagleAnimPhase(t) {
  const a = t >> 2;
  return Math.abs(Math.abs(a - 5) - 5);
}

// ROM $C912 BrickWallInit / $C9BB SteelWallFortify — EAGLE_POS (120,216)
// Walls are 8 individual 8×8 BG tiles in a Π (inverted-U) shape around the
// 16×16 eagle BG area.  ROM nametable data ($D22D/$D249):
//   Row 25 (ey-16): [00, 0F, 0F, 0F, 0F, 00]  — top bar, 4 tiles
//   Row 26 (ey-8):  [00, 0F, E,  E,  0F, 00]  — left+right legs + eagle top
//   Row 27 (ey):    [00, 0F, E,  E,  0F, 00]  — left+right legs + eagle bottom
// Tile $0F = brick (BG0), $10 = steel (BG3).
function drawEagleBase() {
  const ex = EAGLE.x, ey = EAGLE.y;

  // Flash steel↔brick when shovelTimer < 4 (last 64 frames); full steel ≥4; brick at 0
  const isFort = shovelTimer >= 4 || (shovelTimer > 0 && !!((frameCount >> 3) & 1));
  if (chrOff) {
    const wTile = isFort ? 0x10 : 0x0F;  // steel or brick CHR tile
    const wPal  = isFort ? 3 : 0;         // BG3 steel or BG0 brick
    // Top bar: 4 tiles across  (ex-16..ex+8, ey-16)
    drawCHRTile(wTile, wPal, ex - 16, ey - 16);
    drawCHRTile(wTile, wPal, ex - 8,  ey - 16);
    drawCHRTile(wTile, wPal, ex,      ey - 16);
    drawCHRTile(wTile, wPal, ex + 8,  ey - 16);
    // Left leg: 2 tiles  (ex-16, ey-8..ey)
    drawCHRTile(wTile, wPal, ex - 16, ey - 8);
    drawCHRTile(wTile, wPal, ex - 16, ey);
    // Right leg: 2 tiles  (ex+8, ey-8..ey)
    drawCHRTile(wTile, wPal, ex + 8,  ey - 8);
    drawCHRTile(wTile, wPal, ex + 8,  ey);
  } else {
    const wc = isFort ? C.BASE_FORT : C.BASE_WALL;
    // Π shape fallback: top bar + two legs
    fillRect(ex - 16, ey - 16, 32, 8, wc);   // top bar
    fillRect(ex - 16, ey - 8,  8, 16, wc);    // left leg
    fillRect(ex + 8,  ey - 8,  8, 16, wc);    // right leg
  }

  // ROM nametable: eagle is 2×2 BG metatile at (ex-8, ey-8), palette BG0.
  // Intact: $C8/$CA/$C9/$CB.  Damaged: $CC/$CE/$CD/$CF.  (from $D265 data)
  // Sprite tiles $D0-$DF/$E0-$EF are ONLY used during explosion animation.

  if (eagleExpTimer > 0) {
    // ROM $E386 EagleStateUpdate: explosion animation driven by $68 (eagleExpTimer)
    const phase = eagleAnimPhase(eagleExpTimer);
    if (phase === 0) {
      // NullHandler ($DC9E): no eagle sprite drawn during final 4 frames
    } else if (phase >= 1 && phase <= 3) {
      // ROM EagleExplosion1/2/3 ($E3C6/$E3CB/$E3D0): EagleDrawCenter at X=$78,Y=$D8
      const tileBase = [0xF1, 0xF5, 0xF9][phase - 1];
      if (chrOff) {
        const tL = tileBase, tR = tileBase + 2;
        drawCHRTile(tL & 0xFE,       7, ex - 8, ey - 8, true);
        drawCHRTile((tL & 0xFE) + 1, 7, ex - 8, ey,     true);
        drawCHRTile(tR & 0xFE,       7, ex,     ey - 8, true);
        drawCHRTile((tR & 0xFE) + 1, 7, ex,     ey,     true);
      } else {
        fillRect(ex - 8, ey - 8, 16, 16, phase === 1 ? '#ff8800' : phase === 2 ? '#ffcc00' : '#ff4400');
      }
    } else {
      // Phase 4 = intact ($D0-$DF), phase 5 = damaged ($E0-$EF): ROM $E3E2/$E3EA → EagleDrawFull ($E3F2)
      // 8 OAM 8×16 entries = 4×4 grid of 8×8 tiles = 32×32px, palette SP3 (palIdx 7)
      // Tile layout: 4 DrawSprite16 calls at (ex±8, ey±8) centers, each 16×16
      const tBase = (phase === 4) ? 0xD0 : 0xE0;
      if (chrOff) {
        for (let col = 0; col < 4; col++)
          for (let row = 0; row < 4; row++) {
            const tile = tBase + col * 2 + (row & 1) + ((row >> 1) * 8);
            drawCHRTile(tile, 7, ex - 16 + col * 8, ey - 16 + row * 8, true);
          }
      } else {
        fillRect(ex - 16, ey - 16, 32, 32, phase === 4 ? C.EAGLE_OK : C.EAGLE_DEAD);
      }
    }
  } else {
    // Normal gameplay: draw eagle as 2×2 BG metatile (16×16px)
    const tiles = eagleAlive ? [0xC8,0xCA,0xC9,0xCB] : [0xCC,0xCE,0xCD,0xCF];
    if (chrOff) {
      drawMetatile(tiles, 0, ex - 8, ey - 8);
    } else {
      if (eagleAlive) {
        fillRect(ex - 4, ey - 4, 8, 8, '#000000');
        fillRect(ex - 2, ey - 4, 4, 8, C.EAGLE_OK);
        fillRect(ex - 4, ey,     8, 4, C.EAGLE_OK);
      } else {
        fillRect(ex - 4, ey - 4, 8, 8, C.EAGLE_DEAD);
      }
    }
  }
}

// ROM $DB02 DrawTank2x2  $DABA DrawEntityTile  $DF81 DrawMovingSprite
function drawEntity(e) {
  // ROM $E073 EntityKillDispatch: 3-phase explosion at entity center before slot cleared
  // Tiles $84–$8F (PT0 sprite bank), phase0=$84-$87, phase1=$88-$8B, phase2=$8C-$8F
  // Each phase 4 frames; palette SP2 (palIdx 6); 16×16px 2×2 tile block
  if (!e.alive && e.deathTimer > 0) {
    const phase = Math.min(2, Math.floor((12 - e.deathTimer) / 4));
    const Tbase = 256 + 0x84 + phase * 4;
    if (chrOff) {
      drawCHRTile(Tbase,     6, e.x - 8, e.y - 8, true);  // top-left
      drawCHRTile(Tbase + 2, 6, e.x,     e.y - 8, true);  // top-right
      drawCHRTile(Tbase + 1, 6, e.x - 8, e.y,     true);  // bottom-left
      drawCHRTile(Tbase + 3, 6, e.x,     e.y,     true);  // bottom-right
    } else {
      const r = 4 + phase * 2;
      fillRect(e.x - r, e.y - r, r * 2, r * 2, '#ff8800');
    }
    return;
  }
  if (!e.alive) return;

  if (e.spawnAnim > 0) {
    // Spawn star animation  ROM $E0BF DrawShootSprite  CHR PT1 tiles $A0-$AF
    // OAM tile T (odd) per nibble 0-14: |nib-7|*2(&$FC)+$A1 → $AD,$AD,$A9,$A9,$A5,$A5,$A1,$A1,$A1,$A5,$A5,$A9,$A9,$AD,$AD
    // e.x/e.y are center coords; top-left = e.x-8, e.y-8
    fillRect(e.x - 8, e.y - 8, TANK_SZ, TANK_SZ, C.FIELD);
    if (chrOff) {
      const SPAWN_SEQ = [0xAD,0xAD,0xA9,0xA9,0xA5,0xA5,0xA1,0xA1,0xA1,0xA5,0xA5,0xA9,0xA9,0xAD,0xAD];
      const seqIdx = Math.min(14, Math.floor((60 - e.spawnAnim) / 4));
      const T = SPAWN_SEQ[seqIdx];
      // ROM DrawShootSprite ($E0BF): JSR DrawTank ($DB0A) → two 8×16 OAM entries = 16×16 sprite
      // Left col OAM_X = entity_x-8, right col OAM_X = entity_x, both OAM_Y = entity_y-8; palIdx 7 = SP3
      const sx = e.x - 8, sy = e.y - 8;
      const tl = T & 0xFE, tr = (T + 2) & 0xFE;
      drawCHRTile(tl,     7, sx,     sy,     true);  // top-left
      drawCHRTile(tr,     7, sx + 8, sy,     true);  // top-right
      drawCHRTile(tl + 1, 7, sx,     sy + 8, true);  // bottom-left
      drawCHRTile(tr + 1, 7, sx + 8, sy + 8, true);  // bottom-right
    } else {
      const phase = Math.floor(e.spawnAnim / 10) % 4;
      const cols  = [C.SPAWN_A, C.SPAWN_B, C.SPAWN_C, C.SPAWN_D];
      const r = 3 + (3 - phase);
      fillRect(e.x - r, e.y - r, r * 2, r * 2, cols[phase]);
    }
    return;
  }

  // Shield blink fallback (no CHR)  ROM $E330 DrawPlayerShield
  if (e.shieldTimer > 0 && !chrOff && (frameCount >> 1) & 1) {
    fillRect(e.x - 9, e.y - 9, TANK_SZ + 2, TANK_SZ + 2, C.SHIELD);
  }

  // Armor blink on hit  ROM $EA63
  if (e.blinkFrame > 0 && (frameCount & 3) < 2) return;

  // ROM $DB02 DrawTank2x2: T = (entityBase & $F0) + dir×8 + animBit×4; left OAM=T, right OAM=T+2
  // 8×16 OAM → top half tile T, bottom half tile T+1 (NES 8×16 sprite mode)
  // Player base = starLevel (0/$20/$40/$60); enemy base = $80 + type×$20
  // animBit = 0 or 4, XOR'd each 8px step  ROM $E0A9: ADC $B0,X where $B0,X = animBit only; dir×8 added by DrawTank2x2 ($DB02–$DB07: ASL×3+ADC $53)
  // All sprite bank tiles → PNG index 256+T
  const entityBase = e.isPlayer ? e.starLevel : (0x80 + e.type * 0x20);
  const tileBase   = entityBase + e.dir * 8 + e.animBit;
  // ROM $E0B7 table[0]=2,table[4]=2 → all normal enemies always SP2; power-up tanks
  // flash SP2↔SP3 via ($0B>>3)&1 at $E074-$E07C = every 8 frames.
  // SP0=palIdx 4 (yellow), SP1=5 (lime), SP2=6 (grey/white), SP3=7 (red)
  const palIdx = e.slot === 0 ? 4 : e.slot === 1 ? 5 :
                 (e.powerUpTank && ((frameCount >> 3) & 1)) ? 7 : 6;

  if (chrOff) {
    // e.x/e.y are center coords; top-left = e.x-8, e.y-8
    const T = 256 + tileBase;
    drawCHRTile(T,   palIdx, e.x - 8, e.y - 8, true);  // top-left
    drawCHRTile(T+2, palIdx, e.x,     e.y - 8, true);  // top-right
    drawCHRTile(T+1, palIdx, e.x - 8, e.y,     true);  // bottom-left
    drawCHRTile(T+3, palIdx, e.x,     e.y,     true);  // bottom-right
  } else {
    // Fallback: colored rectangle + barrel when CHR not loaded
    let col;
    if (e.slot === 0) {
      col = C.P1;
    } else if (e.slot === 1) {
      col = C.P2;
    } else {
      col = e.powerUpTank ? (((frameCount >> 3) & 1) ? C.ENEMY_PU : C.ENEMY) : C.ENEMY;
    }
    // e.x/e.y are center coords; top-left = e.x-8, e.y-8
    const sz = TANK_SZ;
    fillRect(e.x - 7, e.y - 7, sz - 2, sz - 2, col);
    const trackCol = shadeColor(col, -40);
    if (e.dir === 0 || e.dir === 2) {
      fillRect(e.x - 7,          e.y - 7, 3, sz - 2, trackCol);
      fillRect(e.x + sz - 12,    e.y - 7, 3, sz - 2, trackCol);
    } else {
      fillRect(e.x - 7, e.y - 7,          sz - 2, 3, trackCol);
      fillRect(e.x - 7, e.y + sz - 12,    sz - 2, 3, trackCol);
    }
    const tx = e.x - 4, ty = e.y - 4;
    fillRect(tx, ty, 6, 6, shadeColor(col, 20));
    const bx = e.x, by = e.y;
    const bl = 7;
    if (e.dir === 0) fillRect(bx - 1, by - bl, 2, bl, shadeColor(col, 20));
    if (e.dir === 1) fillRect(bx - bl, by - 1, bl, 2, shadeColor(col, 20));
    if (e.dir === 2) fillRect(bx - 1, by,      2, bl, shadeColor(col, 20));
    if (e.dir === 3) fillRect(bx,     by - 1,  bl, 2, shadeColor(col, 20));
    if (!e.isPlayer && e.type > 0) {
      ctx.fillStyle = '#000';
      ctx.font = `bold ${5 * SCALE}px monospace`;
      ctx.fillText(e.type, (e.x - 4) * SCALE, (e.y + 2) * SCALE);
    }
    if (e.isPlayer && e.starLevel > 0) {
      const dots = e.starLevel / 0x20;
      for (let d = 0; d < dots; d++) {
        fillRect(e.x - 7 + d * 3, e.y - 11, 2, 2, '#ffff00');
      }
    }
  }

  // Shield CHR overlay  ROM $E330 DrawPlayerShield: tiles $28-$2B (even) / $2C-$2F (odd), SP2=palIdx6
  // Phase based on frameCount bit1 — alternates every 2 frames; BG bank (tileAbs 0-255)
  if (e.shieldTimer > 0 && chrOff) {
    const phase = (frameCount >> 1) & 1;
    const tl = phase ? 0x2C : 0x28;
    const tr = phase ? 0x2E : 0x2A;
    const bl = phase ? 0x2D : 0x29;
    const br = phase ? 0x2F : 0x2B;
    drawCHRTile(tl, 6, e.x - 8, e.y - 8, true);  // top-left
    drawCHRTile(tr, 6, e.x,     e.y - 8, true);  // top-right
    drawCHRTile(bl, 6, e.x - 8, e.y,     true);  // bottom-left
    drawCHRTile(br, 6, e.x,     e.y,     true);  // bottom-right
  }
}

function shadeColor(hex, amount) {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1,3),16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3,5),16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5,7),16) + amount));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ROM $E1C6 BulletTravel  $DABA DrawEntityTile  2×6 px sprite
function drawBullet(b) {
  if (b.explodeTimer > 0) {
    // ROM $E1AF BulletExplode: 8×16 PT1 sprite (single OAM entry, PPUCTRL bit5=1)
    // Tile byte = $B1+dir×2 ($B1/$B3/$B5/$B7); top=$B0/$B2/$B4/$B6, bottom=$B1/$B3/$B5/$B7
    // All bottom-half tiles have real pixel data (confirmed: check_explosion_tiles.py)
    const T = (0xB1 + b.edir * 2) & 0xFE;
    if (chrOff) {
      drawCHRTile(T,     6, b.ex, b.ey,     true);
      drawCHRTile(T + 1, 6, b.ex, b.ey + 8, true);
    } else {
      fillRect(b.ex, b.ey, 8, 16, C.BULLET);
    }
  }
  if (!b.active) return;
  const horiz = b.dir === 1 || b.dir === 3;
  if (horiz) fillRect(b.x - 3, b.y - 1, 6, 3, C.BULLET);
  else       fillRect(b.x - 1, b.y - 3, 3, 6, C.BULLET);
}

// ROM $E30D PowerUpDraw: $0B&$08≠0 gate; tile=$81+type*4 (ODD→PT1/BG bank)
// ROM $DB0A DrawTank: left OAM at entity_x−8, right at entity_x; both OAM_Y = entity_y−8
// Tile order [TL,TR,BL,BR] = [base, base+2, base+1, base+3]; ROM $04=2 → OAM pal 2 = SP2
function drawPowerUp() {
  // ROM $E302-$E30A: while $62>0 (post-collect flash), draw tile $3B 8×16 OAM at collect pos
  // 8×16 odd-byte $3B → PT1 tiles: TL=$3A, BL=$3B (left col), TR=$3C, BR=$3D (right col)
  if (puFlashTimer > 0 && puFlashPos) {
    drawSprite16([0x3A, 0x3C, 0x3B, 0x3D], 6, puFlashPos.x - 8, puFlashPos.y - 8, true);
    return;
  }
  if (!powerUp) return;
  if ((frameCount >> 3) & 1) return;  // blink  ROM $0B&$08 gate
  const x = powerUp.x, y = powerUp.y;
  // ROM: $53 = type*4 + $81 (ODD) → PT1/BG bank; T&0xFE = $80+type*4
  const base = 0x80 + powerUp.type * 4;
  drawSprite16([base, base + 2, base + 1, base + 3], 6, x - 8, y - 8, true);
}

// ROM $DACC-$DAD4 DrawEntityTile: if sprite on BG tile $22 (tree), ORs OAM attr with $6E=$20
// (priority-behind-BG). Entities draw BEHIND tree tiles in ROM. Re-draw trees over entities.
function drawTreesOverlay() {
  const chr = TILE_CHR[T.TREES];   // [0x22,0x22,0x22,0x22]
  const pal = TILE_PAL[T.TREES];   // BG1 (index 1)
  for (let row = 0; row < GH; row++) {
    for (let col = 0; col < GW; col++) {
      if (grid[row][col] !== T.TREES) continue;
      const px = FX + col * META;
      const py = FY + row * META;
      if (chrOff) {
        // transparent=true: skip palette-index-0 pixels so only green tree pixels cover entities
        drawCHRTile(chr[0], pal, px,   py,   true);
        drawCHRTile(chr[1], pal, px+8, py,   true);
        drawCHRTile(chr[2], pal, px,   py+8, true);
        drawCHRTile(chr[3], pal, px+8, py+8, true);
      } else {
        // Fallback: redraw colored-rect trees on top of entities
        fillRect(px, py, META, META, C.TREES);
        ctx.fillStyle = C.TREES_DK;
        ctx.fillRect((px + 2) * SCALE, (py + 2)  * SCALE, 3 * SCALE, 3 * SCALE);
        ctx.fillRect((px + 9) * SCALE, (py + 2)  * SCALE, 3 * SCALE, 3 * SCALE);
        ctx.fillRect((px + 5) * SCALE, (py + 6)  * SCALE, 3 * SCALE, 3 * SCALE);
        ctx.fillRect((px + 1) * SCALE, (py + 10) * SCALE, 3 * SCALE, 3 * SCALE);
        ctx.fillRect((px +10) * SCALE, (py + 10) * SCALE, 3 * SCALE, 3 * SCALE);
      }
    }
  }
}

// ROM $C7BD DrawAllHUDKillIcons  $C7CD DrawHUDTanks  $D8F7 DrawRowTiles
function drawHUD() {
  // --- Right sidebar (nametable cols 27–31, pixel X 216–255) ---
  const hx = 27 * 8;                 // pixel X = 216 (nametable col 27)
  const hy = FY;                     // pixel Y = 16  (row 2)

  fillRect(hx, hy, 40, GH * META + 8, C.HUD_BG);

  // Enemy count  ROM $C7BD DrawAllHUDKillIcons: rows 3–12, cols 29–30
  // ROM: BG tile $6A = small enemy tank icon; $11 = blank (erased on spawn)
  const total = enemiesLeft + activeEnemyCount;
  for (let i = 0; i < 20; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    if (i < total) {
      if (chrOff) {
        drawCHRTile(0x6A, 3, hx + 16 + col * 8, hy + 8 + row * 8, true);
      } else {
        fillRect(hx + 16 + col * 8, hy + 8 + row * 8, 8, 6, C.ENEMY);
        fillRect(hx + 17 + col * 8, hy + 9 + row * 8, 2, 4, shadeColor(C.ENEMY, -40));
        fillRect(hx + 21 + col * 8, hy + 9 + row * 8, 2, 4, shadeColor(C.ENEMY, -40));
      }
    } else if (chrOff) {
      // ROM $C7AE DrawHUDKillIconB: erased slots show tile $11 (blank/steel)
      drawCHRTile(0x11, 3, hx + 16 + col * 8, hy + 8 + row * 8, true);
    }
  }

  // P1 lives  ROM $C72D: "1P" at col 29 row 17; $C6C5: icon $14 at col 29 row 18, digit at col 30
  const p1y = 18 * 8;  // nametable row 18 = pixel 144
  if (chrOff) {
    drawNesText('1P', hx + 16, 17 * 8, 3);          // ROM col 29, row 17
    drawCHRTile(0x14, 3, hx + 16, p1y, true);        // ROM col 29, row 18
    drawNesText(String(p1Lives + 1), hx + 24, p1y, 3); // ROM col 30, row 18
  } else {
    text('P1', hx + 16, p1y - 8, C.P1, 6);
    fillRect(hx + 16, p1y, 8, 6, C.P1);
    text(String(p1Lives + 1), hx + 24, p1y + 6, C.HUD_TEXT, 6);
  }

  // P2 lives  ROM $C746: "2P" at col 29 row 20; $C6C5: icon $14 at col 29 row 21, digit at col 30
  if (numPlayers === 2) {
    const p2y = 21 * 8;  // nametable row 21 = pixel 168
    if (chrOff) {
      drawNesText('2P', hx + 16, 20 * 8, 3);          // ROM col 29, row 20
      drawCHRTile(0x14, 3, hx + 16, p2y, true);        // ROM col 29, row 21
      drawNesText(String(Math.max(0, p2Lives + 1)), hx + 24, p2y, 3); // ROM col 30, row 21
    } else {
      text('P2', hx + 16, p2y - 8, C.P2, 6);
      fillRect(hx + 16, p2y, 8, 6, C.P2);
      text(String(Math.max(0, p2Lives + 1)), hx + 24, p2y + 6, C.HUD_TEXT, 6);
    }
  }

  // Stage number  ROM rows 23–25 (pixel 184): 2×2 flag icon + digit tiles
  const sty = 23 * 8;  // nametable row 23 = pixel 184
  const fc29 = 29 * 8; // col 29 = pixel 232
  const fc30 = 30 * 8; // col 30 = pixel 240
  if (chrOff) {
    // Flag icon: 2×2 tiles at rows 23–24, cols 29–30  ROM $D225/$D228
    drawCHRTile(0x6C, 3, fc29, sty,     true);  // top-left
    drawCHRTile(0xFC, 3, fc30, sty,     true);  // top-right
    drawCHRTile(0x6D, 3, fc29, sty + 8, true);  // bottom-left
    drawCHRTile(0xFD, 3, fc30, sty + 8, true);  // bottom-right
    const sn = String(stageIdx + 1).padStart(2);
    drawNesText(sn, fc29, sty + 16, 3);  // ROM row 25
  } else {
    text('S' + (stageIdx + 1), hx + 16, sty + 8, C.HUD_TEXT, 6);
  }

  // Freeze indicator  ROM $0100 EnemyFreezeTimer
  if (freezeTimer > 0) {
    drawNesText('FREEZE', hx, sty + 20, 3);
  }

  // --- Top score strip (ROM nametable row 1, web-only during gameplay) ---
  // ROM: scores at row 3 cols 2–28 only on stage-start; web shows persistently at row 1
  const sy = 8;  // row 1 (pixel 8), inside top border area
  // P1 score: col 2 = pixel 16
  drawNesText('1P', 2 * 8, sy, 3);
  drawNesText(p1Score.toString().padStart(6, ' '), 4 * 8, sy, 3);
  // HI-score: col 11 = pixel 88
  drawNesText('HI', 11 * 8, sy, 3);
  drawNesText(hiScore.toString().padStart(6, ' '), 14 * 8, sy, 3);
  // P2 score (2P only): col 21 = pixel 168
  if (numPlayers === 2) {
    drawNesText('2P', 21 * 8, sy, 3);
    drawNesText(p2Score.toString().padStart(6, ' '), 23 * 8, sy, 3);
  }
}

// ROM $CFAA PreGameDraw — "STAGE XX" banner (CHR tile text, BG3 palette)
function drawStageBanner() {
  const stageStr = 'STAGE  ' + String(stageIdx + 1);
  const tw = stageStr.length * 8;  // text width in NES px
  const bx = (256 - tw) / 2 - 8, by = 108, bw = tw + 16, bh = 16;
  fillRect(bx, by, bw, bh, '#000');
  drawNesText(stageStr, bx + 8, by + 4, 3);
}

// ROM $C53E DrawGameOverScreen — big 32×32 CHR tiles via DrawBigSpriteTile ($D87E)
// ROM $C4E9 NewHiScoreDisplay: "HISCORE" label ($D16B) + hi-score value ($D9C4) + palette flash
function drawGameOver() {
  // "GAME" and "OVER": 4 chars × 32px = 128px wide, centered at x=64
  fillRect(32, 76, 192, 100, '#000');
  drawBigNesText('GAME', 64, 84, 3);
  drawBigNesText('OVER', 64, 116, 3);
  // ROM $D9F0 CompareAndUpdateHiScore → NewHiScoreDisplay ($C4E9)
  if (newHiScorePlayer > 0) {
    // ROM $C527: JSR RNG; AND #$3F; JSR QueuePaletteWrite — random NES color each frame
    const flashPal = Math.floor(Math.random() * 8);  // random palette each frame
    drawNesText('HISCORE', 88, 148, flashPal);
    drawNesText(hiScore.toString().padStart(6, ' '), 88, 158, flashPal);
  }
  // Retry hint (web-only; ROM returns to attract loop via $C0A6)
  drawNesText('PRESS START', 76, 172, 3);
}

// ROM $CAF1 StageClearTallyScreen → TallyScreenInit ($CD04)
// Full-screen layout matching ROM nametable positions (col×8, row×8):
//   Row 3: "HI-SCORE" (col 8) + value (col ~18)
//   Row 5: "STAGE" (col 12) + number (col 14)
//   Row 7: "I-PLAYER" (col 3)     Row 9: P1 score (col 5)
//   Rows 12/15/18/21: per-type rows — score (col 1), "PTS" (col 8),
//     arrow $5B (col 14), enemy sprite (col 15), kill count (col ~13)
//   Row 22: separator (7× tile $5C at col 12)
//   Row 23: "TOTAL" (col 6) + total count (col ~13)
function drawStageClear() {
  // ROM uses full 256×240 screen, black background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const PTS = [100, 200, 300, 400];

  // Row 3 (y=24): HI-SCORE label + value  ROM $CD2D: (col 8, row 3)
  drawNesText('HI-SCORE', 64, 24, 3);
  drawNesText(hiScore.toString().padStart(6, ' '), 144, 24, 3);

  // Row 5 (y=40): STAGE + number  ROM $CD48: (col 12, row 5)
  drawNesText('STAGE', 96, 40, 3);
  drawNesText((stageIdx + 1).toString().padStart(2, ' '), 144, 40, 3);

  // Row 7 (y=56): player label  ROM $CD6B: (col 3, row 7)
  // ROM uses tile $5E (special I glyph) but web uses "I" as approximation
  drawNesText('I-PLAYER', 24, 56, 3);

  // Row 9 (y=72): P1 accumulated score  ROM $CD7A: (col 5, row 9)
  drawNesText(p1Score.toString().padStart(6, ' '), 40, 72, 3);

  if (!tallyState) return;
  const ts = tallyState;

  for (let row = 0; row < 4; row++) {
    // ROM type rows at nametable rows 12, 15, 18, 21 (y = row*3+12)*8
    const ry = (row * 3 + 12) * 8;  // y = 96, 120, 144, 168
    const total = killCounts[row];

    // How many have been tallied so far for this row
    let tallied;
    if (row < ts.row) {
      tallied = total;
    } else if (row === ts.row) {
      tallied = total - ts.countsLeft[row];
    } else {
      tallied = 0;
    }

    // Per-type score + "PTS" label  ROM $CB87: (col 1, row N), $CE20: (col 8, row N)
    if (row <= ts.row) {
      const rowScore = tallied * PTS[row];
      drawNesText(rowScore.toString().padStart(5, ' '), 8, ry, 3);
      drawNesText('PTS', 64, ry, 3);
    }

    // Kill count  ROM $CBA2: (col 8+skip, row N) → ends at col ~13 before arrow
    if (row <= ts.row) {
      drawNesText(tallied.toString().padStart(2, ' '), 96, ry, 3);
    }

    // Arrow tile $5B at col 14 (x=112)  ROM $CD86: (col 14, rows 12/15/18/21)
    if (chrOff) {
      drawCHRTile(0x5B, 3, 112, ry, false);
    } else {
      drawNesText('<', 112, ry, 3);
    }

    // Enemy type icon (16×16 sprite, facing up)  ROM $CEC4/$CF3C
    // Positioned at pixel (121, ry-4) to center vertically  ROM: (X=$81=129-8=121, Y varies)
    const sprBase = 0x80 + row * 0x20;
    const T = 256 + sprBase;
    if (chrOff) {
      drawCHRTile(T,   6, 121, ry - 4, true);  // TL
      drawCHRTile(T+2, 6, 129, ry - 4, true);  // TR
      drawCHRTile(T+1, 6, 121, ry + 4, true);  // BL
      drawCHRTile(T+3, 6, 129, ry + 4, true);  // BR
    } else {
      fillRect(121, ry - 4, 16, 16, ['#aaaaaa','#ffaa44','#ff4444','#444444'][row]);
    }
  }

  // Row 22 (y=176): separator line  ROM $CEA2: 7× tile $5C at (col 12, row 22)
  if (chrOff) {
    for (let i = 0; i < 7; i++) drawCHRTile(0x5C, 3, 96 + i * 8, 176, false);
  } else {
    drawNesText('-------', 96, 176, 3);
  }

  // Row 23 (y=184): TOTAL + count  ROM $CEB4: (col 6, row 23), $CC16: (col 8, row 23)
  drawNesText('TOTAL', 48, 184, 3);
  if (ts.done) {
    const totalKills = killCounts.reduce((s, n) => s + n, 0);
    drawNesText(totalKills.toString().padStart(2, ' '), 96, 184, 3);
  }
}

// ─── Main render  ─────────────────────────────────────────────────────────────
// ROM $D96D FlushPPUQueue  NMI OAM DMA
function render() {
  // ROM $C65C AttractWait: title screen is a separate full-screen render
  if (gamePhase === 'title')   { drawTitleScreen();   return; }
  if (gamePhase === 'victory') { drawVictoryScreen(); return; }
  // ROM $CAF1 StageClearTallyScreen: full-screen tally (not an overlay)
  if (gamePhase === 'clear')   { drawStageClear();    return; }

  ctx.fillStyle = C.BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawField();

  // Draw entities then re-draw trees on top (ROM: OAM priority-behind-BG for sprites under trees)
  for (let i = 2; i < 8; i++) drawEntity(entities[i]);
  for (let i = 0; i < 2; i++) drawEntity(entities[i]);

  for (const b of bullets) drawBullet(b);
  drawPowerUp();
  drawTreesOverlay();  // re-draw tree tiles over entities/bullets (z-order fix)

  // ROM $C7CD DrawHUDTanks / DrawGameOverText: in-field "GAME OVER" sprites
  // 4 OAM 8×16 sprites from BG bank: $79/$7B = left 16×16, $7D/$7F = right 16×16
  // DrawTank places at (X-8,Y-8) and (X,Y-8); second call at (X+8,Y-8) and (X+16,Y-8)
  // Palette SP3 = palIdx 7. Drawn while goScrollTimer > 0 (ROM $0108 > 0).
  if (chrOff && goScrollTimer > 0 && goScrollY < 0xF0) {
    const goX = goScrollX;  // ROM $0105 (variable X position)
    // "GAME" 16×16: DrawTank($79) at (goX, goScrollY) → sprites at (goX-8, goScrollY-8)
    drawCHRTile(0x78, 7, goX - 8,  goScrollY - 8,  true);  // TL
    drawCHRTile(0x7A, 7, goX,      goScrollY - 8,  true);  // TR
    drawCHRTile(0x79, 7, goX - 8,  goScrollY,      true);  // BL
    drawCHRTile(0x7B, 7, goX,      goScrollY,      true);  // BR
    // "OVER" 16×16: DrawTank($7D) at (goX+16, goScrollY) → sprites at (goX+8, goScrollY-8)
    drawCHRTile(0x7C, 7, goX + 8,  goScrollY - 8,  true);  // TL
    drawCHRTile(0x7E, 7, goX + 16, goScrollY - 8,  true);  // TR
    drawCHRTile(0x7D, 7, goX + 8,  goScrollY,      true);  // BL
    drawCHRTile(0x7F, 7, goX + 16, goScrollY,      true);  // BR
  }

  drawHUD();

  if (gamePhase === 'start')    drawStageBanner();
  if (gamePhase === 'gameover') drawGameOver();

  // Controls reminder (web-only, CHR tile text)
  drawNesText('ARROWS:MOVE  SPACE:FIRE', 36, 228, 0);
}

// ─── Victory screen  ────────────────────────────────────────────────────────
// ROM $C44D DrawVictoryScreen: "PEACE BE WITH YOU" + decorative tiles + scroll
// + "NOW LONG WAR" / "COMES TO" / "AN END"
function drawVictoryScreen() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (victoryPhase === 0 || victoryPhase === 1) {
    // Screen 1: "PEACE BE WITH YOU" + decorative tiles
    // ROM: PPUQueueTiles from $D291, col=7 row=10 → NES (56,80)
    // ROM: PPUQueueTiles from $D145, col=12 row=14 → NES (96,112), 9 deco tiles $60-$68
    const sx = -victoryScrollX;  // scroll offset (0 during phase 0)
    drawNesText('PEACE BE WITH YOU', 56 + sx, 80, 3);
    // Decorative tiles $60-$68 at (96,112)
    if (chrOff) {
      for (let i = 0; i < 9; i++) {
        drawCHRTile(0x60 + i, 3, 96 + i * 8 + sx, 112, true);
      }
    }
  }
  if (victoryPhase === 1 || victoryPhase >= 2) {
    // Screen 2: "NOW LONG WAR" / "COMES TO" / "AN END"
    // ROM: DrawRowTiles at col=10 row=7 (80,56), col=12 row=10 (96,80), col=13 row=13 (104,104)
    const sx2 = victoryPhase === 1 ? (256 - victoryScrollX) : 0;
    drawNesText('NOW LONG WAR', 80 + sx2, 56, 3);
    drawNesText('COMES TO', 96 + sx2, 80, 3);
    drawNesText('AN END', 104 + sx2, 104, 3);
  }
  if (victoryPhase === 3) {
    // Blink "PRESS START" to return to title
    if ((frameCount >> 4) & 1) {
      drawNesText('PRESS START', 76, 160, 3);
    }
  }
}

// ─── Title screen  ───────────────────────────────────────────────────────────
// ROM $C65C AttractWait: 240-frame loop with BlinkTitleSprite ($C69A)
// ROM $CFAA PreGameDraw: draws "BATTLE" (26,46) + "CITY" (60,86) via DrawSpriteString
function enterTitle() {
  stopAllSounds();  // silence everything on return to title
  gamePhase   = 'title';
  titleFrame  = 0;
  titleSelect = 0;  // default: 1 PLAYER
}

function drawTitleScreen() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ROM $CFAA PreGameDraw: score strip at nametable row 3 (y=24)
  // HI label at col 11 (x=88), HI score at col 14 (x=112)
  drawNesText('HI-' + hiScore.toString().padStart(6, ' '), 88, 24, 3);

  // ROM $CFAA: "BATTLE" at (26,46), "CITY" at (60,86) via DrawSpriteString ($D14F/$D156)
  // Each char 32×32 magnified NES pixels
  drawBigNesText('BATTLE', 26, 46, 3);
  drawBigNesText('CITY', 60, 86, 3);

  // Web-only mode selection (ROM VS System uses coins; Famicom has menu at ~rows 17/19)
  drawNesText('1 PLAYER', 88, 136, 3);
  drawNesText('2 PLAYERS', 88, 152, 3);
  // Cursor: tank icon at selected option
  if (chrOff) {
    const cy = titleSelect === 0 ? 136 : 152;
    drawCHRTile(256 + 0x00, 4, 72, cy, true);     // TL
    drawCHRTile(256 + 0x02, 4, 80, cy, true);     // TR
    drawCHRTile(256 + 0x01, 4, 72, cy + 8, true); // BL
    drawCHRTile(256 + 0x03, 4, 80, cy + 8, true); // BR
  } else {
    drawNesText('>', 72, titleSelect === 0 ? 136 : 152, 3);
  }

  // ROM $C69A BlinkTitleSprite blink at row 18 area
  if (titleFrame & 0x20) {
    drawNesText('PRESS START', 72, 168, 3);
  }

  // ROM $D1E7 copyright at nametable col 5, row 25 → (40,200); '@'=CHR tile $40=©
  drawNesText('@ 1980 1985 NAMCO LTD', 40, 200, 3);
  // ROM $D1FE "ALL RIGHTS RESERVED" at col 7, row 27 → (56,216)
  drawNesText('ALL RIGHTS RESERVED', 56, 216, 3);

  // Controls hint (web-only)
  drawNesText('P1:ARROWS+SPACE P2:WASD+E', 16, 228, 0);
}

// ─── Boot  ────────────────────────────────────────────────────────────────────
// ROM $C070 Reset  $EBF6 SoundResetInit  $D3BF Init
p1Score  = 0;
p1Lives  = 2;  // display shows +1 (3 lives)
p1NextLifeScore = 20000;  // ROM $CF44 LivesGrantCheck: first bonus-life threshold
hiScore  = 20000;   // ROM $3D–$43: default starting hi-score
newHiScorePlayer = 0;
frameCount = 0;
enterTitle();
initCHR();     // load both CHR tile sheets (chr_all.png + chr_all_alt.png); setCHRBank() selects per stage

// ROM $C402 GameFrame loop — requestAnimationFrame at 60 fps
(function loop() {
  update();
  render();
  requestAnimationFrame(loop);
})();
