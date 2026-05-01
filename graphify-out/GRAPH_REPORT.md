# Voice2Midi Knowledge Graph Report
**Generated:** 2026-04-30 | **Version:** v0.9.3 | **Status:** Phase 1 POC (Audio Detection)

> **Usage :** Lire ce fichier en PREMIER avant tout grep/glob. Contient tous les seuils, fonctions, et dépendances avec numéros de ligne exacts.

---

## 1. PROJECT OVERVIEW

**Name:** Beatbox2MIDI
**Purpose:** Transformer le beatbox en patterns MIDI de batterie, temps réel sur smartphone PWA
**Stack:** HTML/CSS/JS vanilla, Web Audio API, IndexedDB, Service Worker (PWA)
**Déploiement:** GitHub Pages
**User:** Arnaud (producteur metalcore/djent, Tahiti)

**Phase actuelle:** Phase 1 (POC) — Onset detection + classification heuristique 3 classes
**Complété:** Capture audio, onset detection (flux spectral + RMS), classificateur heuristique (Kick/Snare/China)
**Pending:** ML training (Phase 2), Export MIDI (Phase 3), Polish PWA (Phase 4)

---

## 2. GOD NODES (Composants les plus centraux)

| Node | Rôle | Critique |
|------|------|---------|
| **src/audio.js** | Capture audio, détection d'onsets, extraction features | OUI |
| **src/ui.js** | Orchestration UI, callbacks, visualisation, timeline, classifyOnset | OUI |
| **src/model.js** | Constantes MIDI_MAP, CLASSES, stubs ML Phase 2 | NON (squelette) |
| **src/storage.js** | API IndexedDB | NON (dormant) |
| **src/midi.js** | Génération MIDI, utilitaire velocity | NON (stub) |
| **index.html** | DOM, thème visuel, canvas targets | OUI |
| **sw.js** | Service worker, cache offline, PWA | OUI |

**Graphe de dépendances :**
```
index.html → ui.js → audio.js
                   ↘ model.js → midi.js
sw.js (parallèle, gestion cache)
storage.js (dormant, Phase 2)
```

---

## 3. COMMUNAUTÉS FONCTIONNELLES

### Communauté A : Acquisition & Analyse Audio
**Fichier :** `src/audio.js`

**Fonctions clés :**
- `startMicrophone()` (l.51–99) — init getUserMedia + chaîne Web Audio
- `stopMicrophone()` (l.101–106)
- `startAnalysisLoop()` (l.109–203) — **BOUCLE PRINCIPALE 60 FPS**
- `setSensitivity(level)` (l.37–43) — courbe exponentielle rms/flux thresholds
- `setInputGain(g)` (l.46–49)
- `recordSnapshot(durationMs)` (l.210–235)
- `onOnset(cb)`, `onRMS(cb)` (l.33–34) — enregistrement callbacks

**Constantes CONFIG (l.16–23) :**
```javascript
CONFIG = {
  fftSize: 2048,
  rmsThreshold: 0.008,      // défaut sensitiv. 7/10
  fluxThreshold: 0.006,
  minOnsetInterval: 40,     // ms anti-rebond (~16e @ 180 BPM)
  highpassFreq: 80,         // Hz coupe-souffle
  inputGain: 3.0,           // multiplicateur 1–10
}
```

**Chaîne audio :** mic → highpass(80Hz) → gain → analyser + recordDestination
`analyser.smoothingTimeConstant = 0` (l.81) — **AUCUN smoothing, hyper-réactif**

---

### Communauté B : UI & Visualisation
**Fichier :** `src/ui.js`

**Constantes clés :**
```javascript
APP_VERSION = 'v0.9.3'           // l.3 — bumper à chaque modif (format 0.9.x)
TIMELINE_MS = 2000                // l.257 — fenêtre rolling (slider 0.5–6 sec)
MAX_HISTORY_MS = 10000            // l.258 — rétention buffer
WAVEFORM_GAIN = 3.0               // l.74 — amplification visuelle
RAIL_NAMES = ['China','Snare','Kick']   // l.277
CLASS_COOLDOWN_MS = [100, 80, 40]      // l.275 — China, Snare, Kick (ms)
```

**Fonction critique : `classifyOnset()` (l.266–271) :**
```javascript
function classifyOnset({ lowAvg, midAvg, highAvg, zcr }) {
  const hilo = highAvg / (lowAvg || 1);
  if (zcr > 0.08) return 0;   // China (tch — seuil abaissé pour affriquée courte)
  if (hilo > 1.0)  return 1;  // Snare (ta aigu — highs > lows)
  return 2;                   // Kick (ta grave / dr — lows dominent)
}
```

**Callback onset (l.278–285) :** classifyOnset → cooldown check → noteHistory → timeline

**Fonctions :**
- `log(message)` (l.43–50)
- `flashOnset()` (l.54–57)
- `drawWaveform(dataArray)` (l.76–136)
- `metricsLoop()` (l.144–180) — polling VU-meter + stats
- `drawNotes()` (l.314–372) — piano-roll canvas 60 FPS

---

### Communauté C : Modèle & ML (Dormant — Phase 2)
**Fichier :** `src/model.js`

**Exports :**
```javascript
CLASSES = ['china', 'snare', 'kick']   // l.42

MIDI_MAP = {                            // l.45–55
  kick: 36,     // C1
  snare: 38,    // D1
  china: 52,    // GM Chinese Cymbal (E3)
  tom_low: 41, tom_mid: 45, tom_high: 48,
  crash: 49, ride: 51,
}
```
- `trainModel(samples)` — TODO Phase 2
- `predict(features)` — TODO Phase 2
- `featuresFromOnset(onset)` (l.81–89) — vecteur 17 dimensions

---

### Communauté D : Export MIDI (Stub — Phase 3)
**Fichier :** `src/midi.js`
**Imports :** `MIDI_MAP` from model.js
- `buildMidiFile(events, bpm, options)` — TODO Phase 3
- `downloadMidi(blob, filename)` (l.42–49)
- `rmsToVelocity(rms, floor, ceiling, curve)` (l.52–56) — courbe puissance x^0.7

---

### Communauté E : Persistance (Dormant — Phase 2)
**Fichier :** `src/storage.js`
```javascript
DB_NAME = 'beatbox2midi'   // l.13
DB_VERSION = 1             // l.14
```

---

### Communauté F : Service Worker & PWA
**Fichiers :** `sw.js`, `manifest.json`
```javascript
CACHE_NAME = 'beatbox2midi-v13'   // sw.js:2 — sync manuel avec APP_VERSION
```
Stratégie : cache-first, fallback réseau.

---

## 4. TOUS LES SEUILS & CONSTANTES

| Paramètre | Valeur | Fichier:Ligne | Notes |
|-----------|--------|--------------|-------|
| `APP_VERSION` | `'v0.9.3'` | ui.js:3 | Bumper à chaque modif |
| `CACHE_NAME` | `'beatbox2midi-v13'` | sw.js:2 | Sync avec APP_VERSION |
| `fftSize` | 2048 | audio.js:17 | Fenêtre FFT ~46ms |
| `rmsThreshold` | 0.008 | audio.js:18 | Courbe exp. sensitiv. 1–10 |
| `fluxThreshold` | 0.006 | audio.js:19 | Courbe exp. sensitiv. 1–10 |
| `minOnsetInterval` | 40 ms | audio.js:20 | Anti-rebond |
| `highpassFreq` | 80 Hz | audio.js:21 | Coupe-souffle |
| `inputGain` | 3.0 | audio.js:22 | Slider 1–10× |
| `smoothingTimeConstant` | 0 | audio.js:81 | **Aucun smoothing** |
| **ZCR seuil china** | **0.08** | **ui.js:268** | Affriquée courte "tch" |
| **hilo seuil snare** | **1.0** | **ui.js:269** | highs > lows = ta brillant |
| `CLASS_COOLDOWN_MS[0]` | 100 ms | ui.js:275 | China |
| `CLASS_COOLDOWN_MS[1]` | 80 ms | ui.js:275 | Snare |
| `CLASS_COOLDOWN_MS[2]` | 40 ms | ui.js:275 | Kick (dr rapide métal) |
| `TIMELINE_MS` | 2000 | ui.js:257 | Slider 0.5–6 sec |
| `MAX_HISTORY_MS` | 10000 | ui.js:258 | Buffer ring |
| `WAVEFORM_GAIN` | 3.0 | ui.js:74 | Amplif. visuelle |
| `MAX_LOG_LINES` | 40 | ui.js:40 | Cap log |
| `PRE_RECORD_MS` | 5000 | ui.js:215 | Snapshot 5 sec |
| Bande low | 80–600 Hz | audio.js:167 | ~28 bins |
| Bande mid | 600–4000 Hz | audio.js:168 | ~186 bins |
| Bande high | 4000+ Hz | audio.js:168 | Reste des bins |

---

## 5. CALL GRAPH

```
index.html
  └─ <script type="module"> ui.js

ui.js
  ├─ IMPORTS ← audio.js: startMicrophone, onOnset, onRMS, setSensitivity,
  │                        setInputGain, recordSnapshot, getConfig, getMetrics
  ├─ INIT: screen nav, metricsLoop (rAF), drawNotes (rAF), onOnset callback
  └─ RUNTIME:
      onOnset → classifyOnset() → noteHistory → drawNotes()
      rmsCallback → metricsLoop() → VU-meter DOM
      slider → setSensitivity() / setInputGain()
      button → startMicrophone() / recordSnapshot()

audio.js
  ├─ startMicrophone() → getUserMedia → AudioContext → startAnalysisLoop()
  └─ startAnalysisLoop() [60 FPS]
      ├─ getByteTimeDomainData() → drawWaveform() [ui.js]
      ├─ RMS → rmsCallbacks
      ├─ Spectral flux → onset check
      └─ ONSET: lowAvg/midAvg/highAvg/zcr → onsetCallbacks → ui.js:classifyOnset()
```

---

## 6. CONNEXIONS IMPORTANTES

1. **ZCR dilution intentionnelle** : ZCR sur fenêtre pleine 2048 samples → sons soutenus (china) ZCR haut, transitoires courts (kick) ZCR dilué bas
2. **Classification dans ui.js, PAS audio.js** : séparation signal/politique, facile à remplacer par ML Phase 2
3. **recordDestination ≠ analyser** : analyser pré-gain, recorder post-gain → thresholds calibrés sur signal non-amplifié
4. **Sync manuel APP_VERSION / CACHE_NAME** : aucune automatisation, risque de désync si on oublie
5. **Double callback + polling** : `onOnset()` + `onRMS()` + polling `getMetrics()` — redondance pour iOS Safari

---

## 7. NUMÉROS DE LIGNE CLÉS

| Concept | Fichier | Ligne(s) |
|---------|---------|---------|
| CONFIG thresholds | audio.js | 16–23 |
| Sensitivity curve | audio.js | 37–43 |
| Analysis loop | audio.js | 109–203 |
| Spectral bands | audio.js | 167–168 |
| ZCR calculation | audio.js | 184–188 |
| onsetData object | audio.js | 190–196 |
| recordSnapshot() | audio.js | 210–235 |
| APP_VERSION | ui.js | 3 |
| drawWaveform() | ui.js | 76–136 |
| metricsLoop() | ui.js | 144–180 |
| classifyOnset() | ui.js | 266–271 |
| CLASS_COOLDOWN_MS | ui.js | 275 |
| drawNotes() | ui.js | 314–372 |
| CLASSES | model.js | 42 |
| MIDI_MAP | model.js | 45–55 |
| rmsToVelocity() | midi.js | 52–56 |
| IndexedDB schema | storage.js | 13–29 |
| CACHE_NAME | sw.js | 2 |

---

## 8. VERSIONING — RÈGLE

**À chaque modif, bumper deux endroits :**
1. `APP_VERSION` dans `src/ui.js:3` → format `0.9.x`
2. `CACHE_NAME` dans `sw.js:2` → suffixe numérique incrémental

**Historique patches :**
- `v0.9` / sw-v9 — ZCR pleine-fenêtre + cymbal ZCR-only + kick resserré
- `v0.9.1` / sw-v10 — Fix kick (lowAvg > midAvg * 1.20)
- `v0.9.2` / sw-v11,v12 — 3 classes China/Snare/Kick, suppression hi-hats, versioning header
- `v0.9.3` / sw-v13 — ZCR seuil china 0.12→0.08, hilo seuil snare 1.5→1.0, graphify
