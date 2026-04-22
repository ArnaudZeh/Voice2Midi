// src/ui.js
// Gestion UI : navigation écrans, visualisation, logs
import { startMicrophone, onOnset, onRMS, setSensitivity } from './audio.js';

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

// VU-meter RMS — barre verticale à droite du canvas
const rmsMeter = document.getElementById('rmsMeter');
let rmsSmoothed = 0;
onRMS((rms) => {
  // Lissage type peak-follower pour éviter la nervosité
  rmsSmoothed = Math.max(rms, rmsSmoothed * 0.85);
  // Normalise sur [0,1] avec une courbe perçue (puissance)
  const normalized = Math.min(1, Math.pow(rmsSmoothed * 6, 0.6));
  if (rmsMeter) rmsMeter.style.height = `${normalized * 100}%`;
});

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

// Debug : logger les 10 premiers onsets avec leurs features
let onsetCount = 0;
onOnset((data) => {
  onsetCount++;
  if (onsetCount <= 10) {
    log(`#${onsetCount} mfcc[0]=${data.mfcc[0].toFixed(2)} mfcc[1]=${data.mfcc[1].toFixed(2)}`);
  }
});

log('App chargée. Clique "Autoriser le micro" pour commencer.');
