// src/ui.js
// Gestion UI : navigation écrans, visualisation, logs
import { startMicrophone, onOnset } from './audio.js';

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

export function drawWaveform(dataArray) {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  ctx.fillStyle = 'rgba(31, 31, 31, 0.3)';
  ctx.fillRect(0, 0, w, h);

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#00e5a0';
  ctx.beginPath();

  const sliceWidth = w / dataArray.length;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * h) / 2;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    x += sliceWidth;
  }

  ctx.lineTo(w, h / 2);
  ctx.stroke();
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
