// js/engine/SamplerEngine.js
export class SamplerEngine {
  constructor(context = new (window.AudioContext || window.webkitAudioContext)()) {
    this.context = context;
    this.output = context.createGain();
    this.buffers = []; // index -> AudioBuffer
  }
  connect(dest) { this.output.connect(dest?.input ?? dest); }
  disconnect()  { this.output.disconnect(); }

  async decodeArrayBuffer(arr) {
    // compatibilité promesse
    return new Promise((resolve, reject) => {
      this.context.decodeAudioData(arr, resolve, reject);
    });
  }

  // fetch streaming avec progress (0..1) — renvoie un ArrayBuffer
  async fetchWithProgress(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
    const total = Number(res.headers.get('Content-Length')) || 0;
    const reader = res.body?.getReader?.();
    if (!reader) { // fallback
      const buf = await res.arrayBuffer();
      onProgress?.(1);
      return buf;
    }
    let received = 0;
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) onProgress?.(received / total);
    }
    const size = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(size);
    let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length; }
    onProgress?.(1);
    return merged.buffer;
  }

  // charge un son → buffer en this.buffers[index]
  async loadOne(url, index, onItemProgress) {
    const arr = await this.fetchWithProgress(url, p => onItemProgress?.(index, p));
    const buf = await this.decodeArrayBuffer(arr);
    this.buffers[index] = buf;
    return buf;
  }

  // lecture partielle (trim)
  trigger(index, { startSec = 0, endSec, gain = 1 } = {}) {
    const buf = this.buffers[index]; if (!buf) return null;
    const src = this.context.createBufferSource(); src.buffer = buf;
    const g = this.context.createGain(); g.gain.value = gain;
    src.connect(g).connect(this.output);

    const dur = Math.max(0.01, (endSec ?? buf.duration) - startSec);
    src.start(this.context.currentTime + 0.005, startSec, dur);
    return src;
  }

  // mapping simple pour MIDI
  triggerByNote(note, vel = 1) {
    if (!this.buffers.length) return;
    const idx = note % this.buffers.length;
    return this.trigger(idx, { gain: vel });
  }
}
