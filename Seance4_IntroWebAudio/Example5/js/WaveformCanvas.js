// js/ui/WaveformCanvas.js
export class WaveformCanvas {
  constructor(waveCanvas, overlayCanvas) {
    this.wave = waveCanvas;
    this.overlay = overlayCanvas;
    this.wctx = waveCanvas.getContext('2d');
    this.octx = overlayCanvas.getContext('2d');

    this.buffer = null;
    this.startSec = 0;
    this.endSec = 0;
    this.dragging = null;
    this.dragOffset = 0;
    this.windowWidth = 0;
    this.onChange = null;
    this._playheadSec = null;

    overlayCanvas.addEventListener('mousedown', e => this.onDown(e));
    window.addEventListener('mousemove', e => this.onMove(e));
    window.addEventListener('mouseup', () => this.onUp());
  }

  // ============================ Buffer ============================
  setBuffer(buffer, { startSec = 0, endSec = buffer?.duration || 0 } = {}) {
    this.buffer = buffer;
    this.startSec = startSec;
    this.endSec = endSec ?? buffer.duration;
    this.drawWave();
    this.drawOverlay();
  }

  secToX(sec) { return (sec / (this.buffer?.duration || 1)) * this.wave.width; }
  xToSec(x)   { return (x / this.wave.width) * (this.buffer?.duration || 0); }

  // ============================ Dessin ============================
  drawWave() {
    const { wctx, wave, buffer } = this;
    wctx.clearRect(0, 0, wave.width, wave.height);
    if (!buffer) return;

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / wave.width);
    const amp = wave.height / 2;

    wctx.beginPath();
    wctx.moveTo(0, amp);

    for (let x = 0; x < wave.width; x++) {
      let min = 1, max = -1;
      const s = x * step, e = Math.min((x + 1) * step, data.length);
      for (let i = s; i < e; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      wctx.lineTo(x, (1 + min) * amp);
      wctx.lineTo(x, (1 + max) * amp);
    }

    wctx.strokeStyle = '#ffd36b';
    wctx.lineWidth = 1.2;
    wctx.stroke();
  }

  drawOverlay() {
    const ctx = this.octx;
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (!this.buffer) return;

    const x1 = this.secToX(this.startSec);
    const x2 = this.secToX(this.endSec);

    // Zones grisées
    ctx.fillStyle = 'rgba(128,128,128,0.45)';
    ctx.fillRect(0, 0, x1, this.overlay.height);
    ctx.fillRect(x2, 0, this.overlay.width - x2, this.overlay.height);

    // Zone sélectionnée bleue transparente
    ctx.fillStyle = 'rgba(0,196,255,0.25)';
    ctx.fillRect(x1, 0, Math.max(2, x2 - x1), this.overlay.height);

    // Traits blancs (Trim Bars)
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, 0); ctx.lineTo(x1, this.overlay.height);
    ctx.moveTo(x2, 0); ctx.lineTo(x2, this.overlay.height);
    ctx.stroke();

    // Triangles indicateurs
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.moveTo(x1, 0);
    ctx.lineTo(x1 + 10, 8);
    ctx.lineTo(x1, 16);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x2, 0);
    ctx.lineTo(x2 - 10, 8);
    ctx.lineTo(x2, 16);
    ctx.fill();

    // Playhead
    if (typeof this._playheadSec === 'number') {
      const px = Math.max(0, Math.min(this.wave.width, this.secToX(this._playheadSec)));
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, 2);
      ctx.lineTo(px + 0.5, this.overlay.height - 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(px, 8, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ============================ Trim Bar Logic ============================
  onDown(e) {
  if (!this.buffer) return;
  const rect = this.overlay.getBoundingClientRect();
  const x = e.clientX - rect.left;

  const x1 = this.secToX(this.startSec);
  const x2 = this.secToX(this.endSec);
  const grabRange = 8;

  // Détecte le curseur le plus proche du clic
  const distStart = Math.abs(x - x1);
  const distEnd = Math.abs(x - x2);

  if (distStart <= grabRange && distStart <= distEnd) {
    this.dragging = 'start';
  } else if (distEnd <= grabRange) {
    this.dragging = 'end';
  } else if ((x1 < x2 && x > x1 && x < x2) || (x1 > x2 && x > x2 && x < x1)) {
    this.dragging = 'move';
    this.dragOffset = x - x1;
    this.windowWidth = x2 - x1;
  } else {
    this.dragging = null;
  }
}

onMove(e) {
  if (!this.dragging || !this.buffer) return;

  const rect = this.overlay.getBoundingClientRect();
  const x = Math.max(0, Math.min(this.overlay.width, e.clientX - rect.left));

  if (this.dragging === 'start') {
    const s = this.xToSec(x);
    this.startSec = Math.max(0, Math.min(s, this.buffer.duration));
  } else if (this.dragging === 'end') {
    const s = this.xToSec(x);
    this.endSec = Math.max(0, Math.min(s, this.buffer.duration));
  } else if (this.dragging === 'move') {
    const nx = x - this.dragOffset;
    const deltaSec = (nx / this.overlay.width) * this.buffer.duration;
    const widthSec = (this.windowWidth / this.overlay.width) * this.buffer.duration;
    this.startSec = Math.max(0, Math.min(deltaSec, this.buffer.duration));
    this.endSec = Math.max(0, Math.min(deltaSec + widthSec, this.buffer.duration));
  }

  this.drawOverlay();
  this.emit();
}

  onUp() {
    this.dragging = null;
  }

  // ============================ Playhead ============================
  setPlayhead(sec) {
    this._playheadSec = sec;
    this.drawOverlay();
  }

  clearPlayhead() {
    this._playheadSec = null;
    this.drawOverlay();
  }

  // ============================ Événements ============================
  emit() {
    if (this.onChange)
      this.onChange({ startSec: this.startSec, endSec: this.endSec });
  }
}
