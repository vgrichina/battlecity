'use strict';
/* ================================================================
 * Battle City — NES APU Sound Engine (Web Audio API)
 * ROM-accurate reimplementation of $EA7E SoundEngineTick:
 *   - Two-pass architecture (sequence processing → APU write)
 *   - Channel priority: lower slot number wins per hw channel
 *   - Volume envelope decay (NES APU quarter-frame clocked)
 *   - Frequency sweep for pulse channels
 *   - Called every frame from NMI (all game phases)
 * ================================================================ */

// ─── NES APU constants ──────────────────────────────────────────
const NES_CPU_CLOCK = 1789773;  // NTSC CPU clock Hz

// ROM $EE8B pitch table: 12 notes A1-G#2 (11-bit timer periods)
const NES_PITCH = [2034,1920,1812,1710,1603,1524,1438,1358,1282,1210,1142,1078];

// ROM $400E noise periods (NTSC)
const NES_NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];

// Convert NES timer period to frequency
// Pulse/noise: freq = CPU / (16 * (period + 1))
// Triangle:    freq = CPU / (32 * (period + 1))
function periodToFreq(period, isTriangle) {
  if (period <= 0) return 440;
  const div = isTriangle ? 32 : 16;
  return NES_CPU_CLOCK / (div * (period + 1));
}

// Decode note byte → NES timer period
function noteToPeriod(noteByte) {
  const semi = (noteByte >> 3) & 0x0F;
  const oct  = noteByte & 0x07;
  if (semi >= 12) return 0;
  let period = NES_PITCH[semi];
  period >>= oct;
  return period;
}

// Decode note byte → frequency
function noteToFreq(noteByte, isTriangle) {
  const period = noteToPeriod(noteByte);
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

// ─── NES APU Waveform Generation ────────────────────────────────

const dutyWaves = [null, null, null, null];

function initWaves() {
  // Duty cycles: 0=12.5%, 1=25%, 2=50%, 3=25% negated
  const duties = [0.125, 0.25, 0.5, 0.75];
  for (let d = 0; d < 4; d++) {
    const n = 64;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duties[d]);
    }
    dutyWaves[d] = audioCtx.createPeriodicWave(real, imag);
  }

  // Create 15-bit LFSR long-mode noise buffer
  const len = 32767;
  noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let shiftReg = 1;
  for (let i = 0; i < len; i++) {
    const feedback = (shiftReg & 1) ^ ((shiftReg >> 1) & 1);
    shiftReg = (shiftReg >> 1) | (feedback << 14);
    data[i] = (shiftReg & 1) ? -1 : 1;
  }
}

function initAudio() {
  if (audioInited) return;
  audioInited = true;

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    soundEnabled = false;
    return;
  }

  initWaves();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.15;  // NES-appropriate volume
  masterGain.connect(audioCtx.destination);

  // Initialize 4 channels
  for (let i = 0; i < 4; i++) {
    channels[i] = {
      osc: null,
      gain: null,
      type: i < 2 ? 'pulse' : i === 2 ? 'triangle' : 'noise',
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
    // Pulse wave
    ch.osc = audioCtx.createOscillator();
    ch.osc.setPeriodicWave(dutyWaves[2]); // Default 50%
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
const slots = [];
for (let i = 0; i < 28; i++) {
  slots.push({
    active: false,
    channel: 0,       // 0-3 mapped from NES ch 1-4
    seq: null,         // reference to SOUND_SEQ[i]
    pos: 0,            // current position in command stream
    dur: 0,            // frames remaining for current note
    durSaved: 0,       // saved duration for HOLD
    vol: 0,            // volume 0-15 (constant-volume mode)
    freq: 0,           // current frequency Hz
    period: 0,         // NES timer period (for sweep computation)
    noisePeriodIdx: 0, // noise period index ($400E bits 3-0)
    duty: 2,           // duty cycle index 0-3
    volByte: 0,        // raw duty/vol register byte
    loopCtr: [0,0,0],  // 3-level loop counters
    needsWrite: false,  // flag: new note ready, write to APU next pass
    // Envelope state (NES APU hardware envelope simulation)
    useEnvelope: false, // true when volByte bit4=0
    envVol: 15,         // current envelope volume (15→0)
    envDivider: 0,      // envelope divider counter
    envPeriod: 0,       // envelope period (volByte bits 3-0)
    envLoop: false,     // envelope loop flag (volByte bit5)
    envStartFlag: false, // restart envelope on next clock
    // Sweep state (NES APU sweep unit simulation, pulse channels only)
    sweepEnabled: false,
    sweepPeriod: 0,     // sweep divider reload
    sweepNegate: false,
    sweepShift: 0,
    sweepDivider: 0,
  });
}

// ─── Helper: update vol/envelope state from volByte ─────────────
function updateVolState(s) {
  const constVol = !!(s.volByte & 0x10);
  s.useEnvelope = !constVol;
  s.duty = (s.volByte >> 6) & 3;
  if (constVol) {
    s.vol = s.volByte & 0x0F;
  } else {
    s.envPeriod = s.volByte & 0x0F;
    s.envLoop = !!(s.volByte & 0x20);
    // Don't reset envVol here — only on note start
  }
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

  // Initialize volume / envelope state
  const constVol = !!(seq[1] & 0x10);
  s.useEnvelope = !constVol;
  s.duty = (seq[1] >> 6) & 3;
  if (constVol) {
    s.vol = seq[1] & 0x0F;
  } else {
    s.envPeriod = seq[1] & 0x0F;
    s.envLoop = !!(seq[1] & 0x20);
    s.envVol = 15;
    s.envDivider = s.envPeriod;
    s.envStartFlag = true;
    s.vol = 15;
  }

  // Initialize sweep state (pulse channels only)
  s.sweepEnabled = false;
  if (s.channel < 2) {
    const sweep = seq[2];
    if (sweep & 0x80) {
      s.sweepEnabled = true;
      s.sweepPeriod = (sweep >> 4) & 7;
      s.sweepNegate = !!(sweep & 0x08);
      s.sweepShift = sweep & 7;
      s.sweepDivider = s.sweepPeriod;
    }
  }

  const hdrSize = chSel === 4 ? 5 : 4;
  s.pos = hdrSize;
  s.dur = 0;
  s.durSaved = 0;
  s.freq = 0;
  s.period = 0;
  s.noisePeriodIdx = 0;
  s.needsWrite = false;
  s.loopCtr = [0, 0, 0];
}

function stopSound(slotIdx) {
  if (slotIdx < 0 || slotIdx >= 28) return;
  const s = slots[slotIdx];
  if (s.active) {
    s.active = false;
  }
}

function stopAllSounds() {
  for (let i = 0; i < 28; i++) stopSound(i);
  for (let c = 0; c < 4; c++) silenceChannel(c);
}

// ─── Channel helpers ────────────────────────────────────────────
function setChannelFreq(chIdx, freqOrPeriod) {
  if (!channels[chIdx] || !channels[chIdx].active) return;
  const ch = channels[chIdx];
  if (chIdx < 3 && ch.osc) {
    const freq = Math.max(20, Math.min(freqOrPeriod, 20000));
    ch.osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  }
  // Noise channel: vary playback rate for pitch approximation
  if (chIdx === 3 && ch.osc) {
    const period = NES_NOISE_PERIODS[freqOrPeriod & 0x0F];
    const freq = NES_CPU_CLOCK / period;
    const rate = freq / audioCtx.sampleRate;
    ch.osc.playbackRate.setValueAtTime(rate, audioCtx.currentTime);
  }
}

function setChannelDuty(chIdx, dutyIdx) {
  if (chIdx >= 2 || !channels[chIdx] || !channels[chIdx].osc) return;
  channels[chIdx].osc.setPeriodicWave(dutyWaves[dutyIdx & 3]);
}

function setChannelVol(chIdx, vol4bit) {
  if (!channels[chIdx] || !channels[chIdx].gain) return;
  let gain;
  if (chIdx === 2) {
    // Triangle has no volume control in NES — it's on or off
    gain = vol4bit > 0 ? 0.6 : 0;
  } else if (chIdx === 3) {
    gain = (vol4bit / 15) * 0.4;
  } else {
    gain = (vol4bit / 15) * 0.5;
  }
  channels[chIdx].gain.gain.setValueAtTime(gain, audioCtx.currentTime);
}

function silenceChannel(chIdx) {
  setChannelVol(chIdx, 0);
}

// ─── Per-frame sound engine tick (ROM $EA7E) ────────────────────
// Two-pass architecture matching the ROM:
//   Pass 1 (processSequences): advance all active sequences
//   Pass 2 (writeAudio): lower slot number wins per hw channel
// Plus envelope/sweep ticking between passes.
function soundTick() {
  if (!soundEnabled || !audioCtx) return;

  // ── Pass 1: Process sequences ──────────────────────────────────
  for (let i = 0; i < 28; i++) {
    const s = slots[i];
    if (!s.active) continue;

    // Decrement duration
    if (s.dur > 0) {
      s.dur--;
      if (s.dur > 0) continue;
      // Duration expired — fall through to read next command
    }

    // Process command bytes
    const seq = s.seq;
    let safety = 40;
    while (s.pos < seq.length && safety-- > 0) {
      const b = seq[s.pos++];

      if (b <= 0x5F) {
        // NOTE: decode pitch
        if (s.channel < 2) {
          s.period = noteToPeriod(b);
          s.freq = periodToFreq(s.period, false);
        } else if (s.channel === 2) {
          s.period = noteToPeriod(b);
          s.freq = periodToFreq(s.period, true);
        } else {
          s.noisePeriodIdx = b & 0x0F;
        }
        // Restart envelope on new note (ROM: writing $4003/$4007 restarts envelope)
        s.envStartFlag = true;
        // Reset sweep divider on new note
        if (s.sweepEnabled) s.sweepDivider = s.sweepPeriod;
        s.needsWrite = true;
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
        break;

      } else if (b === 0xE9) {
        // MODIFY VOL high-2 (ROM $EDC6: AND #$3F, ORA param)
        if (s.pos < seq.length) {
          const p = seq[s.pos++];
          s.volByte = (s.volByte & 0x3F) | p;
          updateVolState(s);
        }
      } else if (b === 0xEA) {
        // MODIFY VOL low-6 (ROM $EDD8: AND #$C0, ORA param)
        if (s.pos < seq.length) {
          const p = seq[s.pos++];
          s.volByte = (s.volByte & 0xC0) | p;
          updateVolState(s);
        }
      } else if (b === 0xEB) {
        // MODIFY VOL high-4 (ROM $EDEA: AND #$0F, ORA param)
        if (s.pos < seq.length) {
          const p = seq[s.pos++];
          s.volByte = (s.volByte & 0x0F) | p;
          updateVolState(s);
        }
      } else if (b === 0xEC) {
        // SET SWEEP
        if (s.pos < seq.length) {
          const sweep = seq[s.pos++];
          if (s.channel < 2) {
            s.sweepEnabled = !!(sweep & 0x80);
            s.sweepPeriod = (sweep >> 4) & 7;
            s.sweepNegate = !!(sweep & 0x08);
            s.sweepShift = sweep & 7;
            s.sweepDivider = s.sweepPeriod;
          }
        }
      } else if (b === 0xED) {
        // SET TIMER-HI (ignored — period is computed from note)
        if (s.pos < seq.length) s.pos++;
      } else if (b === 0xEE) {
        // SET DUTY/VOL (full replace)
        if (s.pos < seq.length) {
          s.volByte = seq[s.pos++];
          updateVolState(s);
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
          } else {
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

  // ── Tick envelopes (4 quarter-frame clocks per game frame) ─────
  for (let i = 0; i < 28; i++) {
    const s = slots[i];
    if (!s.active) continue;
    if (!s.useEnvelope) continue;

    for (let q = 0; q < 4; q++) {
      if (s.envStartFlag) {
        // Restart: set vol to 15, reload divider
        s.envStartFlag = false;
        s.envVol = 15;
        s.envDivider = s.envPeriod;
        continue;  // this clock consumed by restart
      }
      if (s.envDivider > 0) {
        s.envDivider--;
      } else {
        s.envDivider = s.envPeriod;
        if (s.envVol > 0) {
          s.envVol--;
        } else if (s.envLoop) {
          s.envVol = 15;
        }
      }
    }
  }

  // ── Tick sweeps (2 half-frame clocks per game frame, pulse only)
  for (let i = 0; i < 28; i++) {
    const s = slots[i];
    if (!s.active || !s.sweepEnabled || s.channel >= 2) continue;
    if (s.period <= 0) continue;

    for (let h = 0; h < 2; h++) {
      if (s.sweepDivider > 0) {
        s.sweepDivider--;
      } else {
        s.sweepDivider = s.sweepPeriod;
        if (s.sweepShift > 0) {
          const change = s.period >> s.sweepShift;
          let newPeriod;
          if (s.sweepNegate) {
            // Pulse 1: ones' complement (subtract + extra -1)
            // Pulse 2: two's complement (just subtract)
            newPeriod = s.period - change - (s.channel === 0 ? 1 : 0);
          } else {
            newPeriod = s.period + change;
          }
          if (newPeriod > 0 && newPeriod < 0x800) {
            s.period = newPeriod;
            s.freq = periodToFreq(s.period, false);
            s.needsWrite = true;
          } else if (newPeriod >= 0x800) {
            // Sweep overflow silences the channel (mute flag)
            s.active = false;
          }
        }
      }
    }
  }

  // ── Pass 2: Write to audio (ROM priority: lower slot wins) ─────
  const chClaimed = [false, false, false, false];

  for (let i = 0; i < 28; i++) {
    const s = slots[i];
    if (!s.active) continue;

    const ch = s.channel;
    if (chClaimed[ch]) continue;  // lower-numbered slot already owns this hw channel
    chClaimed[ch] = true;

    // Set duty cycle (pulse channels only)
    if (ch < 2) setChannelDuty(ch, s.duty);

    // Write frequency when a new note was decoded or sweep changed it
    if (s.needsWrite) {
      if (ch < 3) {
        setChannelFreq(ch, s.freq);
      } else {
        setChannelFreq(3, s.noisePeriodIdx);
      }
      s.needsWrite = false;
    }

    // Write volume (envelope or constant)
    const vol = s.useEnvelope ? s.envVol : s.vol;
    setChannelVol(ch, vol);
  }

  // Silence hw channels not claimed by any active slot
  for (let c = 0; c < 4; c++) {
    if (!chClaimed[c]) silenceChannel(c);
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
