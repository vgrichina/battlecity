'use strict';
/* ================================================================
 * Battle City — NES APU Sound Engine (Web Audio API)
 * Implements the ROM $EC23 SoundEngine sequence interpreter
 * using Web Audio oscillators to approximate NES APU channels.
 * ================================================================ */

// ─── NES APU constants ──────────────────────────────────────────
const NES_CPU_CLOCK = 1789773;  // NTSC CPU clock Hz

// ROM $EE8B pitch table: 12 notes A1-G#2 (11-bit timer periods)
const NES_PITCH = [2034,1920,1812,1710,1603,1524,1438,1358,1282,1210,1142,1078];

// Convert NES timer period to frequency
// Pulse/noise: freq = CPU / (16 * (period + 1))
// Triangle:    freq = CPU / (32 * (period + 1))
function periodToFreq(period, isTriangle) {
  if (period <= 0) return 440;
  const div = isTriangle ? 32 : 16;
  return NES_CPU_CLOCK / (div * (period + 1));
}

// Decode note byte → frequency
// bits 5-3 = semitone (0=A..11=G#), bits 2-0 = octave shift
function noteToFreq(noteByte, isTriangle) {
  const semi = (noteByte >> 3) & 0x0F;  // 0-11
  const oct  = noteByte & 0x07;          // 0-7
  if (semi >= 12) return 440;  // safety
  let period = NES_PITCH[semi];
  period >>= oct;
  return periodToFreq(period, isTriangle);
}

// ─── Sound sequence data (extracted from ROM) ───────────────────
// Format: [channel, duty/vol, sweep, timerHi, (noiseReg if ch=4), ...commands..., 0xE8]
const SOUND_SEQ = [
  /* slot  0 $EFD1 coin jingle */
  [0x02,0x82,0x7F,0x40, 0x64,0x1B,0x2B,0x3B,0x1C,0x2C,0x3C,0x6C,0x53,0xE8],
  /* slot  1 $EEDB BGM pulse1 */
  [0x01,0x81,0x7F,0x40, 0xEF,0x68,0x1B,0x2B,0x33,0xF0,0x02,0x06,0x33,0x43,0x53,0xF0,0x02,0x0C,0x43,0x53,0x04,0xF0,0x02,0x12,0x5B,0x0C,0x1C,0xF0,0x02,0x18,0x78,0x1C,0x68,0x1C,0x1C,0x1C,0x78,0x1C,0xE8],
  /* slot  2 $EF02 BGM triangle */
  [0x03,0x10,0x7F,0x08, 0x78,0x1A,0x68,0x1A,0xF1,0x03,0x07,0x78,0x32,0x68,0x32,0xF1,0x03,0x0E,0x78,0x42,0x68,0x42,0xF1,0x03,0x15,0x5A,0xF1,0x03,0x19,0x0B,0xF1,0x03,0x1D,0x78,0x52,0x68,0x52,0xF1,0x03,0x24,0x78,0x52,0xE8],
  /* slot  3 $EF2D BGM pulse2 */
  [0x02,0x81,0x7F,0x40, 0x78,0x51,0x68,0x51,0xF2,0x03,0x07,0x78,0x0A,0x68,0x0A,0xF2,0x03,0x0E,0x78,0x1A,0x68,0x1A,0xF2,0x03,0x15,0x32,0xF2,0x03,0x19,0x42,0xF2,0x03,0x1D,0x78,0x3A,0x68,0x3A,0xF2,0x03,0x24,0x78,0x3A,0xE8],
  /* slot  4 $F044 life-up P1 */
  [0x01,0xA0,0x7F,0x40, 0x66,0x1C,0x3C,0x1C,0x53,0x1C,0x3C,0x05,0x72,0x54,0xE8],
  /* slot  5 $F053 life-up P2 */
  [0x02,0x90,0x7F,0x40, 0x62,0x38,0x66,0xEA,0x20,0x3B,0x53,0x3B,0x1B,0x3B,0x53,0x1C,0x6A,0x14,0xE8],
  /* slot  6 $EFBE SFX */
  [0x02,0x80,0x7F,0x40, 0x63,0x52,0x1B,0x3B,0x53,0x4A,0x13,0x33,0x4B,0x1B,0x3B,0x53,0x1C,0x3C,0xE8],
  /* slot  7 $EF58 noise explosion */
  [0x04,0x1F,0x7F,0x30,0x0A, 0x62,0x49,0x49,0xEA,0x1E,0x49,0x49,0xEA,0x1D,0x49,0x49,0xEA,0x1C,0x49,0x49,0xEA,0x1B,0x49,0x49,0xEA,0x1A,0x49,0xEA,0x19,0x49,0xEA,0x18,0x49,0xE8],
  /* slot  8 $EF7A player fire pulse */
  [0x02,0x1F,0x7F,0x30, 0x62,0x00,0x01,0x00,0xEA,0x1E,0x01,0x00,0xEA,0x1D,0x01,0x00,0x01,0x00,0xEA,0x1C,0x01,0xEA,0x1B,0x00,0xEA,0x1A,0x01,0xEA,0x19,0x00,0xE8],
  /* slot  9 $EFED power-up appear */
  [0x02,0x60,0x7F,0x40, 0x64,0x52,0x3A,0x52,0x03,0x52,0x03,0x13,0x1B,0xE8],
  /* slot 10 $EFA8 entity kill */
  [0x04,0x1F,0x7F,0x40,0x0A, 0x62,0x51,0xEA,0x1E,0x51,0xEA,0x08,0x6A,0x51,0xE8],
  /* slot 11 $EF99 eagle hit */
  [0x02,0x20,0x7F,0x30, 0x63,0x1A,0x12,0x51,0x31,0x19,0x11,0x50,0x30,0x18,0xE8],
  /* slot 12 $F003 brick hit */
  [0x03,0x07,0x7F,0x08, 0x61,0x3A,0x13,0x22,0xE8],
  /* slot 13 $EFFB steel/water hit */
  [0x02,0xD5,0x7F,0x00, 0x62,0x1C,0x1D,0xE8],
  /* slot 14 $F00C armor hit */
  [0x02,0x40,0x7F,0x00, 0x61,0x3D,0x62,0x45,0xEA,0x10,0x28,0xE8],
  /* slot 15 $EFB7 SFX */
  [0x01,0x8F,0x82,0x10, 0x6F,0x2C,0xE8],
  /* slot 16 $F03A enemy fire */
  [0x01,0x1F,0x7F,0x28, 0x61,0x22,0x42,0x5A,0x1B,0xE8],
  /* slot 17 $F031 SFX */
  [0x02,0x80,0x94,0x48, 0x62,0x40,0x48,0xE8],
  /* slot 18 $F027 SFX */
  [0x02,0x8C,0x94,0x40, 0x61,0x10,0x64,0x18,0xE8],
  /* slot 19 $F018 kill sound */
  [0x02,0x80,0x7F,0x18, 0x61,0x39,0xE8],
  /* slot 20 $F01F kill sound 2 */
  [0x04,0x00,0x7F,0x28,0x0A, 0x61,0x28,0xE8],
  /* slot 21 $F066 stage clear melody */
  [0x01,0xB8,0x7F,0x40, 0xEF,0x65,0x0C,0x53,0xF0,0x0C,0x05,0x0C,0x53,0xF0,0x0C,0x0B,0x34,0x24,0xF0,0x08,0x10,0xEA,0x30,0xB0,0x50,0xEA,0x20,0x9C,0x54,0xE8],
  /* slot 22 $F084 stage clear harmony */
  [0x02,0xB8,0x7F,0x40, 0x65,0x43,0x33,0xF1,0x0C,0x04,0x43,0x33,0xF1,0x0C,0x0A,0x14,0x4B,0xF1,0x08,0x0F,0xEA,0x3A,0x30,0x50,0x09,0x29,0x31,0x51,0x0A,0x2A,0x32,0x52,0x0B,0x2B,0x33,0x53,0x0C,0x2C,0x9C,0xEA,0x20,0x2C,0xE8],
  /* slot 23 $F0AF stage clear bass */
  [0x03,0x00,0x7F,0x08, 0xA1,0x01,0x01,0xEE,0x15,0x6A,0x0B,0x0B,0x0B,0xEE,0x22,0x6F,0x33,0x65,0x43,0x7E,0xEE,0x33,0x53,0x6A,0xEE,0x15,0x23,0x13,0x4A,0x9C,0xEE,0xFF,0x32,0xE8],
  /* slot 24 $F0E1 SFX */
  [0x01,0x42,0x7F,0x40, 0x66,0x1B,0x0B,0x78,0x1B,0x68,0x52,0x42,0x32,0x1A,0x1A,0x1A,0x78,0x1A,0xE8],
  /* slot 25 $F0F4 SFX */
  [0x02,0x82,0x7F,0x40, 0x66,0x52,0x52,0x78,0x52,0x68,0x32,0x2A,0x12,0xE8],
  /* slot 26 $F107 SFX */
  [0x03,0x00,0x7F,0x08, 0x62,0x42,0x68,0x32,0x22,0xE8],
  /* slot 27 $EFDF SFX */
  [0x02,0x82,0x7F,0x40, 0x63,0x53,0x1B,0x1C,0x3B,0x3C,0x53,0x6A,0x54,0xE8],
];

// ─── Named sound slots for readability ──────────────────────────
const SND = {
  COIN:         0,
  BGM_SQ1:      1,
  BGM_TRI:      2,
  BGM_SQ2:      3,
  LIFE_UP_P1:   4,
  LIFE_UP_P2:   5,
  SFX6:         6,
  EXPLOSION:    7,   // noise explosion (entity kill component)
  PLAYER_FIRE:  8,   // pulse pew
  POWERUP_APPEAR: 9,
  ENTITY_KILL:  10,  // noise burst
  EAGLE_HIT:    11,
  BRICK_HIT:    12,
  STEEL_HIT:    13,  // steel/water hit ping
  ARMOR_HIT:    14,
  SFX15:        15,
  ENEMY_FIRE:   16,
  SFX17:        17,
  SFX18:        18,
  KILL_SND:     19,
  KILL_SND2:    20,
  STAGE_CLEAR1: 21,
  STAGE_CLEAR2: 22,
  STAGE_CLEAR3: 23,
  VICTORY1:     24,
  VICTORY2:     25,
  VICTORY3:     26,
  SFX27:        27,
};

// ─── Audio context and channels ─────────────────────────────────
let audioCtx = null;
let masterGain = null;
let soundEnabled = true;
let audioInited = false;

// 4 APU channels: pulse1(0), pulse2(1), triangle(2), noise(3)
const channels = [null, null, null, null];

// Noise buffer for noise channel
let noiseBuffer = null;

function initAudio() {
  if (audioInited) return;
  audioInited = true;

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    soundEnabled = false;
    return;
  }

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.15;  // NES-appropriate volume
  masterGain.connect(audioCtx.destination);

  // Create noise buffer (white noise, 1 second)
  const sr = audioCtx.sampleRate;
  noiseBuffer = audioCtx.createBuffer(1, sr, sr);
  const data = noiseBuffer.getChannelData(0);
  // NES noise uses LFSR but white noise is close enough
  for (let i = 0; i < sr; i++) data[i] = Math.random() * 2 - 1;

  // Initialize 4 channels
  for (let i = 0; i < 4; i++) {
    channels[i] = {
      osc: null,
      gain: null,
      type: i < 2 ? 'square' : i === 2 ? 'triangle' : 'noise',
      active: false,
    };
    createChannelNodes(i);
  }
}

function createChannelNodes(chIdx) {
  const ch = channels[chIdx];
  if (!ch || !audioCtx) return;

  // Clean up old nodes
  if (ch.osc) { try { ch.osc.stop(); } catch(e){} }
  if (ch.gain) { try { ch.gain.disconnect(); } catch(e){} }

  ch.gain = audioCtx.createGain();
  ch.gain.gain.value = 0;
  ch.gain.connect(masterGain);

  if (chIdx < 2) {
    // Pulse wave (square approximation)
    ch.osc = audioCtx.createOscillator();
    ch.osc.type = 'square';
    ch.osc.frequency.value = 440;
    ch.osc.connect(ch.gain);
    ch.osc.start();
  } else if (chIdx === 2) {
    // Triangle wave
    ch.osc = audioCtx.createOscillator();
    ch.osc.type = 'triangle';
    ch.osc.frequency.value = 440;
    ch.osc.connect(ch.gain);
    ch.osc.start();
  } else {
    // Noise channel
    ch.osc = audioCtx.createBufferSource();
    ch.osc.buffer = noiseBuffer;
    ch.osc.loop = true;
    ch.osc.connect(ch.gain);
    ch.osc.start();
  }
  ch.active = true;
}

// ─── Sound slot state ───────────────────────────────────────────
// Each slot: { active, channel, seq, pos, dur, durSaved, vol, volByte }
const slots = [];
for (let i = 0; i < 28; i++) {
  slots.push({
    active: false,
    channel: 0,   // 0-3 mapped from NES ch 1-4
    seq: null,     // reference to SOUND_SEQ[i]
    pos: 0,        // current position in command stream
    dur: 0,        // frames remaining for current note
    durSaved: 0,   // saved duration for HOLD
    vol: 0,        // volume 0-15
    freq: 0,       // current frequency
    loopCtr: [0,0,0],  // 3-level loop counters
  });
}

// ─── Trigger a sound ────────────────────────────────────────────
function playSound(slotIdx) {
  if (!soundEnabled || !audioCtx || slotIdx < 0 || slotIdx >= 28) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const seq = SOUND_SEQ[slotIdx];
  if (!seq || seq.length < 5) return;

  const s = slots[slotIdx];
  s.active = true;
  s.seq = seq;

  // Parse header
  const chSel = seq[0];  // 1=sq1, 2=sq2, 3=tri, 4=noise
  s.channel = (chSel >= 1 && chSel <= 4) ? chSel - 1 : 0;
  s.volByte = seq[1];    // duty/volume register
  s.vol = seq[1] & 0x0F;
  // seq[2] = sweep (ignored in web port)
  // seq[3] = timer hi template (ignored)
  // seq[4] = noise reg (if ch=4)

  const hdrSize = chSel === 4 ? 5 : 4;
  s.pos = hdrSize;
  s.dur = 0;
  s.durSaved = 0;
  s.freq = 0;
  s.loopCtr = [0, 0, 0];

  // Set initial volume on the channel
  setChannelVol(s.channel, s.vol);
}

function stopSound(slotIdx) {
  if (slotIdx < 0 || slotIdx >= 28) return;
  const s = slots[slotIdx];
  if (s.active) {
    s.active = false;
    setChannelVol(s.channel, 0);
  }
}

function stopAllSounds() {
  for (let i = 0; i < 28; i++) stopSound(i);
}

// ─── Channel helpers ────────────────────────────────────────────
function setChannelFreq(chIdx, freq) {
  if (!channels[chIdx] || !channels[chIdx].active) return;
  const ch = channels[chIdx];
  if (chIdx < 3 && ch.osc) {
    // Clamp to audible range
    freq = Math.max(20, Math.min(freq, 20000));
    ch.osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  }
  // Noise channel: vary playback rate for pitch approximation
  if (chIdx === 3 && ch.osc) {
    const rate = Math.max(0.1, Math.min(freq / 440, 4));
    ch.osc.playbackRate.setValueAtTime(rate, audioCtx.currentTime);
  }
}

function setChannelVol(chIdx, vol4bit) {
  if (!channels[chIdx] || !channels[chIdx].gain) return;
  // Map 4-bit volume (0-15) to gain (0.0-1.0), with triangle always at fixed vol
  let gain;
  if (chIdx === 2) {
    // Triangle has no volume control in NES — it's on or off
    gain = vol4bit > 0 ? 0.6 : 0;
  } else if (chIdx === 3) {
    // Noise is loud; scale down
    gain = (vol4bit / 15) * 0.4;
  } else {
    gain = (vol4bit / 15) * 0.5;
  }
  channels[chIdx].gain.gain.setValueAtTime(gain, audioCtx.currentTime);
}

function silenceChannel(chIdx) {
  setChannelVol(chIdx, 0);
}

// ─── Per-frame sound engine tick ────────────────────────────────
function soundTick() {
  if (!soundEnabled || !audioCtx) return;

  // Track which channels are being driven this frame
  const chActive = [false, false, false, false];

  for (let i = 0; i < 28; i++) {
    const s = slots[i];
    if (!s.active) continue;

    chActive[s.channel] = true;

    // Decrement duration
    if (s.dur > 0) {
      s.dur--;
      if (s.dur > 0) continue;
      // Duration expired — fall through to read next command
    }

    // Process command bytes
    const seq = s.seq;
    let safety = 40;  // prevent infinite loop
    while (s.pos < seq.length && safety-- > 0) {
      const b = seq[s.pos++];

      if (b <= 0x5F) {
        // NOTE: decode pitch and play
        const isTri = (s.channel === 2);
        s.freq = noteToFreq(b, isTri);
        setChannelFreq(s.channel, s.freq);
        setChannelVol(s.channel, s.vol);
        // Use saved duration if we have one
        if (s.durSaved > 0 && s.dur === 0) {
          s.dur = s.durSaved;
        }
        break;  // one note per frame

      } else if (b === 0x60) {
        // HOLD: sustain current note with saved duration
        if (s.durSaved > 0) s.dur = s.durSaved;
        break;

      } else if (b >= 0x61 && b <= 0xE7) {
        // DURATION: set frames
        s.dur = b - 0x60;
        s.durSaved = s.dur;
        // Continue reading — duration is followed by a note

      } else if (b === 0xE8) {
        // STOP
        s.active = false;
        silenceChannel(s.channel);
        break;

      } else if (b === 0xE9) {
        // MODIFY VOL low-6
        if (s.pos < seq.length) {
          const p = seq[s.pos++];
          s.volByte = (s.volByte & 0x3F) | p;
          s.vol = s.volByte & 0x0F;
        }
      } else if (b === 0xEA) {
        // MODIFY VOL high-2
        if (s.pos < seq.length) {
          const p = seq[s.pos++];
          s.volByte = (s.volByte & 0xC0) | p;
          s.vol = s.volByte & 0x0F;
          setChannelVol(s.channel, s.vol);
        }
      } else if (b === 0xEB) {
        // MODIFY VOL low-4
        if (s.pos < seq.length) {
          const p = seq[s.pos++];
          s.volByte = (s.volByte & 0xF0) | p;
          s.vol = s.volByte & 0x0F;
        }
      } else if (b === 0xEC) {
        // SET SWEEP (ignored in web port)
        if (s.pos < seq.length) s.pos++;
      } else if (b === 0xED) {
        // SET TIMER-HI (ignored)
        if (s.pos < seq.length) s.pos++;
      } else if (b === 0xEE) {
        // SET DUTY/VOL
        if (s.pos < seq.length) {
          s.volByte = seq[s.pos++];
          s.vol = s.volByte & 0x0F;
          setChannelVol(s.channel, s.vol);
        }
      } else if (b === 0xEF) {
        // LOOP-RESET
        s.loopCtr = [0, 0, 0];

      } else if (b >= 0xF0 && b <= 0xF2) {
        // LOOP command (3 levels)
        const level = b - 0xF0;
        if (s.pos + 1 < seq.length) {
          const repeatCount = seq[s.pos++];
          const restartOff  = seq[s.pos++];
          s.loopCtr[level]++;
          if (s.loopCtr[level] >= repeatCount) {
            s.loopCtr[level] = 0;
            // Fall through (loop done)
          } else {
            // Jump back to restart offset in command stream
            // restartOff is relative to start of command stream (after header)
            const hdrSize = (s.seq[0] === 4) ? 5 : 4;
            s.pos = hdrSize + restartOff;
          }
        }

      } else if (b >= 0xF3 && b <= 0xF7) {
        // SKIP: advance past 1 byte
        if (s.pos < seq.length) s.pos++;

      } else {
        // Unknown command — skip
        if (s.pos < seq.length) s.pos++;
      }
    }
  }

  // Silence channels not driven by any active slot
  for (let c = 0; c < 4; c++) {
    if (!chActive[c]) silenceChannel(c);
  }
}

// ─── BGM control ────────────────────────────────────────────────
let bgmPlaying = false;

function startBGM() {
  if (!soundEnabled || bgmPlaying) return;
  bgmPlaying = true;
  playSound(SND.BGM_SQ1);
  playSound(SND.BGM_TRI);
  playSound(SND.BGM_SQ2);
}

function stopBGM() {
  bgmPlaying = false;
  stopSound(SND.BGM_SQ1);
  stopSound(SND.BGM_TRI);
  stopSound(SND.BGM_SQ2);
}

// Re-trigger BGM slots each frame (like ROM $C18A GameLoopTop)
function tickBGM() {
  if (!bgmPlaying) return;
  // If any BGM slot has finished, restart it (the sequences naturally end with $E8)
  if (!slots[SND.BGM_SQ1].active) playSound(SND.BGM_SQ1);
  if (!slots[SND.BGM_TRI].active) playSound(SND.BGM_TRI);
  if (!slots[SND.BGM_SQ2].active) playSound(SND.BGM_SQ2);
}

// ─── High-level SFX helpers ─────────────────────────────────────
function sfxPlayerFire()   { playSound(SND.PLAYER_FIRE); }
function sfxEnemyFire()    { playSound(SND.ENEMY_FIRE); }
function sfxBrickHit()     { playSound(SND.BRICK_HIT); }
function sfxSteelHit()     { playSound(SND.STEEL_HIT); }
function sfxArmorHit()     { playSound(SND.ARMOR_HIT); }
function sfxEntityKill()   { playSound(SND.ENTITY_KILL); playSound(SND.EXPLOSION); }
function sfxPowerUpAppear() { playSound(SND.POWERUP_APPEAR); }
function sfxEagleHit()     { playSound(SND.EAGLE_HIT); }
function sfxLifeUp(player) { playSound(player === 0 ? SND.LIFE_UP_P1 : SND.LIFE_UP_P2); }
function sfxStageClear()   { stopBGM(); playSound(SND.STAGE_CLEAR1); playSound(SND.STAGE_CLEAR2); playSound(SND.STAGE_CLEAR3); }
function sfxGameOver()     { stopBGM(); }
function sfxVictory()      { stopBGM(); playSound(SND.VICTORY1); playSound(SND.VICTORY2); playSound(SND.VICTORY3); }

// ─── Toggle sound ───────────────────────────────────────────────
function toggleSound() {
  soundEnabled = !soundEnabled;
  if (!soundEnabled) stopAllSounds();
  return soundEnabled;
}
