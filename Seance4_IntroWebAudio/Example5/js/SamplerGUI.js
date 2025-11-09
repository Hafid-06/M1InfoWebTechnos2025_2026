// js/ui/SamplerGUI.js
export class SamplerGUI {
  constructor(engine, waveform, els) {
    this.engine = engine;
    this.waveform = waveform;
    this.els = els;

    this.pads = [];
    this.trims = new Map();
    this.currentIndex = -1;
    this.currentSource = null;

    this._rafId = null;
    this._playStart = 0;
    this._playDur = 0;

    // Save trims when waveform is changed
    this.waveform.onChange = ({ startSec, endSec }) => {
      if (this.currentIndex >= 0) this.trims.set(this.currentIndex, { startSec, endSec });
    };
  }

  attachSequencer(seq) {
    this.sequencer = seq;
    // NOUVEAU : Demander au Séquenceur de dessiner sa liste après l'attachement
    if (this.sequencer && typeof this.sequencer.renderSequences === 'function') {
        this.sequencer.renderSequences();
    }
  }

  // called by main to refresh REC buttons; proxy to sequencer if attached
  updateSequencerButtons() {
    if (this.sequencer && typeof this.sequencer.updateButtons === 'function') {
      this.sequencer.updateButtons();
    }
  }

  initPads(count = 16) {
    const container = this.els.padGrid;
    container.innerHTML = '';
    this.pads.length = 0;
    for (let i = 0; i < count; i++) {
      const pad = document.createElement('button');
      pad.className = 'pad';
      pad.disabled = true;
      pad.innerHTML = `<div class="pad__progress"></div><div class="pad__err">ERR</div><span>${i + 1}</span>`;
      pad.addEventListener('click', () => this.onPad(i));
      container.appendChild(pad);
      this.pads[i] = pad;
    }
  }

  setPadProgress(i, ratio) {
    const bar = this.pads[i]?.querySelector('.pad__progress');
    if (bar) bar.style.width = `${Math.round((ratio || 0) * 100)}%`;
  }

  markLoaded(i) {
    const pad = this.pads[i]; if (!pad) return;
    pad.disabled = false; pad.querySelector('.pad__err').style.display = 'none';
    pad.classList.remove('loading', 'failed'); pad.classList.add('loaded');
  }

  markError(i, msg) {
    const pad = this.pads[i]; if (!pad) return;
    pad.disabled = true; pad.querySelector('.pad__err').style.display = 'block';
    pad.classList.remove('loading', 'loaded'); pad.classList.add('failed'); pad.title = msg;
  }

  setActivePad(i) {
    this.pads.forEach(p => p.classList.remove('pad--active'));
    this.pads[i]?.classList.add('pad--active');
  }

  async onPad(i) {
    // onPad remains the click handler: select the pad and then play it
    await this.selectPad(i);
    // after selecting via user click, play the pad
    const { startSec, endSec } = this.trims.get(i) || { startSec: this.waveform.startSec, endSec: this.waveform.endSec };
    // record hit if sequencer attached
    if (this.sequencer && typeof this.sequencer.recordHit === 'function') this.sequencer.recordHit(i);
    this.engine.trigger(i, { startSec, endSec });
  }

  // selectPad loads (if needed) and sets waveform and UI but does NOT play the sound.
  async selectPad(i) {
    const buf = this.engine.buffers[i];
    if (!buf) {
      const pad = this.pads[i]; if (pad) { pad.disabled = true; pad.classList.add('loading'); }
      const url = this.els.urls[i];
      try {
        const loaded = await this.engine.loadOne(url, i, (idx, p) => this.setPadProgress(idx, p));
        this.engine.buffers[i] = loaded; this.markLoaded(i);
        if (pad) { pad.classList.remove('loading'); pad.classList.add('loaded'); }
      } catch (err) { this.markError(i, String(err)); if (pad) { pad.classList.remove('loading'); pad.classList.add('failed'); } return; }
    }

    const finalBuf = this.engine.buffers[i]; if (!finalBuf) return;

    this.currentIndex = i; this.setActivePad(i);
    const url = this.els.urls[i] || `pad ${i + 1}`; this.els.currentName.textContent = url.split('/').pop() || url;
    const t = this.trims.get(i) || { startSec: 0, endSec: finalBuf.duration };
    this.waveform.setBuffer(finalBuf, t);
    this.els.btnPlay.disabled = this.els.btnStop.disabled = false;
  }

  playCurrent() {
    const i = this.currentIndex; if (i < 0) return; const buf = this.engine.buffers[i]; if (!buf) return;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this.currentSource) { try { this.currentSource.stop(); } catch {} this.currentSource = null; }

    const { startSec, endSec } = this.trims.get(i) || { startSec: this.waveform.startSec, endSec: this.waveform.endSec };
    const src = this.engine.trigger(i, { startSec, endSec }); this.currentSource = src;
    this.els.status.textContent = `Playing ${startSec.toFixed(2)} → ${endSec.toFixed(2)}s`;

    const ctx = this.engine.context; const scheduled = ctx.currentTime + 0.005; const dur = Math.max(0.01, endSec - startSec);
    this._playStart = scheduled; this._playDur = dur;

    const tick = () => {
      const now = ctx.currentTime; const t = now - this._playStart; const ratio = Math.max(0, Math.min(1, t / this._playDur));
      const curSec = startSec + ratio * (endSec - startSec); this.waveform.setPlayhead(curSec);
      if (this.els.playProgress) this.els.playProgress.style.width = `${Math.round(ratio * 100)}%`;
      if (ratio < 1 && this.currentSource) this._rafId = requestAnimationFrame(tick); else this._rafId = null;
    };
    this._rafId = requestAnimationFrame(tick);

    src.onended = () => { if (this.currentSource === src) this.currentSource = null; this.els.status.textContent = 'Idle'; if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; } this.waveform.clearPlayhead(); if (this.els.playProgress) this.els.playProgress.style.width = '0%'; };
  }

  stopCurrent() {
    if (this._playPreviewTimer) { clearTimeout(this._playPreviewTimer); this._playPreviewTimer = null; }
    if (this.currentSource) { try { this.currentSource.stop(); } catch {} this.currentSource = null; }
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    
    // NOUVEAU : Arrêter la lecture de séquence
    if (this.sequencer && typeof this.sequencer.stopPlayback === 'function') {
        this.sequencer.stopPlayback();
    }
    
    this.waveform.clearPlayhead(); if (this.els.playProgress) this.els.playProgress.style.width = '0%'; this.els.status.textContent = 'Idle';
  }
}