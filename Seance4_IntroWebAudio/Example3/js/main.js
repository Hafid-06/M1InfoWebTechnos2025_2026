// js/main.js (Exercice 3)
// -------------------------------------------------------
// 1) Elements de la page
const buttonsContainer = document.getElementById('buttonsContainer');

// on crée un conteneur d'entête + <select> pour les presets
const header = document.createElement('div');
header.style.display = 'flex';
header.style.alignItems = 'center';
header.style.gap = '12px';
header.style.marginBottom = '12px';

const presetLabel = document.createElement('label');
presetLabel.textContent = 'Preset :';

const presetSelect = document.createElement('select');
presetSelect.id = 'presetSelect';

header.appendChild(presetLabel);
header.appendChild(presetSelect);
buttonsContainer.parentElement.insertBefore(header, buttonsContainer);

// 2) AudioContext (créé paresseusement)
let audioCtx = null;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// 3) Utils réseau / parsing
const API_URL = 'http://localhost:3000/api/presets';

// transforme un chemin relatif en URL absolue vers le serveur
function absoluteFromServer(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path; // déjà absolu
  const base = 'http://localhost:3000';
  const slash = path.startsWith('/') ? '' : '/';
  return `${base}${slash}${path}`;
}

// tente de normaliser la réponse de l'API vers [{name, files:[...]}]
function normalizePresets(json) {
  const raw = Array.isArray(json) ? json : (json && json.presets) ? json.presets : [];
  return raw
    .map((p, i) => ({
      name: p.name || `Preset ${i + 1}`,
      files: Array.isArray(p.files) ? p.files : [],
    }))
    .filter(p => p.files.length > 0);
}

async function fetchPresets() {
  const res = await fetch(API_URL, { mode: 'cors' });
  if (!res.ok) {
    throw new Error(`Serveur presets: HTTP ${res.status} (${API_URL})`);
  }
  const json = await res.json();
  return normalizePresets(json);
}

// 4) Chargement & décodage
async function fetchAndDecode(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const arr = await res.arrayBuffer();
  const ctx = getCtx();
  return await ctx.decodeAudioData(arr);
}

async function loadBuffers(urls) {
  const ctx = getCtx();
  await ctx.resume();
  return Promise.all(urls.map(fetchAndDecode));
}

// 5) Rendu UI (boutons par son)
function renderButtons(buffers, urls) {
  buttonsContainer.innerHTML = ''; // reset
  buffers.forEach((buffer, i) => {
    const btn = document.createElement('button');
    btn.textContent = `PLAY #${i + 1}`;
    btn.style.padding = '8px 12px';
    btn.style.margin = '4px';

    btn.addEventListener('click', async () => {
      const ctx = getCtx();
      if (ctx.state !== 'running') await ctx.resume();

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      // joue le sample entier; si tu as déjà ton système de trims d'Ex.2,
      // remplace ici par start(offset, duration) avec tes valeurs.
      src.start(ctx.currentTime + 0.01);
    });

    // petit sous-texte avec l’URL
    const small = document.createElement('div');
    small.textContent = urls[i];
    small.style.fontSize = '11px';
    small.style.opacity = '0.7';
    small.style.maxWidth = '720px';
    small.style.wordBreak = 'break-all';
    small.style.marginBottom = '8px';

    const wrap = document.createElement('div');
    wrap.appendChild(btn);
    wrap.appendChild(small);
    buttonsContainer.appendChild(wrap);
  });
}

// 6) Chargement d’un preset (par index)
async function loadPresetByIndex(presets, index) {
  const preset = presets[index];
  if (!preset) return;

  // construit la liste d'URLs
  const urls = preset.files.map(absoluteFromServer);

  // indicateur visuel simple
  buttonsContainer.innerHTML = 'Chargement des sons…';

  try {
    const buffers = await loadBuffers(urls);
    renderButtons(buffers, urls);
  } catch (err) {
    console.error(err);
    buttonsContainer.innerHTML = `Erreur de chargement: ${err.message}`;
  }
}

// 7) Initialisation globale
async function init() {
  // 7.1 récupérer presets
  try {
    buttonsContainer.innerHTML = 'Contact du serveur presets…';
    const presets = await fetchPresets();
    if (!presets.length) {
      buttonsContainer.innerHTML = "Aucun preset disponible (vérifie la réponse de l'API).";
      return;
    }

    // 7.2 remplir le menu
    presetSelect.innerHTML = '';
    presets.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = p.name || `Preset ${i + 1}`;
      presetSelect.appendChild(opt);
    });

    // 7.3 on charge d’abord le 1er preset
    await loadPresetByIndex(presets, 0);

    // 7.4 changement de preset depuis le menu
    presetSelect.addEventListener('change', async (e) => {
      const idx = Number(e.target.value);
      await loadPresetByIndex(presets, idx);
    });

  } catch (err) {
    console.error(err);
    buttonsContainer.innerHTML =
      `Impossible de joindre ${API_URL}.<br>` +
      `→ Vérifie que le serveur tourne bien (npm run start) et que CORS est autorisé.<br>` +
      `Erreur: ${err.message}`;
  }
}

// Lancer
init();
