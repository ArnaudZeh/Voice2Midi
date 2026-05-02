// src/storage.js
// IndexedDB wrapper pour persister le modèle entraîné et les samples
// À implémenter en Phase 2

/**
 * Plan :
 * - DB : 'beatbox2midi'
 * - Store : 'models' (modèle TF.js sérialisé + normalization stats)
 * - Store : 'samples' (samples d'entraînement pour ré-entraîner plus tard)
 * - Store : 'settings' (tempo par défaut, config utilisateur)
 */

const DB_NAME = 'beatbox2midi';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('samples')) {
        db.createObjectStore('samples', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveSample(classLabel, features) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('samples', 'readwrite');
    const store = tx.objectStore('samples');
    const req = store.add({ classLabel, features, timestamp: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllSamples() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('samples', 'readonly');
    const store = tx.objectStore('samples');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearSamples() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('samples', 'readwrite');
    const store = tx.objectStore('samples');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Persistance des samples audio utilisateur (.wav) dans le store 'settings'
// key : 'drum_china' | 'drum_snare' | 'drum_kick'
export async function saveDrumSample(className, arrayBuffer) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key: `drum_${className}`, buffer: arrayBuffer });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadDrumSamples() {
  const db = await openDB();
  const keys = ['drum_china', 'drum_snare', 'drum_kick'];
  const results = {};
  await Promise.all(keys.map(key => new Promise((resolve) => {
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get(key);
    req.onsuccess = () => {
      if (req.result) results[key.replace('drum_', '')] = req.result.buffer;
      resolve();
    };
    req.onerror = () => resolve();
  })));
  return results; // { china?: ArrayBuffer, snare?: ArrayBuffer, kick?: ArrayBuffer }
}

// Persistance du modèle KNN (samples + normStats) dans le store 'settings'
export async function saveModelData(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key: 'knn_model', ...data });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadModelData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get('knn_model');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
