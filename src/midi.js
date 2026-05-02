// src/midi.js — Phase 3 : tap tempo + click audio + export MIDI
import { MIDI_MAP, CLASSES } from './model.js';

// ——— Tap Tempo ———
const MAX_TAPS = 8;
const TAP_TIMEOUT_MS = 2500; // reset si silence > 2.5s
let taps = [];
let tapTimer = null;

export function tap() {
  const now = performance.now();
  if (tapTimer) clearTimeout(tapTimer);
  // Reset si trop long entre deux taps
  if (taps.length && now - taps[taps.length - 1] > TAP_TIMEOUT_MS) taps = [];
  taps.push(now);
  if (taps.length > MAX_TAPS) taps.shift();
  tapTimer = setTimeout(() => { taps = []; }, TAP_TIMEOUT_MS);
  return getBpm();
}

export function getBpm() {
  if (taps.length < 2) return null;
  // Moyenne des intervalles entre taps consécutifs
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

// Décompte 4 beats puis callback
export function startCountdown(bpm, onTick, onDone) {
  stopClick();
  const intervalMs = 60000 / bpm;
  let count = 0;
  playClick(true);
  onTick(1);
  const tick = () => {
    count++;
    if (count < 4) {
      playClick(count % 4 === 0);
      onTick(count + 1);
      countdownTimeout = setTimeout(tick, intervalMs);
    } else {
      onDone();
    }
  };
  countdownTimeout = setTimeout(tick, intervalMs);
}

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

// quantize un timestamp (ms) sur la grille la plus proche
function quantizeMs(tsMs, bpm, grid) {
  if (!grid) return tsMs;
  const divisions = grid === '32n' ? 32 : 16;
  const beatMs = 60000 / bpm;
  const gridMs = beatMs / (divisions / 4);
  return Math.round(tsMs / gridMs) * gridMs;
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

  const events = noteHistory.map(n => {
    const className = CLASSES[n.railIdx];
    const pitch = MIDI_MAP[className];
    if (!pitch) return null;
    const rawMs = n.time - t0;
    const qMs = quantizeMs(rawMs, bpm, quantize);
    const tick = Math.round(qMs / msPerTick);
    const velocity = rmsToVelocity(n.velocity);
    return { tick, pitch, velocity };
  }).filter(Boolean);

  // Trier par tick (quantize peut réordonner)
  events.sort((a, b) => a.tick - b.tick);

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
