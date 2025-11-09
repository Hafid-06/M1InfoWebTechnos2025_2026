// js/main.js
import { SamplerEngine } from './SamplerEngine.js';
import { WaveformCanvas } from './WaveformCanvas.js';
import { PresetService } from './PresetService.js';
import { SamplerGUI } from './SamplerGUI.js';
import { Sequencer } from './Sequencer.js';

// ---- DOM refs
const els = {
  presetSelect: document.getElementById('presetSelect'),
  padGrid: document.getElementById('padGrid'),
  wave: document.getElementById('wave'),
  overlay: document.getElementById('overlay'),
  currentName: document.getElementById('currentName'),
  btnPlay: document.getElementById('btnPlay'),
  btnStop: document.getElementById('btnStop'),
  // NOUVELLES RÉFÉRENCES DU SÉQUENCEUR
  btnRecordStart: document.getElementById('btnRecordStart'),
  btnRecordStop: document.getElementById('btnRecordStop'),
  sequenceList: document.getElementById('sequenceList'),
  // FIN NOUVELLES RÉFÉRENCES
  status: document.getElementById('status'),
  report: document.getElementById('report'),
  playProgress: document.getElementById('playProgress'),
  urls: []
};

// ---- Instances
const engine = new SamplerEngine();
engine.connect(engine.context.destination);

const waveform = new WaveformCanvas(els.wave, els.overlay);
const gui = new SamplerGUI(engine, waveform, els);

// sequencer: attach and wire
const sequencer = new Sequencer(engine, gui, els);
if (typeof gui.attachSequencer === 'function') gui.attachSequencer(sequencer);

// ---- Helpers UI
function fillPresetSelect(presets) {
  els.presetSelect.innerHTML = '';
  // placeholder
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '--- Select preset ---';
  placeholder.selected = true;
  placeholder.disabled = false;
  els.presetSelect.appendChild(placeholder);
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i); opt.textContent = p.name;
    els.presetSelect.appendChild(opt);
  });
}

// ---- Chargement d’un preset (progress + allSettled)
async function loadPreset(preset) {
  els.urls = preset.files.slice();

  // prépare la grille pads
  // Initialize pads but DO NOT preload sounds: lazy load on pad click
  gui.initPads(Math.max(els.urls.length, 16));
  engine.buffers = new Array(els.urls.length);

  // mark all pads as not loaded (they start grey). GUI will load onPad if needed.
  els.report.textContent = `Preset loaded (${els.urls.length} files). Loading files...`;

  // Start loading all files in background (so selecting a preset shows pads loaded without clicking "Load all")
  const jobs = els.urls.map((url, i) =>
    engine.loadOne(url, i, (idx, p) => gui.setPadProgress(idx, p)).then(
      (buf) => { engine.buffers[i] = buf; gui.markLoaded(i); return { ok: true, i }; },
      (err) => { gui.markError(i, String(err)); return Promise.reject({ ok: false, i, err }); }
    )
  );

  const results = await Promise.allSettled(jobs);
  const ok = results.filter(r => r.status === 'fulfilled').length;
  const ko = results.length - ok;
  els.report.textContent = `Loaded: ${ok} • Failed: ${ko}`;

  // NOUVEAU : Active les boutons séquenceur
  gui.updateSequencerButtons();

  // sélectionne le premier sample dispo
  const firstOk = engine.buffers.findIndex(Boolean);
  if (firstOk >= 0) await gui.selectPad(firstOk);
}

// ---- Boutons Play/Stop
els.btnPlay.addEventListener('click', async () => {
  if (engine.context.state !== 'running') await engine.context.resume();
  gui.playCurrent();
});
els.btnStop.addEventListener('click', () => {
  // stop preview/playback via GUI helper
  gui.stopCurrent();
});

// ---- NOUVEAUX Boutons Séquenceur
els.btnRecordStart.addEventListener('click', async () => {
  if (engine.context.state !== 'running') await engine.context.resume();
  sequencer.startRecording();
});
els.btnRecordStop.addEventListener('click', () => {
  sequencer.stopRecording();
});
// ---- FIN NOUVEAUX Boutons Séquenceur


// ---- Boot
(async function init() {
  try {
    const presets = await PresetService.fetchPresets();
    fillPresetSelect(presets);

    // initialize empty grey pads until user selects a preset
    gui.initPads(16);
    engine.buffers = [];

    // NOUVEAU : Initialise l'état des boutons REC
    gui.updateSequencerButtons();

    els.presetSelect.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (val === '') return; // placeholder selected
      await loadPreset(presets[Number(val)]);
    });
  } catch (err) {
    els.report.textContent = 'API error: ' + err.message;
    console.error(err);
  }
})();