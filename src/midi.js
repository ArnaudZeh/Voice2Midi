// src/midi.js
// Export MIDI via midi-writer-js — à implémenter en Phase 3

/**
 * Plan Phase 3 :
 *
 * 1. Chargement dynamique de midi-writer-js depuis CDN
 *    https://cdn.jsdelivr.net/npm/midi-writer-js@3.1.1/build/browser/midiwriter.js
 *
 * 2. Tap tempo
 *    - Capture 2-4 taps utilisateur
 *    - Calcul BPM moyen (avec filtrage des outliers)
 *
 * 3. Construction du fichier MIDI
 *    - Créer une track de drums
 *    - Pour chaque événement { timestamp, className, velocity } :
 *      - Convertir timestamp (ms) → ticks MIDI selon bpm
 *      - Optionnel : quantize sur 16e ou 32e
 *      - Ajouter NoteEvent avec MIDI_MAP[className] et velocity
 *
 * 4. Export
 *    - Générer Blob .mid
 *    - Créer <a download="beatbox-pattern-{date}.mid">
 *    - Trigger click → ouvre le share sheet iOS/Android
 *
 * 5. Quantize options
 *    - Off (raw, feel naturel)
 *    - 16e (défaut)
 *    - 32e (pour patterns rapides type djent)
 */

import { MIDI_MAP } from './model.js';

export function buildMidiFile(events, bpm, options = {}) {
  // TODO Phase 3
  // events: [{ timestamp, className, velocity }]
  // bpm: number
  // options: { quantize: '16n' | '32n' | null }
  throw new Error('buildMidiFile pas encore implémenté');
}

export function downloadMidi(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Utilitaire : velocity musicale (courbe de puissance non-linéaire)
export function rmsToVelocity(rms, floor = 0.01, ceiling = 0.3, curve = 0.7) {
  const normalized = Math.max(0, Math.min(1, (rms - floor) / (ceiling - floor)));
  const curved = Math.pow(normalized, curve);
  return Math.round(curved * 127);
}
