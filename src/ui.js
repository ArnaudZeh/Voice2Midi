// src/ui.js
// Gestion UI : navigation écrans, visualisation, logs
export const APP_VERSION = 'v0.9.7'; // à bumper à chaque modif (format semver patch)
import { startMicrophone, onOnset, onRMS, setSensitivity, setInputGain, recordSnapshot, getConfig, getMetrics } from './audio.js';

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
const MAX_HISTORY_MS = 10000;   // buffer max conservé (ne jamais purger plus tôt)
const noteHistory = [];         // { time, velocity, railIdx }

// Heuristique v0.9.7
// Calibré sur logs réels :
//   tch (china) → ZCR mesuré 0.201–0.511 (min observé : 0.201)
//   kicks faux positifs → ZCR 0.06–0.18 → gap net avant 0.20
// china (0) : ZCR > 0.18 (seuil data-driven, élimine les faux positifs kick)
// snare (1) : ta aigu — midAvg > lowAvg * 0.85
// kick  (2) : ta grave / dr — défaut
function classifyOnset({ lowAvg, midAvg, highAvg, zcr }) {
  if (zcr > 0.18) return 0;              // China (tch — data-driven)
  if (midAvg > lowAvg * 0.85) return 1;  // Snare (ta aigu)
  return 2;                              // Kick
}

// Cooldown par classe
const lastClassTime = [0, 0, 0];
const CLASS_COOLDOWN_MS = [100, 80, 40]; // China, Snare, Kick (40ms pour dr rapide métal)

const RAIL_NAMES = ['China', 'Snare', 'Kick'];
onOnset((data) => {
  const railIdx = classifyOnset(data);
  const now = data.timestamp;
  if (now - lastClassTime[railIdx] < CLASS_COOLDOWN_MS[railIdx]) return;
  lastClassTime[railIdx] = now;
  noteHistory.push({ time: now, velocity: data.rms, railIdx });
  log(`  → ${RAIL_NAMES[railIdx]}`);
});

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

    // Purge uniquement le buffer max — pas la fenêtre affichée
    while (noteHistory.length && now - noteHistory[0].time > MAX_HISTORY_MS) {
      noteHistory.shift();
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
