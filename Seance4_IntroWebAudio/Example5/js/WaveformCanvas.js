export class WaveformCanvas {
  constructor(waveCanvas, overlayCanvas) {
    this.wave = waveCanvas;
    this.overlay = overlayCanvas;

    this.wctx = waveCanvas.getContext("2d");
    this.octx = overlayCanvas.getContext("2d");

    this.buffer = null;
    this.startSec = 0;
    this.endSec = 0;

    this._drag = null;          // 'start' | 'end' | null
    this._playheadSec = null;   // null = pas de playhead
    this.onChange = null;       // callback({ startSec, endSec })

    // ---- HiDPI / Retina : scale le canvas interne sur le DPR ----
    const resize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      [this.wave, this.overlay].forEach((c) => {
        const r = c.getBoundingClientRect();
        c.width  = Math.max(1, Math.floor(r.width * dpr));
        c.height = Math.max(1, Math.floor(r.height * dpr));
      });
      this.wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
      this.drawOverlay();
    };
    this._resize = resize;
    window.addEventListener("resize", resize, { passive: true });
    setTimeout(resize, 0);

    // ---- Souris: on travaille en px CSS (clientWidth/Height) ----
    overlayCanvas.addEventListener("mousedown", (e) => this._onDown(e));
    overlayCanvas.addEventListener("mousemove", (e) => this._onMove(e));
    window.addEventListener("mouseup", () => this._onUp());
  }

  destroy() {
    window.removeEventListener("resize", this._resize);
    this.overlay.replaceWith(this.overlay.cloneNode(true)); // retire listeners
  }

  // ==== conversions secondes <-> x (px CSS) ====
  _secToX(sec) {
    if (!this.buffer) return 0;
    const W = this.wave.clientWidth;
    const dur = Math.max(this.buffer.duration, 0.0001);
    return (sec / dur) * W;
  }
  _xToSec(x) {
    if (!this.buffer) return 0;
    const W = Math.max(1, this.wave.clientWidth);
    const dur = Math.max(this.buffer.duration, 0.0001);
    return (x / W) * dur;
  }

  // ==== API publique ====
  setBuffer(audioBuffer) {
    // support optional second parameter: setBuffer(buf, { startSec, endSec })
    const buf = audioBuffer || null;
    this.buffer = buf;
    if (this.buffer) {
      // default region is the full buffer
      this.startSec = 0;
      this.endSec = this.buffer.duration;
    } else {
      this.startSec = 0;
      this.endSec = 0;
    }
    // If caller passed a region object as second arg (SamperGUI does this), apply it
    if (arguments.length > 1) {
      const region = arguments[1] || {};
      if (typeof region.startSec === 'number' && typeof region.endSec === 'number') {
        this.setRegion(region.startSec, region.endSec);
      }
    }
    this.draw();
    this.drawOverlay();
  }

  // convenience: clear the visible playhead
  clearPlayhead() {
    this.setPlayhead(null);
  }

  setRegion(startSec, endSec) {
    if (!this.buffer) return;
    const dur = this.buffer.duration;
    this.startSec = Math.max(0, Math.min(startSec, dur));
    this.endSec = Math.max(this.startSec + 0.01, Math.min(endSec, dur));
    this.drawOverlay();
  }

  setPlayhead(secOrNull) {
    this._playheadSec = secOrNull;
    this.drawOverlay();
  }

  // ==== dessin waveform ====
  draw() {
    const ctx = this.wctx;
    const W = this.wave.clientWidth;
    const H = this.wave.clientHeight;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0b0f15";
    ctx.fillRect(0, 0, W, H);

    if (!this.buffer) {
      // texte placeholder
      ctx.fillStyle = "#9fb6c8";
      ctx.font = "13px ui-sans-serif";
      ctx.fillText("Waveform", 12, 20);
      return;
    }

    const ch = this.buffer.getChannelData(0);
    const len = ch.length;
    const step = Math.max(1, Math.floor(len / W));

    ctx.beginPath();
    const mid = H / 2;

    for (let x = 0; x < W; x++) {
      let min = 1.0, max = -1.0;
      const i0 = x * step;
      for (let i = 0; i < step && i0 + i < len; i++) {
        const v = ch[i0 + i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.lineTo(x, mid + max * mid);
      ctx.lineTo(x, mid + min * mid);
    }
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ==== overlay trims + playhead ====
  drawOverlay() {
    const o = this.octx;
    const W = this.overlay.clientWidth;
    const H = this.overlay.clientHeight;

    o.clearRect(0, 0, W, H);

    if (!this.buffer) return;

    // zone sélectionnée
    const x1 = this._secToX(this.startSec);
    const x2 = this._secToX(this.endSec);
    o.fillStyle = "rgba(255,255,255,.06)";
    o.fillRect(x1, 0, Math.max(1, x2 - x1), H);

    // trims
    this._drawHandle(o, x1, H, "#f59e0b");
    this._drawHandle(o, x2, H, "#f59e0b");

    // playhead
    if (this._playheadSec != null) {
      const px = this._secToX(this._playheadSec);
      o.strokeStyle = "#22d3ee";
      o.lineWidth = 1;
      o.beginPath();
      o.moveTo(px + 0.5, 0);
      o.lineTo(px + 0.5, H);
      o.stroke();
    }
  }

  _drawHandle(octx, x, H, color) {
    octx.strokeStyle = color;
    octx.lineWidth = 2;
    octx.beginPath();
    octx.moveTo(x + 0.5, 0);
    octx.lineTo(x + 0.5, H);
    octx.stroke();
    octx.fillStyle = color;
    octx.beginPath();
    octx.arc(x, 10, 3, 0, Math.PI * 2);
    octx.fill();
  }

  // ==== interaction souris ====
  _onDown(e) {
    if (!this.buffer) return;
    const r = this.overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(this.overlay.clientWidth, e.clientX - r.left));
    const x1 = this._secToX(this.startSec);
    const x2 = this._secToX(this.endSec);

    const hit = (a, b) => Math.abs(a - b) < 8;
    if (hit(x, x1)) this._drag = "start";
    else if (hit(x, x2)) this._drag = "end";
    else {
      // scrubbing : clique ailleurs -> playhead
      this._playheadSec = this._xToSec(x);
      this.drawOverlay();
    }
  }

  _onMove(e) {
    if (!this._drag) return;
    const r = this.overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(this.overlay.clientWidth, e.clientX - r.left));
    const s = this._xToSec(x);

    if (this._drag === "start") {
      this.startSec = Math.min(s, this.endSec - 0.01);
    } else {
      this.endSec = Math.max(s, this.startSec + 0.01);
    }
    this.drawOverlay();
    this.onChange && this.onChange({ startSec: this.startSec, endSec: this.endSec });
  }

  _onUp() {
    this._drag = null;
  }
}
