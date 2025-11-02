import { SamplerEngine } from './SamplerEngine.js';
import { WaveformCanvas } from './WaveformCanvas.js';
import { PresetService } from './PresetService.js';
import { SamplerGUI } from './SamplerGUI.js';

// ---- DOM refs
const els = {
  presetSelect: document.getElementById('presetSelect'),
  padGrid: document.getElementById('padGrid'),
  wave: document.getElementById('wave'),
  overlay: document.getElementById('overlay'),
  currentName: document.getElementById('currentName'),
  btnPlay: document.getElementById('btnPlay'),
  btnStop: document.getElementById('btnStop'),
  btnRecordStart: document.getElementById('btnRecordStart'),
  btnRecordStop: document.getElementById('btnRecordStop'),
  sequenceList: document.getElementById('sequenceList'),
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

// ---- Helpers UI
function fillPresetSelect(presets) {
  els.presetSelect.innerHTML = '';
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

// ---- Chargement d’un preset
async function loadPreset(preset) {
  els.urls = preset.files.slice();

  gui.initPads(Math.max(els.urls.length, 16));
  engine.buffers = new Array(els.urls.length);
  els.report.textContent = `Preset loaded (${els.urls.length} files). Loading files...`;

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

  gui.updateSequencerButtons();

  // NE PAS JOUER le premier sample automatiquement
  const firstOk = engine.buffers.findIndex(Boolean);
  if (firstOk >= 0) await gui.onPad(firstOk, { play: false });
}

// ---- Boutons Play/Stop
els.btnPlay.addEventListener('click', async () => {
  if (engine.context.state !== 'running') await engine.context.resume();
  gui.playCurrent();
});
els.btnStop.addEventListener('click', () => gui.stopCurrent());

// ---- Séquenceur
els.btnRecordStart.addEventListener('click', async () => {
  if (engine.context.state !== 'running') await engine.context.resume();
  gui.startRecording();
});
els.btnRecordStop.addEventListener('click', () => gui.stopRecording());

// ---- Boot
(async function init() {
  try {
    const presets = await PresetService.fetchPresets();
    fillPresetSelect(presets);
    gui.initPads(16);
    engine.buffers = [];
    gui.updateSequencerButtons();

    els.presetSelect.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (val === '') return;
      await loadPreset(presets[Number(val)]);
    });
  } catch (err) {
    els.report.textContent = 'API error: ' + err.message;
    console.error(err);
  }
})();
