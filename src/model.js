// src/model.js
// TensorFlow.js classifier — à implémenter en Phase 2
// Pour l'instant, squelette et signatures uniquement

/**
 * Plan Phase 2 :
 *
 * 1. Training UI
 *    - Pour chaque classe (kick, snare, hihat_closed, hihat_open) :
 *      - Demander 15-20 exemples
 *      - Pour chaque exemple : capturer un onset + ses features (17 valeurs)
 *      - Stocker dans un array par classe
 *
 * 2. Préparation dataset
 *    - Normaliser les features (z-score par feature)
 *    - Split train/val 80/20
 *    - One-hot encoding des labels
 *
 * 3. Architecture modèle (petit MLP)
 *    - Input: 17 features (13 MFCC + centroid + rolloff + ZCR + RMS)
 *    - Dense 32 ReLU
 *    - Dropout 0.2
 *    - Dense 16 ReLU
 *    - Dense N_CLASSES softmax
 *
 * 4. Training
 *    - Adam optimizer, lr=0.001
 *    - categoricalCrossentropy
 *    - ~100 epochs, batch 8
 *    - Early stopping sur val_loss
 *
 * 5. Inference temps réel
 *    - À chaque onset dans audio.js, appeler predict()
 *    - Retourner { className, confidence }
 *    - Si confidence < 0.6, ignorer (probablement bruit)
 *
 * 6. Persistance
 *    - Sauver modèle + normalisation stats dans IndexedDB
 *    - Charger au démarrage si dispo
 */

export const CLASSES = ['kick', 'snare', 'hihat_closed', 'hihat_open'];

// GM Drums MIDI note mapping
export const MIDI_MAP = {
  kick: 36,
  snare: 38,
  hihat_closed: 42,
  hihat_open: 46,
  // extensions futures
  tom_low: 41,
  tom_mid: 45,
  tom_high: 48,
  crash: 49,
  ride: 51,
};

let model = null;
let normalizationStats = null;

export async function trainModel(samples) {
  // TODO Phase 2
  throw new Error('trainModel pas encore implémenté');
}

export function predict(features) {
  // TODO Phase 2
  // Retour attendu : { className: 'kick', confidence: 0.92 }
  return null;
}

export async function saveModel() {
  // TODO Phase 2 — via IndexedDB
}

export async function loadModel() {
  // TODO Phase 2
  return null;
}

// Utilitaire : convertit un onset en vecteur de features pour le modèle
export function featuresFromOnset(onset) {
  return [
    ...onset.mfcc,                    // 13 valeurs
    onset.spectralCentroid,
    onset.zcr,
    onset.rms,
    onset.spectralFlux,
  ];
}
