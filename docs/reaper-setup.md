# Setup Reaper (Windows) — Auto-import MIDI depuis ton tel

L'idée : créer un dossier partagé entre ton tel et ton PC Windows. Dès que tu exportes un `.mid` depuis l'app, il arrive sur ton PC en quelques secondes et Reaper l'importe tout seul dans ta session.

## Option 1 — Syncthing (recommandé)

Gratuit, open source, chiffré, P2P (pas de cloud). Marche sur wifi local ou à distance.

### Installation

**Sur PC Windows**
1. Télécharge [SyncTrayzor](https://github.com/canton7/SyncTrayzor/releases) (client Syncthing le plus user-friendly pour Windows)
2. Installe et lance
3. Dans l'interface web qui s'ouvre, note ton **Device ID** (section "This Device")
4. Crée un dossier partagé, par exemple `C:\Users\Arnaud\beatbox-exports\`

**Sur ton téléphone**
1. Installe l'app **Syncthing** (Android Play Store) ou **Möbius Sync** (iOS App Store, Syncthing n'est pas natif iOS)
2. Dans l'app, ajoute ton PC via son Device ID
3. Ajoute le dossier partagé, choisis un emplacement local sur ton tel
4. Accepte la demande de partage qui apparaît côté PC

Une fois setup : tout fichier dans ce dossier sur ton tel apparaît sur ton PC en ~2-5 sec.

### Workflow

Dans l'app Beatbox2MIDI, quand tu exportes un .mid, enregistre-le dans ton dossier Syncthing. Il arrive direct sur le PC.

## Option 2 — Alternatives rapides (si Syncthing te soûle)

- **LocalSend** (gratuit, multiplateforme, simple) — pour envois ponctuels via wifi local
- **Email à toi-même** — basique mais ça marche
- **Google Drive / Dropbox** — si tu as déjà configuré

## ReaScript auto-import (v2, optionnel)

Quand la Phase 1 est stable, on pourra ajouter un script Lua pour Reaper qui watch le dossier et importe automatiquement.

Principe :

```lua
-- auto_import_midi.lua (squelette, à développer)
local watch_folder = "C:\\Users\\Arnaud\\beatbox-exports\\"
local seen_files = {}

function scan_folder()
  -- List .mid files in folder
  -- For each new file not in seen_files:
  --   reaper.InsertMedia(filepath, 0)
  --   seen_files[filepath] = true
  reaper.defer(scan_folder)
end

scan_folder()
```

À lancer via `Actions > Load ReaScript` dans Reaper, ou mettre dans le dossier startup.

## Tips Reaper pour drums MIDI

1. **Track dédiée drums** : FX → VST de batterie (Superior Drummer 3, GGD, EZDrummer, Addictive Drums…)
2. **Map GM** : l'app exporte en GM Drums Map par défaut (kick=C1, snare=D1, hat=F#1). Vérifie que ton VST est en mode GM ou remappe.
3. **Quantize** : dans Reaper, sélectionne les notes MIDI → `Shift+Q` pour quantize à 16e/32e
4. **Humanize** : pour éviter le côté robotique, `Menu Edit > Humanize` avec velocity/timing légers
