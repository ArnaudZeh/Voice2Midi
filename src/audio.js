// src/audio.js
// Capture micro + onset detection via Meyda.js
// Chargé depuis CDN dans un import dynamique pour simplifier le setup

import { log, flashOnset, drawWaveform } from './ui.js';

let audioContext = null;
let analyser = null;
let meydaAnalyzer = null;
let stream = null;
let sourceNode = null;
let highpassFilter = null;

// Paramètres tuning onset detection — calibrés pour beatbox soft (tongue clicks, etc.)
const CONFIG = {
  bufferSize: 512,              // 512 @ 48kHz ≈ 10.6ms de latence
  featureExtractors: ['rms', 'spectralFlux', 'mfcc', 'spectralCentroid', 'zcr'],
  mfccCount: 13,
  // Seuils onset detection (défauts "sensibilité 7/10")
  rmsThreshold: 0.004,          // énergie minimale — très bas pour capter les sons soft
  fluxThreshold: 0.05,          // flux spectral minimal — bas pour détecter les attaques légères
  minOnsetInterval: 40,         // ms min entre 2 onsets (anti-rebond, 40ms = ~16e @ 180bpm)
  // Filtre passe-haut anti-souffle
  highpassFreq: 80,
};

let lastOnsetTime = 0;
const onsetCallbacks = [];
const rmsCallbacks = [];

export function onOnset(callback) {
  onsetCallbacks.push(callback);
}

export function onRMS(callback) {
  rmsCallbacks.push(callback);
}

// Sensibilité 1-10 : interpole (courbe exp) les seuils entre stricts et très permissifs
// Plage large côté haut pour capter tongue clicks, claquements de langue, etc.
export function setSensitivity(level) {
  const t = Math.max(1, Math.min(10, level));
  const k = (t - 1) / 9; // 0 à 1
  // Courbe exponentielle : aux hauts niveaux, seuils très bas
  const curve = Math.pow(k, 1.5);
  CONFIG.rmsThreshold = 0.02 * (1 - curve) + 0.0003 * curve;   // 0.02 → 0.0003
  CONFIG.fluxThreshold = 0.3 * (1 - curve) + 0.003 * curve;    // 0.3 → 0.003
}

export async function startMicrophone() {
  try {
    // Demande l'accès micro
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,  // on fait notre propre noise gate
        autoGainControl: false,
      }
    });

    // Contexte audio
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    log(`AudioContext sample rate: ${audioContext.sampleRate} Hz`);

    sourceNode = audioContext.createMediaStreamSource(stream);

    // Filtre passe-haut pour couper le souffle et les basses fréquences indésirables
    highpassFilter = audioContext.createBiquadFilter();
    highpassFilter.type = 'highpass';
    highpassFilter.frequency.value = CONFIG.highpassFreq;

    // Analyser pour la visualisation waveform
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;

    // Chaîne : micro → highpass → analyser
    sourceNode.connect(highpassFilter);
    highpassFilter.connect(analyser);

    // Meyda pour les features audio
    await loadMeyda();

    meydaAnalyzer = Meyda.createMeydaAnalyzer({
      audioContext: audioContext,
      source: highpassFilter,
      bufferSize: CONFIG.bufferSize,
      featureExtractors: CONFIG.featureExtractors,
      numberOfMFCCCoefficients: CONFIG.mfccCount,
      callback: onAudioFrame,
    });

    meydaAnalyzer.start();

    // Boucle de visualisation
    visualize();

    log('Micro actif, analyse en cours...');
    return true;
  } catch (err) {
    log(`Erreur micro: ${err.message}`);
    return false;
  }
}

export function stopMicrophone() {
  if (meydaAnalyzer) meydaAnalyzer.stop();
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
  meydaAnalyzer = null;
  stream = null;
  audioContext = null;
  log('Micro arrêté');
}

// Appelée à chaque buffer audio par Meyda (~10ms)
function onAudioFrame(features) {
  if (!features || features.rms === undefined) return;

  const { rms, spectralFlux, mfcc, spectralCentroid, zcr } = features;

  // Broadcast live (rms + flux) pour VU-meter + affichage debug
  rmsCallbacks.forEach(cb => cb(rms, spectralFlux));

  // Détection onset simple : RMS + flux spectral au-dessus des seuils
  const now = performance.now();
  const elapsed = now - lastOnsetTime;

  if (rms > CONFIG.rmsThreshold &&
      spectralFlux > CONFIG.fluxThreshold &&
      elapsed > CONFIG.minOnsetInterval) {

    lastOnsetTime = now;

    const onsetData = {
      timestamp: now,
      rms,
      spectralFlux,
      mfcc,
      spectralCentroid,
      zcr,
    };

    // Visuel
    flashOnset();
    log(`Onset @ ${now.toFixed(0)}ms | RMS=${rms.toFixed(3)} | flux=${spectralFlux.toFixed(2)} | centroid=${spectralCentroid.toFixed(0)}Hz`);

    // Broadcast aux listeners (classification, enregistrement, etc.)
    onsetCallbacks.forEach(cb => cb(onsetData));
  }
}

// Chargement dynamique de Meyda depuis CDN
async function loadMeyda() {
  if (window.Meyda) return;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/meyda@5.6.3/dist/web/meyda.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Boucle de visualisation waveform
function visualize() {
  if (!analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    if (!analyser) return;
    requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(dataArray);
    drawWaveform(dataArray);
  }
  draw();
}

// Exposé pour debug/tuning
export function getConfig() { return CONFIG; }
export function setConfig(key, value) { CONFIG[key] = value; }

// Pré-enregistrement : capture durationMs du stream micro + compte les onsets pendant la fenêtre
// Retourne { blob, onsetsDuringRecord, mimeType }
export async function recordSnapshot(durationMs = 5000) {
  if (!stream) throw new Error('Micro non actif — active le micro d\'abord');

  const chunks = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  // Collecte les onsets pendant la fenêtre d'enregistrement
  const startT = performance.now();
  const onsets = [];
  const tempListener = (data) => {
    onsets.push({ t: data.timestamp - startT, rms: data.rms });
  };
  onsetCallbacks.push(tempListener);

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      // Retire le listener temporaire
      const idx = onsetCallbacks.indexOf(tempListener);
      if (idx >= 0) onsetCallbacks.splice(idx, 1);
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      resolve({ blob, onsetsDuringRecord: onsets, mimeType: recorder.mimeType, durationMs });
    };
    recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder error'));
    recorder.start();
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, durationMs);
  });
}
