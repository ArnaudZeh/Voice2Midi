# Beatbox2MIDI

Transforme ton beatbox en MIDI directement depuis ton téléphone. Gratuit, open source, 100% offline une fois chargé.

## Pourquoi

Dubler 2 c'est cool mais payant (249 $) et nécessite un micro dynamique. Ce projet vise le même workflow — beatbox → MIDI → VST de batterie dans ton DAW — mais gratuit et depuis ton téléphone.

## Comment ça marche

1. Tu ouvres l'app sur ton tel (c'est une PWA, tu l'installes sur ton écran d'accueil)
2. **Train** : tu fais chaque son (kick, snare, hat…) ~15 fois, l'app apprend ta voix
3. **Jam** : tu tap-tempo, tu beatbox un pattern, l'app transcrit en temps réel
4. **Export** : tu télécharges le `.mid`, tu l'envoies sur ton PC (Syncthing/AirDrop/email)
5. Tu l'importes dans ton DAW (Reaper / Ableton / FL / Logic), tu colles ton VST de batterie, c'est fini

## Setup

### Installation (utilisateur)
Ouvre [URL GitHub Pages] sur ton tel → "Ajouter à l'écran d'accueil" dans le menu du navigateur.

### Setup Reaper (Windows)
Voir [docs/reaper-setup.md](docs/reaper-setup.md) pour l'auto-import via Syncthing + ReaScript.

## Stack

- HTML/CSS/JS vanilla
- Web Audio API (capture micro)
- [Meyda.js](https://meyda.js.org/) (features audio)
- [TensorFlow.js](https://www.tensorflow.org/js) (ML en navigateur)
- [midi-writer-js](https://github.com/grimmdude/MidiWriterJS) (export MIDI)

Aucun backend. Aucune donnée envoyée quelque part. Ton modèle entraîné reste sur ton tel.

## Dev

Voir [CLAUDE.md](CLAUDE.md) pour le contexte projet complet, roadmap, défis techniques.

## Licence

MIT — fais ce que tu veux avec.
