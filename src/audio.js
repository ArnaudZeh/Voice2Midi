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

// Sensibilité 1-10 : interpole linéairement les seuils entre valeurs strictes et très permissives
export function setSensitivity(level) {
  const t = Math.max(1, Math.min(10, level));
  const k = (t - 1) / 9; // 0 à 1
  // Plus k est grand, plus les seuils sont bas (plus sensible)
  CONFIG.rmsThreshold = 0.025 - k * 0.023;   // 0.025 → 0.002
  CONFIG.fluxThreshold = 0.35 - k * 0.33;    // 0.35 → 0.02
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

  // Broadcast RMS live pour le VU-meter UI
  rmsCallbacks.forEach(cb => cb(rms));

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
