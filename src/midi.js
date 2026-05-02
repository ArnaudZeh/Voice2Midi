// src/midi.js — Phase 3 : tap tempo + click audio + export MIDI
import { MIDI_MAP, CLASSES } from './model.js';

// ——— Tap Tempo ———
const TAP_TIMEOUT_MS = 2500; // reset si silence > 2.5s
let taps = [];
let tapTimer = null;

export function tap() {
  const now = performance.now();
  if (tapTimer) clearTimeout(tapTimer);
  // Reset si trop long entre deux taps
  if (taps.length && now - taps[taps.length - 1] > TAP_TIMEOUT_MS) taps = [];
  taps.push(now);
  tapTimer = setTimeout(() => { taps = []; }, TAP_TIMEOUT_MS);
  return getBpm();
}

export function getBpm() {
  if (taps.length < 2) return null;
  // Moyenne de tous les intervalles — s'affine à chaque tap
  let sum = 0;
  for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
  const avgInterval = sum / (taps.length - 1);
  return Math.round(60000 / avgInterval);
}

export function getTapCount() { return taps.length; }

export function resetTaps() {
  if (tapTimer) clearTimeout(tapTimer);
  taps = [];
}

// ——— Click audio (Web Audio API, pas de fichier externe) ———
let clickCtx = null;
let clickIntervalId = null;
let countdownTimeout = null;

function getClickCtx() {
  if (!clickCtx) clickCtx = new AudioContext();
  return clickCtx;
}

function playClick(isAccent = false) {
  const ctx = getClickCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = isAccent ? 1200 : 800;
  gain.gain.setValueAtTime(isAccent ? 0.6 : 0.35, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.06);
}

export function startClick(bpm, onBeat) {
  stopClick();
  const intervalMs = 60000 / bpm;
  let beat = 0;
  playClick(true); // 1er beat immédiat
  onBeat && onBeat(beat);
  beat++;
  clickIntervalId = setInterval(() => {
    playClick(beat % 4 === 0);
    onBeat && onBeat(beat);
    beat++;
  }, intervalMs);
}

export function stopClick() {
  if (clickIntervalId) { clearInterval(clickIntervalId); clickIntervalId = null; }
  if (countdownTimeout) { clearTimeout(countdownTimeout); countdownTimeout = null; }
}

export function isClickRunning() { return clickIntervalId !== null; }

// Décompte N beats puis callback (beats = 4 ou 8)
export function startCountdown(bpm, beats, onTick, onDone) {
  stopClick();
  const intervalMs = 60000 / bpm;
  let count = 0;
  playClick(true);
  onTick(1);
  const tick = () => {
    count++;
    if (count < beats) {
      playClick(count % 4 === 0);
      onTick(count + 1);
      countdownTimeout = setTimeout(tick, intervalMs);
    } else {
      onDone();
    }
  };
  countdownTimeout = setTimeout(tick, intervalMs);
}

// ——— Sons de batterie synthétiques ———
function makeNoise(ctx, duration) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function synthKick(ctx, t, vel) {
  const g = ctx.createGain();
  g.connect(ctx.destination);
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  const osc = ctx.createOscillator();
  osc.connect(g);
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  osc.start(t); osc.stop(t + 0.45);
  return osc;
}

function synthSnare(ctx, t, vel) {
  // Bruit
  const ng = ctx.createGain();
  ng.connect(ctx.destination);
  ng.gain.setValueAtTime(vel * 0.6, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  const ns = ctx.createBufferSource();
  ns.buffer = makeNoise(ctx, 0.2);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 1500;
  ns.connect(hp); hp.connect(ng);
  ns.start(t); ns.stop(t + 0.18);
  // Ton
  const tg = ctx.createGain();
  tg.connect(ctx.destination);
  tg.gain.setValueAtTime(vel * 0.4, t);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  const osc = ctx.createOscillator();
  osc.frequency.value = 220;
  osc.connect(tg);
  osc.start(t); osc.stop(t + 0.08);
  return ns;
}

function synthChina(ctx, t, vel) {
  const g = ctx.createGain();
  g.connect(ctx.destination);
  g.gain.setValueAtTime(vel * 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  const ns = ctx.createBufferSource();
  ns.buffer = makeNoise(ctx, 0.4);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 8000; bp.Q.value = 0.8;
  ns.connect(bp); bp.connect(g);
  ns.start(t); ns.stop(t + 0.35);
  return ns;
}

const SYNTH_FNS = [synthChina, synthSnare, synthKick]; // index = railIdx, fallback si .wav indispo

// Sons statiques bundlés (SOUNDS/*.wav) — chargés une fois, utilisés comme défaut
// ordre : [0]=china, [1]=snare, [2]=kick (= railIdx)
const STATIC_URLS = ['./SOUNDS/CHINA.wav', './SOUNDS/SNARE.wav', './SOUNDS/KICK.wav'];
let staticBuffers = [null, null, null]; // AudioBuffer décodés, partagés entre previews

async function ensureStaticBuffers(ctx) {
  await Promise.all(STATIC_URLS.map(async (url, i) => {
    if (staticBuffers[i]) return; // déjà chargé
    try {
      const res = await fetch(url);
      const ab  = await res.arrayBuffer();
      staticBuffers[i] = await ctx.decodeAudioData(ab);
    } catch (_) { /* restera null → fallback synth */ }
  }));
}

// ——— Quantize partagé (preview + export) ———
export function applyQuantize(notes, bpm, quantize) {
  if (!quantize) return notes;
  const gridMs = getGridMs(bpm, quantize);
  const rawMs = notes.map(n => n.time - notes[0].time);
  const drift = computeDriftCorrection(rawMs, gridMs);
  const dedupMap = new Map();
  notes.forEach((n, i) => {
    const corrected = Math.max(0, rawMs[i] - drift);
    const snapped = Math.round(corrected / gridMs) * gridMs;
    const key = `${snapped}_${n.railIdx}`;
    if (!dedupMap.has(key) || n.velocity > dedupMap.get(key).velocity) {
      dedupMap.set(key, { ...n, time: notes[0].time + snapped });
    }
  });
  return Array.from(dedupMap.values()).sort((a, b) => a.time - b.time);
}

// ——— Prévisualisation audio ———
let previewSources = [];
let previewCtx = null;

export async function previewNotes(notes, bpm, quantize, userBuffers = {}, onProgress, onEnd, withClick = false) {
  stopPreview();
  if (!notes.length) return;
  const notesToPlay = applyQuantize(notes, bpm, quantize);
  previewCtx = new AudioContext();
  previewSources = [];

  // Charger les sons statiques si pas encore fait
  await ensureStaticBuffers(previewCtx);

  // Décoder les overrides utilisateur si dispo
  const userDecoded = {};
  await Promise.all(['china', 'snare', 'kick'].map(async (cls, i) => {
    if (userBuffers[cls]) {
      try { userDecoded[i] = await previewCtx.decodeAudioData(userBuffers[cls].slice(0)); }
      catch (_) {}
    }
  }));

  // Priorité : user override > sons statiques > synth
  const decoded = staticBuffers.map((buf, i) => userDecoded[i] || buf);

  const t0 = previewCtx.currentTime + 0.05;
  const startMs = notesToPlay[0].time;
  const totalMs = notesToPlay[notesToPlay.length - 1].time - startMs;

  notesToPlay.forEach(n => {
    const tSec = t0 + (n.time - startMs) / 1000;
    const vel = Math.max(0.2, Math.min(1, n.velocity * 6));
    if (decoded[n.railIdx]) {
      const src = previewCtx.createBufferSource();
      src.buffer = decoded[n.railIdx];
      const g = previewCtx.createGain();
      g.gain.value = vel;
      src.connect(g); g.connect(previewCtx.destination);
      src.start(tSec);
      previewSources.push(src);
    } else {
      const src = SYNTH_FNS[n.railIdx](previewCtx, tSec, vel);
      previewSources.push(src);
    }
  });

  // Click de référence pendant la lecture (même AudioContext → synchro parfaite)
  if (withClick) {
    const beatMs = 60000 / bpm;
    const beatCount = Math.ceil((totalMs + beatMs) / beatMs) + 1;
    for (let b = 0; b <= beatCount; b++) {
      const tBeat = t0 + (b * beatMs) / 1000;
      const isAccent = b % 4 === 0;
      const osc = previewCtx.createOscillator();
      const gc = previewCtx.createGain();
      osc.connect(gc); gc.connect(previewCtx.destination);
      osc.frequency.value = isAccent ? 1200 : 800;
      gc.gain.setValueAtTime(isAccent ? 0.3 : 0.18, tBeat);
      gc.gain.exponentialRampToValueAtTime(0.001, tBeat + 0.05);
      osc.start(tBeat); osc.stop(tBeat + 0.05);
      previewSources.push(osc);
    }
  }

  // Callback de fin
  const endSec = t0 + totalMs / 1000 + 0.5;
  const endTimer = setTimeout(() => { onEnd && onEnd(); }, (endSec - previewCtx.currentTime) * 1000);
  previewSources._endTimer = endTimer;

  // Progress toutes les 100ms
  if (onProgress) {
    const progressInterval = setInterval(() => {
      if (!previewCtx) { clearInterval(progressInterval); return; }
      const elapsed = (previewCtx.currentTime - t0) * 1000;
      const pct = Math.min(1, elapsed / (totalMs || 1));
      onProgress(pct);
      if (pct >= 1) clearInterval(progressInterval);
    }, 100);
    previewSources._progressInterval = progressInterval;
  }
}

export function stopPreview() {
  if (previewSources._endTimer)        clearTimeout(previewSources._endTimer);
  if (previewSources._progressInterval) clearInterval(previewSources._progressInterval);
  previewSources.forEach(s => { try { s.stop(0); } catch (_) {} });
  previewSources = [];
  if (previewCtx) { previewCtx.close(); previewCtx = null; }
}

export function isPreviewRunning() { return previewCtx !== null; }

// ——— Export MIDI ———
// Charge midi-writer-js depuis CDN (une seule fois)
let midiWriterReady = null;
function loadMidiWriter() {
  if (midiWriterReady) return midiWriterReady;
  midiWriterReady = new Promise((resolve, reject) => {
    if (window.MidiWriter) return resolve(window.MidiWriter);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/midi-writer-js@3.1.1/build/browser/midiwriter.js';
    s.onload = () => resolve(window.MidiWriter);
    s.onerror = () => reject(new Error('Impossible de charger midi-writer-js'));
    document.head.appendChild(s);
  });
  return midiWriterReady;
}

// velocity musicale (courbe puissance)
export function rmsToVelocity(rms, floor = 0.01, ceiling = 0.3, curve = 0.7) {
  const norm = Math.max(0, Math.min(1, (rms - floor) / (ceiling - floor)));
  return Math.max(20, Math.round(Math.pow(norm, curve) * 127));
}

// gridMs pour un quantize donné
function getGridMs(bpm, grid) {
  const beatMs = 60000 / bpm;
  return grid === '32n' ? beatMs / 8 : beatMs / 4; // 32e ou 16e
}

// Correction de drift : offset médian de toutes les notes par rapport à la grille
// Corrige la latence systématique (ex: l'utilisateur joue toujours 30ms après le click)
function computeDriftCorrection(rawTimesMs, gridMs) {
  const signedOffsets = rawTimesMs.map(t => {
    const mod = ((t % gridMs) + gridMs) % gridMs;
    return mod < gridMs / 2 ? mod : mod - gridMs;
  });
  signedOffsets.sort((a, b) => a - b);
  return signedOffsets[Math.floor(signedOffsets.length / 2)] || 0;
}

/**
 * buildAndDownloadMidi(noteHistory, bpm, options)
 * noteHistory : [{ time: DOMHighResTimeStamp, velocity: rms, railIdx }]
 * railIdx → CLASSES[railIdx] → MIDI_MAP
 */
export async function buildAndDownloadMidi(noteHistory, bpm, options = {}) {
  const MidiWriter = await loadMidiWriter();
  const { quantize = '16n' } = options;

  if (!noteHistory.length) throw new Error('Aucune note à exporter');

  const track = new MidiWriter.Track();
  track.setTempo(bpm);
  track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 0 }));

  // Décale tout pour que le premier onset soit à t=0
  const t0 = noteHistory[0].time;
  const ppq = 128; // ticks par noire
  const msPerTick = 60000 / (bpm * ppq);

  // Appliquer quantize (partagé avec preview)
  const quantizedNotes = applyQuantize(noteHistory, bpm, quantize);

  const events = quantizedNotes.map(n => {
    const className = CLASSES[n.railIdx];
    const pitch = MIDI_MAP[className];
    if (!pitch) return null;
    const rawMs = n.time - t0;
    const tick = Math.round(rawMs / msPerTick);
    return { tick, pitch, velocity: rmsToVelocity(n.velocity) };
  }).filter(Boolean).sort((a, b) => a.tick - b.tick);

  // Construire les NoteEvents avec wait en ticks
  let cursor = 0;
  events.forEach(({ tick, pitch, velocity }) => {
    const wait = tick - cursor;
    cursor = tick;
    track.addEvent(new MidiWriter.NoteEvent({
      pitch: [pitch],
      duration: 'T32',        // très court, drum style
      velocity,
      wait: wait > 0 ? `T${wait}` : 'T0',
    }));
  });

  const writer = new MidiWriter.Writer([track]);
  const blob = new Blob([writer.buildFile()], { type: 'audio/midi' });
  const date = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
  const filename = `beatbox_${bpm}bpm_${date}.mid`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}
