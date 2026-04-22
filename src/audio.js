// src/audio.js
// Capture micro + onset detection — 100% AnalyserNode (fiable iOS Safari)
// Meyda sera réintroduit en phase 2 pour les MFCC (classification).

import { log, flashOnset, drawWaveform } from './ui.js';

let audioContext = null;
let analyser = null;
let stream = null;
let sourceNode = null;
let highpassFilter = null;
let gainNode = null;
let recordDestination = null;

// Seuils calibrés pour notre calcul maison (différent de l'échelle Meyda)
const CONFIG = {
  fftSize: 2048,
  rmsThreshold: 0.008,        // défaut "sensibilité 7/10"
  fluxThreshold: 0.006,
  minOnsetInterval: 40,       // ms entre 2 onsets (anti-rebond, ~16e @ 180bpm)
  highpassFreq: 80,
  inputGain: 3.0,             // amplification du signal micro (1-10)
};

let lastOnsetTime = 0;
const onsetCallbacks = [];
const rmsCallbacks = [];

// État live pour polling depuis l'UI (failsafe si les callbacks déconnent)
let lastMetrics = { rms: 0, flux: 0, frameCount: 0, ts: 0 };
export function getMetrics() { return lastMetrics; }

export function onOnset(cb) { onsetCallbacks.push(cb); }
export function onRMS(cb) { rmsCallbacks.push(cb); }

// 1-10, courbe exp pour avoir beaucoup de résolution côté permissif
export function setSensitivity(level) {
  const t = Math.max(1, Math.min(10, level));
  const k = (t - 1) / 9;
  const curve = Math.pow(k, 1.3);
  CONFIG.rmsThreshold = 0.05 * (1 - curve) + 0.0015 * curve;   // 0.05 → 0.0015
  CONFIG.fluxThreshold = 0.08 * (1 - curve) + 0.0005 * curve;  // 0.08 → 0.0005
}

// Gain d'entrée du micro (1-10) — applique un multiplicateur via GainNode
export function setInputGain(g) {
  CONFIG.inputGain = Math.max(0, Math.min(10, g));
  if (gainNode) gainNode.gain.value = CONFIG.inputGain;
}

export async function startMicrophone() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    // iOS Safari : AudioContext peut démarrer suspendu
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    log(`AudioContext: ${audioContext.state} @ ${audioContext.sampleRate} Hz`);

    sourceNode = audioContext.createMediaStreamSource(stream);

    highpassFilter = audioContext.createBiquadFilter();
    highpassFilter.type = 'highpass';
    highpassFilter.frequency.value = CONFIG.highpassFreq;

    // Amplification du signal micro
    gainNode = audioContext.createGain();
    gainNode.gain.value = CONFIG.inputGain;

    analyser = audioContext.createAnalyser();
    analyser.fftSize = CONFIG.fftSize;
    // Crucial : 0 = pas de lissage temporel sur le spectre → flux fiable
    analyser.smoothingTimeConstant = 0;

    // Destination pour le pré-enregistrement (capte l'audio post-gain)
    recordDestination = audioContext.createMediaStreamDestination();

    // Chaîne : mic → highpass → gain → { analyser, recordDestination }
    sourceNode.connect(highpassFilter);
    highpassFilter.connect(gainNode);
    gainNode.connect(analyser);
    gainNode.connect(recordDestination);

    startAnalysisLoop();
    log('Analyse lancée — parle ou beatbox, tu devrais voir les valeurs monter');
    return true;
  } catch (err) {
    log(`Erreur micro: ${err.message}`);
    return false;
  }
}

export function stopMicrophone() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
  stream = null; audioContext = null; analyser = null;
  log('Micro arrêté');
}

// Boucle unique : waveform + RMS + flux + onset, 60fps
function startAnalysisLoop() {
  const timeData = new Uint8Array(analyser.fftSize);
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const prevFreq = new Uint8Array(analyser.frequencyBinCount);
  let hasPrev = false;

  function tick() {
    if (!analyser) return;
    requestAnimationFrame(tick);

    // Waveform (time-domain)
    analyser.getByteTimeDomainData(timeData);
    drawWaveform(timeData);

    // RMS (niveau général)
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / timeData.length);

    // Spectral flux (changements spectraux positifs, bon pour les transitoires)
    analyser.getByteFrequencyData(freqData);
    let flux = 0;
    if (hasPrev) {
      for (let i = 0; i < freqData.length; i++) {
        const diff = freqData[i] - prevFreq[i];
        if (diff > 0) flux += diff / 255;
      }
      flux /= freqData.length;
    }
    prevFreq.set(freqData);
    hasPrev = true;

    // État live pour polling (failsafe pour UI)
    lastMetrics = {
      rms,
      flux,
      frameCount: lastMetrics.frameCount + 1,
      ts: performance.now(),
    };

    // Broadcast pour VU-meter / metrics
    rmsCallbacks.forEach(cb => cb(rms, flux));

    // Onset detection
    const now = performance.now();
    const elapsed = now - lastOnsetTime;
    if (rms > CONFIG.rmsThreshold &&
        flux > CONFIG.fluxThreshold &&
        elapsed > CONFIG.minOnsetInterval) {
      lastOnsetTime = now;
      const onsetData = {
        timestamp: now,
        rms,
        spectralFlux: flux,
        // Placeholders pour compat future (remplacés par Meyda en phase 2)
        mfcc: null,
        spectralCentroid: null,
        zcr: null,
      };
      flashOnset();
      log(`Onset RMS=${rms.toFixed(4)} flux=${flux.toFixed(4)}`);
      onsetCallbacks.forEach(cb => cb(onsetData));
    }
  }
  tick();
}

export function getConfig() { return CONFIG; }
export function setConfig(k, v) { CONFIG[k] = v; }

// Pré-enregistrement : capture durationMs + compte onsets pendant la fenêtre
// Utilise recordDestination.stream → audio post-gain (plus audible à la relecture)
export async function recordSnapshot(durationMs = 5000) {
  if (!recordDestination) throw new Error('Active le micro d\'abord');

  const chunks = [];
  const recorder = new MediaRecorder(recordDestination.stream);
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const startT = performance.now();
  const onsets = [];
  const tempListener = (data) => {
    onsets.push({ t: data.timestamp - startT, rms: data.rms });
  };
  onsetCallbacks.push(tempListener);

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const idx = onsetCallbacks.indexOf(tempListener);
      if (idx >= 0) onsetCallbacks.splice(idx, 1);
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      resolve({ blob, onsetsDuringRecord: onsets, mimeType: recorder.mimeType, durationMs });
    };
    recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder error'));
    recorder.start();
    setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, durationMs);
  });
}
