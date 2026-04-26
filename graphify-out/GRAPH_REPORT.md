# Knowledge Graph — Beatbox2MIDI
Generated: 2026-04-26 | Version courante: v0.8 | 7 fichiers source

---

## God Nodes (nœuds les plus connectés)

1. **`src/audio.js`** — 8 connexions sortantes, importé par `ui.js`
   - Nœud central du pipeline audio. Exporte : `startMicrophone`, `onOnset`, `setSensitivity`, `setInputGain`, `recordSnapshot`, `getMetrics`, `getConfig`
   - Contient la boucle d'analyse 60fps (waveform + RMS + spectral flux + onset + classification features)
   - Chaîne WebAudio : `mic → highpassFilter(80Hz) → gainNode → { analyser(smoothing=0), recordDestination }`

2. **`src/ui.js`** — importe audio.js, pilote index.html complet
   - Contient toute la logique de classification heuristique (`classifyOnset`)
   - Gère : waveform canvas, notes canvas (timeline MIDI), sliders, pré-enregistrement, logs
   - Point d'entrée de l'app (chargé comme module depuis index.html)

---

## Communautés (clusters fonctionnels)

### Cluster 1 — Pipeline audio ACTIF (Phase 1 ✅)
| Fichier | Rôle | État |
|---------|------|------|
| `src/audio.js` | Capture micro, onset detection, features | Complet |
| `src/ui.js` | Classification heuristique, visualisation | En cours (tuning) |
| `index.html` | UI, sliders, canvas, nav | Complet |
| `sw.js` | Cache PWA offline-first | v8, cache-busted |

**Pipeline de données actuel :**
```
getUserMedia → AudioContext (44100Hz) → highpass(80Hz) → gainNode(3×)
    → analyser (fftSize=2048, smoothing=0)
        → tick() 60fps :
            ├── getByteTimeDomainData → waveform + RMS + ZCR
            ├── getByteFrequencyData  → spectral flux (onset) + band energies
            └── onset detected → { rms, flux, lowAvg, midAvg, highAvg, zcr }
                → classifyOnset() → railIdx (0-3)
                → per-class cooldown (HH:120ms, Snare:80ms, Kick:60ms)
                → noteHistory[] → canvas timeline
```

**Classification heuristique v0.8 :**
```
zcr > 0.10 || hilo > 1.5  → HH-Closed / HH-Open
hilo < 1.35 && mid < low*1.15 → Kick
default → Snare

Bandes : low=80-600Hz, mid=600-4000Hz, high=4000+Hz
binHz ≈ 21.5Hz (sampleRate=44100, fftSize=2048, binCount=1024)
```

### Cluster 2 — ML Classification (Phase 2 🔜)
| Fichier | Rôle | État |
|---------|------|------|
| `src/model.js` | MLP TF.js, predict(), trainModel() | Squelette |
| `src/storage.js` | IndexedDB : samples + settings | Squelette |

**Architecture prévue :**
- Input : 17 features (13 MFCC + centroid + rolloff + ZCR + RMS)
- Dense(32, ReLU) → Dropout(0.2) → Dense(16, ReLU) → Dense(4, softmax)
- 15-20 samples/classe, entraîné dans le navigateur
- `CLASSES = ['kick', 'snare', 'hihat_closed', 'hihat_open']`

**Connexion manquante :** `audio.js` retourne `mfcc: null` — Meyda.js doit être réintroduit pour les 13 MFCC.

### Cluster 3 — Export MIDI (Phase 3 🔜)
| Fichier | Rôle | État |
|---------|------|------|
| `src/midi.js` | buildMidiFile(), downloadMidi(), rmsToVelocity() | Squelette |

**Mapping GM Drums :** kick=36, snare=38, hihat_closed=42, hihat_open=46
**Dépendance externe :** midi-writer-js (CDN jsdelivr) — pas encore chargé
**`rmsToVelocity(rms, floor=0.01, ceiling=0.3, curve=0.7)`** — courbe de puissance non-linéaire, prête à l'emploi

### Cluster 4 — PWA Infrastructure
| Fichier | Rôle |
|---------|------|
| `manifest.json` | App name, icons, theme |
| `sw.js` | Cache offline, strategy: cache-first |
| `docs/reaper-setup.md` | Guide Syncthing + ReaScript Windows |

---

## Connexions Surprenantes

- **`midi.js` importe `model.js`** (pour `MIDI_MAP`) — mais `model.js` n'est pas encore fonctionnel. L'import fonctionne car il ne consomme que la constante statique `MIDI_MAP`.
- **`classifyOnset()` est dans `ui.js`** au lieu de `model.js` — anomalie architecturale intentionnelle (Phase 1 heuristique vs Phase 2 ML). À déplacer dans `model.js` en Phase 2.
- **`featuresFromOnset()` dans `model.js`** référence `onset.mfcc` (13 valeurs) qui est actuellement `null` dans tous les onsets — liera Meyda.js en Phase 2.

---

## Roadmap & État

| Phase | Contenu | État |
|-------|---------|------|
| 1 — POC audio | Capture, onset, waveform, timeline, heuristique | ✅ quasi-complet (tuning classif) |
| 2 — ML | Train UI, MFCC (Meyda), MLP TF.js, IndexedDB | 🔜 prochain |
| 3 — Export | Tap tempo, quantize, .mid download | 🔜 |
| 4 — PWA polish | SW, icons, mode sombre, installation | 🔜 |
| 5 — Extensions | Double kick, toms, basse (Pitchy.js) | 📅 futur |

---

## Questions suggérées pour les prochaines sessions

- "Où brancher Meyda pour les MFCC en Phase 2 ?" → `audio.js:startAnalysisLoop`, remplacer `mfcc: null`
- "Quel est le contrat entre `audio.js` et `model.js` ?" → `onsetData` → `featuresFromOnset()` → `predict()`
- "Comment connecter la classification ML à la timeline ?" → remplacer `classifyOnset()` dans `ui.js` par `model.predict()`
- "Comment implémenter le tap tempo ?" → `midi.js`, capturer 3-4 timestamps, calculer BPM moyen

---

## Versioning SW (à incrémenter à chaque push)

`sw.js CACHE_NAME = 'beatbox2midi-vN'` — actuellement **v8**. Incrémenter à chaque commit pour forcer le rechargement sur mobile.
