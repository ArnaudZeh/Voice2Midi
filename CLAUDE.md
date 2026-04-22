# CLAUDE.md — Beatbox2MIDI

Contexte projet pour Claude Code. Lis ce fichier en premier à chaque session.

## Qui je suis

Arnaud, producteur et consultant marketing digital basé à Tahiti. Je fais de la musique (metalcore/djent principalement, aussi des beats latinos) et je bosse sur Reaper sur Windows à la maison. Parle-moi en français, tutoiement toujours.

## Ce qu'on construit

Une app web (PWA) qui transforme mon beatbox en MIDI pour batterie, utilisable depuis mon téléphone. Inspiré de Dubler 2 mais gratuit, open source, et exécuté 100% côté client.

**Objectif final v1** : je beatbox sur mon tel, j'exporte un .mid, il arrive dans Reaper sur mon PC Windows, je lance un VST de batterie (GetGood Drums / Superior Drummer) dessus.

**Objectif long terme** : ajouter une détection de basse (humming + pitch detection) pour pouvoir créer des démos batterie+basse en quelques minutes.

## Contraintes non négociables

- **Gratuit end-to-end** — hébergement GitHub Pages, pas de backend, pas de compte utilisateur, pas d'API payante
- **Tout client-side** — training et inférence du modèle tournent dans le navigateur du tel, aucune donnée envoyée quelque part
- **Pas de micro spécifique** — doit marcher avec le micro du téléphone et n'importe quel casque
- **PWA installable** — pour un accès rapide depuis l'écran d'accueil, fonctionnement offline une fois chargée
- **Windows-friendly workflow** — l'export doit arriver facilement dans Reaper sur PC (Syncthing recommandé)

## Stack technique

- **HTML/CSS/JS vanilla** — pas de framework, on garde léger
- **Web Audio API** + `getUserMedia()` pour capter le micro
- **[Meyda.js](https://meyda.js.org/)** pour extraire les features audio (MFCC, spectral centroid, ZCR, RMS)
- **[TensorFlow.js](https://www.tensorflow.org/js)** pour le modèle de classification (entraîné dans le navigateur)
- **[midi-writer-js](https://github.com/grimmdude/MidiWriterJS)** pour générer les .mid
- **Service Worker** pour PWA + cache offline
- **GitHub Pages** pour l'hébergement

## Architecture actuelle

```
beatbox2midi/
├── CLAUDE.md              ← ce fichier
├── README.md              ← doc utilisateur + setup Reaper/Syncthing
├── index.html             ← UI (3 écrans : Train / Jam / Export)
├── manifest.json          ← PWA manifest
├── sw.js                  ← service worker
├── src/
│   ├── audio.js           ← capture micro + onset detection (Meyda)
│   ├── model.js           ← TF.js training + inference
│   ├── midi.js            ← export .mid
│   ├── ui.js              ← gestion UI (screens, boutons, feedback)
│   └── storage.js         ← sauvegarde du modèle entraîné (IndexedDB)
└── docs/
    └── reaper-setup.md    ← guide Syncthing + ReaScript auto-import
```

## Pipeline audio

1. `getUserMedia()` → `AudioContext` → `AnalyserNode`
2. High-pass filter à 80 Hz pour couper le souffle
3. Noise gate adaptatif (seuil calibré au démarrage)
4. **Onset detection** : flux spectral via Meyda (`spectralFlux` + `rms`). Quand l'énergie + le flux dépassent un seuil, on déclenche un event "onset"
5. À chaque onset : fenêtre de 30-50ms → extraction features (13 MFCC + centroid + rolloff + ZCR + RMS)
6. Inférence TF.js → classe prédite + confidence score
7. Si confidence > seuil, on ajoute l'événement au buffer (timestamp + classe + velocity dérivée du RMS)

## Modèle ML

- **Type** : petit MLP (ou KNN pour v1 ultra-simple)
- **Input** : ~17 features par onset (13 MFCC + 4 spectrales)
- **Output** : softmax sur N classes (4 en v1 : kick, snare, hihat_closed, hihat_open)
- **Training** : user-driven, 15-20 exemples par classe, entraînement dans le navigateur (<30 sec)
- **Persistance** : modèle sauvegardé en IndexedDB (survit aux reloads)

**Mapping GM Drums par défaut** :
- kick → MIDI 36 (C1)
- snare → MIDI 38 (D1)
- hihat_closed → MIDI 42 (F#1)
- hihat_open → MIDI 46 (A#1)

Extensible plus tard : tom_low (41), tom_mid (45), tom_high (48), crash (49), ride (51).

## Export MIDI

- Format : Standard MIDI File type 0 ou 1
- Tempo : tap-tempo au début du jam (2-4 taps → bpm moyen)
- Quantization : optionnelle, snap sur 16e (défaut) ou 32e
- Velocity : mapping non-linéaire RMS → 0-127 (courbe type x^0.7 pour rendre les nuances musicales)
- Téléchargement : `Blob` → `<a download>` → déclenche le share sheet iOS/Android

## Workflow Reaper (Windows)

Cf. `docs/reaper-setup.md`. Idée : Syncthing sync un dossier `~/beatbox-exports/` entre tel et PC. ReaScript Lua watch le dossier, auto-import nouveaux .mid dans la session active.

## Roadmap

### Phase 1 — POC audio (en cours)
- [ ] Capture micro + onset detection fiable (visualisation des onsets détectés)
- [ ] Tester latence sur iOS Safari et Android Chrome
- [ ] Tuning des seuils (énergie, flux spectral) pour éviter faux positifs (souffle, bruit ambiant)

### Phase 2 — Classification + training
- [ ] UI "Train mode" : 4 classes, 15 exemples par classe, visualisation des features
- [ ] Entraînement MLP TF.js
- [ ] Persistance IndexedDB
- [ ] "Jam mode" : inférence temps réel avec preview audio (808 samples)

### Phase 3 — Export + intégration Reaper
- [ ] Tap tempo
- [ ] Quantize toggle
- [ ] Export .mid
- [ ] Doc Syncthing + ReaScript pour auto-import

### Phase 4 — PWA + polish
- [ ] Service worker cache offline
- [ ] Manifest + icônes
- [ ] Installation sur écran d'accueil iOS/Android
- [ ] Mode sombre (par défaut)

### Phase 5 — Extensions futures
- [ ] Plus de classes (toms, crashes, rides)
- [ ] Double kick detection (important pour metalcore/djent, tester à 180+ bpm)
- [ ] Détection de basse par humming + pitch detection (Pitchy.js / CREPE.js)
- [ ] Preset "Arnaud" exportable/importable

## Défis techniques identifiés

1. **Latence iOS Safari** — variable, à mesurer. Si > 80ms en jam mode, fallback sur "record then convert" (offline) au lieu du temps réel
2. **Souffle** — noise gate obligatoire sinon chaque respiration = faux kick
3. **Double kick rapide** — onset detector doit tenir des 16e à 180 bpm (fenêtre minimum ~30ms entre onsets)
4. **Velocity musicale** — linéaire RMS→127 sonne plat, courbe de puissance nécessaire
5. **Calibration micro** — chaque micro/tel capte différemment, d'où training perso systématique

## Style de code

- JS moderne (ES2020+), modules ESM, pas de bundler pour l'instant (import direct)
- Pas de dépendances npm au début — tout via CDN (unpkg/jsdelivr)
- Fonctions pures quand possible, séparation claire audio/model/midi/ui
- Commentaires en français, noms de variables en anglais
- Console.log verbeux en dev (on virera pour la v1 propre)

## Ce qu'il ne faut PAS faire

- Ne pas partir sur React/Vue/Svelte pour l'instant — overkill
- Ne pas ajouter de backend, même "juste pour logger"
- Ne pas implémenter la basse avant que la batterie marche bien
- Ne pas over-engineer le modèle ML — un KNN ou MLP à 2 couches suffit largement
- Ne pas me faire des commits énormes, je préfère itérer petit

## Commandes utiles

Dev local (pour tester avant de push) :
```bash
# Serveur HTTPS local (obligatoire pour getUserMedia)
npx serve -l 3000 --ssl-cert
# ou simplement ouvrir via GitHub Pages direct
```

Push :
```bash
git add . && git commit -m "message" && git push
```

GitHub Pages s'update tout seul en 1-2 min après le push.
