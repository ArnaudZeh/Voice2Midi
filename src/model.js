// src/model.js — KNN classifier (Phase 2)
// Features : [lowAvg, midAvg, highAvg, zcr, rms, spectralFlux] (6 dimensions)

export const CLASSES = ['china', 'snare', 'kick'];
export const N_CLASSES = CLASSES.length;
export const MIN_SAMPLES = 5; // minimum par classe pour entraîner

export const MIDI_MAP = {
  kick:  36,  // C1
  snare: 38,  // D1
  china: 52,  // GM Chinese Cymbal
  tom_low: 41, tom_mid: 45, tom_high: 48,
  crash: 49, ride: 51,
};

const K = 3; // voisins KNN

let trainingSamples = []; // [{ classIdx, features }]
let normStats = null;     // { mean[], std[] }
let isTrained = false;

// Extrait le vecteur de features depuis un onsetData (audio.js)
export function featuresFromOnset(onset) {
  return [onset.lowAvg, onset.midAvg, onset.highAvg, onset.zcr, onset.rms, onset.spectralFlux];
}

export function addTrainingSample(classIdx, onsetData) {
  trainingSamples.push({ classIdx, features: featuresFromOnset(onsetData) });
}

export function clearClassSamples(classIdx) {
  trainingSamples = trainingSamples.filter(s => s.classIdx !== classIdx);
  isTrained = false;
  normStats = null;
}

export function clearTraining() {
  trainingSamples = [];
  normStats = null;
  isTrained = false;
}

export function getTrainingCounts() {
  const counts = new Array(N_CLASSES).fill(0);
  trainingSamples.forEach(s => counts[s.classIdx]++);
  return counts;
}

export function canTrain() {
  return getTrainingCounts().every(c => c >= MIN_SAMPLES);
}

export function isModelTrained() { return isTrained; }

// Normalisation z-score
function computeNormStats(samples) {
  const n = samples.length;
  const dim = samples[0].features.length;
  const mean = new Array(dim).fill(0);
  const std  = new Array(dim).fill(0);
  samples.forEach(s => s.features.forEach((v, i) => { mean[i] += v; }));
  mean.forEach((_, i) => { mean[i] /= n; });
  samples.forEach(s => s.features.forEach((v, i) => { std[i] += (v - mean[i]) ** 2; }));
  std.forEach((_, i) => { std[i] = Math.sqrt(std[i] / n) || 1; });
  return { mean, std };
}

function normalize(features, stats) {
  return features.map((v, i) => (v - stats.mean[i]) / stats.std[i]);
}

export function trainModel() {
  if (!canTrain()) throw new Error(`Min ${MIN_SAMPLES} samples par classe requis`);
  normStats = computeNormStats(trainingSamples);
  isTrained = true;
}

export function predict(onsetData) {
  if (!isTrained || !normStats) return null;
  const features = normalize(featuresFromOnset(onsetData), normStats);
  const k = Math.min(K, trainingSamples.length);

  const distances = trainingSamples.map(s => ({
    classIdx: s.classIdx,
    dist: Math.sqrt(
      normalize(s.features, normStats)
        .reduce((acc, v, i) => acc + (v - features[i]) ** 2, 0)
    ),
  }));
  distances.sort((a, b) => a.dist - b.dist);

  const votes = new Array(N_CLASSES).fill(0);
  distances.slice(0, k).forEach(n => votes[n.classIdx]++);
  const classIdx = votes.indexOf(Math.max(...votes));
  return { classIdx, className: CLASSES[classIdx], confidence: votes[classIdx] / k };
}

// Sérialisation pour IndexedDB
export function serializeModel() {
  return { samples: trainingSamples, normStats, isTrained };
}

export function deserializeModel(data) {
  if (!data) return;
  trainingSamples = data.samples || [];
  normStats       = data.normStats || null;
  isTrained       = data.isTrained || false;
}
