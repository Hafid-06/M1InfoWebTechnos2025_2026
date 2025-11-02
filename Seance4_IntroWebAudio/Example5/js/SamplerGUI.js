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
    this._previewDelay = 120;
    this._playPreviewTimer = null;
    
    // === Logique de Séquenceur ===
    this.isRecording = false;
    this.recordingStartTime = 0;
    this.recordedSequence = [];
    this.sequences = []; // [{ id, name, events: [], duration }]
    this.sequenceIdCounter = 1;
    this.currentSequencePlayback = null; // Pour gérer l'arrêt de la séquence
    // =======================================

    // Callback quand on modifie les trims dans la waveform (ESSENTIEL POUR SAUVEGARDER)
    this.waveform.onChange = ({ startSec, endSec }) => {
      if (this.currentIndex >= 0) {
        this.trims.set(this.currentIndex, { startSec, endSec });
      }
    };
  }

  // ====================== INITIALISATION DES PADS ======================
  initPads(count = 16) {
    const container = this.els.padGrid;
    container.innerHTML = '';
    this.pads.length = 0;
    for (let r = 3; r >= 0; r--) {
      for (let c = 0; c < 4; c++) {
        const idx = (3 - r) * 4 + c;
        const pad = document.createElement('button');
        pad.className = 'pad';
        pad.disabled = true;
        pad.innerHTML = `<div class="pad__progress"></div><div class="pad__err">ERR</div><span>${idx + 1}</span>`;
        pad.addEventListener('click', () => this.onPad(idx));
        container.appendChild(pad);
        this.pads[idx] = pad;
      }
    }
  }

  // ====================== MÉTHODES D'ÉTAT DES PADS ======================
  setPadProgress(i, ratio) {
    const bar = this.pads[i]?.querySelector('.pad__progress');
    if (bar) bar.style.width = `${Math.round((ratio || 0) * 100)}%`;
  }

  markLoaded(i) {
    const pad = this.pads[i];
    if (!pad) return;
    pad.disabled = false;
    pad.querySelector('.pad__err').style.display = 'none';
    pad.classList.remove('loading', 'failed');
    pad.classList.add('loaded');
  }

  markError(i, msg) {
    const pad = this.pads[i];
    if (!pad) return;
    pad.disabled = true;
    pad.querySelector('.pad__err').style.display = 'block';
    pad.classList.remove('loading', 'loaded');
    pad.classList.add('failed');
    pad.title = msg;
  }

  setActivePad(i) {
    this.pads.forEach(p => p.classList.remove('pad--active'));
    this.pads[i]?.classList.add('pad--active');
  }

  // ====================== LORSQU’ON CLIQUE SUR UN PAD ======================
  async onPad(i) {
    const buf = this.engine.buffers[i];

    // --- LOGIQUE D'ENREGISTREMENT ---
    if (this.isRecording) {
      const timestamp = this.engine.context.currentTime - this.recordingStartTime;
      // Enregistre l'événement: { index du pad, temps relatif }
      this.recordedSequence.push({ index: i, time: timestamp });
      this.els.status.textContent = `🔴 RECORDING: ${this.recordedSequence.length} events`;
    }
    // ------------------------------------------

    if (!buf) {
      const pad = this.pads[i];
      if (pad) {
        pad.disabled = true;
        pad.classList.add('loading');
      }

      const url = this.els.urls[i];
      try {
        const loaded = await this.engine.loadOne(url, i, (idx, p) =>
          this.setPadProgress(idx, p)
        );
        this.engine.buffers[i] = loaded;
        this.markLoaded(i);
        if (pad) {
          pad.classList.remove('loading');
          pad.classList.add('loaded');
        }
      } catch (err) {
        this.markError(i, String(err));
        if (pad) {
          pad.classList.remove('loading');
          pad.classList.add('failed');
        }
        return;
      }
    }

    const finalBuf = this.engine.buffers[i];
    if (!finalBuf) return;

    // Affiche/sélectionne la waveform du pad si on n'est pas en mode enregistrement pur
    if (!this.isRecording) {
        this.currentIndex = i;
        this.setActivePad(i);

        const url = this.els.urls[i] || `pad ${i + 1}`;
        this.els.currentName.textContent = url.split('/').pop() || url;

        const t =
            this.trims.get(i) || { startSec: 0, endSec: finalBuf.duration };
        this.waveform.setBuffer(finalBuf, t);

        this.els.btnPlay.disabled = this.els.btnStop.disabled = false;
    }
    
    // Joue le son directement
    const { startSec, endSec } =
      this.trims.get(i) || { startSec: 0, endSec: finalBuf.duration };
      
    this.engine.trigger(i, { startSec, endSec });
  }

  // ====================== GESTION DE LA LECTURE ======================
  playCurrent() {
    const i = this.currentIndex;
    if (i < 0) return;
    const buf = this.engine.buffers[i];
    if (!buf) return;

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {}
      this.currentSource = null;
    }

    const { startSec, endSec } =
      this.trims.get(i) || {
        startSec: this.waveform.startSec,
        endSec: this.waveform.endSec
      };
    const src = this.engine.trigger(i, { startSec, endSec });
    this.currentSource = src;
    this.els.status.textContent = `Playing ${startSec.toFixed(
      2
    )} → ${endSec.toFixed(2)}s`;

    const ctx = this.engine.context;
    const scheduled = ctx.currentTime + 0.005;
    const dur = Math.max(0.01, endSec - startSec);
    this._playStart = scheduled;
    this._playDur = dur;

    const tick = () => {
      const now = ctx.currentTime;
      let t = now - this._playStart;
      let ratio = Math.max(0, Math.min(1, t / this._playDur));
      const curSec = startSec + ratio * (endSec - startSec);
      this.waveform.setPlayhead(curSec);
      if (this.els.playProgress)
        this.els.playProgress.style.width = `${Math.round(ratio * 100)}%`;
      if (ratio < 1 && this.currentSource)
        this._rafId = requestAnimationFrame(tick);
      else this._rafId = null;
    };
    this._rafId = requestAnimationFrame(tick);

    src.onended = () => {
      if (this.currentSource === src) this.currentSource = null;
      this.els.status.textContent = 'Idle';
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      this.waveform.clearPlayhead();
      if (this.els.playProgress) this.els.playProgress.style.width = '0%';
    };
  }

  stopCurrent() {
    if (this._playPreviewTimer) {
      clearTimeout(this._playPreviewTimer);
      this._playPreviewTimer = null;
    }
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {}
      this.currentSource = null;
    }
    
    // Arrêter le playback de séquence si en cours
    if (this.currentSequencePlayback) {
        this.currentSequencePlayback.stop();
        this.currentSequencePlayback = null;
    }
    
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this.waveform.clearPlayhead();
    if (this.els.playProgress) this.els.playProgress.style.width = '0%';
    this.els.status.textContent = 'Idle';
  }

  // ====================== NOUVELLES MÉTHODES SÉQUENCEUR ======================

  updateSequencerButtons() {
    const hasLoadedPads = this.engine.buffers.some(Boolean);
    this.els.btnRecordStart.disabled = this.isRecording || !hasLoadedPads;
    this.els.btnRecordStop.disabled = !this.isRecording;
  }

  startRecording() {
    if (this.isRecording) return;
    this.stopCurrent(); 
    
    this.isRecording = true;
    this.recordedSequence = [];
    this.recordingStartTime = this.engine.context.currentTime;

    this.els.status.textContent = '🔴 RECORDING... Tap pads!';
    this.updateSequencerButtons();
  }

  stopRecording() {
  if (!this.isRecording) return;

  this.isRecording = false;

  if (this.recordedSequence.length === 0) {
    this.els.status.textContent = 'Recording stopped. No events recorded.';
  } else {
    const lastEventTime = this.recordedSequence[this.recordedSequence.length - 1].time;
    const duration = Math.max(0.1, lastEventTime);

    const sequenceNumber = this.sequences.length + 1;

    const newSequence = {
      id: Date.now(), // identifiant unique indépendant du numéro visible
      name: `Sequence ${sequenceNumber} (${this.recordedSequence.length} hits)`,
      events: [...this.recordedSequence],
      duration
    };

    this.sequences.push(newSequence);
    this.els.status.textContent = `${newSequence.name} saved!`;
    this.renderSequences();
  }

  this.updateSequencerButtons();
}


  playSequence(sequenceToPlay) {
    this.stopCurrent();
    
    const sequence = sequenceToPlay;
    if (!sequence) return;

    this.els.status.textContent = `▶️ Playing ${sequence.name}...`;

    const ctx = this.engine.context;
    const startTime = ctx.currentTime + 0.05; 
    let sequenceTimeoutHandles = [];

    sequence.events.forEach(event => {
        const { index, time } = event;
        const scheduledTime = startTime + time;
        
        const handle = setTimeout(() => {
            const buf = this.engine.buffers[index];
            if (!buf) return; 

            const { startSec, endSec } = this.trims.get(index) || { startSec: 0, endSec: buf.duration };
            this.engine.trigger(index, { startSec, endSec });
        }, (scheduledTime - ctx.currentTime) * 1000); 
        
        sequenceTimeoutHandles.push(handle);
    });

    this.currentSequencePlayback = {
        stop: () => {
            sequenceTimeoutHandles.forEach(clearTimeout);
            this.els.status.textContent = 'Idle';
            this.currentSequencePlayback = null;
        }
    };
    
    const stopHandle = setTimeout(() => {
        if (this.currentSequencePlayback) {
            this.currentSequencePlayback.stop();
        }
    }, sequence.duration * 1000 + 100);
    sequenceTimeoutHandles.push(stopHandle);
  }
  
  // ====================== TÉLÉCHARGEMENT EN WAV ======================

  async downloadSequence(sequence) {
    if (!sequence) return;

    this.els.status.textContent = `Préparation de l'export de ${sequence.name}...`;
    
    const ctx = this.engine.context;
    const renderDuration = sequence.duration + 0.5; 
    
    const sampleRate = ctx.sampleRate;
    const frameCount = Math.ceil(renderDuration * sampleRate);

    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) {
      this.els.status.textContent = "Erreur: OfflineAudioContext n'est pas supporté par ce navigateur.";
      return;
    }
    
    const offlineCtx = new OfflineCtx(2, frameCount, sampleRate); // 2 canaux
    const destination = offlineCtx.destination;
    
    // Planifier les événements de la séquence dans ce contexte hors-ligne
    sequence.events.forEach(event => {
        const { index, time } = event;
        const buf = this.engine.buffers[index];
        if (!buf) return;

        const src = offlineCtx.createBufferSource();
        src.buffer = buf;
        
        const { startSec, endSec } = this.trims.get(index) || { startSec: 0, endSec: buf.duration };
        const durationSec = Math.max(0.01, endSec - startSec);
        
        src.connect(destination);
        src.start(time, startSec, durationSec); 
    });

    try {
        const renderedBuffer = await offlineCtx.startRendering();
        this.els.status.textContent = `Rendu terminé. Encodage en WAV...`;

        const wavBlob = this.encodeWAV(renderedBuffer, renderedBuffer.numberOfChannels, renderedBuffer.sampleRate);

        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sequence.name.replace(/[^a-zA-Z0-9]/g, '_')}_export.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.els.status.textContent = `${sequence.name} téléchargé avec succès!`;

    } catch (e) {
        this.els.status.textContent = `Erreur lors de l'export: ${e.message}`;
        console.error("Erreur d'export:", e);
    }
  }


// ====================== FONCTION UTILITAIRE D'ENCODAGE (WAV) ======================

  encodeWAV(audioBuffer, numChannels, sampleRate) {
    const buffers = [];
    for (let c = 0; c < numChannels; c++) {
      buffers.push(audioBuffer.getChannelData(c));
    }
    
    const numSamples = audioBuffer.length;
    const bytesPerSample = 2; // 16-bit PCM

    const dataSize = numSamples * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    let offset = 0;
    
    // RIFF identifier
    writeString(view, offset, 'RIFF'); offset += 4;
    // file length (total - 8)
    view.setUint32(offset, 36 + dataSize, true); offset += 4;
    // WAVE identifier
    writeString(view, offset, 'WAVE'); offset += 4;
    
    // FMT sub-chunk
    writeString(view, offset, 'fmt '); offset += 4;
    // format length
    view.setUint32(offset, 16, true); offset += 4;
    // PCM format
    view.setUint16(offset, 1, true); offset += 2;
    // num channels
    view.setUint16(offset, numChannels, true); offset += 2;
    // sample rate
    view.setUint32(offset, sampleRate, true); offset += 4;
    // byte rate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint32(offset, sampleRate * numChannels * bytesPerSample, true); offset += 4;
    // block align (NumChannels * BitsPerSample/8)
    view.setUint16(offset, numChannels * bytesPerSample, true); offset += 2;
    // bits per sample
    view.setUint16(offset, bytesPerSample * 8, true); offset += 2;
    
    // DATA sub-chunk
    writeString(view, offset, 'data'); offset += 4;
    // data size
    view.setUint32(offset, dataSize, true); offset += 4;
    
    const output = new Float32Array(numSamples * numChannels);
    
    let index = 0;
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        output[index++] = buffers[c][i];
      }
    }

    // Convertir les Float32 en Int16 PCM (16-bit)
    for (let i = 0; i < output.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, output[i]));
        s = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(offset, s, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }

// ====================== GESTION DE LA LISTE DE SÉQUENCES ======================

  renderSequences() {
    const listEl = this.els.sequenceList;
    listEl.innerHTML = '';

    this.sequences.forEach(seq => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.marginBottom = '8px';
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = seq.name;
      nameSpan.style.marginRight = '10px';
      nameSpan.style.color = '#e6e6e6';
      nameSpan.style.flexGrow = 1;
      
      const btnPlay = document.createElement('button');
      btnPlay.textContent = 'Play';
      btnPlay.onclick = () => this.playSequence(seq);
      btnPlay.style.marginRight = '5px';
      
      // BOUTON TÉLÉCHARGEMENT
      const btnDownload = document.createElement('button');
      btnDownload.textContent = 'DL (.wav)';
      btnDownload.onclick = () => this.downloadSequence(seq);
      btnDownload.style.marginRight = '5px';
      btnDownload.style.backgroundColor = '#2aa6d6';
      btnDownload.style.color = 'white';
      
      const btnDelete = document.createElement('button');
      btnDelete.textContent = 'X';
      btnDelete.style.backgroundColor = '#5c1f1f'; 
      btnDelete.style.color = 'white';
      btnDelete.onclick = () => this.deleteSequence(seq.id);
      
      li.appendChild(nameSpan);
      li.appendChild(btnPlay);
      li.appendChild(btnDownload); 
      li.appendChild(btnDelete);
      listEl.appendChild(li);
    });
    
    this.updateSequencerButtons();
  }
  
  deleteSequence(id) {
    const initialLength = this.sequences.length;
    this.sequences = this.sequences.filter(s => s.id !== id);
    
    if (this.sequences.length < initialLength) {stop
        this.els.status.textContent = `Sequence ${id} deleted.`;
        this.renderSequences();
    }
  }

}