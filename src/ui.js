// src/ui.js
// Gestion UI : navigation écrans, visualisation, logs
export const APP_VERSION = 'v0.12.3'; // à bumper à chaque modif (format semver patch)
import { startMicrophone, onOnset, onRMS, setSensitivity, setInputGain, recordSnapshot, getConfig, getMetrics } from './audio.js';
import { addTrainingSample, trainModel, predict, isModelTrained, canTrain, getTrainingCounts, clearClassSamples, clearTraining, serializeModel, deserializeModel, CLASSES, MIN_SAMPLES } from './model.js';
import { saveModelData, loadModelData } from './storage.js';
import { tap, getBpm, getTapCount, resetTaps, startClick, stopClick, isClickRunning, startCountdown, buildAndDownloadMidi, previewNotes, stopPreview, applyQuantize } from './midi.js';
import { saveDrumSample, loadDrumSamples } from './storage.js';

// Navigation entre écrans
const navButtons = document.querySelectorAll('nav button');
const screens = document.querySelectorAll('.screen');

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.screen;
    navButtons.forEach(b => b.classList.toggle('active', b === btn));
    screens.forEach(s => s.classList.toggle('active', s.id === `screen-${target}`));
  });
});

// Bouton activation micro
const btnMicStart = document.getElementById('btnMicStart');
const micStatus = document.getElementById('micStatus');

btnMicStart.addEventListener('click', async () => {
  btnMicStart.disabled = true;
  btnMicStart.textContent = 'Initialisation...';
  const ok = await startMicrophone();
  if (ok) {
    btnMicStart.textContent = 'Micro actif ✓';
    micStatus.textContent = 'En écoute — fais un son';
    micStatus.style.color = 'var(--accent)';
  } else {
    btnMicStart.disabled = false;
    btnMicStart.textContent = 'Réessayer';
    micStatus.textContent = 'Erreur — vérifie les permissions';
    micStatus.style.color = 'var(--danger)';
  }
});

// Logs
const logEl = document.getElementById('log');
const MAX_LOG_LINES = 40;
const logLines = [];

export function log(message) {
  const time = new Date().toLocaleTimeString('fr-FR', { hour12: false });
  logLines.push(`[${time}] ${message}`);
  if (logLines.length > MAX_LOG_LINES) logLines.shift();
  logEl.textContent = logLines.join('\n');
  logEl.scrollTop = logEl.scrollHeight;
  console.log(message);
}

// Flash onset
const onsetFlash = document.getElementById('onsetFlash');
export function flashOnset() {
  onsetFlash.classList.add('active');
  setTimeout(() => onsetFlash.classList.remove('active'), 80);
}

// Visualisation waveform sur canvas
const canvas = document.getElementById('visualizerCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Gain visuel : amplifie l'amplitude affichée pour rendre les sons soft lisibles
const WAVEFORM_GAIN = 3.0;

export function drawWaveform(dataArray) {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const mid = h / 2;

  // Fond — un chouïa plus opaque pour contraste
  ctx.fillStyle = 'rgba(31, 31, 31, 0.45)';
  ctx.fillRect(0, 0, w, h);

  // Ligne centrale discrète
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();

  const sliceWidth = w / dataArray.length;

  // 1er passage : fill gradient sous la courbe
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, 'rgba(0, 229, 160, 0.35)');
  gradient.addColorStop(0.5, 'rgba(0, 229, 160, 0.12)');
  gradient.addColorStop(1, 'rgba(0, 229, 160, 0.0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  let x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const centered = (dataArray[i] - 128) / 128; // -1 à 1
    const amplified = Math.max(-1, Math.min(1, centered * WAVEFORM_GAIN));
    const y = mid + amplified * mid;
    ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.lineTo(w, mid);
  ctx.closePath();
  ctx.fill();

  // 2e passage : ligne épaisse + glow
  ctx.shadowColor = '#00e5a0';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#00e5a0';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const centered = (dataArray[i] - 128) / 128;
    const amplified = Math.max(-1, Math.min(1, centered * WAVEFORM_GAIN));
    const y = mid + amplified * mid;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// VU-meter + live metrics via POLLING (plus fiable que le callback onRMS)
const rmsMeter = document.getElementById('rmsMeter');
const metricsEl = document.getElementById('liveMetrics');
let rmsSmoothed = 0;
let peakRms = 0, peakFlux = 0, peakSince = 0;

function metricsLoop() {
  requestAnimationFrame(metricsLoop);
  const m = getMetrics();
  const { rms, flux, frameCount } = m;

  // VU-meter
  rmsSmoothed = Math.max(rms, rmsSmoothed * 0.85);
  const normalized = Math.min(1, Math.pow(rmsSmoothed * 6, 0.6));
  if (rmsMeter) rmsMeter.style.height = `${normalized * 100}%`;

  // Peak-hold 500ms
  const now = performance.now();
  if (now - peakSince > 500) {
    peakRms = rms; peakFlux = flux; peakSince = now;
  } else {
    peakRms = Math.max(peakRms, rms);
    peakFlux = Math.max(peakFlux, flux);
  }

  if (metricsEl) {
    if (frameCount === 0) {
      metricsEl.innerHTML = '<span class="ko">En attente du micro…</span>';
    } else {
      const cfg = getConfig();
      const rmsOk = peakRms > cfg.rmsThreshold;
      const fluxOk = peakFlux > cfg.fluxThreshold;
      metricsEl.innerHTML =
        `<span class="${rmsOk ? 'ok' : 'ko'}">RMS ${peakRms.toFixed(4)}</span> ` +
        `<span class="sep">/</span> ` +
        `<span class="${fluxOk ? 'ok' : 'ko'}">Flux ${peakFlux.toFixed(4)}</span> ` +
        `<span class="sep">· seuils</span> ` +
        `${cfg.rmsThreshold.toFixed(4)} / ${cfg.fluxThreshold.toFixed(4)} ` +
        `<span class="sep">· frames</span> ${frameCount}`;
    }
  }
}
metricsLoop();

// Slider sensibilité
const sensSlider = document.getElementById('sensSlider');
const sensValue = document.getElementById('sensValue');
if (sensSlider) {
  const applySens = (v) => {
    setSensitivity(v);
    sensValue.textContent = v;
  };
  applySens(parseInt(sensSlider.value, 10));
  sensSlider.addEventListener('input', (e) => applySens(parseInt(e.target.value, 10)));
}

// Slider gain micro
const gainSlider = document.getElementById('gainSlider');
const gainValue = document.getElementById('gainValue');
if (gainSlider) {
  const applyGain = (v) => {
    setInputGain(v);
    gainValue.textContent = `${v}×`;
  };
  applyGain(parseFloat(gainSlider.value));
  gainSlider.addEventListener('input', (e) => applyGain(parseFloat(e.target.value)));
}

// Compteur d'onsets
let onsetCount = 0;
onOnset(() => { onsetCount++; });

// ——— Pré-enregistrement 5s ———
const btnPreRecord = document.getElementById('btnPreRecord');
const preRecordStatus = document.getElementById('preRecordStatus');
const preRecordPlayback = document.getElementById('preRecordPlayback');
const preRecordSummary = document.getElementById('preRecordSummary');
const PRE_RECORD_MS = 5000;

if (btnPreRecord) {
  btnPreRecord.addEventListener('click', async () => {
    btnPreRecord.disabled = true;
    preRecordSummary.textContent = '';
    preRecordPlayback.removeAttribute('src');
    preRecordPlayback.style.display = 'none';

    // Countdown visuel
    const total = PRE_RECORD_MS / 1000;
    let remaining = total;
    preRecordStatus.textContent = `Enregistrement… ${remaining}s`;
    btnPreRecord.classList.add('recording');
    const tick = setInterval(() => {
      remaining -= 1;
      preRecordStatus.textContent = `Enregistrement… ${remaining}s`;
    }, 1000);

    try {
      const { blob, onsetsDuringRecord } = await recordSnapshot(PRE_RECORD_MS);
      clearInterval(tick);
      const url = URL.createObjectURL(blob);
      preRecordPlayback.src = url;
      preRecordPlayback.style.display = 'block';
      preRecordStatus.textContent = 'Enregistrement prêt — écoute ci-dessous';
      preRecordSummary.textContent =
        `${onsetsDuringRecord.length} onset${onsetsDuringRecord.length > 1 ? 's' : ''} détecté${onsetsDuringRecord.length > 1 ? 's' : ''} en ${(PRE_RECORD_MS/1000)}s · taille ${(blob.size/1024).toFixed(1)} KB`;
      log(`Pré-enregistrement terminé : ${onsetsDuringRecord.length} onsets`);
    } catch (err) {
      clearInterval(tick);
      preRecordStatus.textContent = `Erreur : ${err.message}`;
      log(`Pré-enregistrement erreur : ${err.message}`);
    } finally {
      btnPreRecord.classList.remove('recording');
      btnPreRecord.disabled = false;
    }
  });
}

// ——— Timeline MIDI rolling (affiche les onsets comme notes sur piano-roll) ———
const notesCanvas = document.getElementById('notesCanvas');
let TIMELINE_MS = 2000;         // fenêtre affichée — contrôlée par le slider zoom
const MAX_HISTORY_MS = 300000;  // 5 min — assez large pour couvrir n'importe quelle session
const noteHistory = [];         // { time, velocity, railIdx }

// Heuristique v0.9.10 — calibré sur 3 sessions de logs réels
// tch/ts (china)   : ZCR 0.20–0.51
// tou/dou/dr (kick): ZCR 0.01–0.09, high/mid max=0.644, mid/low max=0.843
// ka/ta/pa (snare) : ZCR 0.02–0.08, high/mid max=0.546, mid/low 0.693–0.931
//
// LIMITE HEURISTIQUE : zones mid/low 0.69–0.84 partagées entre kick et snare.
// Seuil 0.82 = meilleur compromis (2 snare gagnées, 2 kicks faux positifs rares).
// Séparation fiable requiert Phase 2 ML (training utilisateur).
//
// china (0) : ZCR > 0.18
// snare (1) : ka/ta/pa — deux critères en union :
//   • burst "k/t" + mid présent : high/mid > 0.60 ET mid/low > 0.70
//   • formant "a" dominant      : mid/low > 0.82
// kick  (2) : tou/dou/dr — défaut
function classifyOnset({ lowAvg, midAvg, highAvg, zcr }) {
  if (zcr > 0.18) return 0;                                          // China
  if (highAvg > midAvg * 0.60 && midAvg > lowAvg * 0.70) return 1; // Snare — burst + mid
  if (midAvg > lowAvg * 0.82) return 1;                             // Snare — formant "a"
  return 2;                                                          // Kick
}

// Cooldown par classe
const lastClassTime = [0, 0, 0];
const CLASS_COOLDOWN_MS = [200, 80, 40]; // China (200ms anti-triplette), Snare, Kick

const RAIL_NAMES = ['China', 'Snare', 'Kick'];
const RAIL_COLORS = ['#ffb020', '#ff3b5c', '#4f9dff'];
let mlMode = false;          // false = heuristique, true = KNN
let capturingClass = -1;     // classIdx en cours de capture (-1 = inactif)

// ——— Capture training ———
onOnset((data) => {
  if (capturingClass < 0) return;
  addTrainingSample(capturingClass, data);
  updateTrainingUI();
});

// ——— Classification (heuristique ou ML) ———
onOnset((data) => {
  let railIdx;
  if (mlMode && isModelTrained()) {
    const result = predict(data);
    if (!result || result.confidence < 0.5) return;
    railIdx = result.classIdx;
  } else {
    railIdx = classifyOnset(data);
  }
  const now = data.timestamp;
  if (now - lastClassTime[railIdx] < CLASS_COOLDOWN_MS[railIdx]) return;
  lastClassTime[railIdx] = now;
  noteHistory.push({ time: now, velocity: data.rms, railIdx });
  const suffix = mlMode ? ` (ML)` : '';
  log(`  → ${RAIL_NAMES[railIdx]}${suffix}`);
});

// ——— UI Training ———
function updateTrainingUI() {
  const counts = getTrainingCounts();
  CLASSES.forEach((cls, i) => {
    const el = document.getElementById(`count-${cls}`);
    if (el) el.textContent = `${counts[i]} sample${counts[i] > 1 ? 's' : ''}`;
  });
  const btnTrain = document.getElementById('btnTrain');
  if (btnTrain) {
    const ready = canTrain();
    const alreadyTrained = isModelTrained();
    btnTrain.disabled = !ready;
    if (!ready) {
      btnTrain.textContent = `Entraîner (min ${MIN_SAMPLES}/classe · ${counts.join('/')})`;
    } else {
      btnTrain.textContent = alreadyTrained ? `Ré-entraîner (${counts.join('/')} samples)` : 'Entraîner le modèle';
    }
  }
}

function updateModeLabel() {
  const el = document.getElementById('modeLabel');
  if (!el) return;
  el.textContent = mlMode ? '🤖 ML actif' : '📐 Heuristique';
  el.style.color = mlMode ? 'var(--accent)' : 'var(--text-dim)';
}

// Boutons Rec par classe
CLASSES.forEach((cls, idx) => {
  const btn = document.getElementById(`rec-${cls}`);
  const card = document.getElementById(`tc-${cls}`);
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (capturingClass === idx) {
      // Stop
      capturingClass = -1;
      btn.textContent = '● Rec';
      btn.classList.remove('recording');
      if (card) card.classList.remove('recording');
    } else {
      // Stop le précédent s'il y en a un
      if (capturingClass >= 0) {
        const prevBtn = document.getElementById(`rec-${CLASSES[capturingClass]}`);
        const prevCard = document.getElementById(`tc-${CLASSES[capturingClass]}`);
        if (prevBtn) { prevBtn.textContent = '● Rec'; prevBtn.classList.remove('recording'); }
        if (prevCard) prevCard.classList.remove('recording');
      }
      capturingClass = idx;
      btn.textContent = '■ Stop';
      btn.classList.add('recording');
      if (card) card.classList.add('recording');
    }
  });
});

// Bouton Entraîner
const btnTrain = document.getElementById('btnTrain');
if (btnTrain) {
  btnTrain.addEventListener('click', async () => {
    try {
      trainModel();
      mlMode = true;
      updateModeLabel();
      updateTrainingUI();
      await saveModelData(serializeModel());
      log(`Modèle KNN entraîné (${getTrainingCounts().join('/')} samples). Mode ML actif.`);
    } catch (err) {
      log(`Erreur training : ${err.message}`);
    }
  });
}

// Boutons × par classe (efface seulement cette classe, garde les autres)
CLASSES.forEach((cls, idx) => {
  const btn = document.getElementById(`clear-${cls}`);
  if (!btn) return;
  btn.addEventListener('click', () => {
    clearClassSamples(idx);
    mlMode = false;
    updateModeLabel();
    updateTrainingUI();
    log(`Samples ${cls} effacés — ré-enregistre puis Ré-entraîner.`);
  });
});

// Bouton Reset tout
const btnResetTraining = document.getElementById('btnResetTraining');
if (btnResetTraining) {
  btnResetTraining.addEventListener('click', () => {
    // Arrêter toute capture en cours
    if (capturingClass >= 0) {
      const btn = document.getElementById(`rec-${CLASSES[capturingClass]}`);
      const card = document.getElementById(`tc-${CLASSES[capturingClass]}`);
      if (btn) { btn.textContent = '● Rec'; btn.classList.remove('recording'); }
      if (card) card.classList.remove('recording');
      capturingClass = -1;
    }
    clearTraining();
    mlMode = false;
    updateModeLabel();
    updateTrainingUI();
    log('Training reset — retour heuristique.');
  });
}

// Chargement modèle au démarrage
(async () => {
  try {
    const data = await loadModelData();
    if (data) {
      deserializeModel(data);
      if (isModelTrained()) {
        mlMode = true;
        updateModeLabel();
        updateTrainingUI();
        log(`Modèle KNN chargé (${getTrainingCounts().join('/')} samples). Mode ML actif.`);
      }
    }
  } catch (_) { /* pas de modèle sauvegardé */ }
})();

// Slider zoom timeline
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');
if (zoomSlider) {
  const applyZoom = (v) => {
    TIMELINE_MS = v * 1000;
    zoomValue.textContent = `${v}s`;
  };
  applyZoom(parseFloat(zoomSlider.value));
  zoomSlider.addEventListener('input', (e) => applyZoom(parseFloat(e.target.value)));
  zoomSlider.addEventListener('change', (e) => applyZoom(parseFloat(e.target.value)));
}

if (notesCanvas) {
  const nctx = notesCanvas.getContext('2d');

  function resizeNotesCanvas() {
    const rect = notesCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    notesCanvas.width = rect.width * dpr;
    notesCanvas.height = rect.height * dpr;
    nctx.setTransform(1, 0, 0, 1, 0, 0);
    nctx.scale(dpr, dpr);
  }
  resizeNotesCanvas();
  window.addEventListener('resize', resizeNotesCanvas);

  function drawNotes() {
    requestAnimationFrame(drawNotes);
    const rect = notesCanvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const now = performance.now();

    // Purge le buffer max — jamais pendant un enregistrement actif
    if (!isRecording) {
      while (noteHistory.length && now - noteHistory[0].time > MAX_HISTORY_MS) {
        noteHistory.shift();
      }
    }

    // Fond
    nctx.fillStyle = 'rgba(21, 21, 21, 1)';
    nctx.fillRect(0, 0, w, h);

    // Grille horizontale (3 rails : China / Snare / Kick)
    const rails = 3;
    const railLabels = ['China', 'Snare', 'Kick'];
    const railColors = ['#ffb020', '#ff3b5c', '#4f9dff'];
    for (let i = 0; i < rails; i++) {
      const y = ((i + 0.5) / rails) * h;
      nctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      nctx.lineWidth = 1;
      nctx.beginPath();
      nctx.moveTo(0, y); nctx.lineTo(w, y);
      nctx.stroke();
      // Label
      nctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      nctx.font = '10px ui-monospace, monospace';
      nctx.fillText(railLabels[i], 6, y - 4);
    }

    // Ligne "now" (droite)
    nctx.strokeStyle = 'rgba(0, 229, 160, 0.5)';
    nctx.setLineDash([4, 4]);
    nctx.beginPath();
    nctx.moveTo(w - 1, 0); nctx.lineTo(w - 1, h);
    nctx.stroke();
    nctx.setLineDash([]);

    // Dessin des notes — rail déterminé par heuristique spectral centroid
    for (const n of noteHistory) {
      const age = now - n.time;
      if (age > TIMELINE_MS) continue; // hors fenêtre, on skip sans supprimer
      const x = w - (age / TIMELINE_MS) * w;
      const railIdx = n.railIdx ?? (rails - 1);
      const rowY = ((railIdx + 0.5) / rails) * h;
      const vel = Math.min(1, n.velocity * 10);
      const noteH = Math.max(10, vel * (h / rails) * 0.8);
      const color = railColors[railIdx];

      // Glow
      nctx.shadowColor = color;
      nctx.shadowBlur = 8;
      nctx.fillStyle = color;
      nctx.fillRect(x - 5, rowY - noteH / 2, 10, noteH);
      nctx.shadowBlur = 0;
    }
  }
  drawNotes();
}

const versionEl = document.getElementById('app-version');
if (versionEl) versionEl.textContent = APP_VERSION;

log(`Beatbox2MIDI ${APP_VERSION} chargée. Clique "Autoriser le micro" pour commencer.`);

// ═══════════════════════════════════════════════════════
// ——— EXPORT SCREEN ———
// ═══════════════════════════════════════════════════════

// Références DOM
const bpmDisplay       = document.getElementById('bpmDisplay');
const tapHint          = document.getElementById('tapHint');
const btnTap           = document.getElementById('btnTap');
const btnClick         = document.getElementById('btnClick');
const beatDots         = [0,1,2,3].map(i => document.getElementById(`dot${i}`));
const countdownDisplay = document.getElementById('countdownDisplay');
const btnCountdownRec  = document.getElementById('btnCountdownRec');
const btnStopRec       = document.getElementById('btnStopRec');
const recStatus        = document.getElementById('recStatus');
const btnExport        = document.getElementById('btnExport');
const exportSummary    = document.getElementById('exportSummary');
const btnPreviewPlay   = document.getElementById('btnPreviewPlay');
const btnPreviewStop   = document.getElementById('btnPreviewStop');
const previewBar       = document.getElementById('previewBar');
const previewStatus    = document.getElementById('previewStatus');

let currentBpm = null;
let isRecording = false;
let recStartTime = null;
let recNotes = [];          // snapshot de noteHistory filtré au stopRec
let quantizeMode = 'none';
let recCounterInterval = null;
let userDrumBuffers = {};   // { china?, snare?, kick? } ArrayBuffer

// noteHistory partagé : on écoute aussi les onsets pour la rec export
// (le même noteHistory de la timeline sert à l'export)

function updateBpmDisplay(bpm) {
  currentBpm = bpm;
  if (bpmDisplay) bpmDisplay.innerHTML = bpm ? `${bpm} <span>BPM</span>` : `— <span>BPM</span>`;
  if (btnClick)  btnClick.disabled = !bpm;
  if (btnCountdownRec) btnCountdownRec.disabled = !bpm;
}

// ——— BPM manuel ———
const bpmInput  = document.getElementById('bpmInput');
const btnBpmSet = document.getElementById('btnBpmSet');
function applyManualBpm() {
  const v = parseInt(bpmInput.value, 10);
  if (v >= 30 && v <= 300) {
    updateBpmDisplay(v);
    resetTaps();
    if (tapHint) tapHint.textContent = `BPM manuel : ${v}`;
    if (isClickRunning()) startClickUi(v);
  }
}
if (btnBpmSet) btnBpmSet.addEventListener('click', applyManualBpm);
if (bpmInput) {
  // keydown fonctionne sur desktop, pas sur iOS — on couvre les deux
  bpmInput.addEventListener('keydown', e => { if (e.key === 'Enter') { applyManualBpm(); bpmInput.blur(); } });
  bpmInput.addEventListener('change', applyManualBpm);   // iOS : déclenché au blur du champ
}

// ——— Tap Tempo ———
if (btnTap) {
  btnTap.addEventListener('click', () => {
    const bpm = tap();
    const count = getTapCount();
    if (bpm) {
      updateBpmDisplay(bpm);
      if (tapHint) tapHint.textContent = `${count} tap${count > 1 ? 's' : ''} · continue pour affiner`;
      // Si le click tourne déjà, le redémarrer au nouveau BPM
      if (isClickRunning()) startClickUi(bpm);
    } else {
      if (tapHint) tapHint.textContent = 'Tap 2…';
    }
  });
}

// ——— Click de référence ———
let beatIdx = 0;
function startClickUi(bpm) {
  beatIdx = 0;
  beatDots.forEach((d, i) => { d.className = 'beat-dot' + (i === 0 ? ' accent' : ''); });
  startClick(bpm, (beat) => {
    const cur = beat % 4;
    beatDots.forEach((d, i) => {
      d.className = 'beat-dot' + (i === 0 ? ' accent' : '') + (i === cur ? ' active' : '');
    });
  });
  if (btnClick) { btnClick.textContent = '■ Stop Click'; btnClick.classList.add('active'); }
}

function stopClickUi() {
  stopClick();
  beatDots.forEach(d => d.className = 'beat-dot');
  if (btnClick) { btnClick.textContent = '▶ Click'; btnClick.classList.remove('active'); }
}

if (btnClick) {
  btnClick.addEventListener('click', () => {
    if (isClickRunning()) stopClickUi();
    else if (currentBpm) startClickUi(currentBpm);
  });
}

// ——— Décompte + Rec ———
function updateExportButtons() {
  const has = recNotes.length > 0 && !!currentBpm;
  if (btnPreviewPlay) btnPreviewPlay.disabled = !has;
  if (btnExport)      btnExport.disabled = !has;
}

function startRec() {
  isRecording = true;
  recStartTime = performance.now();
  recNotes = [];
  if (btnCountdownRec) btnCountdownRec.style.display = 'none';
  if (btnStopRec)      btnStopRec.style.display = '';
  if (exportSummary)   exportSummary.textContent = '';
  if (btnExport)       btnExport.disabled = true;
  // Compteur live — relit noteHistory filtré toutes les 200ms
  recCounterInterval = setInterval(() => {
    const n = noteHistory.filter(n => n.time >= recStartTime).length;
    if (recStatus) recStatus.textContent = `● Enregistrement… ${n} note${n !== 1 ? 's' : ''}`;
  }, 200);
}

function stopRec() {
  isRecording = false;
  clearInterval(recCounterInterval);
  stopClick();
  stopClickUi();
  if (countdownDisplay) countdownDisplay.textContent = '';
  if (btnCountdownRec) { btnCountdownRec.style.display = ''; }
  if (btnStopRec)      btnStopRec.style.display = 'none';
  // Snapshot : toutes les notes classifiées depuis recStartTime
  recNotes = noteHistory.filter(n => n.time >= recStartTime);
  const n = recNotes.length;
  if (recStatus) recStatus.textContent = n ? `${n} note${n !== 1 ? 's' : ''} enregistrée${n !== 1 ? 's' : ''}` : 'Rien enregistré.';
  if (exportSummary) exportSummary.textContent = '';
  updateExportButtons();
}

if (btnCountdownRec) {
  btnCountdownRec.addEventListener('click', () => {
    if (!currentBpm) return;
    stopClickUi();
    if (countdownDisplay) countdownDisplay.textContent = '';
    let n = 4;
    startCountdown(
      currentBpm,
      (beat) => { if (countdownDisplay) countdownDisplay.textContent = beat; },
      () => {
        if (countdownDisplay) countdownDisplay.textContent = '';
        startRec();
        startClickUi(currentBpm);
      }
    );
    if (countdownDisplay) countdownDisplay.textContent = '1';
  });
}

if (btnStopRec) {
  btnStopRec.addEventListener('click', stopRec);
}

// ——— Quantize (partagé écoute + export) ———
document.querySelectorAll('.q-btn').forEach(btn => {
  if (btn.dataset.q === 'none') btn.classList.add('active');
  btn.addEventListener('click', () => {
    document.querySelectorAll('.q-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    quantizeMode = btn.dataset.q;
  });
});

// ——— Sons de batterie — upload utilisateur ———
['china', 'snare', 'kick'].forEach(cls => {
  const input  = document.getElementById(`file-${cls}`);
  const slot   = document.getElementById(`slot-${cls}`);
  const status = document.getElementById(`status-${cls}`);
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    userDrumBuffers[cls] = buf;
    await saveDrumSample(cls, buf);
    if (status) status.textContent = file.name.slice(0, 14);
    if (slot)   slot.classList.add('loaded');
  });
});

// Charger les samples sauvegardés au démarrage
(async () => {
  try {
    const saved = await loadDrumSamples();
    ['china', 'snare', 'kick'].forEach(cls => {
      if (saved[cls]) {
        userDrumBuffers[cls] = saved[cls];
        const status = document.getElementById(`status-${cls}`);
        const slot   = document.getElementById(`slot-${cls}`);
        if (status) status.textContent = 'Custom ✓';
        if (slot)   slot.classList.add('loaded');
      }
    });
  } catch (_) {}
})();

// ——— Preview ———
function setPreviewPlaying(playing) {
  if (btnPreviewPlay) btnPreviewPlay.disabled = playing;
  if (btnPreviewStop) btnPreviewStop.disabled = !playing;
  if (previewStatus) previewStatus.textContent = playing ? '▶ Lecture…' : '';
  if (!playing && previewBar) previewBar.style.width = '0%';
}

if (btnPreviewPlay) {
  btnPreviewPlay.addEventListener('click', async () => {
    if (!recNotes.length || !currentBpm) return;
    const q = quantizeMode === 'none' ? null : quantizeMode;
    const label = q ? `Lecture ${quantizeMode}` : 'Lecture RAW';
    if (previewStatus) previewStatus.textContent = `▶ ${label}…`;
    setPreviewPlaying(true);
    await previewNotes(
      recNotes, currentBpm, q, userDrumBuffers,
      (pct) => { if (previewBar) previewBar.style.width = `${pct * 100}%`; },
      () => setPreviewPlaying(false)
    );
  });
}

if (btnPreviewStop) {
  btnPreviewStop.addEventListener('click', () => {
    stopPreview();
    setPreviewPlaying(false);
  });
}

// ——— Export ———
if (btnExport) {
  btnExport.addEventListener('click', async () => {
    if (!recNotes.length || !currentBpm) return;
    btnExport.disabled = true;
    btnExport.textContent = 'Export en cours…';
    try {
      const q = quantizeMode === 'none' ? null : quantizeMode;
      const filename = await buildAndDownloadMidi(recNotes, currentBpm, { quantize: q });
      const n = applyQuantize(recNotes, currentBpm, q).length;
      if (exportSummary) exportSummary.textContent = `✓ ${filename} · ${n} notes`;
      log(`Export : ${filename} (${n} notes, ${currentBpm} BPM, quant.=${quantizeMode})`);
    } catch (err) {
      if (exportSummary) exportSummary.textContent = `Erreur : ${err.message}`;
      log(`Export erreur : ${err.message}`);
    } finally {
      btnExport.disabled = false;
      btnExport.textContent = 'Exporter .mid';
    }
  });
}
