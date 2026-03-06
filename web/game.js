'use strict';
/* ================================================================
 * Battle City — Web Port  (v1)
 * RE reference commit: 973e914
 * ROM: Battle City (1985)(Namco)[Famicom].nes  iNES mapper 0  16KB PRG mirrored  8KB CHR
 * All ROM addresses cited as // ROM $XXXX  label
 * ================================================================ */

// ─── Canvas  ─────────────────────────────────────────────────────────────────
const SCALE   = 3;
const NES_W   = 256;   // standard NES resolution
const NES_H   = 240;
const canvas  = document.getElementById('game');
canvas.width  = NES_W * SCALE;
canvas.height = NES_H * SCALE;
const ctx     = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ─── CHR tile engine ──────────────────────────────────────────────────────────
// Tile sheet: tiles/chr_all.png — single 8KB CHR ROM, 512 tiles in 32×16 grid.
// 9px cell (8px+1px border). BG tile N: col=N%32 row=N/32; Sprite tile N: abs=N+256.
const CHR_CELL = 9, CHR_BORDER = 1;


// Nestopia NES 2C02 NTSC palette — standard reference for accurate color reproduction.
// Key in-game colors: $00=#7C7C7C (border gray), $17=#E45C10 (brick orange), $0F=#000000 (black).
const NES_MASTER_HEX = ['#7C7C7C', '#0000FC', '#0000BC', '#4428BC', '#940084', '#A80020', '#A81000', '#881400', '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#000000', '#000000', '#BCBCBC', '#0078F8', '#0058F8', '#6844FC', '#D800CC', '#E40058', '#F83800', '#E45C10', '#AC7C00', '#00B800', '#00A800', '#00A844', '#008888', '#000000', '#000000', '#000000', '#F8F8F8', '#3CBCFC', '#6888FC', '#9878F8', '#F878F8', '#F85898', '#F87858', '#FCA044', '#F8B800', '#B8F818', '#58D854', '#58F898', '#00E8D8', '#787878', '#000000', '#000000', '#FCFCFC', '#A4E4FC', '#B8B8F8', '#D8B8F8', '#F8B8F8', '#F8A4C0', '#F0D0B0', '#FCE0A8', '#F8D878', '#D8F878', '#B8F8B8', '#B8F8D8', '#00FCFC', '#F8D8F8', '#000000', '#000000'];

// 9 BG palette sets from BGPaletteTable ($D565–$D5F4, 9×16 bytes → PPU $3F00-$3F0F)
// Each entry: [BG0[4], BG1[4], BG2[4], BG3[4]]
// Sets 0-2: in-game (sets 1/2 alternate for water animation each 32 frames)
// Set 3: player-select / game-over  Set 4: title animation
// Sets 5-8: grenade/shovel flash cycle ($4D = ($0B&3)+5 → sets 5/6/7/8)
const BG_PALETTE_SETS = [
  // Set 0 — in-game base ($D565)
  [[0x0F,0x17,0x06,0x00],[0x0F,0x3C,0x10,0x12],[0x0F,0x29,0x09,0x0B],[0x0F,0x00,0x10,0x20]],
  // Set 1 — water anim frame A ($D575): BG1 col1=$3C col2=$12
  [[0x0F,0x17,0x06,0x00],[0x0F,0x3C,0x12,0x12],[0x0F,0x29,0x09,0x0B],[0x0F,0x00,0x10,0x20]],
  // Set 2 — water anim frame B ($D585): BG1 col1=$12 col2=$3C
  [[0x0F,0x17,0x06,0x00],[0x0F,0x12,0x3C,0x12],[0x0F,0x29,0x09,0x0B],[0x0F,0x00,0x10,0x20]],
  // Set 3 — player-select / game-over ($D595)
  [[0x0F,0x16,0x16,0x30],[0x0F,0x3C,0x10,0x16],[0x0F,0x29,0x09,0x27],[0x0F,0x00,0x10,0x20]],
  // Set 4 — title animation ($D5A5)
  [[0x0F,0x17,0x06,0x00],[0x0F,0x3C,0x10,0x00],[0x0F,0x29,0x09,0x00],[0x0F,0x00,0x10,0x00]],
  // Set 5 — flash A ($D5B5): BG0 col1=$0F (black)
  [[0x0F,0x0F,0x06,0x00],[0x0F,0x3C,0x10,0x00],[0x0F,0x29,0x09,0x00],[0x0F,0x00,0x10,0x00]],
  // Set 6 — flash B ($D5C5): BG0 col1=$12 (blue)
  [[0x0F,0x12,0x06,0x00],[0x0F,0x3C,0x10,0x00],[0x0F,0x29,0x09,0x00],[0x0F,0x00,0x10,0x00]],
  // Set 7 — flash C ($D5D5): BG0 col1=$00 (dark gray)
  [[0x0F,0x00,0x06,0x00],[0x0F,0x3C,0x10,0x00],[0x0F,0x29,0x09,0x00],[0x0F,0x00,0x10,0x00]],
  // Set 8 — flash D ($D5E5): BG0 col1=$30 (off-white)
  [[0x0F,0x30,0x06,0x00],[0x0F,0x3C,0x10,0x00],[0x0F,0x29,0x09,0x00],[0x0F,0x00,0x10,0x00]],
];

// Sprite palettes (PPU $3F10-$3F1F via SpritePaletteData $D555–$D564, fixed for all screens)
const SP_PALETTE_DATA = [
  [0x0F, 0x18, 0x27, 0x38],  // SP0 P1 yellow
  [0x0F, 0x0A, 0x1B, 0x3B],  // SP1 P2 green
  [0x0F, 0x0C, 0x10, 0x20],  // SP2 enemy
  [0x0F, 0x04, 0x16, 0x20],  // SP3 special
];

// Active palette (hex strings), built once at startup
const NES_PAL = [
  ['#000000','#000000','#000000','#000000'],
  ['#000000','#000000','#000000','#000000'],
  ['#000000','#000000','#000000','#000000'],
  ['#000000','#000000','#000000','#000000'],
  ['#000000','#000000','#000000','#000000'],
  ['#000000','#000000','#000000','#000000'],
  ['#000000','#000000','#000000','#000000'],
  ['#000000','#000000','#000000','#000000'],
];

// Grayscale level → palette index (extract_tiles.py: 0→0, 0x55→1, 0xAA→2, 0xFF→3)
function grayToIdx(r) { return r < 0x2B ? 0 : r < 0x7F ? 1 : r < 0xD5 ? 2 : 3; }

let chrOff = null;                // offscreen canvas 2d context for active CHR sheet
const tileCache = new Map();      // cached offscreen canvases keyed by "abs_pal_transp"

// Build NES_PAL once: direct 2C02 lookup, no VS. System remap
(function buildPalette() {
  const bgSet = BG_PALETTE_SETS[0];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      NES_PAL[i][j] = NES_MASTER_HEX[bgSet[i][j] & 0x3F];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      NES_PAL[4+i][j] = NES_MASTER_HEX[SP_PALETTE_DATA[i][j] & 0x3F];
})();

// Active BG palette set index ($4D in ROM); 0=in-game base, 1/2=water anim, 3=select/gameover, 4=title, 5-8=flash
let activeBGSet = 0;
function setBGPaletteSet(n) {
  if (activeBGSet === n) return;
  activeBGSet = n;
  const bgSet = BG_PALETTE_SETS[n];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      NES_PAL[i][j] = NES_MASTER_HEX[bgSet[i][j] & 0x3F];
  tileCache.clear();
}

function initCHR() {
  const img = new Image();
  img.src = 'tiles/chr_all.png';
  img.onload = () => {
    const oc = document.createElement('canvas');
    oc.width = img.width; oc.height = img.height;
    const octx = oc.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(img, 0, 0);
    chrOff = octx;
    tileCache.clear();
    render();
  };
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
// Draws a 16×16 metasprite made of two 8×16 OAM entries
// sprTiles contains the tile byte assigned to each 8×16 entry: [left_tile, right_tile]
// In NES 8×16 mode: Top = T & 0xFE, Bottom = T | 0x01
function drawSprite16(sprTiles, palIdx, px, py, pt1 = false) {
  const bank = pt1 ? 0 : 256;
  const draw8x16 = (t, ox) => {
    const top = bank + (t & 0xFE);
    const bot = bank + (t | 0x01);
    drawCHRTile(top, palIdx, px + ox, py,     true);
    drawCHRTile(bot, palIdx, px + ox, py + 8, true);
  };
  draw8x16(sprTiles[0], 0); // left entry
  draw8x16(sprTiles[1], 8); // right entry
}

// Draw a single CHR tile magnified 4× (8×8 → 32×32 NES pixels) for big text
// ROM $D87E DrawBigSpriteTile: renders each font pixel as a 4×4 brick quadrant
function drawBigCHRTile(tileAbs, palIdx, destX, destY) {
  if (!chrOff) return;
  const tcol = tileAbs % 32, trow = (tileAbs / 32) | 0;
  const sx = tcol * CHR_CELL + CHR_BORDER;
  const sy = trow * CHR_CELL + CHR_BORDER;
  const pdata = chrOff.getImageData(sx, sy, 8, 8).data;

  // Each 8x8 font tile becomes 4x4 = 16 background tiles (each 8x8 px)
  // Each background tile's 4 quadrants are determined by 2x2 font pixels.
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      let bits = 0;
      // Map 2x2 font pixels to 4 brick quadrants
      if (grayToIdx(pdata[((ty * 2 + 0) * 8 + (tx * 2 + 0)) * 4]) > 0) bits |= 1; // TL
      if (grayToIdx(pdata[((ty * 2 + 0) * 8 + (tx * 2 + 1)) * 4]) > 0) bits |= 2; // TR
      if (grayToIdx(pdata[((ty * 2 + 1) * 8 + (tx * 2 + 0)) * 4]) > 0) bits |= 4; // BL
      if (grayToIdx(pdata[((ty * 2 + 1) * 8 + (tx * 2 + 1)) * 4]) > 0) bits |= 8; // BR
      
      if (bits === 0) continue;
      
      // Draw the 8x8 tile representing these quadrants. 
      // In Battle City, tiles $00-$0F are the 16 combinations of brick quadrants.
      const px = destX + tx * 8;
      const py = destY + ty * 8;
      drawCHRTile(bits, palIdx, px, py, true);
    }
  }
}

// Draw NES-style text using BG-bank CHR font tiles
// ROM $D8F7 DrawSpriteString: ASCII-indexed tiles ($41='A'..$5A='Z', $30='0'..$39='9', $20=space)
// x,y = top-left corner in NES pixels; palIdx = BG palette index
// Special tile overrides: ROM font stores '-'=tile $6B, '.'=tile $69 (outside ASCII→tile direct mapping)
const NES_TILE_OVERRIDE = { '-': 0x6B, '.': 0x69 };
function drawNesText(str, x, y, palIdx) {
  const s = str.toUpperCase();
  if (chrOff) {
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const tile = NES_TILE_OVERRIDE[ch] ?? s.charCodeAt(i);
      if ((tile >= 0x21 && tile <= 0x5F) || tile >= 0x60) {
        drawCHRTile(tile, palIdx, x + i * 8, y, false);
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
// ROM $D5FB CalcNametableAddr, ROM $F000 LoadStageData + $F07A StageDataTable (16 px origin)
const FX   = 16;   // ROM $10 — playfield left edge (NES pixels)
const FY   = 16;   // ROM $10 — playfield top edge
const META = 16;   // 2×2 CHR tiles × 8 px = 16 px per metatile
const GW   = 13;   // ROM $F000: 13-column grid
const GH   = 13;   // ROM $F000: 13-row grid

// ─── Key positions  ───────────────────────────────────────────────────────────
// ROM $E47A PlayerSpawnX[2]  $E47C PlayerSpawnY[2]  $E474 EnemySpawnX[3]  eagle pos fixed ($78,$D8)
const P1_SPAWN   = { x: 0x58, y: 0xD8 };   // (88, 216)
const P2_SPAWN   = { x: 0x98, y: 0xD8 };   // (152, 216)
const EAGLE      = { x: 0x78, y: 0xD8 };   // (120, 216)
// Π-shaped brick wall around eagle: 5 cells at metatile rows 11–12, cols 5–7.
// Eagle at pixel ($78,$D8)=(120,216) → metatile (row=12,col=6); wall confirmed by pixel-position analysis.
// Each entry = {row, col, bits} where bits = brickBits mask (TL=0,TR=1,BL=2,BR=3)
const EAGLE_WALL = [
  {row:11, col:5, bits:0b1000},  // BR (top-left corner of Π)
  {row:11, col:6, bits:0b1100},  // BL+BR (top-center bar)
  {row:11, col:7, bits:0b0100},  // BL (top-right corner of Π)
  {row:12, col:5, bits:0b1010},  // TR+BR (left leg)
  {row:12, col:7, bits:0b0101},  // TL+BL (right leg)
];
const EN_SPAWN_X = [0x18, 0x78, 0xD8];     // ROM $E474 EnemySpawnX[3] — 3 X positions (24,120,216)
const EN_SPAWN_Y = 0x18;                    // 24

// ─── Direction encoding  ──────────────────────────────────────────────────────
// ROM $E46C DirDeltaX[4]  $E470 DirDeltaY[4]
// 0=UP  1=LEFT  2=DOWN  3=RIGHT
const DX = [ 0, -1,  0,  1];
const DY = [-1,  0,  1,  0];

// ─── Tile type constants  ─────────────────────────────────────────────────────
// ROM $DACB TileTypeTable  extract_level_maps.py
const T = {
  BRICK_R:0, BRICK_B:1, BRICK_L:2, BRICK_T:3,
  BRICK:4,
  STEEL_R:5, STEEL_B:6, STEEL_L:7, STEEL_T:8,
  STEEL:9,
  WATER:10, TREES:11, ICE:12,
  EMPTY:13,
};

// ROM $DABB TileAttrTable: tile type → BG palette index (indexed by game.js T values)
const TILE_PAL = [0,0,0,0,0, 3,3,3,3,3, 1,2,3];

// ROM $DACB TileTypeTable: tile type → [TL,TR,BL,BR] BG CHR tile indices
// Brick types (0–4) are null — handled via brickBits in drawTile().
const TILE_CHR = [
  null, null, null, null, null,       // T.BRICK_R=0 .. T.BRICK=4
  [0x20,0x10,0x20,0x10],              // T.STEEL_R=5  (TileTypeTable+20: right-col partial)
  [0x20,0x20,0x10,0x10],              // T.STEEL_B=6  (TileTypeTable+24: bottom-row partial)
  [0x10,0x20,0x10,0x20],              // T.STEEL_L=7  (TileTypeTable+28: left-col partial)
  [0x10,0x10,0x20,0x20],              // T.STEEL_T=8  (TileTypeTable+32: top-row partial)
  [0x10,0x10,0x10,0x10],              // T.STEEL=9    (TileTypeTable+36: full solid)
  [0x12,0x12,0x12,0x12],              // T.WATER=10
  [0x22,0x22,0x22,0x22],              // T.TREES=11
  [0x21,0x21,0x21,0x21],              // T.ICE=12
];

// Brick quadrant CHR tiles from BRICK_FULL metatile [TL,TR,BL,BR]
// ROM $DACB TileTypeTable type4 (BRICK_FULL) = [0x0F, 0x0F, 0x0F, 0x0F] (all solid-brick CHR)
// (type0 BRICK_R = [0x00,0x0F,0x00,0x0F] — was incorrectly used before)
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
// Checks sub-quadrant for partial brick tiles (BRICK_R/B/L/T)
function passable8(px, py) {
  const col = Math.floor((px - FX) / META);
  const row = Math.floor((py - FY) / META);
  if (col < 0 || col >= GW || row < 0 || row >= GH) return false;
  const t = grid[row][col];
  if (t === T.EMPTY || t === T.ICE || t === T.TREES) return true;
  if (t <= T.BRICK) {  // BRICK_R=0 .. BRICK=4: check 8px sub-quadrant
    const qx = Math.floor(((px - FX) % META) / 8);
    const qy = Math.floor(((py - FY) % META) / 8);
    return !(brickBits[row][col] & (1 << (qy * 2 + qx)));
  }
  if (t >= T.STEEL_R && t <= T.STEEL_T) {  // partial steel: open quadrants ($20 tiles) are passable
    const qx = Math.floor(((px - FX) % META) / 8);
    const qy = Math.floor(((py - FY) % META) / 8);
    // Solid-quadrant bitmask (TL=bit0,TR=bit1,BL=bit2,BR=bit3) derived from TILE_CHR $10 entries:
    // STEEL_R=[0x20,0x10,0x20,0x10]→TR+BR solid=0b1010; STEEL_B=[0x20,0x20,0x10,0x10]→BL+BR=0b1100
    // STEEL_L=[0x10,0x20,0x10,0x20]→TL+BL solid=0b0101; STEEL_T=[0x10,0x10,0x20,0x20]→TL+TR=0b0011
    const STEEL_BLOCK = [0b1010, 0b1100, 0b0101, 0b0011]; // indexed by t - T.STEEL_R
    return !(STEEL_BLOCK[t - T.STEEL_R] & (1 << (qy * 2 + qx)));
  }
  return false;  // T.STEEL (full) and WATER block
}

// ─── NES color palette approximations  ────────────────────────────────────────
// ROM $D555 SpritePaletteData  $D565 BGPaletteTable
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
let selectedStage;  // ROM $85 SelectedStage
let curtainRow = -1; // 0..14, row of curtain currently closing/opening (top and bottom meet at center)
let curtainTarget = ''; // 'select' or 'play'
let editX = 6, editY = 6;       // grid coords (ROM $90/$98 in pixel, /16 for grid)
let editTileType = 4;            // ROM $5C: 0-13 (start=full brick)
let editHoldCount = 0;           // ROM $7B: d-pad hold counter
let editAFirst = false;          // ROM $81: first A press flag
let editACycleTimer = 0;         // throttle A/B held cycling
let editStartHeld = false;       // edge-detect for Enter in edit mode
let customMap = null;            // GW*GH array of arrays
let frameCount;     // ROM $0A/$0B FrameHi/FrameLo
let gamePhase;      // 'title' | 'start' | 'play' | 'clear' | 'gameover_tally' | 'gameover' | 'victory' | 'select' | 'curtain' | 'edit'
let titleFrame;     // frame counter for title screen blink animation
let titleTimer = 0; // ROM $0A counts to 8 before Demo Mode
let titleCursor = 0; // menu cursor: 0=1P, 1=2P, 2=CONSTRUCTION
let titleDownHeld = false, titleUpHeld = false, titleFireHeld = false;
let demoMode = false; // ROM $6D DemoActive
let selectKeyHeld = false; // edge-detect for stage selection
let credits = 0;    // VS System only ($0104 credits); unused in Famicom version
let numPlayers;     // 1 or 2; set at title screen before game start
let p1Score;        // ROM $15–$1B P1Score (int; BCD in ROM)
let p1Lives;        // ROM $51 P1Lives
let p1NextLifeScore; // ROM $CF44 LivesGrantCheck: next score multiple of 20000 to award a life
let p2Score;        // ROM $1C–$22 P2Score
let p2Lives;        // ROM $52 P2Lives
let p2NextLifeScore;
let hiScore;        // ROM $3D–$43 HiScore (7-digit BCD in ROM; plain int here)
let newHiScorePlayer; // ROM $D97D UpdateHiScore: 0=none, 1=P1, 2=P2
let enemiesLeft;    // ROM $7F EnemiesRemaining (total to spawn)
let activeEnemyCount;
let freezeTimer;    // ROM $0100 EnemyFreezeTimer (Timer power-up)
let shovelTimer;    // ROM $45 PowerUpTimer for shovel/fortify
let eagleAlive;
let eagleExpTimer;   // ROM $68 EagleStatus: set to 39 on eagle hit; counts down to 0
let spawnRot;       // ROM $6A SpawnRotIdx (0→1→2→0 cycling)
let spawnDelay;     // ROM $82 SpawnDelay countdown
let phaseTimer;     // stage-start / clear / gameover display timer
let powerUp;        // { x, y, type } or null
let puFlashTimer;   // ROM $62: 50-frame countdown after power-up collected; flash sprite shown
let puFlashPos;     // { x, y } position where flash is drawn
let grenadeFlash;   // ROM $EBBC: brief palette flash on grenade; counts down 0→8
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
let killCounts;             // [4] per-type enemy kills this stage  (cleared at StageStartInit $C331)
let tallyState;             // tally animation state during 'clear' phase
let victoryPhase;           // ROM $C44D DrawVictoryScreen phases: 0=peace text, 1=scroll, 2=war-end text, 3=wait
let victoryTimer;           // frame counter for current victory phase
let victoryScrollX;         // ROM $4F: horizontal scroll offset (0→240 over 240 frames)

// ─── Brick sub-tile init  ─────────────────────────────────────────────────────
// ROM $D745 SubTileBitmask: bit0=TL, bit1=TR, bit2=BL, bit3=BR
// ROM $DACB TileTypeTable types 0–3 are half-wall metatiles (2 of 4 sub-tiles filled):
//   Type 0 right-col  [00,0F,00,0F] → TR+BR = 0b1010
//   Type 1 bottom-row [00,00,0F,0F] → BL+BR = 0b1100
//   Type 2 left-col   [0F,00,0F,00] → TL+BL = 0b0101
//   Type 3 top-row    [0F,0F,00,00] → TL+TR = 0b0011
function brickInitBits(t) {
  if (t === T.BRICK_R) return 0b1010;  // TR+BR (right col)
  if (t === T.BRICK_B) return 0b1100;  // BL+BR (bottom row)
  if (t === T.BRICK_L) return 0b0101;  // TL+BL (left col)
  if (t === T.BRICK_T) return 0b0011;  // TL+TR (top row)
  if (t === T.BRICK)   return 0b1111;
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
    armorHits: 0,     // remaining armor hits before death  ROM $E70C EnemyBulletPlayerCollision
    powerUpTank: false,// flashing tank carrying power-up  ROM $E363 SpawnEnemy $7F==17/10/3
    blinkFrame: 0,    // armor-hit blink countdown
    spawnAnim: 0,     // spawn star animation frames  ROM $DE55 SpawnAnimTick
    stunTimer: 0,     // friendly-fire stun (200 frames, can't move)  ROM $6F,X=$C8 from $E8AA
    animBit: 0,       // track animation frame: 0 or 4; EOR #$04 each EntityMovementAI call  ROM $DD29
    fireTimer: 0,     // unused; ROM $E162 EnemyFireTick uses per-frame 1/32 check instead
    deathTimer: 0,    // death explosion countdown: 12→0, drawn even while alive=false  ROM $DE64 DeathAnimTick
    lastHitBy: 0,     // player slot that last hit this entity (for score routing in 2P)
    isPlayer: slot < 2,
  };
}

// ─── Bullet factory  ──────────────────────────────────────────────────────────
// ROM $CC,X BulletState  $B8,X BulletX  $C2,X BulletY  $D6,X BulletDouble
function makeBullet(slot) {
  return { slot, x: 0, y: 0, dir: 0, active: false, armor: false, powered: false, owner: -1, explodeTimer: 0, ex: 0, ey: 0, edir: 0 };
}

// ROM $E112 BulletExplode: explosion sprite drawn from $B8/$C2 bullet position
function triggerBulletExplosion(b) {
  b.explodeTimer = 12;
  b.ex    = b.x - 5;   // explosion sprite offset from bullet center
  b.ey    = b.y - 8;   // OAM Y = bullet.y − 8
  b.edir  = b.dir;
}

// setEagleWall: set eagle wall cells in grid (brick or steel)
// steel=true → T.STEEL (shovel active), steel=false → T.BRICK with partial brickBits
function setEagleWall(steel) {
  for (const w of EAGLE_WALL) {
    if (steel) {
      grid[w.row][w.col] = T.STEEL;
      brickBits[w.row][w.col] = 0;
    } else {
      grid[w.row][w.col] = T.BRICK;
      brickBits[w.row][w.col] = w.bits;
    }
  }
}

// ─── Level init  ──────────────────────────────────────────────────────────────
// ROM $F000 LoadStageData  $E413 ClearEntitySlots2
// ROM $C331 StageStartInit
function initLevel(idx) {
  stageIdx          = idx % LEVEL_MAPS.length;  // ROM loops back to stage 1 after stage 35
  frameCount        = 0;
  activeBGSet       = -1; setBGPaletteSet(0);   // reset to in-game base palette set
  gamePhase         = 'start';
  phaseTimer        = 180;   // ~3 s stage-start banner  ROM $CFAA PreGameDraw
  eagleAlive        = true;
  eagleExpTimer     = 0;
  freezeTimer       = 0;
  shovelTimer       = 0;
  powerUp           = null;
  puFlashTimer      = 0;
  puFlashPos        = null;
  grenadeFlash      = 0;
  spawnRot          = 0;     // ROM $6A SpawnRotIdx
  spawnDelay        = Math.max(50, 186 - stageIdx * 4 - (numPlayers === 2 ? 20 : 0)); // ROM $C3A2: $84=$BE-(stage*4); $C3B0: 2P SBC #$14
  enemiesLeft       = 20;    // ROM $7F EnemiesRemaining: 20 per stage
  activeEnemyCount  = 0;
  playerRespawnTimer = [0, 0];
  goScrollX     = 0x70;  // ROM $0105 = $70 (center X = 112)
  goScrollY     = 240;   // off-screen
  goScrollDir   = 0;     // ROM $0107 = 0 (up)
  goScrollTimer = 0;     // inactive
  goScrollFrame = 0;
  killCounts = [0, 0, 0, 0];   // ROM $C331 StageStartInit: four per-type kill counters reset each stage
  tallyState = null;

  // Copy level grid from ROM data  ROM $F07A StageDataTable
  let raw = LEVEL_MAPS[stageIdx];
  if (stageIdx === 0 && customMap) raw = customMap;
  
  grid      = raw.map(r => [...r]);

  // Brick sub-tile bits  ROM $D743 ClearTileBit
  brickBits = grid.map(r => r.map(t => brickInitBits(t)));
  // Normalize partial-brick display types 0–3 → T.BRICK (4) in the grid;
  // brickBits already captures the correct 2-quadrant pattern above.
  grid.forEach((r, ri) => r.forEach((t, ci) => {
    if (t >= T.BRICK_R && t < T.BRICK) grid[ri][ci] = T.BRICK;
  }));

  // add Π-shaped brick wall around eagle to grid+brickBits
  setEagleWall(false);

  // Init entity slots  ROM $E413 ClearEntitySlots2
  entities = Array.from({ length: 8 }, (_, i) => {
    const e = makeEntity(i);
    e.demoDir = 0;
    e.demoTimer = 0;
    e.demoFire = false;
    return e;
  });

  // Init bullet slots  ROM $E413 ClearEntitySlots2 (also clears bullet state area)
  bullets  = Array.from({ length: 10 }, (_, i) => makeBullet(i));

  // Spawn players  ROM $C331 StageStartInit → SpawnEnemy ($E363, player branch)
  spawnPlayer(0);
  if (numPlayers === 2) spawnPlayer(1);
}

// ─── Player respawn  ──────────────────────────────────────────────────────────
// ROM $E363 SpawnEnemy/FinalizeEntitySpawn (player branch)  $E47A PlayerSpawnX[2]  $E47C PlayerSpawnY[2]
function spawnPlayer(slot) {
  const e   = entities[slot];
  const pos = slot === 0 ? P1_SPAWN : P2_SPAWN;
  e.x           = pos.x;
  e.y           = pos.y;
  e.dir         = 0;      // UP  ROM $E47E EntityInitStatus: players=$A0
  e.alive       = true;
  e.spawnAnim   = 30;     // spawn star anim  ROM $DF09/$DF18: 15 states×2 frames ≈ 30 frames
  e.shieldTimer = 3;      // spawn shield: 3 ticks × 64 frames = 192 frames  ROM $89,X
  e.starLevel   = 0;      // ROM $0101,X reset on death
  e.blinkFrame  = 0;
  e.stunTimer   = 0;      // ROM $6F,X cleared on spawn
}

// ─── Enemy type table  ────────────────────────────────────────────────────────
// ROM $E4EC EntityTypeTable (35×4 type bytes) + $E578 StageEnemyCountTable (35×4 counts)
// SpawnEnemy ($E363): slot counts from StageEnemyCountTable[$85-1]; type = EntityTypeTable[($85-1)*4+slot]
// $80=Basic(0), $A0=Fast(1), $C0=Power(2), $E0=Armor(3)
// 35 stages × 20 enemies; slots emitted in order (slot0 count times, then slot1, etc.)
// Famicom ROM: EntityTypeTable $E4EC (35x4 type bytes) + StageEnemyCountTable $E578 (35x4 counts)
// Reconstructed: for each stage, emit count[slot] of type[slot] for slots 0..3 in order.
// Types: 0=basic, 1=fast, 2=power, 3=armor
const ENEMY_TYPE_TABLE = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1],  // stage 1:  B×18 F×2
  [3,3,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],  // stage 2:  A×2 F×4 B×14
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,3,3],  // stage 3:  B×14 F×4 A×2
  [2,2,2,2,2,2,2,2,2,2,1,1,1,1,1,0,0,3,3,3],  // stage 4:  P×10 F×5 B×2 A×3
  [2,2,2,2,2,3,3,0,0,0,0,0,0,0,0,1,1,1,1,1],  // stage 5:  P×5 A×2 B×8 F×5
  [2,2,2,2,2,2,2,1,1,0,0,0,0,0,0,0,0,0,3,3],  // stage 6:  P×7 F×2 B×9 A×2
  [0,0,0,1,1,1,1,2,2,2,2,2,2,0,0,0,0,0,0,0],  // stage 7:  B×3 F×4 P×6 B×7
  [2,2,2,2,2,2,2,3,3,1,1,1,1,0,0,0,0,0,0,0],  // stage 8:  P×7 A×2 F×4 B×7
  [0,0,0,0,0,0,1,1,1,1,2,2,2,2,2,2,2,3,3,3],  // stage 9:  B×6 F×4 P×7 A×3
  [0,0,0,0,0,0,0,0,0,0,0,0,1,1,2,2,2,2,3,3],  // stage 10: B×12 F×2 P×4 A×2
  [1,1,1,1,1,3,3,3,3,3,3,2,2,2,2,1,1,1,1,1],  // stage 11: F×5 A×6 P×4 F×5
  [2,2,2,2,2,2,2,2,1,1,1,1,1,1,3,3,3,3,3,3],  // stage 12: P×8 F×6 A×6
  [2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,3,3,3,3],  // stage 13: P×8 F×8 A×4
  [2,2,2,2,2,2,2,2,2,2,1,1,1,1,3,3,3,3,3,3],  // stage 14: P×10 F×4 A×6
  [0,0,1,1,1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3],  // stage 15: B×2 F×10 A×8
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,3,3],  // stage 16: B×16 F×2 A×2
  [3,3,1,1,2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0],  // stage 17: A×2 F×2 P×8 B×8
  [3,3,3,3,0,0,2,2,2,2,2,2,1,1,1,1,1,1,1,1],  // stage 18: A×4 B×2 P×6 F×8
  [1,1,1,1,3,3,3,3,3,3,3,3,0,0,0,0,2,2,2,2],  // stage 19: F×4 A×8 B×4 P×4
  [1,1,1,1,1,1,1,1,0,0,2,2,3,3,3,3,3,3,3,3],  // stage 20: F×8 B×2 P×2 A×8
  [2,2,2,2,2,2,2,2,1,1,0,0,0,0,0,0,3,3,3,3],  // stage 21: P×8 F×2 B×6 A×4
  [1,1,1,1,1,1,1,1,0,0,0,0,0,0,2,2,3,3,3,3],  // stage 22: F×8 B×6 P×2 A×4
  [3,3,3,3,3,3,2,2,2,2,1,1,1,1,1,1,1,1,1,1],  // stage 23: A×6 P×4 F×10
  [2,2,2,2,3,3,1,1,1,1,0,0,0,0,0,0,0,0,0,0],  // stage 24: P×4 A×2 F×4 B×10
  [2,2,1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3],  // stage 25: P×2 F×8 A×10
  [1,1,1,1,1,1,3,3,3,3,3,3,0,0,0,0,2,2,2,2],  // stage 26: F×6 A×6 B×4 P×4
  [2,2,3,3,3,3,3,3,3,3,1,1,1,1,1,1,1,1,0,0],  // stage 27: P×2 A×8 F×8 B×2
  [1,1,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2],  // stage 28: F×2 A×1 B×15 P×2
  [2,2,2,2,2,2,2,2,2,2,1,1,1,1,3,3,3,3,3,3],  // stage 29: P×10 F×4 A×6
  [0,0,0,0,1,1,1,1,1,1,1,1,2,2,2,2,3,3,3,3],  // stage 30: B×4 F×8 P×4 A×4
  [2,2,2,1,1,1,1,1,1,1,1,3,3,3,3,3,3,2,2,2],  // stage 31: P×3 F×8 A×6 P×3
  [3,3,3,3,3,3,3,3,0,0,0,0,0,0,2,2,1,1,1,1],  // stage 32: A×8 B×6 P×2 F×4
  [1,1,1,1,3,3,3,3,3,3,3,3,2,2,2,2,1,1,1,1],  // stage 33: F×4 A×8 P×4 F×4
  [2,2,2,2,1,1,1,1,1,1,1,1,1,1,3,3,3,3,3,3],  // stage 34: P×4 F×10 A×6
  [2,2,2,2,1,1,1,1,1,1,3,3,3,3,3,3,3,3,3,3],  // stage 35: P×4 F×6 A×10
];

// ─── Enemy spawn  ─────────────────────────────────────────────────────────────
// ROM $DB48 EnemySpawnTick  $E363 SpawnEnemy (enemy branch)  $E474 EnemySpawnX[3]
function spawnEnemy() {
  if (enemiesLeft <= 0)        return;
  if (activeEnemyCount >= 4)   return;   // max 4 on screen simultaneously

  for (let i = 2; i <= 7; i++) {
    const e = entities[i];
    if (e.alive || e.deathTimer > 0) continue;

    e.x          = EN_SPAWN_X[spawnRot % 3];  // ROM $6A SpawnRotIdx → $E474 EnemySpawnX[3]
    e.y          = EN_SPAWN_Y;
    e.dir        = 2;     // DOWN  ROM $E47E EntityInitStatus: enemies=$A2
    e.alive      = true;
    e.spawnAnim  = 30;

    // Enemy type: per-stage sequence from ROM $E4EC EntityTypeTable + $E578 StageEnemyCountTable
    // spawnIdx = enemies already spawned = 20 - enemiesLeft (0..19)
    const typeRow = ENEMY_TYPE_TABLE[Math.min(stageIdx, ENEMY_TYPE_TABLE.length - 1)];
    e.type       = typeRow[20 - enemiesLeft];

    // Power-up tank: flag at 17/10/3 remaining  ROM $E363 SpawnEnemy: $7F==17/10/3
    e.powerUpTank = (enemiesLeft === 17 || enemiesLeft === 10 || enemiesLeft === 3);

    // Armor hits: only type 3 gets armor (bits 0-1 of $A8,X; set at $E4B5: ORA #$03)
    // ROM $E4B1: CMP #$E0; only type 3 gets ORA #$03. Types 0/1/2 have 0 armor bits.
    // Armor check at $E70C: AND #$03; BEQ kill; DEC. Start=3 → 4 total hits.
    e.armorHits  = e.type >= 3 ? 3 : 0;
    e.shieldTimer = 0;
    e.fireTimer  = 0;
    e.fireTimer  = 0; // not used; firing uses per-frame 1/32 check
    e.blinkFrame = 0;

    spawnRot = (spawnRot + 1) % 3;   // ROM $6A INC SpawnRotIdx
    enemiesLeft--;
    activeEnemyCount++;
    return;
  }
}

// ─── Input  ───────────────────────────────────────────────────────────────────
// ROM $9689/$D689 ReadControllers
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyM') { toggleSound(); updateSoundBtn(); }
  if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) toggleFullscreen();
  if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) toggleRecording();
  // Quick-start shortcuts (work from title screen)
  if (e.code === 'Digit1' && gamePhase === 'title') { quickStart(0); }   // 1P
  if (e.code === 'Digit2' && gamePhase === 'title') { quickStart(1); }   // 2P
  if (e.code === 'Digit3' && gamePhase === 'title') { quickStart(2); }   // Construction
  if (e.code === 'KeyD'   && gamePhase === 'title') { quickStartDemo(); } // Demo
  e.preventDefault();
});
window.addEventListener('keyup',   e => { keys[e.code] = false; });

// ─── Touch / Virtual Gamepad ──────────────────────────────────────────────────
(function setupTouch() {
  const dpad     = document.getElementById('dpad');
  const btnFire  = document.getElementById('btn-fire');
  const btnStart = document.getElementById('btn-start');
  if (!dpad) return;

  const DPAD_KEYS = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
  const arrEls = { ArrowUp: dpad.querySelector('.up'), ArrowDown: dpad.querySelector('.dn'),
                   ArrowLeft: dpad.querySelector('.lt'), ArrowRight: dpad.querySelector('.rt') };
  let dpadTouchId = null;

  function clearDpad() {
    DPAD_KEYS.forEach(k => { keys[k] = false; });
    Object.values(arrEls).forEach(el => el && el.classList.remove('active'));
  }

  function applyDir(clientX, clientY) {
    const r  = dpad.getBoundingClientRect();
    const dx = clientX - (r.left + r.width  / 2);
    const dy = clientY - (r.top  + r.height / 2);
    clearDpad();
    if (Math.hypot(dx, dy) < r.width * 0.12) return;
    const a = Math.atan2(dy, dx) * 180 / Math.PI;
    let k;
    if      (a >= -135 && a < -45)  k = 'ArrowUp';
    else if (a >=  -45 && a <  45)  k = 'ArrowRight';
    else if (a >=   45 && a < 135)  k = 'ArrowDown';
    else                             k = 'ArrowLeft';
    keys[k] = true;
    if (arrEls[k]) arrEls[k].classList.add('active');
  }

  dpad.addEventListener('touchstart', e => {
    e.preventDefault();
    if (dpadTouchId !== null) return;
    const t = e.changedTouches[0];
    dpadTouchId = t.identifier;
    applyDir(t.clientX, t.clientY);
  }, { passive: false });

  dpad.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches)
      if (t.identifier === dpadTouchId) { applyDir(t.clientX, t.clientY); break; }
  }, { passive: false });

  dpad.addEventListener('touchend', e => {
    for (const t of e.changedTouches)
      if (t.identifier === dpadTouchId) { dpadTouchId = null; clearDpad(); break; }
  });
  dpad.addEventListener('touchcancel', () => { dpadTouchId = null; clearDpad(); });

  function bindBtn(el, keyCode) {
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      keys[keyCode] = true;
      el.classList.add('pressed');
    }, { passive: false });
    el.addEventListener('touchend',    () => { keys[keyCode] = false; el.classList.remove('pressed'); });
    el.addEventListener('touchcancel', () => { keys[keyCode] = false; el.classList.remove('pressed'); });
  }

  bindBtn(btnFire,  'Space');
  bindBtn(btnStart, 'Enter');

  // B button (for edit mode tile cycling backward)
  const btnB = document.getElementById('btn-b');
  if (btnB) bindBtn(btnB, 'KeyX');
})();

// ─── Fullscreen ───────────────────────────────────────────────────────────────
function toggleFullscreen() {
  const el = document.getElementById('screen');
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
}

// ─── UI buttons (fullscreen + sound) ──────────────────────────────────────────
(function setupUIButtons() {
  const btnFS = document.getElementById('btn-fullscreen');
  const btnSnd = document.getElementById('btn-sound');
  if (btnFS) btnFS.addEventListener('click', toggleFullscreen);
  if (btnSnd) btnSnd.addEventListener('click', () => { toggleSound(); updateSoundBtn(); });
  const btnRec = document.getElementById('btn-record');
  if (btnRec) btnRec.addEventListener('click', toggleRecording);
})();

// ─── Video/audio recording ───────────────────────────────────────────────────
let _recorder = null;
let _recChunks = [];

function toggleRecording() {
  if (_recorder && _recorder.state === 'recording') {
    _recorder.stop();
    return;
  }
  initAudio();
  if (!audioCtx || !recordDest) return;

  const videoStream = canvas.captureStream(60);
  const combined = new MediaStream([
    ...videoStream.getTracks(),
    ...recordDest.stream.getTracks()
  ]);

  // Pick best available codec
  const mimeTypes = [
    'video/webm; codecs=vp9,opus',
    'video/webm; codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  let mime = '';
  for (const m of mimeTypes) {
    if (MediaRecorder.isTypeSupported(m)) { mime = m; break; }
  }

  _recChunks = [];
  _recorder = new MediaRecorder(combined, mime ? { mimeType: mime } : {});
  _recorder.ondataavailable = e => { if (e.data.size > 0) _recChunks.push(e.data); };
  _recorder.onstop = () => {
    const ext = _recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(_recChunks, { type: _recorder.mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `battlecity-${Date.now()}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    const btn = document.getElementById('btn-record');
    if (btn) btn.classList.remove('recording');
  };
  _recorder.start();
  const btn = document.getElementById('btn-record');
  if (btn) btn.classList.add('recording');
}

// ─── Dynamic mobile button labels ─────────────────────────────────────────────
const TILE_NAMES = ['BRICK R','BRICK B','BRICK L','BRICK T','BRICK',
                    'STEEL R','STEEL B','STEEL L','STEEL T','STEEL',
                    'WATER','TREES','ICE','EMPTY'];

let _lastMobilePhase = null;

function updateMobileLabels() {
  const btnFire  = document.getElementById('btn-fire');
  const btnStart = document.getElementById('btn-start');
  const btnB     = document.getElementById('btn-b');
  if (!btnFire) return;

  const ctxStage = document.getElementById('ctx-stage');
  const ctxTile  = document.getElementById('ctx-tile');

  // Show/hide context panels
  const showStage = gamePhase === 'select';
  const showTile  = gamePhase === 'edit';
  if (ctxStage) ctxStage.classList.toggle('active', showStage);
  if (ctxTile)  ctxTile.classList.toggle('active', showTile);

  // Update stage number live
  if (showStage) {
    const el = document.getElementById('ctx-stage-num');
    if (el) el.textContent = selectedStage + 1;
  }

  // Update tile name live
  if (showTile) {
    const el = document.getElementById('ctx-tile-name');
    if (el) el.textContent = TILE_NAMES[editTileType] || 'TILE';
  }

  // Only update button labels on phase change
  if (gamePhase === _lastMobilePhase) return;
  _lastMobilePhase = gamePhase;

  switch (gamePhase) {
    case 'title':
      btnFire.textContent  = 'SEL';
      btnStart.textContent = 'START';
      if (btnB) btnB.style.display = 'none';
      break;
    case 'select':
      btnFire.textContent  = 'GO';
      btnStart.textContent = 'GO';
      if (btnB) btnB.style.display = 'none';
      break;
    case 'edit':
      btnFire.textContent  = 'PLACE';
      btnStart.textContent = 'PLAY';
      if (btnB) btnB.style.display = 'none'; // tile nav handled by ctx-tile buttons
      break;
    case 'play':
    case 'start':
      btnFire.textContent  = 'FIRE';
      btnStart.textContent = 'START';
      if (btnB) btnB.style.display = 'none';
      break;
    case 'clear':
    case 'gameover_tally':
    case 'gameover':
    case 'victory':
      btnFire.textContent  = 'OK';
      btnStart.textContent = 'OK';
      if (btnB) btnB.style.display = 'none';
      break;
    default:
      btnFire.textContent  = 'FIRE';
      btnStart.textContent = 'START';
      if (btnB) btnB.style.display = 'none';
  }
}

// Wire up context panel buttons (called once after DOM ready)
function initCtxButtons() {
  // Stage prev/next
  const stagePrev = document.getElementById('ctx-stage-prev');
  const stageNext = document.getElementById('ctx-stage-next');
  if (stagePrev) stagePrev.addEventListener('pointerdown', e => {
    e.preventDefault();
    selectedStage = (selectedStage + 34) % 35;
    const el = document.getElementById('ctx-stage-num');
    if (el) el.textContent = selectedStage + 1;
  });
  if (stageNext) stageNext.addEventListener('pointerdown', e => {
    e.preventDefault();
    selectedStage = (selectedStage + 1) % 35;
    const el = document.getElementById('ctx-stage-num');
    if (el) el.textContent = selectedStage + 1;
  });

  // Tile prev/next
  const tilePrev = document.getElementById('ctx-tile-prev');
  const tileNext = document.getElementById('ctx-tile-next');
  if (tilePrev) tilePrev.addEventListener('pointerdown', e => {
    e.preventDefault();
    editTileType = (editTileType + 13) % 14;
    const el = document.getElementById('ctx-tile-name');
    if (el) el.textContent = TILE_NAMES[editTileType] || 'TILE';
  });
  if (tileNext) tileNext.addEventListener('pointerdown', e => {
    e.preventDefault();
    editTileType = (editTileType + 1) % 14;
    const el = document.getElementById('ctx-tile-name');
    if (el) el.textContent = TILE_NAMES[editTileType] || 'TILE';
  });
}

// Returns direction (0-3) or -1 if no d-pad held
// P1: Arrows (+ WASD in 1P mode); P2: WASD
function p1Dir() {
  if (demoMode && entities[0]) return entities[0].dir;  // AI sets e.dir via tickDemoAI
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
  if (demoMode && entities[1]) return entities[1].dir;  // AI sets e.dir via tickDemoAI
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

// Can entity e move in direction d? (1px step; ROM moves 8px but runs EntityMainLoop ~8× less often)
// ROM $DD30 MoveGridSnap: probes 2 leading-edge points at 8px tile resolution
const TANK_SZ = 16;  // ROM 16×16 tank; entity_X/Y are center coords

function canMove(e, d) {
  const nx = e.x + DX[d];
  const ny = e.y + DY[d];

  // Playfield boundary  ROM $DE22 ClampXMove  $DE2A ClampYMove
  // nx/ny are center coords; top-left = nx-8, ny-8
  if (nx - 8 < FX || nx - 8 + TANK_SZ > FX + GW * META) return false;
  if (ny - 8 < FY || ny - 8 + TANK_SZ > FY + GH * META) return false;

  // Eagle zone  ROM $DC7C EntityMovementAI: eagle tile block — 16×16 eagle center at (ex-8, ey-8)
  if (eagleAlive && rectsOverlap(nx - 8, ny - 8, TANK_SZ, TANK_SZ, EAGLE.x - 8, EAGLE.y - 8, 16, 16)) return false;

  // Tile collision: 2 leading-edge probe points at 8px tile resolution
  // ROM $DD30 MoveGridSnap: probes top and bottom of leading edge
  // UP: (nx-8,ny-8),(nx+7,ny-8)  LEFT: (nx-8,ny-8),(nx-8,ny+7)
  // DOWN: (nx-8,ny+7),(nx+7,ny+7)  RIGHT: (nx+7,ny-8),(nx+7,ny+7)
  let p1x, p1y, p2x, p2y;
  if      (d === 0) { p1x = nx - 8; p1y = ny - 8; p2x = nx + 7; p2y = ny - 8; }  // UP
  else if (d === 1) { p1x = nx - 8; p1y = ny - 8; p2x = nx - 8; p2y = ny + 7; }  // LEFT
  else if (d === 2) { p1x = nx - 8; p1y = ny + 7; p2x = nx + 7; p2y = ny + 7; }  // DOWN
  else              { p1x = nx + 7; p1y = ny - 8; p2x = nx + 7; p2y = ny + 7; }  // RIGHT
  if (!passable8(p1x, p1y) || !passable8(p2x, p2y)) return false;

  // ROM $DC7C EntityMovementAI has NO entity-entity collision — only tile probes.
  // Tanks can freely overlap in the original ROM (prevents stuck-on-spawn).
  return true;
}

// ROM $E486 DirToStateTable: 2 sets of 9-way direction lookups (raw bytes $A0-$A3 = entity state + dir)
// Set 0: Prefer-Y (vertical dominant), Set 1: Prefer-X (horizontal dominant)
// Index: (signY+1)*3 + (signX+1)
const DIR_TARGET_TABLE = [
  0, 0, 0, 1, 0, 3, 2, 2, 2, // Set 0: UP, UP, UP, LEFT, UP, RIGHT, DOWN, DOWN, DOWN
  1, 0, 3, 1, 0, 3, 1, 2, 3  // Set 1: LEFT, UP, RIGHT, LEFT, UP, RIGHT, LEFT, DOWN, RIGHT
];

// ROM $DDA0 CalcDirToTarget: calculates direction toward target ($71/$72) with axis preference; lookups via $E486 table
function calcDirToTarget(e, tx, ty) {
  const dx = tx - e.x, dy = ty - e.y;
  const sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
  const sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
  const tableIdx = (sy + 1) * 3 + (sx + 1);
  
  // 50% chance to use Set 1 (prefer-X) for enemies
  const setOffset = (Math.random() < 0.5) ? 9 : 0;
  return DIR_TARGET_TABLE[tableIdx + setOffset];
}

// ROM $DE72 SpeedCtrlMove: AI goal selector based on stage difficulty ($84>>2 vs $0A); sets entity AI state $B0/$C0/$D0/$A0-$A3
function speedCtrlMove(e) {
  const frameHi = (frameCount >> 6) & 0xFF; // ROM $0A
  const sdm = Math.max(50, 190 - stageIdx * 4); // approximation of ZP $84
  
  if ((sdm >> 2) >= frameHi) {
    // Phase 1 (Slow): Target HQ
    e.dir = calcDirToTarget(e, EAGLE.x, EAGLE.y);
  } else if ((sdm >> 3) >= frameHi) {
    // Phase 2 (Medium): Random direction
    e.dir = Math.floor(Math.random() * 4);
  } else {
    // Phase 3 (Fast): Target nearest player
    let target = entities[0];
    if (numPlayers === 2 && (!entities[0].alive || Math.random() < 0.5)) target = entities[1];
    if (target && target.alive) e.dir = calcDirToTarget(e, target.x, target.y);
    else e.dir = Math.floor(Math.random() * 4);
  }
}

// ROM $DDA0 RandomDirChange: enemy direction update — 50% SpeedCtrl; 25% turn L; 25% turn R
function randomDirChange(e) {
  const r = Math.random();
  if (r < 0.5) {
    speedCtrlMove(e);
  } else {
    if (Math.random() < 0.5) e.dir = (e.dir + 1) & 3; // Right
    else                     e.dir = (e.dir + 3) & 3; // Left
  }
}

// ─── Entity movement  ─────────────────────────────────────────────────────────
// ROM $DB75 PlayerMoveTick  $DC7C EntityMovementAI  $DD30 MoveGridSnap
function moveEntities() {
  for (let i = 0; i < 8; i++) {
    const e = entities[i];
    if (!e.alive || e.spawnAnim > 0) continue;

    // ROM $E181 EntityTileRead: ice flag set from tile at (posX-8, posY-8) = entity top-left corner.
    // (Not center — the ROM reads the nametable tile under the top-left 8×8 quadrant.)
    const itlx = e.x - 8, itly = e.y - 8;
    const icol = Math.floor((itlx - FX) / META);
    const irow = Math.floor((itly - FY) / META);
    const onIce = irow >= 0 && irow < GH && icol >= 0 && icol < GW && grid[irow][icol] === T.ICE;

    if (e.isPlayer) {
      // Skip P2 slot in 1P mode
      if (e.slot === 1 && numPlayers === 1) continue;
      // ROM $DB75 PlayerMoveTick: process on 3 of every 4 frames
      if ((frameCount & 3) === 2) continue;
      // ROM $DB8B: friendly-fire stun ($6F,X != 0) — skip controller input, count down
      if (e.stunTimer > 0) { e.stunTimer--; continue; }

      const d = e.slot === 0 ? p1Dir() : p2Dir();
      if (!onIce) {
        // Off ice: normal input — stop if no key, allow direction change
        if (d === -1) continue;
        // Direction change: snap to 8-px grid only for perpendicular turns
        // ROM $DB75 PlayerMoveTick: same dir → skip; 180° (EOR #$02) → skip; else snap
        if (d !== e.dir) {
          if (d !== (e.dir ^ 2)) {  // perpendicular turn → snap
            e.x = (e.x + 4) & 0xF8;
            e.y = (e.y + 4) & 0xF8;
          }
          e.dir = d;
        }
      }
      // On ice: ignore input — keep sliding in current direction, no direction change
      // ROM $DD29: animBit ($B0,X EOR #$04) toggles every EntityMovementAI call, even when blocked
      if (canMove(e, e.dir)) {
        e.x += DX[e.dir];
        e.y += DY[e.dir];
      }
      e.animBit ^= 4;  // ROM $DD29: toggle every movement-attempt frame (moved or blocked)
    } else {
      // Enemy: frozen during Timer power-up  ROM $0100 EnemyFreezeTimer
      if (freezeTimer > 0) continue;

      // ROM $DC7C EntityMovementAI: Fast type ($A0, EntityType&$F0==$A0) always processes; others alternate
      if (e.type !== 1 && ((i ^ frameCount) & 1)) continue;

      // AI: logic from ROM $DC7C EntityMovementAI
      if (!onIce) {
        // 1. ROM $DC80–$DC96: if 8px-aligned, 1/16 chance call SpeedCtrlMove and skip movement this frame
        if ((e.x & 7) === 0 && (e.y & 7) === 0) {
          if ((Math.random() * 16 | 0) === 0) {
            speedCtrlMove(e);
            continue;  // ROM RTS at $DC96: no movement or animBit toggle this frame
          }
        }

        // 2. ROM $DD11: if blocked — 75% keep direction (bump), 25% flip 180° ($DD30: EOR #$02)
        // Snap to 8px grid before probing (ROM entities start on 8px grid; JS 1px steps drift off)
        if (!canMove(e, e.dir)) {
          if ((Math.random() * 4 | 0) === 0) {
            // 25%: flip 180° (ROM $DD30: EOR #$02 on direction bits); no animBit toggle
            e.x = (e.x + 4) & 0xF8;  // snap grid so new-dir probes land on tile boundaries
            e.y = (e.y + 4) & 0xF8;
            e.dir ^= 2;
            continue;  // ROM $DD47 RTS: no animBit toggle on the flip path
          }
          // 75%: keep direction, toggle animBit (ROM $DD27→$DD29)
          e.animBit ^= 4;
          continue;
        }
      }

      // Passable: move 1px, toggle animBit (ROM $DD04–$DD0E→$DD29)
      e.x += DX[e.dir];
      e.y += DY[e.dir];
      e.animBit ^= 4;
    }
  }
}

// ─── Firing  ──────────────────────────────────────────────────────────────────
// ROM $E08C FireBullet  $E122 PlayerFireTick  $E162 EnemyFireTick
let fireHeld = [false, false];  // per-player fire-held state

function handlePlayerFire() {
  // P1 fire: Space / X / J (+ E in 1P mode)
  const p1press = demoMode ? (entities[0] && entities[0].demoFire) : !!(keys['Space'] || keys['KeyX'] || keys['KeyJ'] || (numPlayers === 1 && keys['KeyE']));
  if (p1press && !fireHeld[0]) {
    const e = entities[0];
    if (e.alive && e.spawnAnim === 0) tryFire(e);
  }
  fireHeld[0] = p1press;

  // P2 fire: E / Q  (only in 2P mode)
  if (numPlayers === 2) {
    const p2press = demoMode ? (entities[1] && entities[1].demoFire) : !!(keys['KeyE'] || keys['KeyQ']);
    if (p2press && !fireHeld[1]) {
      const e = entities[1];
      if (e.alive && e.spawnAnim === 0) tryFire(e);
    }
    fireHeld[1] = p2press;
  }
}

// ROM $E162 EnemyFireTick: for each active enemy, fire if RNG & $1F == 0 (1/32 per frame)
function handleEnemyFire() {
  if (freezeTimer > 0) return;
  for (let i = 2; i <= 7; i++) {
    const e = entities[i];
    if (!e.alive || e.spawnAnim > 0) continue;
    if ((Math.random() * 32 | 0) === 0) tryFire(e);
  }
}

// ROM $E08C FireBullet: set $CC,X = dir|$40; compute start pos from entity center
function tryFire(e) {
  // Primary bullet slot = entity index  ROM $CC,X BulletState
  let b = bullets[e.slot];
  if (b.active) {
    // Double-shot: starLevel >= $40  ROM $D6,X bit0  $0101,X >= $40
    if (e.starLevel < 0x40) return;
    // Secondary slot must have opposite (slot^frameCount)&1 parity so both bullets
    // alternate frames rather than skipping together.  ROM slots are adjacent → odd/even pairs.
    // P1: primary=0 (even) → secondary=9 (odd); P2: primary=1 (odd) → secondary=8 (even).
    const sec = e.slot < 2 ? 8 + (e.slot ^ 1) : null;
    if (sec === null || bullets[sec].active) return;
    b = bullets[sec];
  }
  // Bullet spawn position: from entity center toward direction  ROM $E140
  // e.x/e.y are center coords (ROM convention)
  b.x      = e.x + DX[e.dir] * 8;  // ROM $E0A5: ASL×3 = ×8
  b.y      = e.y + DY[e.dir] * 8;
  b.dir    = e.dir;
  b.active       = true;
  b.explodeTimer = 0;
  b.armor        = e.starLevel >= 0x60;  // armor-piercing at max star  ROM $D6,X bit1
  // Power (D6,X!=0): 1-2-star player or power-type enemy → 4px/frame, no alternating-frame skip
  // ROM $E08C FireBullet: $A8&$F0=$20/$40→D6=1; =$60→D6=3; enemy $C0→D6=1; else D6=0
  b.powered      = e.starLevel >= 0x20 || (!e.isPlayer && e.type === 2);
  b.owner        = e.slot;
  if (e.isPlayer) sfxPlayerFire(); else sfxEnemyFire();  // ROM sound triggers
}

// ─── Bullet movement + tile collision  ────────────────────────────────────────
// ROM $E02E BulletStateMachine: moves all bullets every frame — 2px normal, 4px power.
// ROM $E604 BulletTerrainCollision: separate step; skips collision check for normal
//   bullets when (slot^frame)&1==0 (alternating frame, $E612–$E61B).
// These are two separate GameTickMain steps (5 and 11).

function moveBullets() {
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b.active) continue;

    // ROM $E051 BulletMoveStep: move every frame — 2px normal (one BulletApplyDelta),
    // 4px power (two BulletApplyDelta calls, $D6 bit0 set).
    const spd = b.powered ? 4 : 2;
    b.x += DX[b.dir] * spd;
    b.y += DY[b.dir] * spd;

    // Out of field bounds  ROM $E604 BulletTerrainCollision: boundary check
    if (b.x < FX - 4 || b.x > FX + GW * META + 4 ||
        b.y < FY - 4 || b.y > FY + GH * META + 4) {
      b.active = false;
      continue;
    }

    // ROM $E612–$E61B: skip collision check this frame for normal bullets when (slot^frame)&1==0
    // Power bullets always check collision.
    if (!b.powered && !((b.slot ^ frameCount) & 1)) continue;

    // Eagle hit  ROM $E693 BulletHitCheck: eagle tile $C8 → set $68=$27=39 (eagle-destruction timer)
    if (eagleAlive &&
        Math.abs(b.x - EAGLE.x) < 12 &&
        Math.abs(b.y - EAGLE.y) < 8) {
      eagleAlive    = false;
      eagleExpTimer = 39;  // ROM $E693: $68 = $27 = 39 decimal
      sfxEagleHit();  // ROM $030B=1
      triggerBulletExplosion(b);
      b.active = false;
      continue;
    }

    // Tile collision  ROM $E604 BulletTerrainCollision: 4-probe system
    // Probes span −5/−1/0/+4 pixels perpendicular to movement direction.
    // isHoriz: LEFT(1)/RIGHT(3) → perp is Y axis; UP(0)/DOWN(2) → perp is X axis.
    const isHoriz = b.dir & 1;
    const px = isHoriz ? 0 : 1;  // perpendicular unit X
    const py = isHoriz ? 1 : 0;  // perpendicular unit Y

    // Probe A: primary, always  ROM $E647 JSR BulletHitCheck
    const hitA = bulletHitsTileAt(b, b.x, b.y);
    // Probe B: perp +4, only if A hit brick  ROM $E64A BEQ $E65F (skip B when A=0)
    if (hitA === 'brick') tryBrickAt(b.x + px * 4, b.y + py * 4);

    // Probe C: perp −1, always independent of A  ROM $E65F–$E66D (unconditional)
    const hitC = bulletHitsTileAt(b, b.x - px, b.y - py);
    // Probe D: perp −5, only if C hit brick  ROM $E670 BEQ $E68B (skip D when C=0)
    if (hitC === 'brick') tryBrickAt(b.x - px * 5, b.y - py * 5);

    // Stop bullet if either A or C hit any solid tile  ROM: $CC,X=$33 set inside BulletHitCheck
    if (hitA || hitC) {
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

// ROM $E604: secondary probe — destroy brick at (bx,by) without stopping bullet.
// Used for probes B and D (perpendicular ±4/±5 from bullet center).
function tryBrickAt(bx, by) {
  const col = Math.floor((bx - FX) / META);
  const row = Math.floor((by - FY) / META);
  if (col < 0 || col >= GW || row < 0 || row >= GH) return;
  const t = grid[row][col];
  if (t !== T.BRICK && !(t >= T.BRICK_R && t <= T.BRICK_T)) return;
  const localX = bx - (FX + col * META);
  const localY = by - (FY + row * META);
  const qbit = 1 << (Math.floor(localY / 8) * 2 + Math.floor(localX / 8));
  if (brickBits[row][col] & qbit) destroyBrick(row, col, bx, by);
}

// ROM $E693 BulletHitCheck: checks tile at (bx, by) for bullet b.
// Returns 'brick' (A=1: destroys brick quarter, triggers secondary probes B/D),
//         'solid' (A=0: steel stops bullet via $CC=$33, no secondary probe),
//         null    (A=0: empty/passable — water/forest/ice/open-steel all pass through).
// ROM $E6C8: CMP #$12; BCS $E709 — tiles >= $12 (water=$12, ice=$21, forest=$22) are passable.
function bulletHitsTileAt(b, bx, by) {
  const col = Math.floor((bx - FX) / META);
  const row = Math.floor((by - FY) / META);
  if (col < 0 || col >= GW || row < 0 || row >= GH) return null;

  const t = grid[row][col];
  const localX = bx - (FX + col * META);
  const localY = by - (FY + row * META);
  const qx = localX >= 8 ? 1 : 0;
  const qy = localY >= 8 ? 1 : 0;
  const qbit = 1 << (qy * 2 + qx);  // TL=bit0, TR=bit1, BL=bit2, BR=bit3

  // Steel: A=0 in ROM (but $CC=$33 set), no secondary probe trigger  ROM $E6D8–$E709
  // Armor-piercing (D6 bit1 set): erase steel tile  ROM $E6DE WriteNametableByte #$00
  if (t === T.STEEL || (t >= T.STEEL_R && t <= T.STEEL_T)) {
    if (t >= T.STEEL_R && t <= T.STEEL_T) {
      // Partial steel: open ($20) quadrants passable, only solid ($10) quadrants block
      const STEEL_BLOCK = [0b1010, 0b1100, 0b0101, 0b0011]; // STEEL_R/B/L/T
      if (!(STEEL_BLOCK[t - T.STEEL_R] & qbit)) return null;
    }
    if (b.armor) grid[row][col] = T.EMPTY;
    if (b.owner < 2) sfxSteelHit();  // ROM $030D=1 player bullet ricochets
    return 'solid';
  }

  // Water/forest/ice: tile >= $12 → passable for bullets  ROM $E6C8 CMP #$12; BCS $E709
  // (Tanks cannot cross water, but bullets fly through freely)

  // Brick: A=1 in ROM, triggers secondary probes  ROM $E6FA ClearTileBit; $E6FD LDA #$01 RTS
  if (t === T.BRICK || (t >= T.BRICK_R && t <= T.BRICK_T)) {
    if (!(brickBits[row][col] & qbit)) return null;  // quadrant already cleared — pass through
    destroyBrick(row, col, bx, by);
    if (b.owner < 2) sfxBrickHit();  // ROM $030C=1
    return 'brick';
  }
  return null;
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
  // (Since only 5 types exist, we map bitmask to closest half-wall or empty)
  if      (bits === 0)      grid[row][col] = T.EMPTY;
  else if ((bits & 0b1010) === bits) grid[row][col] = T.BRICK_R;
  else if ((bits & 0b1100) === bits) grid[row][col] = T.BRICK_B;
  else if ((bits & 0b0101) === bits) grid[row][col] = T.BRICK_L;
  else if ((bits & 0b0011) === bits) grid[row][col] = T.BRICK_T;
  else                      grid[row][col] = T.BRICK;
}

// ─── Bullet–entity collision  ─────────────────────────────────────────────────
// ROM $E70C EnemyBulletPlayerCollision: 10×10 px proximity check
function bulletEntityCollision() {
  for (let bi = 0; bi < bullets.length; bi++) {
    const b = bullets[bi];
    if (!b.active) continue;

    const isPlayerBullet = b.owner < 2;

    for (let ei = 0; ei < 8; ei++) {
      const e = entities[ei];
      if (!e.alive || e.spawnAnim > 0) continue;

      const targetIsPlayer = ei < 2;

      // Section routing matches ROM's three separate loops:
      if (!isPlayerBullet && !targetIsPlayer) continue;  // S1: enemy bullet only hits players
      if (isPlayerBullet && targetIsPlayer) {
        // S3: player bullet → other player  ROM $E843
        // EOR parity: (entity_slot XOR bullet_slot) must be ODD → prevents self-hit  ROM $E865
        if (!((ei ^ bi) & 1)) continue;
      }
      // S2: player bullet → enemy falls through (no extra filter)

      if (ei === b.owner) continue;

      // 10×10 px hit check  ROM $E70C $E87A  (e.x/e.y are center coords)
      if (Math.abs(b.x - e.x) >= 10) continue;
      if (Math.abs(b.y - e.y) >= 10) continue;

      triggerBulletExplosion(b);
      b.active = false;

      if (!isPlayerBullet) {
        // Enemy bullet → player  ROM $E70C
        if (e.shieldTimer > 0) continue;  // shield deflects
        killEntity(e);
      } else if (targetIsPlayer) {
        // Player bullet → other player  ROM $E843: 200-frame stun (not kill), shield deflects
        // ROM $E8A0: skip if already stunned ($6F,X!=0); $E8A4: skip in construction mode
        if (e.stunTimer > 0 || e.shieldTimer > 0) continue;
        e.stunTimer = 200;  // ROM $E8AA: STA $6F,X=#$C8 (200 frames — can't move)
      } else {
        // Player bullet → enemy  ROM $E70C: armor check, blink on partial hit
        e.lastHitBy = b.owner;  // track which player gets the kill score
        if (e.armorHits > 0) {
          e.armorHits--;
          e.blinkFrame = 20;   // brief blink to signal hit
          sfxArmorHit();  // ROM $030E=1 player bullet hits armored tank
        } else {
          killEntity(e);
        }
      }
    }
  }
}

// ─── Bullet–bullet cancel  ────────────────────────────────────────────────────
// ROM $E910 BulletBulletCollision: player bullet vs enemy bullet within 6 px
function bulletBulletCancel() {
  // Player bullet slots: 0, 8 (P1), 1, 9 (P2)  ROM $E910: slot&$06==0
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

// ROM $C728 CheckGameOver: eagle destroyed ($68=0) or all lives lost → trigger "GAME OVER" scroll
// Center-up when both players dead; called from main gameplay loop
function checkGameOverScroll() {
  if (demoMode) { enterTitle(); return; }
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

// 2P mode: when one player's lives run out, scroll "GAME OVER" from their side of the screen
// P1 dies (playerIdx=0): scroll from X=$20 moving right toward P2
// P2 dies (playerIdx=1): scroll from X=$C0 moving left toward P1
function startPlayerDeathScroll(playerIdx) {
  if (goScrollTimer > 0) return;  // already scrolling
  if (!eagleAlive) return;        // only scroll "GAME OVER" when eagle still intact
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
// Player death: EnemyBulletPlayerCollision ($E70C); Enemy death: bulletEntityCollision → killEntity
function killEntity(e) {
  if (!e.alive) return;
  e.alive = false;
  e.deathTimer = 24;  // ROM state $73→$00: ~24 countdown steps (3 per phase × 8 phases)

  if (e.isPlayer) {
    // ROM $DE0D: DEC $51,X lives for P1/P2 (X=slot)
    const slot = e.slot;
    if (slot === 0) {
      p1Lives--;
      if (p1Lives < 0) {
        if (numPlayers === 2) startPlayerDeathScroll(0);  // ROM $DE26: P1 dead in 2P → goScroll right
        checkGameOverScroll();
      } else {
        playerRespawnTimer[0] = 120;
      }
    } else {
      p2Lives--;
      if (p2Lives < 0) {
        if (numPlayers === 2) startPlayerDeathScroll(1);  // ROM $DE38: P2 dead in 2P → goScroll left
        checkGameOverScroll();
      } else {
        playerRespawnTimer[1] = 120;
      }
    }
  } else {
    // ROM $E70C EnemyBulletPlayerCollision (enemy death path): DEC $80 EnemyKillsPool
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
    killCounts[Math.min(e.type, 3)]++;  // ROM $8D10 ResultScreen tally loop: per-type kill counter

    sfxEntityKill();  // ROM $030A=1 entity kill explosion + noise burst

    // Power-up tank drops power-up  ROM $E363 SpawnEnemy: blink flag → powerup spawn on kill
    if (e.powerUpTank && !powerUp) {
      spawnPowerUp();
    }
  }
}

// ─── Power-ups  ───────────────────────────────────────────────────────────────
// ROM $E972 PowerupCollectTick: proximity check; dispatch on $88 type
// ROM $E8FA PowerupTypeTable[8]: PRNG&7 indexes into this; type 5 (1-Up) at index 5
const POWERUP_RNG = [0, 1, 2, 3, 4, 5, 4, 3];
// PowerUpSpawnPickPos: RNG & 0x03 → coord = ((A+1)*6)*8
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
      sfxPowerUpCollect();  // ROM $A9C7: slot 6 powerup collect sound
      applyPowerUp(e, powerUp.type);
      // ROM $EB4D: STA $62 #$32 — start 50-frame flash at collect position
      puFlashPos = { x: powerUp.x, y: powerUp.y };
      puFlashTimer = 50;
      powerUp = null;
      return;
    }
  }
}

// ROM $E9E2 PowerUpDispatchTable: 6 u16le ptrs; JMP via $11/$12 indexed by $88*2
function applyPowerUp(e, type) {
  switch (type) {
    case 0:  // Helmet   ROM $E9F0: STA $89,X=#$0A (10 ticks × 64 frames = 640 frames shield)
      e.shieldTimer = 10;
      break;
    case 1:  // Timer/Clock  ROM $E9F5: STA $0100=#$0A (~640 frames freeze)
      freezeTimer = 10;
      break;
    case 2:  // Shovel  ROM $E9FB: STA $45=#$14 (20 ticks), JSR $CB9E (eagle wall→steel)
      shovelTimer = 20;
      setEagleWall(true);  // ROM $CB9E SteelWallFortify (called from $E9FB ShovelPowerUp)
      break;
    case 3:  // Star  ROM $EA07: $0101,X += $20 (max $60); STA $A8,X=type
      e.starLevel = Math.min(e.starLevel + 0x20, 0x60);
      break;
    case 4:  // Grenade  ROM $EA17: entities 7→2 → STA $A0,Y=$73; STA $030A=1 ($030A=kill SFX)
      for (let i = 2; i <= 7; i++) {
        if (entities[i].alive) killEntity(entities[i]);
      }
      grenadeFlash = 8;  // ~8 frames white flash over playfield
      break;
    case 5:  // Tank/1-Up  ROM $EA3E: INC $51,X; STA $0304=$0305=1
      if (e.slot === 0) { p1Lives++; sfxLifeUp(0); } else { p2Lives++; sfxLifeUp(1); }
      break;
  }
}

// ─── Enemy spawn dispatch  ────────────────────────────────────────────────────
// ROM $DB48 EnemySpawnTick: dec $82 SpawnDelay; if $7F>0 find free slot
function tickEnemySpawn() {
  if (enemiesLeft <= 0 || activeEnemyCount >= 4) return;
  if (spawnDelay > 0) { spawnDelay--; return; }
  spawnEnemy();
  spawnDelay = Math.max(50, 186 - stageIdx * 4 - (numPlayers === 2 ? 20 : 0)); // ROM $C3A2+$C3B0
}

// ─── Shield + freeze tick  ────────────────────────────────────────────────────
// ROM $E27C InvincibilityTick: shieldTimer decremented every 64 frames
// ROM $DC7C EntityMovementAI: freezeTimer check skips enemy movement when $0100 set
function tickTimers() {
  for (let i = 0; i < 2; i++) {
    const e = entities[i];
    if (e.shieldTimer > 0 && (frameCount & 63) === 0) e.shieldTimer--;
  }
  if (freezeTimer > 0 && (frameCount & 63) === 0) freezeTimer--;
  // ROM $E2A9 ShovelEagleTick: $45 decremented every 16 frames; <4 ticks flash steel↔brick
  if (shovelTimer > 0 && (frameCount & 15) === 0) {
    shovelTimer--;
    if (shovelTimer === 0) {
      setEagleWall(false);  // timer expired → revert to brick
    } else if (shovelTimer < 4) {
      // ROM flashing: alternate steel/brick every 16 frames via FrameLo AND $10
      setEagleWall(!!((frameCount >> 4) & 1));
    }
  }
  if (puFlashTimer > 0) puFlashTimer--;
  if (grenadeFlash > 0) {
    grenadeFlash--;
    setBGPaletteSet(5 + (frameCount & 3));  // ROM $EBBC: cycle sets 5-8 ($4D=($0B&3)+5)
    if (grenadeFlash === 0) setBGPaletteSet(0); // restore in-game base when flash ends
  }
  for (const e of entities) {
    if (e.spawnAnim > 0)  e.spawnAnim--;
    if (e.blinkFrame > 0) e.blinkFrame--;
    if (!e.alive && e.deathTimer > 0) e.deathTimer--;
  }
  for (let pi = 0; pi < numPlayers; pi++) {
    if (playerRespawnTimer[pi] > 0) {
      playerRespawnTimer[pi]--;
      if (playerRespawnTimer[pi] === 0 && !entities[pi].alive) {
        spawnPlayer(pi);  // ROM $C331 StageStartInit → SpawnEnemy (player branch)
      }
    }
  }
  if (eagleExpTimer > 0) eagleExpTimer--;  // ROM $E2A9 ShovelEagleTick: DEC $68 eagle-destruction timer
}

// ─── Stage-clear check  ───────────────────────────────────────────────────────
// ROM $C728 CheckGameOver: $80 EnemyKillsPool → 0 → stage clear
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

// Simulated AI inputs for demo mode
function tickDemoAI() {
  for (let i = 0; i < 2; i++) {
    const e = entities[i];
    if (!e || !e.alive || e.spawnAnim > 0) continue;
    
    // Pick a random direction every 64 frames or if blocked (exact same logic as enemies)
    if (e.demoTimer === undefined) e.demoTimer = 0;
    if ((e.x & 7) === 0 && (e.y & 7) === 0 && (Math.random() * 16 | 0) === 0) {
      speedCtrlMove(e);
    }
    if (!canMove(e, e.dir)) {
      randomDirChange(e);
    }
    
    // Fire occasionally
    e.demoFire = (Math.random() * 20 | 0) === 0;
  }
}

// ─── Main update  ─────────────────────────────────────────────────────────────
// ROM $C2E6 GameTickMain — 18-subsystem sequence called every frame from game loop $C1F9
function update() {
  frameCount++;
  updateMobileLabels();

  // ROM NMI handler: SoundEngineTick runs every frame regardless of game phase
  soundTick();
  tickBGM();

  // ROM $9B24: tank engine sound — plays while any player is pressing d-pad and alive
  if (gamePhase === 'play') {
    const anyMoving = (entities[0] && entities[0].alive && p1Dir() !== -1) ||
                      (numPlayers === 2 && entities[1] && entities[1].alive && p2Dir() !== -1);
    if (anyMoving && !slots[SND.TANK_ENGINE].active) sfxStartEngine();
    else if (!anyMoving && slots[SND.TANK_ENGINE].active) sfxStopEngine();
  }

  if (gamePhase === 'play') tickPaletteFlash(); // ROM $C31D PaletteFlashTick — water animation, in-game only

  if (demoMode && gamePhase === 'play') tickDemoAI();

  // ROM $C9C0 PlayerSelectLoop: SELECT cycles cursor 0→1→2→0 (1P/2P/CONSTRUCTION)
  // START dispatches via SelectDispatchTable based on $83 (cursor position)
  if (gamePhase === 'title') {
    titleFrame++;
    titleTimer++;

    // Reset demo timer on any input
    if (keys['ArrowUp'] || keys['ArrowDown'] || keys['Space'] || keys['Enter']) titleTimer = 0;

    // D-pad up/down (SELECT in ROM cycles $83: 0→1→2→0) — throttle to once per 8 frames
    if (titleFrame % 8 === 1) {
      if (keys['ArrowUp'])   titleCursor = (titleCursor + 2) % 3; // up = prev item
      if (keys['ArrowDown']) titleCursor = (titleCursor + 1) % 3; // down = next item
    }

    // START: dispatch based on cursor (ROM $CA69 SelectDispatchTable)
    if (keys['Space'] || keys['Enter']) {
      initAudio();
      if (titleCursor === 2) { // CONSTRUCTION
        initLevel(0);
        gamePhase = 'edit';  // must be AFTER initLevel (which sets gamePhase='start')
        grid.forEach(r => r.fill(T.EMPTY));
        brickBits.forEach(r => r.fill(0));
        editX = 6; editY = 6;
        editTileType = T.BRICK;
        editHoldCount = 0;
        editAFirst = false;
        editACycleTimer = 0;
        editStartHeld = true;  // Enter is still held from title select
      } else {
        numPlayers = titleCursor === 1 ? 2 : 1; // 0=1P, 1=2P
        p1Score = 0; p1Lives = 2; p1NextLifeScore = 20000;
        p2Score = 0; p2Lives = 2; p2NextLifeScore = 20000;
        newHiScorePlayer = 0;
        gamePhase = 'curtain';
        curtainTarget = 'select';
        curtainRow = 0;
        selectedStage = 0;
        setBGPaletteSet(4); // ROM $C16D: STA $4D=#$04 (InterStageScreen sets palette 4 before curtain)
      }
    } else if (titleTimer > 600) { // 10 seconds inactivity → Demo Mode
      demoMode = true;
      numPlayers = 2;
      p1Score = 0; p1Lives = 2;
      p2Score = 0; p2Lives = 2;
      initLevel(34); // Stage 35
    }
    return;
  }

  if (gamePhase === 'edit') {
    // D-pad: cursor movement (ROM $C6D2)
    const up    = !!(keys['ArrowUp']    || keys['KeyW']);
    const left  = !!(keys['ArrowLeft']  || keys['KeyA']);
    const down  = !!(keys['ArrowDown']  || keys['KeyS']);
    const right = !!(keys['ArrowRight'] || keys['KeyD']);
    const dpad  = up || left || down || right;

    let moved = false;
    if (dpad) {
      editHoldCount++;
      // First press (==1) moves immediately; after 20 frames, repeat every 6
      if (editHoldCount === 1 || (editHoldCount >= 20 && (editHoldCount - 20) % 6 === 0)) {
        if (up)    editY = Math.max(0, editY - 1);
        if (down)  editY = Math.min(GH - 1, editY + 1);
        if (left)  editX = Math.max(0, editX - 1);
        if (right) editX = Math.min(GW - 1, editX + 1);
        moved = true;
      }
    } else {
      editHoldCount = 0;
    }

    // Place tile on movement (ROM places continuously while moving)
    if (moved) {
      grid[editY][editX] = editTileType;
      brickBits[editY][editX] = brickInitBits(editTileType);
    }

    // A button (Space/Z): first press places tile, holding cycles type forward
    const aBtn = !!(keys['Space'] || keys['KeyZ']);
    if (aBtn) {
      if (!editAFirst) {
        editAFirst = true;
        grid[editY][editX] = editTileType;
        brickBits[editY][editX] = brickInitBits(editTileType);
        editACycleTimer = 0;
      } else {
        editACycleTimer++;
        if (editACycleTimer % 8 === 0) {
          editTileType = (editTileType + 1) % 14;
        }
      }
    } else if (!aBtn) {
      editAFirst = false;
    }

    // B button (X/Shift): cycle type backward (every 8 frames while held)
    const bBtn = !!(keys['KeyX'] || keys['ShiftLeft'] || keys['ShiftRight']);
    if (bBtn && !aBtn && frameCount % 8 === 0) {
      editTileType = (editTileType + 13) % 14; // -1 mod 14
    }

    // Start (Enter): save and transition to play (edge-detect)
    if (!keys['Enter']) editStartHeld = false;
    if (keys['Enter'] && !editStartHeld) {
      setEagleWall(false);
      customMap = grid.map(r => [...r]);
      numPlayers = 1;
      p1Score = 0; p1Lives = 2; p1NextLifeScore = 20000;
      p2Score = 0; p2Lives = 2; p2NextLifeScore = 20000;
      newHiScorePlayer = 0;
      selectedStage = 0;
      gamePhase = 'curtain';
      curtainTarget = 'select';
      curtainRow = 0;
      setBGPaletteSet(4);
    }
    return;
  }

  if (gamePhase === 'curtain') {
    // ROM $CC90 CurtainClose / $CCB2 InitNametableFromRAM: 1 row per WaitVBlank (1 row/frame)
    if (curtainTarget === 'select') {
      curtainRow++;
      if (curtainRow === 15) { gamePhase = 'select'; }
    } else {
      curtainRow--;
      if (curtainRow === -1) {
        gamePhase = 'play';  // ROM has no separate 'start' banner phase — goes straight to game loop
        startBGM();
      }
    }
    return;
  }

  // ROM $C159 InterStageScreen: A=advance stage, B=go back (1-35/$23 wraps); auto-repeats every 8 frames
  if (gamePhase === 'select') {
    const selUp   = !!(keys['ArrowUp']   || keys['KeyW']);
    const selDown = !!(keys['ArrowDown'] || keys['KeyS']);
    // Edge trigger on first press, then auto-repeat every 8 frames (matches ROM $C18B/$C1B2 timing)
    if (selUp && (!selectKeyHeld || frameCount % 8 === 0))
      selectedStage = (selectedStage + 1) % 35;
    if (selDown && (!selectKeyHeld || frameCount % 8 === 0))
      selectedStage = (selectedStage + 34) % 35;
    selectKeyHeld = selUp || selDown;

    if (keys['Space'] || keys['Enter']) {
      initLevel(selectedStage);
      setBGPaletteSet(0); // ROM $C1F1: STA $4D=#$00 after InitNametableFromRAM, switches to in-game palette
      gamePhase = 'curtain';
      curtainTarget = 'play';
      curtainRow = 14;
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
          sfxTallyTick();  // ROM $8D2A/$8D2D: slots 19+20 per tick
          ts.frameTimer = 8;  // ROM $CDD8: LDX #$08 = 8 frames per kill tick
        }
        if (ts.countsLeft[ts.row] === 0) {
          ts.row++;
          ts.frameTimer = 20;  // ROM $CDEC: LDX #$14 = 20 frames inter-row pause
        }
      }
    } else {
      if (phaseTimer === 100) sfxTallyDone();  // ROM $8E7E: slot 27 tally complete jingle
      phaseTimer--;
      if (phaseTimer <= 0) {
        if (customMap && stageIdx === 0) {
          // Construction mode: return to title after playing custom map
          customMap = null;
          enterTitle();
        } else if (stageIdx === LEVEL_MAPS.length - 1) {
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
  // ROM $8256 JSR $CCD4: result/stats tally before brick GAME OVER screen
  if (gamePhase === 'gameover_tally') {
    if (phaseTimer > 0) { phaseTimer--; return; }
    const ts = tallyState;
    if (!ts.done) {
      while (ts.row < 4 && killCounts[ts.row] === 0) ts.row++;
      if (ts.row >= 4) {
        ts.done = true;
        phaseTimer = 120;  // ROM $CEE5: LDX #$78 = 120 frames
      } else {
        ts.frameTimer--;
        if (ts.frameTimer <= 0) {
          ts.countsLeft[ts.row] = Math.max(0, ts.countsLeft[ts.row] - 1);
          sfxTallyTick();  // ROM $8D48/$8D4B
          ts.frameTimer = 8;   // ROM $CDD8: LDX #$08
        }
        if (ts.countsLeft[ts.row] === 0) { ts.row++; ts.frameTimer = 20; } // ROM $CDEC: LDX #$14
      }
    } else {
      phaseTimer--;
      if (phaseTimer <= 0) {
        // ROM $8283 JSR $C5D9: brick background + GAME/OVER sprites
        gamePhase = 'gameover';
        activeBGSet = -1; setBGPaletteSet(3);
      }
    }
    return;
  }
  if (gamePhase === 'gameover') {
    if (keys['Space'] || keys['Enter']) enterTitle();
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

  // ── Active gameplay subsystems  ROM $C2E6 GameTickMain order ──────────────
  tickTimers();                   // shield/freeze/spawn timers
  moveEntities();                 // ROM $DC7C EntityMovementAI
  moveBullets();                  // ROM $E604 BulletTerrainCollision
  bulletBulletCancel();           // ROM $E910 BulletBulletCollision
  bulletEntityCollision();        // ROM $E70C EnemyBulletPlayerCollision
  tickEnemySpawn();               // ROM $DB48 EnemySpawnTick
  handlePlayerFire();             // ROM $E122 PlayerFireTick
  handleEnemyFire();              // ROM $E162 EnemyFireTick
  checkPowerUpCollision();        // ROM $E972 PowerupCollectTick

  // ROM $C728 CheckGameOver: eagle destroyed ($68→0) → start in-field scroll
  if (!eagleAlive && eagleExpTimer === 0 && goScrollTimer === 0 && gamePhase === 'play') {
    if (demoMode) { enterTitle(); return; }
    goScrollX     = 0x70;  // ROM $0105 = $70 (center)
    goScrollY     = 0xF0;  // ROM $0106 = $F0
    goScrollDir   = 0;     // ROM $0107 = 0 (up)
    goScrollTimer = 0x11;  // ROM $0108 = $11
    goScrollFrame = 0;
  }

  // ROM $C972 ShovelAnimTick (doubles as GAME OVER scroll): 4-direction wiggle for "GAME OVER" sprites
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
          // ROM $8256 JSR $CCD4: result/stats screen before brick game-over screen
          gamePhase  = 'gameover_tally';
          phaseTimer = 25;
          activeBGSet = -1; setBGPaletteSet(3);  // ROM $CEF7 ResultScreenInit: $4D=3
          sfxGameOver();
          tallyState = {
            countsLeft: [...killCounts],
            row:        0,
            frameTimer: 7,
            done:       false,
          };
          newHiScorePlayer = 0;
          if (p1Score > hiScore) { hiScore = p1Score; newHiScorePlayer = 1; }
          if (numPlayers === 2 && p2Score > hiScore) { hiScore = p2Score; newHiScorePlayer = 2; }
        }
      }
    }
    if (goScrollTimer >= 10) {
      const WIGGLE_X = [0, -1, 0, 1];   // ROM $D3D5 ShovelTileDX (bytes 0-3)
      const WIGGLE_Y = [-1, 0, 1, 0];   // ROM $D3D9 ShovelTileDY
      goScrollX += WIGGLE_X[goScrollDir];
      goScrollY += WIGGLE_Y[goScrollDir];
    }
  }

  checkStageClear();              // ROM $C728 CheckGameOver: $80=0 → stage clear
}

// ─── Rendering helpers  ───────────────────────────────────────────────────────
// ROM $D934 FindFirstNonZeroScore: skips leading zeros but always shows ≥2 digits
function fmtScore(n, width = 6) {
  return n.toString().padStart(2, '0').padStart(width, ' ');
}
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
// ROM $D784 WriteNametableByte  $DACB TileTypeTable  $D743 ClearTileBit
function drawTile(col, row) {
  const t  = grid[row][col];
  const px = FX + col * META;
  const py = FY + row * META;

  fillRect(px, py, META, META, C.FIELD);  // always fill black first
  if (t === T.EMPTY || t >= 13) return;

  if (chrOff) {
    if (t <= T.BRICK) {
      // Brick (full or partial): draw ALL 4 quadrants
      // ROM $DACB TileTypeTable: set bit → tile $0F (solid brick), clear bit → tile $00 (shadow/mortar)
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
  if (t === T.BRICK || (t >= T.BRICK_R && t <= T.BRICK_T)) {
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
  if (t === T.STEEL || (t >= T.STEEL_R && t <= T.STEEL_T)) {
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

// ROM ClearNametableSlot ($98EB): fills nametable with tile $FC (not $00).
// Bank 0 (default stages) tile $FC = decorative diagonal ramp (indices 1 and 3).
// Bank 1 (alt stages) tile $FC = blank.
// NES nametable = 32 cols × 30 rows of 8×8 tiles = 256×240.
function drawBorderTiles() {
  const borderCol = '#666666'; // solid gray fallback
  if (!chrOff) {
    // Fallback: fill border areas with solid color
    fillRect(0, 0, 256, 16, borderCol);           // Top 2 rows
    fillRect(0, 224, 256, 16, borderCol);         // Bottom 2 rows
    fillRect(0, 16, 16, 208, borderCol);          // Left 2 cols
    fillRect(224, 16, 32, 208, borderCol);         // Right 4 cols
    return;
  }

  // ROM ClearEntitySlots ($D7CC): fills entire nametable buffer ($0400-$07FF) with $11, then
  // zeros attribute table ($07C0-$07FF → all BG palette 0). Border area is never overwritten,
  // so it stays tile $11 throughout gameplay. Tile $FC only appears inside the flag icon graphic.
  const tile = 0x11;
  const palIdx = 0;

  // Top 2 rows (rows 0–1, all 32 cols)
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 32; c++)
      drawCHRTile(tile, palIdx, c * 8, r * 8);
  // Bottom 2 rows (rows 28–29, all 32 cols)
  for (let r = 28; r < 30; r++)
    for (let c = 0; c < 32; c++)
      drawCHRTile(tile, palIdx, c * 8, r * 8);
  // Left 2 cols (rows 2–27, cols 0–1)
  for (let r = 2; r < 28; r++)
    for (let c = 0; c < 2; c++)
      drawCHRTile(tile, palIdx, c * 8, r * 8);
  // Right 4 cols (rows 2–27, cols 28–31)
  for (let r = 2; r < 28; r++)
    for (let c = 28; c < 32; c++)
      drawCHRTile(tile, palIdx, c * 8, r * 8);
}

// ROM $F000 LoadStageData / $F07A StageDataTable: renders all 13×13 metatiles
function drawField() {
  // NES PPU nametable: playfield is pure black, border gets tile $FC (ClearNametableSlot $98EB)
  fillRect(FX, FY, GW * META, GH * META, C.FIELD);
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

// ROM $E386 EagleStateUpdate — draws eagle sprite (intact/damaged/explosion).
// Walls now live in grid[]+brickBits[] via EAGLE_WALL / setEagleWall().
function drawEagleBase() {
  const ex = EAGLE.x, ey = EAGLE.y;

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
  // ROM entity kill animation: initial state $73 counts to $00 over ~24 frames.
  // DrawDispatch at $DF6C uses ($A0,X >> 3)&$FE as byte offset into MoveUpdateDispatch ($E575):
  //   states $7x/$6x/$5x → DrawMovingSprite ($DF81) → CalcSprTile → tile $F1/$F5/$F9 → 16×16 spark
  //   states $4x/$3x     → DrawExpandSprite ($DFFA) → 32×32 burst (eagle intact $D0-$DF / damaged $E0-$EF)
  //   state  $2x         → DrawSmallSprite  ($DFE7→$DFA4) → tile $F9 → 16×16 spark
  //   state  $1x         → DrawSpawnSprite  ($DFB1→$DFA4) → tile $F1 → 16×16 spark
  // All phases: palette SP3 (palIdx 7), BG bank (PT1, no +256).
  if (!e.alive && e.deathTimer > 0) {
    const t = e.deathTimer;
    if (chrOff) {
      if (t >= 22) {
        // state $7x: DrawMovingSprite → CalcSprTile → tile $F1, 16×16
        drawCHRTile(0xF0, 7, e.x - 8, e.y - 8, true);
        drawCHRTile(0xF1, 7, e.x - 8, e.y,     true);
        drawCHRTile(0xF2, 7, e.x,     e.y - 8, true);
        drawCHRTile(0xF3, 7, e.x,     e.y,     true);
      } else if (t >= 19) {
        // state $6x: DrawMovingSprite → CalcSprTile → tile $F5, 16×16
        drawCHRTile(0xF4, 7, e.x - 8, e.y - 8, true);
        drawCHRTile(0xF5, 7, e.x - 8, e.y,     true);
        drawCHRTile(0xF6, 7, e.x,     e.y - 8, true);
        drawCHRTile(0xF7, 7, e.x,     e.y,     true);
      } else if (t >= 16) {
        // state $5x: DrawMovingSprite → CalcSprTile → tile $F9, 16×16
        drawCHRTile(0xF8, 7, e.x - 8, e.y - 8, true);
        drawCHRTile(0xF9, 7, e.x - 8, e.y,     true);
        drawCHRTile(0xFA, 7, e.x,     e.y - 8, true);
        drawCHRTile(0xFB, 7, e.x,     e.y,     true);
      } else if (t >= 10) {
        // states $4x/$3x: DrawExpandSprite ($DFFA) → 32×32, tile formula:
        // tileAbs = base + (row&1) + col*2 + (row>>1)*8  (4 quadrants × DrawTank = 16 tiles)
        const base = (t >= 13) ? 0xD0 : 0xE0;  // $4x→intact eagle $D0-$DF, $3x→damaged $E0-$EF
        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 4; col++) {
            const tileAbs = base + (row & 1) + col * 2 + (row >> 1) * 8;
            drawCHRTile(tileAbs, 7, e.x - 16 + col * 8, e.y - 16 + row * 8, true);
          }
        }
      } else if (t >= 7) {
        // state $2x: DrawSmallSprite ($DFE7→$DFA4) → tile $F9, 16×16
        drawCHRTile(0xF8, 7, e.x - 8, e.y - 8, true);
        drawCHRTile(0xF9, 7, e.x - 8, e.y,     true);
        drawCHRTile(0xFA, 7, e.x,     e.y - 8, true);
        drawCHRTile(0xFB, 7, e.x,     e.y,     true);
      } else {
        // state $1x: DrawSpawnSprite ($DFB1→$DFA4) → tile $F1, 16×16
        drawCHRTile(0xF0, 7, e.x - 8, e.y - 8, true);
        drawCHRTile(0xF1, 7, e.x - 8, e.y,     true);
        drawCHRTile(0xF2, 7, e.x,     e.y - 8, true);
        drawCHRTile(0xF3, 7, e.x,     e.y,     true);
      }
    } else {
      // fallback: expanding rect
      const phase = Math.floor((24 - t) / 4);
      const r = 2 + phase * 2;
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
      const seqIdx = Math.min(14, Math.floor((30 - e.spawnAnim) / 2));
      const T = SPAWN_SEQ[seqIdx];
      // ROM DrawShootSprite ($E0BF): JSR DrawTank ($DB0A) → two 8×16 OAM entries = 16×16 sprite
      // Left col OAM_X = entity_x-8, right col OAM_X = entity_x, both OAM_Y = entity_y-8; palIdx 7 = SP3
      const sx = e.x - 8, sy = e.y - 8;
      // ODD tile byte T → PT1 (BG bank, no +256): top=T&$FE, bottom=(T&$FE)+1
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

  // Shield CHR overlay  ROM $E330 DrawPlayerShield: tiles $28-$2F (BG bank), SP2=palIdx6
  // drawSprite16 uses [left_tile, right_tile] bytes from OAM entries
  if (e.shieldTimer > 0 && chrOff) {
    const base = (frameCount >> 1) & 1 ? 0x2D : 0x29; // ROM tile bytes $2D/$29 (ODD)
    drawSprite16([base, base + 2], 6, e.x - 8, e.y - 8, true);
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
    // ODD tile index ($B1, etc) in 8x16 mode → PT1 (index 256+)
    // Wait, ROM $E1AF BulletExplode: tile $B1 is ODD, so it comes from BG bank (PT0)
    const T = (0xB1 + b.edir * 2) & 0xFE;
    if (chrOff) {
      drawCHRTile(T,     7, b.ex, b.ey,     true); // palette SP3 (palIdx 7)
      drawCHRTile(T + 1, 7, b.ex, b.ey + 8, true);
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
    // ROM tile $3B is ODD → BG bank (PT0)
    // drawSprite16 uses [left_tile, right_tile] assigned to OAM entries
    drawSprite16([0x3B, 0x3D], 6, puFlashPos.x - 8, puFlashPos.y - 8, true);
    return;
  }
  if (!powerUp) return;
  if ((frameCount >> 3) & 1) return;  // blink  ROM $0B&$08 gate
  const x = powerUp.x, y = powerUp.y;
  // ROM: $53 = type*4 + $81 (ODD) → PT1/BG bank;
  // drawSprite16 uses [left_tile, right_tile]
  const base = 0x81 + powerUp.type * 4;
  drawSprite16([base, base + 2], 6, x - 8, y - 8, true);
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

// ROM $C7BD DrawAllHUDKillIcons  $C7CD DrawGameOverBanner  $D8F7 DrawRowTiles
function drawHUD() {
  // --- Right sidebar (nametable cols 28–31, pixel X 224–255) ---
  // ROM: ClearNametableSlot ($98EB) fills with tile $FC; HUD area attribute = $00 (palette 0/BG0).
  // HUD elements drawn over background via PPUQueueTiles ($D6D3).
  const hx = 28 * 8;                 // pixel X = 224 (nametable col 28)
  const hy = FY;                     // pixel Y = 16  (row 2)

  // Clear HUD area (cols 28–31) with tile $11 (same as rest of nametable — set by ClearEntitySlots).
  if (chrOff) {
    for (let r = 0; r < 30; r++)
      for (let c = 28; c < 32; c++)
        drawCHRTile(0x11, 0, c * 8, r * 8);
  } else {
    // Fallback: fill sidebar area with solid gray
    fillRect(hx, 0, 32, 240, '#666666');
  }

  // Enemy count  ROM $C7BD DrawAllHUDKillIcons: rows 3–12, cols 29–30
  // ROM: BG tile $6A = small enemy tank icon; $11 = blank (erased at spawn, not death)
  // Icon erased when enemy SPAWNS → icon count = enemiesLeft (not including active enemies)
  const total = enemiesLeft;  // ROM $7F EnemiesRemaining (enemies not yet spawned)
  for (let i = 0; i < 20; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    if (i < total) {
      if (chrOff) {
        drawCHRTile(0x6A, 0, hx + 8 + col * 8, 3 * 8 + row * 8, false);
      } else {
        fillRect(hx + 8 + col * 8, 3 * 8 + row * 8, 8, 6, C.ENEMY);
      }
    } else {
      // ROM $C7AE DrawHUDKillIconB: write tile $11 (steel/blank) for consumed slots
      if (chrOff) {
        drawCHRTile(0x11, 0, hx + 8 + col * 8, 3 * 8 + row * 8, false);
      }
    }
  }

  // P1 lives  ROM DrawHUDScores $C830: tiles $58/$13 ("1P") at col 29-30, row 17
  //            ROM LivesDisplayTick $C7C8: tile $14 at col 29 row 18; inverted digit at col 30 row 18
  //            Inverted tiles: color-0=black (digit stroke), color-3=gray (matches tile $11 BG)
  const p1y = 18 * 8;  // nametable row 18 = pixel 144
  if (chrOff) {
    // ROM tiles $58=inverted-"1", $13=inverted-"P"
    drawCHRTile(0x58, 0, hx + 8,  17 * 8, false);  // ROM col 29, row 17
    drawCHRTile(0x13, 0, hx + 16, 17 * 8, false);  // ROM col 30, row 17
    drawCHRTile(0x14, 0, hx + 8, p1y, false);        // ROM col 29, row 18 (P1 tank icon)
    // Lives digit: ROM uses inverted digit tiles $6E+digit via DrawNametableTextOffset
    const p1d = p1Lives + 1;
    if (p1d >= 10) drawCHRTile(0x6E + Math.floor(p1d / 10), 0, hx + 8,  p1y, false);
    drawCHRTile(0x6E + (p1d % 10), 0, hx + 16, p1y, false);  // ROM col 30, row 18
  } else {
    text('IP', hx + 8, p1y - 8, C.P1, 6);
    text(String(p1Lives + 1), hx + 16, p1y + 6, C.HUD_TEXT, 6);
  }

  // P2 lives  ROM DrawHUDScores $C849: tiles $5A/$13 ("2P") at col 29-30, row 20
  //            ROM LivesDisplayTick: tile $14 at col 29 row 21; inverted digit at col 30 row 21
  if (numPlayers === 2) {
    const p2y = 21 * 8;  // nametable row 21 = pixel 168
    if (chrOff) {
      // ROM tiles $5A=inverted-"2", $13=inverted-"P"
      drawCHRTile(0x5A, 0, hx + 8,  20 * 8, false);  // ROM col 29, row 20
      drawCHRTile(0x13, 0, hx + 16, 20 * 8, false);  // ROM col 30, row 20
      drawCHRTile(0x14, 0, hx + 8, p2y, false);        // ROM col 29, row 21 (P1 tank icon)
      const p2d = Math.max(0, p2Lives + 1);
      if (p2d >= 10) drawCHRTile(0x6E + Math.floor(p2d / 10), 0, hx + 8,  p2y, false);
      drawCHRTile(0x6E + (p2d % 10), 0, hx + 16, p2y, false);  // ROM col 30, row 21
    } else {
      text('IIP', hx + 8, p2y - 8, C.P2, 6);
      text(String(Math.max(0, p2Lives + 1)), hx + 16, p2y + 6, C.HUD_TEXT, 6);
    }
  }

  // Stage number  ROM rows 23–25 (pixel 184): 2×2 flag icon + inverted digit tiles
  const sty = 23 * 8;  // nametable row 23 = pixel 184
  if (chrOff) {
    // Flag icon: 2×2 tiles at rows 23–24, cols 29–30  ROM $D225/$D228
    drawCHRTile(0x6C, 0, hx + 8, sty,     false);  // top-left
    drawCHRTile(0xFC, 0, hx + 16, sty,     false);  // top-right
    drawCHRTile(0x6D, 0, hx + 8, sty + 8, false);  // bottom-left
    drawCHRTile(0xFD, 0, hx + 16, sty + 8, false);  // bottom-right
    // Stage digit: ROM uses inverted digit tiles $6E+digit via DrawNametableTextOffset, row 25
    const sd = stageIdx + 1;
    if (sd >= 10) drawCHRTile(0x6E + Math.floor(sd / 10), 0, hx + 8,  sty + 16, false);
    drawCHRTile(0x6E + (sd % 10), 0, hx + 16, sty + 16, false);  // ROM row 25
  } else {
    text('S' + (stageIdx + 1), hx + 16, sty + 8, C.HUD_TEXT, 6);
  }

  // Freeze indicator  ROM $0100 EnemyFreezeTimer
  if (freezeTimer > 0) {
    drawNesText('FREEZE', hx, sty + 20, 0);
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

// ROM $C5D9 GameOverBrickScreen — nametable filled with tile $00 (blank); palette set 3; GAME/OVER as big-text sprites
// ROM $C44B HiScoreEntryScreen: "HISCORE" label + value + palette flash
function drawGameOver() {
  // ROM $C5D9: WriteNametable zeros CPU $0400-$07FF → PPU nametable all tile $00 = solid black.
  // $05=$1C is a PPU address offset ($12+$05=0x20→$2000), NOT a tile fill index.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // "GAME" and "OVER": 4 chars × 32px = 128px wide, centered at x=64
  // palIdx=0 = BG0 of palette set 3 = [0F,16,16,30] → orange-red + white bricks
  drawBigNesText('GAME', 64, 84, 0);
  drawBigNesText('OVER', 64, 116, 0);
  // ROM $D97D UpdateHiScore → post-game hi-score display
  if (newHiScorePlayer > 0) {
    // ROM $C527: JSR RNG; AND #$3F; JSR QueuePaletteWrite — random NES color each frame
    const flashPal = Math.floor(Math.random() * 8);  // random palette each frame
    drawNesText('HISCORE', 88, 148, flashPal);
    drawNesText(fmtScore(hiScore), 88, 158, flashPal);
  }
  // Retry hint handled by external controls-hint div (web-only; ROM returns to attract loop via $C0A6)
}

// ROM $8CD4 ResultScreen entry → $CEF7 ResultScreenInit (static strings) → $8D0A per-type tally loop
// Full-screen layout confirmed against Famicom ROM nametable positions (col×8, row×8):
//   Row 3:  "HI-SCORE" (col 8, $CF2D) + hi-score value (col 18+skip, $CF34)
//   Row 5:  "STAGE" (col 12, $CF44) + stage number (col 14+skip, $CF54)
//   Row 7:  "I-PLAYER" (col 3, $CF67)     Row 9: P1 score (col 5+skip, $CF72)
//   Rows 12/15/18/21: per-type — result score (col 1+skip, $8D6E), "PTS" (col 8, $D023),
//     kill count (col 8+skip right-justified, $8D85), arrow $5B (col 14, $CF7A)
//   Row 22: separator 7× tile $5C at col 12 ($D099, string $D3BB)
//   Row 23: "TOTAL" (col 6, $D0B2) + total kills (col 8+skip, $8DFE)
function drawStageClear() {
  // ROM uses full 256×240 screen, black background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const PTS = [100, 200, 300, 400];

  // Row 3 (y=24): HI-SCORE label + value  ROM $CF2D: (col 8, row 3); hi-score at col 18+skip ($CF34)
  drawNesText('HI-SCORE', 64, 24, 3);
  drawNesText(fmtScore(hiScore), 144, 24, 3);

  // Row 5 (y=40): STAGE + number  ROM $CF44: (col 12, row 5); stage num at col 14+skip ($CF54)
  drawNesText('STAGE', 96, 40, 3);
  drawNesText((stageIdx + 1).toString().padStart(2, ' '), 144, 40, 3);

  // Row 7 (y=56): player label  ROM $CF67: (col 3, row 7)
  // ROM uses tile $5E (special I glyph) but web uses "I" as approximation
  drawNesText('I-PLAYER', 24, 56, 3);

  // Row 9 (y=72): P1 accumulated score  ROM $CF72: (col 5+skip, row 9)
  drawNesText(fmtScore(p1Score), 40, 72, 3);

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

    // Per-type score + "PTS" label  ROM $8D6E: (col 1+skip, row N), $D023: (col 8, row N)
    if (row <= ts.row) {
      const rowScore = tallied * PTS[row];
      drawNesText(rowScore.toString().padStart(5, ' '), 8, ry, 3);
      drawNesText('PTS', 64, ry, 3);
    }

    // Kill count (right-justified 2 digits)  ROM $8D85: (col 8+skip→12/13, row N)
    if (row <= ts.row) {
      drawNesText(tallied.toString().padStart(2, ' '), 96, ry, 3);
    }

    // Arrow tile $5B at col 14 (x=112)  ROM $CF7A: (col 14, rows 12/15/18/21)
    if (chrOff) {
      drawCHRTile(0x5B, 3, 112, ry, false);
    } else {
      drawNesText('<', 112, ry, 3);
    }

    // Enemy type icon (16×16 sprite, facing up)  ROM $D0B8: DrawEagleStar (X=$81, Y=tile*$20)
    // Positioned at pixel (121, ry-4) to center vertically  ROM: X=$81=129, sprite drawn at 129-8=121
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

  // Row 22 (y=176): separator line  ROM $D099: 7× tile $5C (string $D3BB) at col 12
  if (chrOff) {
    for (let i = 0; i < 7; i++) drawCHRTile(0x5C, 3, 96 + i * 8, 176, false);
  } else {
    drawNesText('-------', 96, 176, 3);
  }

  // Row 23 (y=184): TOTAL + count  ROM $D0B2: (col 6, row 23); total kills at col 8+skip ($8DFE)
  drawNesText('TOTAL', 48, 184, 3);
  if (ts.done) {
    const totalKills = killCounts.reduce((s, n) => s + n, 0);
    drawNesText(totalKills.toString().padStart(2, ' '), 96, 184, 3);
  }
}

// ─── Controls hint (web-only)  ────────────────────────────────────────────────
const _hint = document.getElementById('controls-hint');
function hb(key, label) { return `<span class="hb"><kbd>${key}</kbd>${label}</span>`; }
const HINTS = {
  title:   [hb('↑ ↓', 'Select'), hb('Enter', 'Start'), hb('1', '1P'), hb('2', '2P'), hb('3', 'Build'), hb('D', 'Demo')],
  select:  [hb('↑ ↓', 'Stage'), hb('Enter', 'Start')],
  curtain: [],
  start:   [hb('↑↓←→', 'Move'), hb('Space', 'Fire'), hb('M', 'Sound'), hb('R', 'Record'), hb('F', 'Full')],
  play:    [hb('↑↓←→', 'Move'), hb('Space', 'Fire'), hb('M', 'Sound'), hb('R', 'Record'), hb('F', 'Full')],
  clear:          [],
  gameover_tally: [],
  gameover:       [hb('Enter', 'Retry')],
  victory: [],
  edit:    [hb('↑↓←→', 'Move'), hb('Space', 'Place'), hb('T', 'Tile'), hb('Enter', 'Play')],
};
let _lastPhase = null;
function updateControlsHint() {
  if (!_hint || gamePhase === _lastPhase) return;
  _lastPhase = gamePhase;
  _hint.innerHTML = (HINTS[gamePhase] || []).join('');
}

// ─── Main render  ─────────────────────────────────────────────────────────────
// ROM $D96D FlushPPUQueue  NMI OAM DMA
function render() {
  updateControlsHint();
  // ROM $C65C AttractWait: title screen is a separate full-screen render
  if (gamePhase === 'title')   { drawTitleScreen();   return; }
  if (gamePhase === 'curtain') { drawCurtain();       return; }
  if (gamePhase === 'select')  { drawStageSelect();   return; }
  if (gamePhase === 'victory') { drawVictoryScreen(); return; }
  // ROM $CAF1 StageClearTallyScreen / $8CD4 ResultScreen: full-screen (not overlays)
  if (gamePhase === 'clear')          { drawStageClear(); return; }
  if (gamePhase === 'gameover_tally') { drawStageClear(); return; }
  // ROM $C5D9 GameOverBrickScreen: full-screen brick background (not an overlay)
  if (gamePhase === 'gameover')       { drawGameOver();   return; }

  ctx.fillStyle = C.BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawField();

  // Draw entities then re-draw trees on top (ROM: OAM priority-behind-BG for sprites under trees)
  for (let i = 2; i < 8; i++) drawEntity(entities[i]);
  for (let i = 0; i < 2; i++) drawEntity(entities[i]);

  for (const b of bullets) drawBullet(b);
  drawPowerUp();
  drawTreesOverlay();  // re-draw tree tiles over entities/bullets (z-order fix)

  // In-field "GAME OVER" sprites: PT1 tiles $78–$7F letter art, drawn while $0108>0 at pos $0105/$0106
  // 4 OAM 8×16 sprites from BG bank: $79/$7B = left 16×16, $7D/$7F = right 16×16
  // DrawTank places at (X-8,Y-8) and (X,Y-8); second call at (X+8,Y-8) and (X+16,Y-8)
  // Palette SP3 = palIdx 7. Drawn while goScrollTimer > 0 (ROM $0108 > 0).
  if (chrOff && goScrollTimer > 0 && goScrollY < 0xF0) {
    const goX = goScrollX;  // ROM $0105 (variable X position)
    // odd tile bytes ($79,$7B,$7D,$7F) → PT1 letter-art tiles
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

  if (gamePhase === 'edit') {
    // Draw cursor: blink every 16 frames (ROM style)
    if (!(frameCount & 0x10)) {
      const cx = FX + editX * META, cy = FY + editY * META;
      fillRect(cx, cy, 16, 2, '#fff');
      fillRect(cx, cy + 14, 16, 2, '#fff');
      fillRect(cx, cy, 2, 16, '#fff');
      fillRect(cx + 14, cy, 2, 16, '#fff');
    }
    // Draw current tile type preview in sidebar
    const previewX = FX + GW * META + 8, previewY = FY + 8;
    // Draw the selected tile as a metatile
    if (editTileType < T.EMPTY) {
      const chr = editTileType <= T.BRICK ? [0x11,0x11,0x11,0x11] : TILE_CHR[editTileType];
      const pal = editTileType <= T.BRICK ? 0 : TILE_PAL[editTileType];
      if (chr) {
        drawCHRTile(chr[0], pal, previewX,     previewY,     true);
        drawCHRTile(chr[1], pal, previewX + 8, previewY,     true);
        drawCHRTile(chr[2], pal, previewX,     previewY + 8, true);
        drawCHRTile(chr[3], pal, previewX + 8, previewY + 8, true);
      }
    }
    // Draw type number using inverted digit tiles
    drawCHRTile(0x6E + Math.floor(editTileType / 10), 0, previewX, previewY + 20, false);
    drawCHRTile(0x6E + (editTileType % 10), 0, previewX + 8, previewY + 20, false);
  }

  drawHUD();

  if (gamePhase === 'start') drawStageBanner();

  // ROM $EBBC grenade palette flash: cycles BG palette sets 5-8 for ~8 frames (handled in tick).
}

// ROM $C31D PaletteFlashTick — cycles $4D between sets 1 and 2 every 32 frames
// Set 1 BG1: [0F,3C,12,12] (yellow dominant), Set 2 BG1: [0F,12,3C,12] (blue dominant)
function tickPaletteFlash() {
  const f = frameCount & 0x3F;
  if (f === 0) setBGPaletteSet(1);       // water anim frame A: BG1 col1=$3C(yellow)
  else if (f === 32) setBGPaletteSet(2); // water anim frame B: BG1 col1=$12(blue)
}

// ROM $CC90 CurtainClose: fills nametable with tile $11 from outside in (row pairs 0+29, 1+28..15+14)
// ROM $CCB2 InitNametableFromRAM: $63=0, copies shadow RAM to PPU same way (curtain open)
// InterStageScreen ($C159) sets palette 4 before calling $CC90; attribute table has BG3 for field area.
function drawCurtain() {
  // Universal BG color = NES_PAL[0][0] = 0x0F = black (same in all palette sets)
  ctx.fillStyle = NES_PAL[0][0];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (curtainTarget === 'play') {
    // When opening to play, we draw the field first then cover it
    drawField();
    drawEagleBase();
  }

  // ROM: attribute table sets BG3 (palIdx=3) for the field area during InterStageScreen
  const palIdx = 3;
  const tile = 0x11; // steel tile — fills entire nametable as curtain
  for (let r = 0; r <= curtainRow; r++) {
    for (let c = 0; c < 32; c++) {
      drawCHRTile(tile, palIdx, c * 8, r * 8, false);
      drawCHRTile(tile, palIdx, c * 8, (29 - r) * 8, false);
    }
  }
}

// ROM $CA91 DrawStageInter — "STAGE XX" shown on top of closed curtain.
// InterStageScreen ($C159): curtain fills all 30 rows with tile $11 (BG3 steel, palette 4);
// "STAGE XX" written to nametable tiles $23-$27+digit at row 14 via $CA91.
// Stage select: A-held→INC $85 (1-35 wraps), B-held→DEC $85, Start→StageStartSetup.
function drawStageSelect() {
  // ROM $C159 InterStageScreen: palette 4 active; $CC90 CurtainClose fills all rows with tile $11.
  // $CA91 DrawStageInter writes tiles $23-$27 (inverted S,T,A,G,E), two $11 spaces, then digit
  // tiles $6E+d at row 14 col 12. All tiles use BG3 (same palette as steel curtain).
  ctx.fillStyle = NES_PAL[0][0];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const palIdx = 3; // BG3 — attribute table sets BG3 for entire field during InterStageScreen
  for (let r = 0; r < 30; r++)
    for (let c = 0; c < 32; c++)
      drawCHRTile(0x11, palIdx, c * 8, r * 8, false);

  // "STAGE  " at row 14 col 12 (NES px 96,112): inverted-letter tiles $23-$27 + two steel spaces
  const sx = 12 * 8, sy = 14 * 8;
  for (let i = 0; i < 5; i++) drawCHRTile(0x23 + i, palIdx, sx + i * 8, sy, false);
  drawCHRTile(0x11, palIdx, sx + 5 * 8, sy, false);
  drawCHRTile(0x11, palIdx, sx + 6 * 8, sy, false);

  // Digit tiles $6E='0'..$77='9' at col 19+ (inverted digits); leading tens digit omitted if 0
  const stage = selectedStage + 1;
  const tens = Math.floor(stage / 10);
  const units = stage % 10;
  let dc = 19;
  if (tens > 0) { drawCHRTile(0x6E + tens, palIdx, dc * 8, sy, false); dc++; }
  drawCHRTile(0x6E + units, palIdx, dc * 8, sy, false);
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

// ─── Quick-start helpers (keyboard shortcuts 1/2/3/D) ────────────────────────
function quickStart(cursor) {
  initAudio();
  titleCursor = cursor;
  // Simulate pressing Start on the selected menu item
  if (cursor === 2) {
    initLevel(0);
    gamePhase = 'edit';
    grid.forEach(r => r.fill(T.EMPTY));
    brickBits.forEach(r => r.fill(0));
    editX = 6; editY = 6;
    editTileType = T.BRICK;
    editHoldCount = 0;
    editAFirst = false;
    editACycleTimer = 0;
    editStartHeld = true;
  } else {
    numPlayers = cursor === 1 ? 2 : 1;
    p1Score = 0; p1Lives = 2; p1NextLifeScore = 20000;
    p2Score = 0; p2Lives = 2; p2NextLifeScore = 20000;
    newHiScorePlayer = 0;
    gamePhase = 'curtain';
    curtainTarget = 'select';
    curtainRow = 0;
    selectedStage = 0;
    setBGPaletteSet(4);
  }
}

function quickStartDemo() {
  initAudio();
  demoMode = true;
  numPlayers = 2;
  p1Score = 0; p1Lives = 2;
  p2Score = 0; p2Lives = 2;
  initLevel(34);
}

function updateSoundBtn() {
  const btn = document.getElementById('btn-sound');
  if (btn) btn.classList.toggle('muted', !soundEnabled);
}

// ─── Title screen  ───────────────────────────────────────────────────────────
// ROM $C65C AttractWait: 240-frame loop with BlinkTitleSprite ($C69A)
// ROM $CFAA PreGameDraw: draws "BATTLE" (26,46) + "CITY" (60,86) via DrawSpriteString
function enterTitle() {
  stopAllSounds();  // silence everything on return to title
  activeBGSet = -1; setBGPaletteSet(3); // ROM $C9C2: STA $4D=#$03 (PlayerSelectLoop sets palette set 3)
  gamePhase   = 'title';
  titleFrame  = 0;
  titleTimer  = 0;
  demoMode    = false;
  selectKeyHeld = false;
  curtainRow  = -1;
}

function drawTitleScreen() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ROM $D17F DrawTitleScreen: score strip at nametable row 3 (y=24)
  // $D2A5 str_TilePairA: tile $5E at col=2 (x=16), tile $6B at col=3 (x=24)
  // P1 score via DrawNametableTextOffset with $60=$30: col=4 (x=32)
  // All title screen elements use BG palette 0 (palIdx=0).
  // With set 3: BG0=[0F,16,16,30] → color3=$30=white for text, color1=$16=orange-red for NAMCOT/cursor.
  if (chrOff) {
    drawCHRTile(0x5E, 0, 16, 24, true); // tile $5E = 1P icon
    drawCHRTile(0x6B, 0, 24, 24, true); // tile $6B = dash
  } else {
    drawNesText('I-', 16, 24, 0);
  }
  drawNesText(fmtScore(p1Score), 32, 24, 0); // col=4 (x=32)
  // $D2B1 str_HI: "HI" $6B at col=11 (x=88); HI score at col=14 (x=112)
  drawNesText('HI-', 88, 24, 0);                               // col=11 (x=88)
  drawNesText(fmtScore(hiScore), 112, 24, 0); // col=14 (x=112)

  // ROM $D199/$D1AC: "BATTLE" at sprite (x=26,y=46), "CITY" at (x=60,y=86)
  drawBigNesText('BATTLE', 26, 46, 0);
  drawBigNesText('CITY', 60, 86, 0);

  // ROM $D221 "1 PLAYER" at col=11 row=17 (x=88,y=136)
  // ROM $D230 "2 PLAYERS" at col=11 row=19 (x=88,y=152)
  // ROM $D23F "CONSTRUCTION" at col=11 row=21 (x=88,y=168)
  drawNesText('1 PLAYER',    88, 136, 0);
  drawNesText('2 PLAYERS',   88, 152, 0);
  drawNesText('CONSTRUCTION', 88, 168, 0);

  // ROM $CA2F UpdateCursorSprite: P1 tank sprite (entity slot 0, $A0=$83, dir=3=RIGHT)
  // at X=$90=$48=72, Y=$98=cursor×16+$8B; $B0 bit2 toggles every 4 frames for tread animation
  // Tank is always visible — $B0 controls animation frame, not visibility.
  {
    // Animation frame toggles every 4 frames (ROM $C9EF: EOR #$04 when $0B AND 3 == 0)
    const animBit = (titleFrame >> 2) & 1;
    if (chrOff) {
      const T = 256 + 0x18 + (animBit ? 4 : 0); // P1 tank, dir=3 (right), star0
      drawCHRTile(T,   4, 64, 132 + titleCursor * 16, true); // top-left    SP0=palIdx 4
      drawCHRTile(T+2, 4, 72, 132 + titleCursor * 16, true); // top-right
      drawCHRTile(T+1, 4, 64, 140 + titleCursor * 16, true); // bottom-left
      drawCHRTile(T+3, 4, 72, 140 + titleCursor * 16, true); // bottom-right
    } else {
      drawNesText('>', 64, 136 + titleCursor * 16, 0);
    }
  }

  // ROM $D247 credits tiles $60–$68 at col=11 row=23 (x=88,y=184) via DrawNametableText
  // Tiles $60–$68 are 9 custom graphic tiles — the NAMCOT/staff-name logo strip
  for (let i = 0; i < 9; i++) {
    drawCHRTile(0x60 + i, 0, 88 + i * 8, 184, true);
  }

  // ROM $D260 copyright: col=4 (x=32), row=25 (y=200); tile $40=© + tile $69='.' at end ($D2F8)
  drawNesText('@ 1980 1985 NAMCO LTD.', 32, 200, 0);
  // ROM $D272 "ALL RIGHTS RESERVED": col=6 (x=48), row=27 (y=216)
  drawNesText('ALL RIGHTS RESERVED', 48, 216, 0);
}

// ─── Boot  ────────────────────────────────────────────────────────────────────
// ROM $C070 Reset  $EA51 APUSoundInit  $D491 Init
p1Score  = 0;
p1Lives  = 2;  // display shows +1 (3 lives)
p1NextLifeScore = 20000;  // ROM: first bonus-life threshold at 20000 pts
hiScore  = 20000;   // ROM $3D–$43: default starting hi-score
selectedStage = 0;
newHiScorePlayer = 0;
frameCount = 0;
enterTitle();
initCHR();     // load single Famicom CHR ROM sheet (chr_all.png)
initCtxButtons();

// ROM $C09C MainLoop — fixed 60 fps physics, skip render if no tick elapsed
const FRAME_MS = 1000 / 60;
let _accumulator = 0;
let _lastTime = performance.now();
(function loop(now) {
  _accumulator += now - _lastTime;
  _lastTime = now;
  if (_accumulator > 200) _accumulator = 200; // clamp after tab sleep
  let ticked = false;
  while (_accumulator >= FRAME_MS) {
    update();
    _accumulator -= FRAME_MS;
    ticked = true;
  }
  if (ticked) render();
  requestAnimationFrame(loop);
})(performance.now());

