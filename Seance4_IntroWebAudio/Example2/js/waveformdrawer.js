// waveformdrawer.js
export default class WaveformDrawer {
  decodedAudioBuffer;
  peaks;
  canvas;
  displayWidth;
  displayHeight;
  sampleStep;
  color;

  init(decodedAudioBuffer, canvas, color, sampleStep) {
    this.decodedAudioBuffer = decodedAudioBuffer;
    this.canvas = canvas;
    this.displayWidth = canvas.width;
    this.displayHeight = canvas.height;
    this.color = color;
    this.sampleStep = sampleStep; // peut être undefined
    this.getPeaks();
  }

  max(values) {
    let max = -Infinity;
    for (let i = 0, len = values.length; i < len; i++) {
      const v = values[i];
      if (v > max) max = v;
    }
    return max;
  }

  // startY : décalage vertical ; height : hauteur de tracé
  drawWave(startY, height) {
    const ctx = this.canvas.getContext('2d');
    ctx.save();
    ctx.translate(0, startY);

    // Efface l’ancienne forme → chaque son a sa waveform propre
    ctx.clearRect(-0, -startY, this.displayWidth, height);

    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;

    const width = this.displayWidth;
    const coef = height / (2 * this.max(this.peaks));
    const halfH = height / 2;

    // ligne médiane
    ctx.beginPath();
    ctx.moveTo(0, halfH);
    ctx.lineTo(width, halfH);
    ctx.stroke();

    // haut
    ctx.beginPath();
    ctx.moveTo(0, halfH);
    for (let i = 0; i < width; i++) {
      const h = Math.round(this.peaks[i] * coef);
      ctx.lineTo(i, halfH + h);
    }
    ctx.lineTo(width, halfH);

    // bas
    ctx.moveTo(0, halfH);
    for (let i = 0; i < width; i++) {
      const h = Math.round(this.peaks[i] * coef);
      ctx.lineTo(i, halfH - h);
    }
    ctx.lineTo(width, halfH);

    ctx.fill();
    ctx.restore();
  }

  // Construction des pics (moyenne multi-canaux)
  getPeaks() {
    const buffer = this.decodedAudioBuffer;
    const width = this.displayWidth;
    const sampleSize = Math.ceil(buffer.length / width);

    // par défaut, on échantillonne 1/10e du bloc
    this.sampleStep = this.sampleStep || ~~(sampleSize / 10) || 1;

    const channels = buffer.numberOfChannels;
    this.peaks = new Float32Array(width); // init à 0

    for (let c = 0; c < channels; c++) {
      const chan = buffer.getChannelData(c);
      for (let i = 0; i < width; i++) {
        const start = ~~(i * sampleSize);
        const end = start + sampleSize;

        let peak = 0;
        for (let j = start; j < end; j += this.sampleStep) {
          const v = chan[j] || 0;
          const a = v < 0 ? -v : v;
          if (a > peak) peak = a;
        }
        this.peaks[i] += peak; // accumulation canal par canal
      }
    }

    // moyenne finale
    if (channels > 1) {
      for (let i = 0; i < width; i++) this.peaks[i] /= channels;
    }
  }
}
