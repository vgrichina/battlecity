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
// Tile sheet: ../tiles/chr_pt0.png — 512 tiles in 32×16 grid, 9px cell (8px+1px border)
// BG tile N: col=N%32 row=N/32   Sprite tile N: abs=N+256
const CHR_CELL = 9, CHR_BORDER = 1;

// ROM $D44A PaletteData (8 NES palette slots)
const NES_PAL = [
  ['#000000','#783C00','#540400','#545454'],  // BG0 brick  (ROM $D44A: $0F,$17,$06,$00)
  ['#000000','#A0D6E4','#989698','#3032EC'],  // BG1 trees  (ROM $D44E: $0F,$3C,$10,$12)
  ['#000000','#74C400','#083A00','#003C00'],  // BG2 water  (ROM $D452: $0F,$29,$09,$0B)
  ['#000000','#545454','#989698','#ECEEEC'],  // BG3 steel  (ROM $D456: $0F,$00,$10,$20)
  ['#000000','#545A00','#D48820','#CCD278'],  // SP0 P1 yel (ROM $D45A: $0F,$18,$27,$38)
  ['#000000','#004000','#007628','#98E2B4'],  // SP1 P2 grn (ROM $D45E: $0F,$0A,$1B,$3B)
  ['#000000','#00323C','#989698','#ECEEEC'],  // SP2 enemy  (ROM $D462: $0F,$0C,$10,$20)
  ['#000000','#440064','#982220','#ECEEEC'],  // SP3 spcl   (ROM $D466: $0F,$04,$16,$20)
];

// Grayscale level → palette index (extract_tiles.py: 0→0, 0x55→1, 0xAA→2, 0xFF→3)
function grayToIdx(r) { return r < 0x2B ? 0 : r < 0x7F ? 1 : r < 0xD5 ? 2 : 3; }

let chrOff = null;                // offscreen canvas 2d context for CHR sheet
const tileCache = new Map();      // cached ImageData keyed by "abs_pal_transp"

function initCHR() {
  const img = new Image();
  img.src = '../tiles/chr_pt0.png';
  img.onload = () => {
    const oc = document.createElement('canvas');
    oc.width = img.width; oc.height = img.height;
    chrOff = oc.getContext('2d');
    chrOff.drawImage(img, 0, 0);
    tileCache.clear();
  };
}

// Draw one 8×8 CHR tile at NES pixel (destX, destY).
// tileAbs: 0–255 = BG bank, 256–511 = sprite bank.
// transparent: skip color-0 pixels (sprites show BG underneath).
function drawCHRTile(tileAbs, palIdx, destX, destY, transparent = false) {
  if (!chrOff) return;
  const key = `${tileAbs}_${palIdx}_${transparent ? 1 : 0}`;
  let idata = tileCache.get(key);
  if (!idata) {
    const tcol = tileAbs % 32, trow = (tileAbs / 32) | 0;
    const sx = tcol * CHR_CELL + CHR_BORDER;
    const sy = trow * CHR_CELL + CHR_BORDER;
    const pdata = chrOff.getImageData(sx, sy, 8, 8).data;
    const pal = NES_PAL[palIdx];
    idata = ctx.createImageData(8 * SCALE, 8 * SCALE);
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
            const i = ((py * SCALE + sy2) * (8 * SCALE) + (px2 * SCALE + sx2)) * 4;
            idata.data[i] = rr; idata.data[i+1] = gg; idata.data[i+2] = bb; idata.data[i+3] = 255;
          }
      }
    }
    tileCache.set(key, idata);
  }
  ctx.putImageData(idata, Math.round(destX * SCALE), Math.round(destY * SCALE));
}

// Draw 2×2 BG metatile (16×16px): chrTiles = [TL, TR, BL, BR] BG tile indices
function drawMetatile(chrTiles, palIdx, px, py) {
  drawCHRTile(chrTiles[0], palIdx, px,   py);
  drawCHRTile(chrTiles[1], palIdx, px+8, py);
  drawCHRTile(chrTiles[2], palIdx, px,   py+8);
  drawCHRTile(chrTiles[3], palIdx, px+8, py+8);
}

// Draw 2×2 sprite (16×16px): sprTiles = [TL, TR, BL, BR] sprite bank tile indices (0–255)
// pt1=false (default) → sprite bank: PNG index = 256+T
// pt1=true  → BG/PT1 bank (eagle, spawn, bullet-expl): PNG index = T & 0xFE
function drawSprite16(sprTiles, palIdx, px, py, pt1 = false) {
  const ti = pt1 ? (t => t & 0xFE) : (t => 256 + t);
  drawCHRTile(ti(sprTiles[0]), palIdx, px,   py,   true);
  drawCHRTile(ti(sprTiles[1]), palIdx, px+8, py,   true);
  drawCHRTile(ti(sprTiles[2]), palIdx, px,   py+8, true);
  drawCHRTile(ti(sprTiles[3]), palIdx, px+8, py+8, true);
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
  FIELD:     '#080808',
  BORDER:    '#404040',
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
  HUD_BG:    '#282828',
  HUD_TEXT:  '#e8e8e8',
  SCORE_COL: '#f8e800',
  GAMEOVER:  '#f80000',
};

// ─── Game state  ──────────────────────────────────────────────────────────────
let stageIdx;       // ROM $41 StageNum
let frameCount;     // ROM $0A/$0B FrameHi/FrameLo
let gamePhase;      // 'start' | 'play' | 'clear' | 'gameover'
let p1Score;        // ROM $15–$1B P1Score (int; BCD in ROM)
let p1Lives;        // ROM $51 P1Lives
let enemiesLeft;    // ROM $7F EnemiesRemaining (total to spawn)
let activeEnemyCount;
let freezeTimer;    // ROM $0100 EnemyFreezeTimer (Timer power-up)
let shovelTimer;    // ROM $45 PowerUpTimer for shovel/fortify
let eagleAlive;
let spawnRot;       // ROM $6A SpawnRotIdx (0→1→2→0 cycling)
let spawnDelay;     // ROM $82 SpawnDelay countdown
let phaseTimer;     // stage-start / clear / gameover display timer
let powerUp;        // { x, y, type } or null
let grid;           // GH×GW array of tile types (mutable, brick quarters get cleared)
let brickBits;      // GH×GW 4-bit brick sub-tile masks  ROM $D745 SubTileBitmask
let entities;       // 8 entity objects (slots 0-7)
let bullets;        // 10 bullet slots (0-7 primary per entity; 8-9 player double-shot)
let playerRespawnTimer = 0;

// ─── Brick sub-tile init  ─────────────────────────────────────────────────────
// ROM $D745 SubTileBitmask: bit0=TL, bit1=TR, bit2=BL, bit3=BR
function brickInitBits(t) {
  if (t === T.BRICK_TL) return 0b0001;
  if (t === T.BRICK_TR) return 0b0010;
  if (t === T.BRICK_BL) return 0b0100;
  if (t === T.BRICK_BR) return 0b1000;
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
    fireTimer: 0,     // enemy fire interval
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
  b.ex    = b.x - 5;   // ROM: OAM X = bullet.x − 5
  b.ey    = b.y;
  b.edir  = b.dir;
}

// ─── Level init  ──────────────────────────────────────────────────────────────
// ROM $F239 LevelTileLoader  $E4D0 ClearEntitySlots  $E4C6 ClearBulletSlots
// ROM $C33D LevelStart  $C625 ClearKillTallies
function initLevel(idx) {
  stageIdx          = Math.min(idx, LEVEL_MAPS.length - 1);
  frameCount        = 0;
  gamePhase         = 'start';
  phaseTimer        = 180;   // ~3 s stage-start banner  ROM $CFAA PreGameDraw
  eagleAlive        = true;
  freezeTimer       = 0;
  shovelTimer       = 0;
  powerUp           = null;
  spawnRot          = 0;     // ROM $6A SpawnRotIdx
  spawnDelay        = Math.max(50, 190 - stageIdx * 4); // ROM $84 SpawnDelayMax: 190 - stageNum*4, min 50
  enemiesLeft       = 20;    // ROM $7F EnemiesRemaining: 20 per stage
  activeEnemyCount  = 0;
  playerRespawnTimer = 0;

  // Copy level grid from ROM data  ROM $F27D LevelMapData
  const raw = LEVEL_MAPS[stageIdx];
  grid      = raw.map(r => [...r]);

  // Brick sub-tile bits  ROM $D745
  brickBits = grid.map(r => r.map(t => brickInitBits(t)));

  // Init entity slots  ROM $E4D0 ClearEntitySlots
  entities = Array.from({ length: 8 }, (_, i) => makeEntity(i));

  // Init bullet slots  ROM $E4C6 ClearBulletSlots
  bullets  = Array.from({ length: 10 }, (_, i) => makeBullet(i));

  // Spawn P1  ROM $E417 PlayerRespawn
  spawnPlayer(0);
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
    if (e.alive) continue;

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
    e.fireTimer  = 60 + Math.floor(Math.random() * 120);
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
window.addEventListener('keydown', e => { keys[e.code] = true;  e.preventDefault(); });
window.addEventListener('keyup',   e => { keys[e.code] = false; });

// Returns direction (0-3) or -1 if no d-pad held
function p1Dir() {
  if (keys['ArrowUp']    || keys['KeyW']) return 0;
  if (keys['ArrowLeft']  || keys['KeyA']) return 1;
  if (keys['ArrowDown']  || keys['KeyS']) return 2;
  if (keys['ArrowRight'] || keys['KeyD']) return 3;
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

    if (e.isPlayer) {
      // ROM $DC23 frame throttle: process on 3 of every 4 frames
      if ((frameCount & 3) === 2) continue;

      const d = p1Dir();
      if (d === -1) continue;

      // Direction change: snap to 8-px grid  ROM $DC23  (+4)&$F8
      if (d !== e.dir) {
        e.x = (e.x + 4) & 0xF8;
        e.y = (e.y + 4) & 0xF8;
        e.dir = d;
      }
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

      // AI: change direction when blocked or timer expires
      // ROM $DDFC RandomDirChange  $DE48 DirTowardHQ
      e.aiTimer--;
      const blocked = !canMove(e, e.dir);
      if (blocked || e.aiTimer <= 0) {
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
let fireHeld = false;

function handlePlayerFire() {
  const pressing = !!(keys['Space'] || keys['KeyX'] || keys['KeyJ']);
  if (pressing && !fireHeld) {
    const e = entities[0];
    if (e.alive && e.spawnAnim === 0) tryFire(e);
  }
  fireHeld = pressing;
}

// ROM $E216 EnemyFireCheck: enemies fire with ~1/32 chance per active enemy per frame
function handleEnemyFire() {
  if (freezeTimer > 0) return;
  for (let i = 2; i <= 7; i++) {
    const e = entities[i];
    if (!e.alive || e.spawnAnim > 0) continue;
    e.fireTimer--;
    if (e.fireTimer <= 0) {
      tryFire(e);
      e.fireTimer = 30 + Math.floor(Math.random() * 90); // ~ROM 1/32 per frame ≈ avg 50
    }
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

    // Eagle hit  ROM $E838: eagle tile $C8 → set $68=$27 eagle-destruction
    if (eagleAlive &&
        Math.abs(b.x - EAGLE.x) < 12 &&
        Math.abs(b.y - EAGLE.y) < 8) {
      eagleAlive = false;
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
  if (t === T.STEEL || (t >= T.STEEL_TL && t <= T.STEEL_BR)) return true;

  // Water: stop bullet, no destroy  ROM $E838 water check
  if (t === T.WATER) return true;

  // Brick: destroy quarter  ROM $D763 TileDestroyBrick  $D745 SubTileBitmask
  if (t === T.BRICK || (t >= T.BRICK_TL && t <= T.BRICK_BR)) {
    destroyBrick(row, col, b.x, b.y);
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
        if (e.armorHits > 0) {
          e.armorHits--;
          e.blinkFrame = 20;   // brief blink to signal hit  ROM $EA63
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
  // Player bullet slots: 0, 1, 8, 9  ROM $EAB5: slot&$06==0
  const playerSlots = [0, 8];
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

// ─── Entity death  ────────────────────────────────────────────────────────────
// ROM $DEBA PlayerKilled  $DEC9 EnemyKilled
function killEntity(e) {
  if (!e.alive) return;
  e.alive = false;

  if (e.isPlayer) {
    // ROM $DEBA: DEC $51 P1Lives
    p1Lives--;
    if (p1Lives < 0) {
      gamePhase  = 'gameover';
      phaseTimer = 240;   // ROM $C53E DrawGameOverScreen timer
    } else {
      playerRespawnTimer = 120;  // ~2 s delay before respawn
    }
  } else {
    // ROM $DEC9: DEC $80 EnemyKillsPool; ROM $D2C2 KillScoreTable
    activeEnemyCount--;
    const pts = (1 + Math.min(e.type, 3)) * 100;  // 100/200/300/400
    p1Score += pts;

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
}

function checkPowerUpCollision() {
  if (!powerUp) return;
  for (let i = 0; i < 2; i++) {
    const e = entities[i];
    if (!e.alive || e.spawnAnim > 0) continue;
    // ROM $EB17: within 12 px of effect position ($86/$87)  (e.x/e.y are center coords)
    if (Math.abs(e.x - powerUp.x) < 12 && Math.abs(e.y - powerUp.y) < 12) {
      applyPowerUp(e, powerUp.type);
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
    case 5:  // Tank/1-Up  ROM $EBE3: INC $51
      p1Lives++;
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
  for (const e of entities) {
    if (e.spawnAnim > 0)  e.spawnAnim--;
    if (e.blinkFrame > 0) e.blinkFrame--;
  }
  if (playerRespawnTimer > 0) {
    playerRespawnTimer--;
    if (playerRespawnTimer === 0 && !entities[0].alive) {
      spawnPlayer(0);  // ROM $DEE8 SpawnP1
    }
  }
}

// ─── Stage-clear check  ───────────────────────────────────────────────────────
// ROM $DEC9: when $80 EnemyKillsPool → 0 → stage clear
function checkStageClear() {
  if (gamePhase !== 'play') return;
  if (enemiesLeft === 0 && activeEnemyCount === 0) {
    gamePhase  = 'clear';
    phaseTimer = 180;   // ROM $CAF1 StageClearTallyScreen
  }
}

// ─── Main update  ─────────────────────────────────────────────────────────────
// ROM $C402 GameFrame  $C29F GameUpdate2 — 18-subsystem sequence
function update() {
  frameCount++;

  if (gamePhase === 'start') {
    phaseTimer--;
    if (phaseTimer <= 0) gamePhase = 'play';
    return;
  }
  if (gamePhase === 'clear') {
    phaseTimer--;
    if (phaseTimer <= 0) initLevel(stageIdx + 1);
    return;
  }
  if (gamePhase === 'gameover') {
    phaseTimer--;
    if (phaseTimer <= 0 && (keys['Space'] || keys['Enter'])) initLevel(stageIdx);
    return;
  }

  // ── Active gameplay subsystems  ROM $C29F GameUpdate2 order ──────────────
  tickTimers();                   // shield/freeze/spawn timers
  moveEntities();                 // ROM $DC9F EntityMovement
  moveBullets();                  // ROM $E7A9 BulletMoveCollision
  bulletBulletCancel();           // ROM $EAB5 BulletVsBulletCancel
  bulletEntityCollision();        // ROM $E8B1 EnemyBulletPlayerHit
  tickEnemySpawn();               // ROM $DBF6 EnemySpawnDispatch
  handlePlayerFire();             // ROM $E1D6 PlayerFireCheck
  handleEnemyFire();              // ROM $E216 EnemyFireCheck
  checkPowerUpCollision();        // ROM $EB17 PowerUpCollision

  if (!eagleAlive) {
    gamePhase  = 'gameover';      // ROM $C1A0 StageEndHandler eagle-destruction
    phaseTimer = 240;
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
      // Brick (full or partial): draw only present quadrants from brickBits
      // ROM $DB89 BRICK_FULL (type4) = [TL=$0F, TR=$0F, BL=$0F, BR=$0F]
      const bits = brickBits[row][col];
      for (let q = 0; q < 4; q++) {
        if (bits & (1 << q)) {
          drawCHRTile(BRICK_QUAD[q], TILE_PAL[T.BRICK], px + ((q & 1) ? 8 : 0), py + (q >= 2 ? 8 : 0));
        }
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

// ROM $F239 LevelTileLoader: draws all 13×13 metatiles
function drawField() {
  // Border rectangle  ROM NES PPU nametable borders
  fillRect(FX - 4, FY - 4, GW * META + 8, GH * META + 8 + 8, C.BORDER);
  fillRect(FX, FY, GW * META, GH * META + 8, C.FIELD);

  for (let row = 0; row < GH; row++)
    for (let col = 0; col < GW; col++)
      drawTile(col, row);

  drawEagleBase();
}

// ROM $E3F2 DrawEagleWalls  $E3E2 EagleWallClosed  EAGLE_POS (120,216)
function drawEagleBase() {
  const ex = EAGLE.x, ey = EAGLE.y;

  // Surrounding wall tiles: 4 × 16×16 metatile blocks surrounding 32×32 eagle area
  // ROM $E3F2 positions: (ex-16,ey-16), (ex,ey-16), (ex-16,ey), (ex,ey)
  // Flash steel↔brick when shovelTimer < 4 (last 64 frames); full steel ≥4; brick at 0
  const isFort = shovelTimer >= 4 || (shovelTimer > 0 && !!((frameCount >> 3) & 1));
  if (chrOff) {
    const wTile = isFort ? 0x10 : 0x0F;  // steel or brick CHR tile
    const wPal  = isFort ? 3 : 0;         // BG3 steel or BG0 brick
    const wt4 = [wTile, wTile, wTile, wTile];
    drawMetatile(wt4, wPal, ex - 16, ey - 16);
    drawMetatile(wt4, wPal, ex,      ey - 16);
    drawMetatile(wt4, wPal, ex - 16, ey);
    drawMetatile(wt4, wPal, ex,      ey);
  } else {
    const wc = isFort ? C.BASE_FORT : C.BASE_WALL;
    fillRect(ex - 16, ey - 16, 32, 32, wc);
  }

  // Eagle sprite: 8 OAM entries in 4×2 grid = 32×32px, top-left at (ex-16, ey-16)
  // Each entry is 8×16 (top half = T & 0xFE, bottom half = (T & 0xFE)+1), all PT1
  // ROM $E3F2: intact  rows $D1/$D5/$D9/$DD | $D3/$D7/$DB/$DF
  // ROM $E3E2: damaged rows $E1/$E5/$E9/$ED | $E3/$E7/$EB/$EF
  const intactTiles  = [0xD1,0xD5,0xD9,0xDD, 0xD3,0xD7,0xDB,0xDF];
  const damagedTiles = [0xE1,0xE5,0xE9,0xED, 0xE3,0xE7,0xEB,0xEF];
  const oamTiles = eagleAlive ? intactTiles : damagedTiles;

  if (chrOff) {
    const xs = [ex - 16, ex - 8, ex, ex + 8];
    const ys = [ey - 16, ey];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const T = oamTiles[row * 4 + col];
        drawCHRTile(T & 0xFE,        7, xs[col], ys[row],     true);
        drawCHRTile((T & 0xFE) + 1,  7, xs[col], ys[row] + 8, true);
      }
    }
  } else {
    if (eagleAlive) {
      fillRect(ex - 4, ey - 4, 8, 8, '#000000');
      fillRect(ex - 2, ey - 4, 4, 8, C.EAGLE_OK);
      fillRect(ex - 4, ey,     8, 4, C.EAGLE_OK);
    } else {
      fillRect(ex - 4, ey - 4, 8, 8, C.EAGLE_DEAD);
      ctx.fillStyle = '#ff0000';
      ctx.font = `bold ${6 * SCALE}px monospace`;
      ctx.fillText('✕', (ex - 5) * SCALE, (ey + 4) * SCALE);
    }
  }
}

// ROM $DB02 DrawTank2x2  $DABA DrawEntityTile  $DF81 DrawMovingSprite
function drawEntity(e) {
  if (!e.alive) return;

  if (e.spawnAnim > 0) {
    // Spawn star animation  ROM $E0BF DrawSpawnSprite  CHR PT1 tiles $A0-$AF
    // Triangle wave: $A1,$A3,$A5,$A7,$A9,$AB,$AD,$AF,$AD,$AB,$A9,$A7,$A5,$A3,$A1
    // e.x/e.y are center coords; top-left = e.x-8, e.y-8
    fillRect(e.x - 8, e.y - 8, TANK_SZ, TANK_SZ, C.FIELD);
    if (chrOff) {
      const SPAWN_SEQ = [0xAD,0xAD,0xA9,0xA9,0xA5,0xA5,0xA1,0xA1,0xA1,0xA5,0xA5,0xA9,0xA9,0xAD,0xAD];
      const seqIdx = Math.min(14, Math.floor((60 - e.spawnAnim) / 4));
      const T = SPAWN_SEQ[seqIdx];
      // 8×16 sprite centered in 16×16 entity area; palIdx 7 = SP3  ROM DrawShootSprite ($E0BF) sets $04=3
      const sx = e.x - 4, sy = e.y - 8;
      drawCHRTile(T & 0xFE,       7, sx, sy,     true);
      drawCHRTile((T & 0xFE) + 1, 7, sx, sy + 8, true);
    } else {
      const phase = Math.floor(e.spawnAnim / 10) % 4;
      const cols  = [C.SPAWN_A, C.SPAWN_B, C.SPAWN_C, C.SPAWN_D];
      const r = 3 + (3 - phase);
      fillRect(e.x - r, e.y - r, r * 2, r * 2, cols[phase]);
    }
    return;
  }

  // Shield blink  ROM $E330 DrawPlayerShield  CHR $29/$2B tiles
  if (e.shieldTimer > 0 && (frameCount >> 1) & 1) {
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
    // ROM $E1AF BulletExplode: 8×8 PT1 sprite, tile = ($B1 + dir*2) & $FE, palette SP2 (palIdx 6)
    const T = (0xB1 + b.edir * 2) & 0xFE;
    if (chrOff) {
      drawCHRTile(T, 6, b.ex, b.ey, true);
    } else {
      fillRect(b.ex, b.ey, 8, 8, C.BULLET);
    }
  }
  if (!b.active) return;
  const horiz = b.dir === 1 || b.dir === 3;
  if (horiz) fillRect(b.x - 3, b.y - 1, 6, 3, C.BULLET);
  else       fillRect(b.x - 1, b.y - 3, 3, 6, C.BULLET);
}

// ROM $C912/$C9BB PowerUpSprite_Off/On  6 power-up types
// ROM $DB0A: 8×16 OAM mode; 2 entries side-by-side → 16×16px total
// Sprite bank tiles: base=$80+type*4; TL=base, TR=base+2, BL=base+1, BR=base+3
// palIdx=7 (SP3)  Flash tiles (PT1 bank): $3A–$3D
function drawPowerUp() {
  if (!powerUp) return;
  if ((frameCount >> 3) & 1) return;  // blink  ROM $0B&$08 gate
  const x = powerUp.x, y = powerUp.y;
  const base = 0x80 + powerUp.type * 4;
  drawSprite16([base, base + 2, base + 1, base + 3], 7, x - 8, y - 8);
}

// ROM $C7BD DrawAllHUDKillIcons  $C7CD DrawHUDTanks  $D8F7 DrawRowTiles
function drawHUD() {
  const hx = FX + GW * META + 6;
  const hy = FY;

  fillRect(hx, hy, 36, GH * META + 8, C.HUD_BG);

  // Enemy count  ROM $C7BD DrawAllHUDKillIcons: 10 pairs of tank icons (2 columns)
  // ROM: BG tile $6A = small enemy tank icon; $11 = blank (erased on spawn)
  text('ENEMY', hx + 1, hy + 8, C.HUD_TEXT, 5);
  const total = enemiesLeft + activeEnemyCount;
  for (let i = 0; i < Math.min(total, 20); i++) {
    const col = i % 2, row = Math.floor(i / 2);
    if (chrOff) {
      drawCHRTile(0x6A, 3, hx + 1 + col * 9, hy + 12 + row * 9);
    } else {
      fillRect(hx + 2 + col * 10, hy + 12 + row * 8, 8, 6, C.ENEMY);
      fillRect(hx + 3 + col * 10, hy + 13 + row * 8, 2, 4, shadeColor(C.ENEMY, -40));
      fillRect(hx + 7 + col * 10, hy + 13 + row * 8, 2, 4, shadeColor(C.ENEMY, -40));
    }
  }

  // Stage number  ROM $41 StageNum
  text(`S${stageIdx + 1}`, hx + 3, hy + 108, C.HUD_TEXT, 6);

  // P1 lives  ROM $51 P1Lives; icon = BG tile $14 (PT1), BG3 palette (palIdx 3)
  text('P1', hx + 3, hy + 124, C.P1, 6);
  if (chrOff) drawCHRTile(0x14, 3, hx + 3, hy + 127);
  else fillRect(hx + 3, hy + 127, 8, 6, C.P1);  // life tank icon fallback
  text(`×${p1Lives + 1}`, hx + 13, hy + 133, C.HUD_TEXT, 6);

  // Score  ROM $15-$1B P1Score (BCD in ROM; plain int here)
  text('SCORE', hx + 1, hy + 152, C.HUD_TEXT, 5);
  text(p1Score.toString().padStart(6, '0'), hx + 1, hy + 162, C.SCORE_COL, 6);

  // Freeze indicator  ROM $0100 EnemyFreezeTimer
  if (freezeTimer > 0) {
    text('FREEZE', hx + 1, hy + 175, '#40ffff', 5);
  }
}

// ROM $CFAA PreGameDraw — "STAGE XX" banner
function drawStageBanner() {
  const bx = 42, by = 96, bw = 160, bh = 28;
  fillRect(bx, by, bw, bh, '#000');
  ctx.fillStyle = C.SCORE_COL;
  ctx.font = `bold ${11 * SCALE}px monospace`;
  ctx.fillText(`STAGE  ${stageIdx + 1}`, (bx + 12) * SCALE, (by + 20) * SCALE);
}

// ROM $C53E DrawGameOverScreen
function drawGameOver() {
  fillRect(42, 88, 160, 40, '#000');
  ctx.fillStyle = C.GAMEOVER;
  ctx.font = `bold ${14 * SCALE}px monospace`;
  ctx.fillText('GAME', 58 * SCALE, 112 * SCALE);
  ctx.fillText('OVER', 58 * SCALE, 128 * SCALE);
  ctx.fillStyle = '#888';
  ctx.font      = `${6 * SCALE}px monospace`;
  ctx.fillText('SPACE/ENTER to retry', 20 * SCALE, 148 * SCALE);
}

// ROM $CAF1 StageClearTallyScreen
function drawStageClear() {
  fillRect(34, 102, 170, 20, '#000');
  ctx.fillStyle = '#00ff00';
  ctx.font = `bold ${10 * SCALE}px monospace`;
  ctx.fillText('STAGE CLEAR!', 38 * SCALE, 118 * SCALE);
}

// ─── Main render  ─────────────────────────────────────────────────────────────
// ROM $D96D FlushPPUQueue  NMI OAM DMA
function render() {
  ctx.fillStyle = C.BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawField();

  // Draw entities (enemies behind trees, players on top)
  // ROM: trees drawn as BG tiles, so sprites appear underneath — we skip z-ordering in v1
  for (let i = 2; i < 8; i++) drawEntity(entities[i]);
  for (let i = 0; i < 2; i++) drawEntity(entities[i]);

  for (const b of bullets) drawBullet(b);
  drawPowerUp();

  // ROM $C7CD DrawHUDTanks: 2×8×16 OAM sprites tiles $79/$7B (left) $7D/$7F (right)
  // at NES pixel ($0105−8,$0106−8)/($0105,$0106−8); init $0105=$0106=$70 → (104,104).
  // Visible while gamePhase='play'/'start' (ROM: visible while $0108≥$0A).
  if (chrOff && (gamePhase === 'play' || gamePhase === 'start'))
    drawSprite16([0x79, 0x7D, 0x7B, 0x7F], 7, 104, 104, true);

  drawHUD();

  if (gamePhase === 'start')    drawStageBanner();
  if (gamePhase === 'gameover') drawGameOver();
  if (gamePhase === 'clear')    drawStageClear();

  // Controls reminder
  ctx.fillStyle = '#404040';
  ctx.font = `${4 * SCALE}px monospace`;
  ctx.fillText('WASD/ARROWS: move  SPACE/X: fire', 8 * SCALE, 235 * SCALE);
}

// ─── Boot  ────────────────────────────────────────────────────────────────────
// ROM $C070 Reset  $EBF6 SoundResetInit  $D3BF Init
p1Score  = 0;
p1Lives  = 2;  // display shows +1 (3 lives)
initLevel(0);
initCHR();     // load CHR tile sheet (../tiles/chr_pt0.png); renders CHR immediately on load

// ROM $C402 GameFrame loop — requestAnimationFrame at 60 fps
(function loop() {
  update();
  render();
  requestAnimationFrame(loop);
})();
