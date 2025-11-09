// js/Sequencer.js
export class Sequencer {
  constructor(engine, gui, els) {
    this.engine = engine;
    this.gui = gui;
    this.els = els;

    this.isRecording = false;
    this.recordingStartTime = 0;
    this.recorded = [];
    this.sequences = [];
    this.currentPlaybackHandle = null; // Pour gérer l'arrêt de la lecture
  }

  updateButtons() {
    const hasLoaded = (this.engine.buffers || []).some(Boolean);
    if (this.els.btnRecordStart) this.els.btnRecordStart.disabled = this.isRecording || !hasLoaded;
    if (this.els.btnRecordStop) this.els.btnRecordStop.disabled = !this.isRecording;
  }

  startRecording() {
    if (this.isRecording) return;
    if (this.gui && this.gui.stopCurrent) this.gui.stopCurrent();
    this.isRecording = true;
    this.recordingStartTime = this.engine.context.currentTime;
    this.recorded = [];
    if (this.els.status) this.els.status.textContent = '🔴 RECORDING...';
    this.updateButtons();
  }

  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;
    if (this.recorded.length) {
      // Renumérote les séquences
      const newIndex = this.sequences.length + 1;
      const duration = this.recorded[this.recorded.length - 1].time + 0.5; // Ajout d'un petit buffer
      const seq = { id: Date.now(), name: `Sequence ${newIndex} (${this.recorded.length} hits)`, events: this.recorded.slice(), duration: duration };
      this.sequences.push(seq);
    }
    if (this.els.status) this.els.status.textContent = 'Idle';
    this.renderSequences();
    this.updateButtons();
  }

  recordHit(index) {
    if (!this.isRecording) return;
    const t = this.engine.context.currentTime - this.recordingStartTime;
    this.recorded.push({ index, time: t });
    if (this.els.status) this.els.status.textContent = `🔴 RECORDING: ${this.recorded.length}`;
  }

  stopPlayback() {
    if (this.currentPlaybackHandle) {
        this.currentPlaybackHandle.forEach(clearTimeout);
        this.currentPlaybackHandle = null;
    }
    if (this.els.status) this.els.status.textContent = 'Idle';
  }

  playSequence(seq) {
    this.stopPlayback(); // S'assurer que l'ancienne séquence est arrêtée
    if (!seq) return;

    if (this.gui && this.gui.stopCurrent) this.gui.stopCurrent(); // Arrête la lecture du pad simple
    if (this.els.status) this.els.status.textContent = `▶️ Playing ${seq.name}`;

    const ctx = this.engine.context;
    const start = ctx.currentTime + 0.05;
    const handles = [];

    seq.events.forEach(ev => {
      const ms = Math.max(0, (start + ev.time - ctx.currentTime) * 1000);
      handles.push(setTimeout(() => {
        const buf = this.engine.buffers[ev.index];
        if (!buf) return;
        const trim = (this.gui && this.gui.trims && this.gui.trims.get(ev.index)) || { startSec:0, endSec: buf.duration };
        this.engine.trigger(ev.index, { startSec: trim.startSec, endSec: trim.endSec });
      }, ms));
    });

    // Arrêt automatique + stockage des handles pour un arrêt manuel
    handles.push(setTimeout(() => this.stopPlayback(), seq.duration * 1000 + 100));
    this.currentPlaybackHandle = handles;
  }

  renderSequences() {
    const list = this.els.sequenceList; if (!list) return; list.innerHTML = '';
    this.sequences.forEach(s => {
      const li = document.createElement('li');
      li.style.display = 'flex'; li.style.gap = '8px'; li.style.alignItems = 'center'; li.style.marginBottom = '8px';
      
      const name = document.createElement('span'); name.textContent = s.name; name.style.flexGrow = '1';
      
      const play = document.createElement('button'); play.textContent = 'Play'; play.onclick = () => this.playSequence(s);
      
      // NOUVEAU BOUTON TÉLÉCHARGEMENT
      const dl = document.createElement('button'); 
      dl.textContent = 'DL (.wav)'; 
      dl.style.backgroundColor = '#2aa6d6'; dl.style.color = 'white';
      dl.onclick = () => this.downloadSequence(s);
      
      const del = document.createElement('button'); del.textContent = 'X'; del.onclick = () => { this.sequences = this.sequences.filter(x=>x.id!==s.id); this.renderSequences(); };
      
      li.appendChild(name); li.appendChild(play); li.appendChild(dl); li.appendChild(del); list.appendChild(li);
    });
  }

  // ====================== MÉTHODES DE TÉLÉCHARGEMENT ======================

  async downloadSequence(sequence) {
    if (!sequence) return;

    this.els.status.textContent = `Préparation de l'export de ${sequence.name}...`;
    
    const ctx = this.engine.context;
    const renderDuration = sequence.duration + 0.5; // Durée avec un petit buffer de sécurité
    
    const sampleRate = ctx.sampleRate;
    const frameCount = Math.ceil(renderDuration * sampleRate);

    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) {
      this.els.status.textContent = "Erreur: OfflineAudioContext n'est pas supporté par ce navigateur.";
      return;
    }
    
    // Création du contexte audio hors-ligne (2 canaux, même sample rate)
    const offlineCtx = new OfflineCtx(2, frameCount, sampleRate);
    const destination = offlineCtx.destination;
    
    // Planifier les événements de la séquence dans ce contexte hors-ligne
    sequence.events.forEach(event => {
        const { index, time } = event;
        const buf = this.engine.buffers[index];
        if (!buf) return;

        const src = offlineCtx.createBufferSource();
        src.buffer = buf;
        
        // Utiliser les trims stockés dans la GUI
        const trim = (this.gui && this.gui.trims && this.gui.trims.get(index)) || { startSec:0, endSec: buf.duration };
        const durationSec = Math.max(0.01, trim.endSec - trim.startSec);
        
        src.connect(destination);
        // time = offset dans la séquence, trim.startSec = offset dans le buffer
        src.start(time, trim.startSec, durationSec); 
    });

    try {
        const renderedBuffer = await offlineCtx.startRendering();
        this.els.status.textContent = `Rendu terminé. Encodage en WAV...`;

        // Encodage du buffer rendu en Blob WAV
        const wavBlob = this.encodeWAV(renderedBuffer, renderedBuffer.numberOfChannels, renderedBuffer.sampleRate);

        // Déclenchement du téléchargement
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sequence.name.replace(/[^a-zA-Z0-9_]/g, '')}_export.wav`; // Nettoyage du nom
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
    const bytesPerSample = 2; // 16-bit PCM (standard pour le WAV)

    const dataSize = numSamples * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    let offset = 0;
    
    // RIFF Header
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + dataSize, true); offset += 4; // File Length
    writeString(view, offset, 'WAVE'); offset += 4;
    
    // FMT Sub-chunk
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // Format Length
    view.setUint16(offset, 1, true); offset += 2;  // PCM Format
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numChannels * bytesPerSample, true); offset += 4; // Byte Rate
    view.setUint16(offset, numChannels * bytesPerSample, true); offset += 2; // Block Align
    view.setUint16(offset, bytesPerSample * 8, true); offset += 2; // Bits Per Sample
    
    // DATA Sub-chunk
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, dataSize, true); offset += 4; // Data Size
    
    // Écriture des données audio
    const output = new Float32Array(numSamples * numChannels);
    let index = 0;
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        output[index++] = buffers[c][i];
      }
    }

    // Conversion Float32 vers Int16 PCM (16-bit)
    for (let i = 0; i < output.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, output[i]));
        s = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(offset, s, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}