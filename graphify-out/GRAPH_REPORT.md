# Voice2Midi Knowledge Graph Report
**Generated:** 2026-05-03 | **Version:** v0.13.3 | **Status:** Phases 1–3 complètes

> **Usage :** Lire ce fichier EN PREMIER avant tout grep/glob. Contient toutes les fonctions, seuils, dépendances et numéros de ligne à jour.

---

## 1. PROJECT OVERVIEW

**Name:** Beatbox2MIDI
**Purpose:** Transformer le beatbox en patterns MIDI de batterie, temps réel sur smartphone PWA
**Stack:** HTML/CSS/JS vanilla, Web Audio API, IndexedDB, Service Worker (PWA)
**Déploiement:** GitHub Pages
**User:** Arnaud (producteur metalcore/djent, Tahiti)

**Phase actuelle:** Phases 1–3 terminées, Phase 4 (PWA polish) pending

| Phase | Statut | Contenu |
|-------|--------|---------|
| 1 — Audio POC | ✅ | Capture micro, onset detection (RMS + flux spectral), ZCR, heuristique 3 classes |
| 2 — ML Training | ✅ | KNN (K=3), z-score normalization, UI training, IndexedDB persistence |
| 3 — Export MIDI | ✅ | Tap tempo, click audio, décompte (4/8 temps), quantize + drift correction, preview, export .mid |
| 4 — PWA Polish | ⏳ | Icônes, splash screen, manifest complet |
| 5 — Extensions | ⏳ | Toms, double kick, détection basse (humming + pitch) |

---

## 2. GOD NODES (Composants les plus centraux)

| Node | Connexions | Rôle | Critique |
|------|-----------|------|---------|
| **src/ui.js** | 8 imports + DOM + callbacks | Orchestrateur central — UI, classification, noteHistory, export UI | OUI |
| **noteHistory** | drawNotes + recNotes + export | Buffer partagé entre timeline live, rec et export | OUI |
| **onOnset** | audio.js → ui.js (×2 callbacks) | Pont événementiel audio→classification+training | OUI |
| **src/audio.js** | Produit tous les onsets | Source unique de données audio | OUI |
| **src/midi.js** | Tap tempo + preview + export | Toute la logique musicale (tempo, click, quantize, MIDI) | OUI |
| **src/model.js** | KNN + MIDI_MAP + CLASSES | Classification ML + mapping MIDI | OUI |
| **src/storage.js** | IndexedDB wrapper | Persistence modèle KNN + samples drum .wav | MOYEN |
| **index.html** | Tous les IDs DOM | Définit la structure UI des 3 écrans | OUI |
| **sw.js** | Cache offline | PWA, cache-first, survie sans réseau | MOYEN |

---

## 3. GRAPHE D'IMPORTS

```
index.html
  └─ <script type="module"> src/ui.js

src/ui.js (orchestrateur)
  ├─ ← src/audio.js   : startMicrophone, onOnset, onRMS, setSensitivity,
  │                      setInputGain, recordSnapshot, getConfig, getMetrics
  ├─ ← src/model.js   : addTrainingSample, trainModel, predict, isModelTrained,
  │                      canTrain, getTrainingCounts, clearClassSamples,
  │                      clearTraining, serializeModel, deserializeModel,
  │                      CLASSES, MIN_SAMPLES
  ├─ ← src/midi.js    : tap, getBpm, getTapCount, resetTaps, startClick, stopClick,
  │                      isClickRunning, startCountdown, buildAndDownloadMidi,
  │                      previewNotes, stopPreview, applyQuantize
  └─ ← src/storage.js : saveModelData, loadModelData, saveDrumSample, loadDrumSamples

src/audio.js
  └─ ← src/ui.js  : log, flashOnset, drawWaveform   ⚠️ DÉPENDANCE CIRCULAIRE

src/midi.js
  └─ ← src/model.js : MIDI_MAP, CLASSES

src/model.js  → (aucun import)
src/storage.js → (aucun import)
sw.js          → (aucun import)
```

**⚠️ Dépendance circulaire :** `ui.js ↔ audio.js`. Fonctionne avec les modules ES (lazy resolution) mais les deux fichiers sont couplés. Si on extrait audio.js dans un Web Worker, il faudra découpler `log`/`flashOnset`/`drawWaveform`.

---

## 4. COMMUNAUTÉS FONCTIONNELLES

### Communauté A — Acquisition & Analyse Audio
**Fichier :** `src/audio.js`

**Chaîne Web Audio :**
```
getUserMedia() → MediaStreamSource → BiquadFilter(HP 80Hz) → GainNode → AnalyserNode
                                                                       ↓
                                                           MediaStreamDestination (recordSnapshot)
```
`analyser.smoothingTimeConstant = 0` (audio.js:81) — **Aucun lissage temporel → flux instantané**

**Constantes CONFIG (audio.js:16–23) :**
```javascript
CONFIG = {
  fftSize: 2048,              // ~46ms @ 44100 Hz
  rmsThreshold: 0.008,        // défaut sensitiv. 7/10 → courbe exp
  fluxThreshold: 0.006,       // défaut sensitiv. 7/10 → courbe exp
  minOnsetInterval: 40,       // ms anti-rebond (~16e @ 180 BPM)
  highpassFreq: 80,           // Hz coupe-souffle
  inputGain: 3.0,             // amplification micro (slider 1–10)
}
```

**Bandes spectrales (audio.js:165–179) :**
| Bande | Fréquences | Bins (@44100Hz) | Calcul avg |
|-------|-----------|----------------|-----------|
| low   | 80–600 Hz  | ~27 bins        | `lowE / (lowEnd-1)` |
| mid   | 600–4000 Hz| ~158 bins       | `midE / (midEnd-lowEnd)` |
| high  | 4000+ Hz   | ~856 bins       | `highE / (freqData.length-midEnd)` |

**ZCR (audio.js:184–188) :** Calculé sur **toute** la fenêtre 2048 samples.
→ Dilution intentionnelle : sons soutenus (china "tsss") ZCR haut (0.20–0.51), transitoires courts (kick/snare) ZCR bas (0.01–0.09)

**onsetData (audio.js:190–196) :**
```javascript
{
  timestamp,       // performance.now()
  rms,             // énergie générale
  spectralFlux,    // flux spectral positif
  lowAvg,          // avg énergie basse fréquence / bin
  midAvg,          // avg énergie médium / bin
  highAvg,         // avg énergie haute fréquence / bin
  zcr,             // zero-crossing rate pleine fenêtre
  mfcc: null,      // réservé Phase 5
}
```

**Fonctions exportées :**
- `startMicrophone()` (audio.js:51) — init getUserMedia + AudioContext
- `stopMicrophone()` (audio.js:101)
- `startAnalysisLoop()` (audio.js:109) — **BOUCLE PRINCIPALE 60 FPS** (privée)
- `setSensitivity(level)` (audio.js:37) — courbe exp rmsThreshold/fluxThreshold
- `setInputGain(g)` (audio.js:46)
- `onOnset(cb)` / `onRMS(cb)` (audio.js:33–34) — enregistrement callbacks
- `getMetrics()` (audio.js:31) — polling failsafe pour UI iOS
- `getConfig()` / `setConfig(k, v)` (audio.js:205–206)
- `recordSnapshot(durationMs)` (audio.js:210) — capture MediaRecorder + compte onsets

---

### Communauté B — Classification (Heuristique + KNN)

**B1 — Heuristique (ui.js:279–284) :**
```javascript
function classifyOnset({ lowAvg, midAvg, highAvg, zcr }) {
  if (zcr > 0.18) return 0;                                          // China
  if (highAvg > midAvg * 0.60 && midAvg > lowAvg * 0.70) return 1; // Snare burst+mid
  if (midAvg > lowAvg * 0.82) return 1;                             // Snare formant "a"
  return 2;                                                          // Kick
}
```
Calibré sur logs réels : china ZCR 0.20–0.51, kick ZCR 0.01–0.09, snare mid/low 0.693–0.931.
**Limite :** zones mid/low 0.69–0.84 partagées kick/snare → heuristique seule insuffisante pour cas limites.

**B2 — KNN ML (src/model.js) :**

```javascript
CLASSES = ['china', 'snare', 'kick']        // model.js:4
N_CLASSES = 3
MIN_SAMPLES = 5                             // minimum par classe pour entraîner
K = 3                                       // voisins KNN
```

**Features d'entrée (6 dimensions) :** `[lowAvg, midAvg, highAvg, zcr, rms, spectralFlux]`

**Pipeline KNN :**
```
onsetData → featuresFromOnset() → z-score normalize → kNN (K=3) → vote → {classIdx, className, confidence}
```

**Normalisation z-score :** calculée sur le training set complet à `trainModel()`. Chaque feature normalisée par `(v - mean[i]) / std[i]`.

**Seuil de confiance (ui.js:307) :** `confidence < 0.5` → onset ignoré (filtrage bruit)

**Cooldown par classe (ui.js:288) :**
```javascript
CLASS_COOLDOWN_MS = [200, 80, 40]  // China, Snare, Kick (ms)
```

**Fonctions model.js :**
- `featuresFromOnset(onset)` (model.js:23) — vecteur 6 dims
- `addTrainingSample(classIdx, onsetData)` (model.js:27)
- `trainModel()` (model.js:72) — calcule normStats + `isTrained = true`
- `predict(onsetData)` (model.js:78) — retourne `{classIdx, className, confidence}`
- `serializeModel()` / `deserializeModel()` (model.js:99–108) — pour IndexedDB
- `clearClassSamples(classIdx)` (model.js:31) — efface une classe, réinitialise `isTrained`
- `clearTraining()` (model.js:37) — reset complet

**Mode actif (ui.js:292) :**
```javascript
let mlMode = false;  // false = heuristique, true = KNN
```
→ passe à `true` automatiquement après `trainModel()` ou chargement IndexedDB au démarrage.

**Mapping MIDI (model.js:8–14) :**
```javascript
MIDI_MAP = {
  kick: 36,     // C1
  snare: 38,    // D1
  china: 52,    // GM Chinese Cymbal (E3)
  tom_low: 41, tom_mid: 45, tom_high: 48,  // réservé Phase 5
  crash: 49, ride: 51,                      // réservé Phase 5
}
```

---

### Communauté C — MIDI & Export
**Fichier :** `src/midi.js`

**C1 — Tap Tempo (midi.js:5–33) :**
```javascript
TAP_TIMEOUT_MS = 2500   // reset si silence > 2.5s entre taps
```
- `tap()` — push timestamp, calcule BPM moyen sur TOUS les intervalles (pas de max)
- `getBpm()` — retourne BPM arrondi ou null si < 2 taps
- `getTapCount()` / `resetTaps()`

**C2 — Click audio (midi.js:36–97) :**
- Click synthétique via Web Audio API (pas de fichier externe)
- `playClick(isAccent)` — accent à 1200 Hz, normal à 800 Hz, durée 60ms
- `startClick(bpm, onBeat)` — premier beat immédiat puis `setInterval`
- `stopClick()` — nettoie interval + timeout
- `isClickRunning()` — état boolean
- `startCountdown(bpm, beats, onTick, onDone)` — décompte N beats (4 ou 8) puis callback
  **beats param (ui.js:565) :** `countdownBeats = 4` par défaut, toggle 4/8 dans UI

**C3 — Sons synthétiques fallback (midi.js:99–158) :**
- `synthKick(ctx, t, vel)` — osc 160→40Hz + decay 0.45s
- `synthSnare(ctx, t, vel)` — bruit HP 1500Hz + ton 220Hz
- `synthChina(ctx, t, vel)` — bruit BP 8000Hz Q=0.8
- `SYNTH_FNS = [synthChina, synthSnare, synthKick]` — index = railIdx

**C4 — Sons statiques (.wav bundlés) (midi.js:160–174) :**
```javascript
STATIC_URLS = ['./SOUNDS/CHINA.wav', './SOUNDS/SNARE.wav', './SOUNDS/KICK.wav']
// ordre : [0]=china, [1]=snare, [2]=kick  ← identique à railIdx
staticBuffers = [null, null, null]  // AudioBuffer décodés, partagés entre previews
```
- `ensureStaticBuffers(ctx)` — chargement lazy, une seule fois

**Priorité sons :** user override > sons statiques bundlés > synth

**C5 — Quantize (midi.js:177–192, partagé preview+export) :**
```javascript
function applyQuantize(notes, bpm, quantize) {
  // 1. gridMs = beatMs/4 (16n) ou beatMs/8 (32n)
  // 2. drift correction : offset médian (compense latence systématique)
  // 3. snap au grid le plus proche
  // 4. dedup : si 2 notes même slot+railIdx, garde velocity max
}
```
- `getGridMs(bpm, grid)` — `'32n'` = beatMs/8, `'16n'` = beatMs/4
- `computeDriftCorrection(rawTimesMs, gridMs)` — médiane des signed offsets → corrige latence utilisateur

**C6 — Preview audio (midi.js:195–265) :**
- `previewNotes(notes, bpm, quantize, userBuffers, onProgress, onEnd, withClick)`
- `withClick = false` — si true, schedule des beeps metronome dans le **même AudioContext** (synchro parfaite)
- `stopPreview()` / `isPreviewRunning()`
- Progress callback toutes les 100ms

**C7 — Export MIDI (midi.js:269–365) :**
- `loadMidiWriter()` — charge midi-writer-js depuis CDN (lazy, une seule fois)
- `rmsToVelocity(rms, floor=0.01, ceiling=0.3, curve=0.7)` — courbe puissance x^0.7 → 20–127
- `buildAndDownloadMidi(noteHistory, bpm, options)` — PPQ=128, durée notes = T32 (drum style)
- Filename : `beatbox_${bpm}bpm_${date}.mid`

---

### Communauté D — Persistance (IndexedDB)
**Fichier :** `src/storage.js`

```javascript
DB_NAME = 'beatbox2midi'
DB_VERSION = 1
// Stores : 'samples' (keyPath: 'id', autoIncrement), 'settings' (keyPath: 'key')
```

| Clé settings | Type | Usage |
|-------------|------|-------|
| `'drum_china'` | ArrayBuffer | Sample .wav user China |
| `'drum_snare'` | ArrayBuffer | Sample .wav user Snare |
| `'drum_kick'`  | ArrayBuffer | Sample .wav user Kick |
| `'knn_model'`  | {samples, normStats, isTrained} | Modèle KNN sérialisé |

**Fonctions :**
- `saveDrumSample(className, arrayBuffer)` / `loadDrumSamples()` (storage.js:72–97)
- `saveModelData(data)` / `loadModelData()` (storage.js:100–120)
- `saveSample(classLabel, features)` / `getAllSamples()` / `clearSamples()` (storage.js:37–68) ← store 'samples' (features training, peu utilisé actuellement)

---

### Communauté E — UI & Orchestration
**Fichier :** `src/ui.js`

**Constantes globales :**
```javascript
APP_VERSION = 'v0.13.1'        // ui.js:3 — bumper à chaque modif
TIMELINE_MS = 2000              // ui.js:261 — fenêtre rolling (slider 0.5–6s)
MAX_HISTORY_MS = 300000         // ui.js:262 — 5 min — jamais purgé pendant rec
WAVEFORM_GAIN = 3.0             // ui.js:78 — amplification visuelle
MAX_LOG_LINES = 40              // ui.js:44
PRE_RECORD_MS = 5000            // ui.js:219 — snapshot Test 5s
```

**noteHistory (ui.js:264) :** `[{ time: performance.now(), velocity: rms, railIdx }]`
Structure centrale partagée :
- `drawNotes()` — lit pour affichage rolling (skip si age > TIMELINE_MS, purge si > MAX_HISTORY_MS sauf pendant rec)
- `startRec()` → `recStartTime = performance.now()`
- `stopRec()` → `recNotes = noteHistory.filter(n => n.time >= recStartTime)` — snapshot

**État Export Screen :**
```javascript
let currentBpm = null
let isRecording = false     // garde contre purge noteHistory dans drawNotes
let recStartTime = null
let recNotes = []           // snapshot au stopRec
let quantizeMode = 'none'   // 'none' | '16n' | '32n'
let countdownBeats = 4      // 4 ou 8 (toggle beats-btn)
let previewWithClick = false // toggle click pendant preview
let userDrumBuffers = {}    // { china?, snare?, kick? } ArrayBuffer (user override)
```

**Fonctions UI :**
- `log(message)` (ui.js:47) — console + DOM avec timestamp
- `flashOnset()` (ui.js:58) — flash visuel 80ms sur canvas
- `drawWaveform(dataArray)` (ui.js:80) — rendu waveform + gradient + glow
- `metricsLoop()` (ui.js:148) — polling rAF VU-meter + RMS/flux affichage
- `drawNotes()` (ui.js:468) — piano-roll canvas 60 FPS (3 rails)
- `classifyOnset()` (ui.js:279) — heuristique de fallback
- `updateTrainingUI()` (ui.js:321) — refresh compteurs samples + état bouton Entraîner
- `updateModeLabel()` (ui.js:340) — affiche "ML actif" ou "Heuristique"
- `updateBpmDisplay(bpm)` (ui.js:569)
- `applyManualBpm()` (ui.js:579) — saisie BPM manuelle (keydown desktop + change iOS)
- `startClickUi(bpm)` / `stopClickUi()` (ui.js:613–629)
- `startRec()` / `stopRec()` (ui.js:645–674)
- `setPreviewPlaying(playing)` (ui.js:743)

**Deux callbacks onOnset (ui.js:297–318) :**
1. Si `capturingClass >= 0` → `addTrainingSample(capturingClass, data)` + `updateTrainingUI()`
2. Toujours → classification (heuristique ou KNN) + cooldown + `noteHistory.push()`

---

### Communauté F — Service Worker & PWA
**Fichier :** `sw.js`

```javascript
CACHE_NAME = 'beatbox2midi-v31'   // sw.js:2 — sync avec APP_VERSION
```

**Assets cachés :** `./`, `./index.html`, `./manifest.json`, `./src/ui.js`, `./src/audio.js`, `./src/model.js`, `./src/midi.js`, `./src/storage.js`, `./SOUNDS/KICK.wav`, `./SOUNDS/SNARE.wav`, `./SOUNDS/CHINA.wav`

Stratégie : **cache-first**, fallback réseau, 503 si offline et absent du cache.
`self.skipWaiting()` + `self.clients.claim()` → activation immédiate.

**SOUNDS/ (bundlés) :**
| Fichier | railIdx | MIDI |
|---------|---------|------|
| SOUNDS/CHINA.wav | 0 | 52 |
| SOUNDS/SNARE.wav | 1 | 38 |
| SOUNDS/KICK.wav  | 2 | 36 |

---

## 5. CALL GRAPH COMPLET

```
index.html → ui.js (module)

ui.js INIT:
  ├─ screen nav (navButtons)
  ├─ startMicrophone() → btnMicStart
  ├─ metricsLoop() [rAF continu]
  ├─ drawNotes() [rAF continu] ← lit noteHistory
  ├─ loadModelData() [async] → deserializeModel() → mlMode = true si dispo
  ├─ loadDrumSamples() [async] → userDrumBuffers
  └─ onOnset callbacks x2 (capture training + classification)

audio.js RUNTIME [60 FPS]:
  tick()
  ├─ getByteTimeDomainData() → drawWaveform()      → ui.js
  ├─ RMS → rmsCallbacks                            → metricsLoop() ui.js
  ├─ Spectral flux calc
  └─ ONSET (si rms+flux > seuils && elapsed > 40ms):
      ├─ bandes spectrales (low/mid/high avg)
      ├─ ZCR calcul
      └─ onsetCallbacks.forEach()
           ├─ cb1 (training) : addTrainingSample()  → model.js
           └─ cb2 (classif)  : predict() ou classifyOnset()
                               → cooldown check
                               → noteHistory.push()

EXPORT FLOW:
  btnTap → tap() → getBpm() → updateBpmDisplay()
  bpmInput → applyManualBpm() → updateBpmDisplay()
  btnClick → startClick(bpm) → setInterval playClick()
  btnCountdownRec → startCountdown(bpm, beats) → [N beats] → startRec()
  btnStopRec → stopRec() → recNotes = noteHistory.filter(≥recStartTime)
  btnPreviewPlay → previewNotes(recNotes, bpm, q, userBuffers, ..., withClick)
  btnExport → buildAndDownloadMidi(recNotes, bpm, {quantize}) → .mid download
```

---

## 6. TOUS LES SEUILS & CONSTANTES

| Paramètre | Valeur | Fichier:Ligne | Notes |
|-----------|--------|--------------|-------|
| `APP_VERSION` | `'v0.13.3'` | ui.js:3 | Bumper à chaque modif |
| `CACHE_NAME` | `'beatbox2midi-v33'` | sw.js:2 | Sync avec APP_VERSION |
| `fftSize` | 2048 | audio.js:17 | Fenêtre FFT ~46ms @ 44100Hz |
| `rmsThreshold` | 0.008 | audio.js:18 | Default sensitiv. 7/10 |
| `fluxThreshold` | 0.006 | audio.js:19 | Default sensitiv. 7/10 |
| `minOnsetInterval` | 40 ms | audio.js:20 | Anti-rebond double kick |
| `highpassFreq` | 80 Hz | audio.js:21 | Coupe-souffle |
| `inputGain` | 3.0 | audio.js:22 | Slider 1–10× |
| `smoothingTimeConstant` | 0 | audio.js:81 | **Aucun lissage** |
| **ZCR seuil china** | **0.18** | **ui.js:280** | tch/ts → ZCR 0.20–0.51 |
| **Snare burst critère 1** | highAvg > midAvg×0.60 && midAvg > lowAvg×0.70 | ui.js:281 | |
| **Snare formant critère 2** | midAvg > lowAvg×0.82 | ui.js:282 | |
| `CLASS_COOLDOWN_MS[0]` | 200 ms | ui.js:288 | China (anti-triplette) |
| `CLASS_COOLDOWN_MS[1]` | 80 ms | ui.js:288 | Snare |
| `CLASS_COOLDOWN_MS[2]` | 40 ms | ui.js:288 | Kick (dr rapide métal) |
| `KNN K` | 3 | model.js:16 | Voisins KNN |
| `MIN_SAMPLES` | 5 | model.js:6 | Min par classe pour entraîner |
| Confiance min KNN | 0.5 | ui.js:307 | En dessous → onset ignoré |
| `TIMELINE_MS` | 2000 | ui.js:261 | Slider 0.5–6s |
| `MAX_HISTORY_MS` | 300000 | ui.js:262 | 5 min — non purgé pendant rec |
| `WAVEFORM_GAIN` | 3.0 | ui.js:78 | Amplif. visuelle canvas |
| `PRE_RECORD_MS` | 5000 | ui.js:219 | Snapshot test 5s |
| `TAP_TIMEOUT_MS` | 2500 | midi.js:5 | Reset taps si silence > 2.5s |
| `PPQ` | 128 | midi.js:325 | Ticks par noire (export MIDI) |
| `quantize grid 16n` | beatMs / 4 | midi.js:293 | |
| `quantize grid 32n` | beatMs / 8 | midi.js:293 | |
| `rmsToVelocity curve` | 0.7 | midi.js:286 | x^0.7 → nuances musicales |
| `rmsToVelocity floor` | 0.01 | midi.js:286 | |
| `rmsToVelocity ceiling` | 0.3 | midi.js:286 | |

---

## 7. CONNEXIONS IMPORTANTES

1. **⚠️ Dépendance circulaire audio.js ↔ ui.js** : audio.js importe `log`, `flashOnset`, `drawWaveform` depuis ui.js. Fonctionne en production (ES modules) mais risqué si on isole audio.js dans un Worker.

2. **classifyOnset() vit dans ui.js, pas model.js** : décision architecturale pour faciliter le remplacement par le KNN. La heuristique est un fallback, le KNN prend le dessus dès qu'entraîné.

3. **noteHistory comme source unique de vérité** : la timeline live, le compteur rec live, et le snapshot export lisent tous le même tableau. Pas de double-buffering, ce qui implique que `isRecording` doit être vrai avant de purger (`drawNotes` l.475).

4. **staticBuffers partagés** : les AudioBuffers des SOUNDS/*.wav sont gardés en mémoire entre previews. Si `previewCtx` est fermé entre deux previews, les buffers restent valides (ils sont indépendants du contexte).

5. **Preview click dans même AudioContext** : le click de métronome pendant la preview est schedulé dans le même `previewCtx` que les drums → synchro parfaite sans drift inter-contextes.

6. **Drift correction quantize** : `computeDriftCorrection` calcule la médiane des offsets par rapport à la grille. Si l'utilisateur joue systématiquement 30ms après le click, tous les timestamps sont décalés de -30ms avant snap → correction latence humaine/réseau.

7. **userDrumBuffers override** : chargés depuis IndexedDB au démarrage, remplacent les staticBuffers dans previewNotes ET sont passés à buildAndDownloadMidi (pour la preview seulement, l'export .mid ne contient que les timestamps/pitches, pas l'audio).

---

## 8. NUMÉROS DE LIGNE CLÉS

| Concept | Fichier | Ligne(s) |
|---------|---------|---------|
| APP_VERSION | ui.js | 3 |
| CACHE_NAME | sw.js | 2 |
| CONFIG thresholds | audio.js | 16–23 |
| Sensitivity curve | audio.js | 37–43 |
| Analysis loop | audio.js | 109–203 |
| Spectral bands | audio.js | 165–168 |
| ZCR calculation | audio.js | 184–188 |
| onsetData object | audio.js | 190–196 |
| recordSnapshot() | audio.js | 210–235 |
| drawWaveform() | ui.js | 80–140 |
| metricsLoop() | ui.js | 148–184 |
| MAX_HISTORY_MS | ui.js | 262 |
| classifyOnset() | ui.js | 279–284 |
| CLASS_COOLDOWN_MS | ui.js | 288 |
| mlMode variable | ui.js | 292 |
| onOnset callback #1 (training) | ui.js | 297–300 |
| onOnset callback #2 (classif) | ui.js | 303–318 |
| updateTrainingUI() | ui.js | 321–338 |
| drawNotes() | ui.js | 468–529 |
| isRecording guard (purge) | ui.js | 475–479 |
| bpmDisplay refs | ui.js | 541–556 |
| countdownBeats / previewWithClick | ui.js | 565–566 |
| startRec() | ui.js | 645–658 |
| stopRec() | ui.js | 660–674 |
| quantize handler [data-q] | ui.js | 703–709 |
| beats-btn handler | ui.js | 712–718 |
| previewWithClick handler | ui.js | 720–727 |
| CLASSES / MIDI_MAP | model.js | 4–14 |
| featuresFromOnset() | model.js | 23–25 |
| trainModel() | model.js | 72–76 |
| predict() | model.js | 78–96 |
| serializeModel() | model.js | 99–101 |
| TAP_TIMEOUT_MS | midi.js | 5 |
| tap() | midi.js | 9–17 |
| startCountdown(bpm,beats,...) | midi.js | 80–97 |
| STATIC_URLS / staticBuffers | midi.js | 162–163 |
| applyQuantize() | midi.js | 177–192 |
| computeDriftCorrection() | midi.js | 299–306 |
| previewNotes() withClick | midi.js | 198 / 220–238 |
| buildAndDownloadMidi() | midi.js | 313–365 |
| saveDrumSample() | storage.js | 72–81 |
| loadDrumSamples() | storage.js | 83–97 |
| saveModelData() | storage.js | 100–109 |
| loadModelData() | storage.js | 111–120 |

---

## 9. VERSIONING — RÈGLE

**À chaque modif, bumper TROIS endroits :**
1. `APP_VERSION` dans `src/ui.js:3` → format semver patch
2. Version hardcodée dans `index.html` → `<span id="app-version">vX.Y.Z</span>` (visible même sans JS)
3. `CACHE_NAME` dans `sw.js:2` → suffixe numérique incrémental
4. `git tag vX.Y.Z && git push --tags`

**Pourquoi le double :** la ligne JS `document.getElementById('app-version').textContent = APP_VERSION` est à ui.js:10, tout en haut. Mais le HTML hardcode la version en backup absolu — si le module entier crashe, la version reste affichée.

**Historique :**
| Version | SW Cache | Changements |
|---------|---------|-------------|
| v0.9–v0.9.10 | v9–v18 | POC audio, heuristique 3 classes, ZCR tuning |
| v0.10.0 | v19 | Phase 2 : KNN training UI + IndexedDB |
| v0.11.0–v0.11.2 | v20–v22 | Phase 3 : tap tempo, click, countdown, export MIDI |
| v0.12.0 | v23 | BPM manuel, preview audio (synth), progress bar |
| v0.12.1 | v24 | Fix BPM manuel iOS (change event) |
| v0.12.2 | v25–v29 | Sons .wav SOUNDS/ intégrés (KICK/SNARE/CHINA) |
| v0.12.3 | — | Fix rec : no purge noteHistory pendant rec, MAX_HISTORY 5min |
| v0.13.0 | v30 | Décompte 4/8 temps + click optionnel pendant preview |
| v0.13.1 | v31 | Fix sélecteur quantize `[data-q]` (restaure versioning) |
| v0.13.2 | v32 | Fix conflits boutons : `seg-btn` pour beats/click, `q-btn` restauré |
| v0.13.3 | v33 | Fix versioning définitif : hardcodé HTML + JS en ligne 10 (avant tout crash possible) |

---

## 10. QUESTIONS UTILES POUR LA PROCHAINE SESSION

- Comment ajouter une 4e classe (tom ou crash) ? → `CLASSES`, `MIDI_MAP`, `RAIL_NAMES`, `RAIL_COLORS`, `CLASS_COOLDOWN_MS`, `railLabels`/`railColors` dans `drawNotes()`
- Double kick à 180 BPM → `minOnsetInterval` (audio.js:20) à descendre sous 40ms, surveiller `CLASS_COOLDOWN_MS[2]`
- Ajouter l'export quantize dans le nom du fichier .mid → `buildAndDownloadMidi` midi.js:313
- Phase 4 PWA : icônes manquantes dans `manifest.json`, splash screen iOS
- Découpler la dépendance circulaire audio.js ↔ ui.js → passer un EventEmitter ou postMessage si Web Worker
