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
      const seq = { id: Date.now(), name: `Sequence ${this.sequences.length + 1}`, events: this.recorded.slice(), duration: this.recorded[this.recorded.length-1].time };
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

  playSequence(seq) {
    if (!seq) return;
    if (this.gui && this.gui.stopCurrent) this.gui.stopCurrent();
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
    // auto-clear: not managing stop handles beyond timeouts for brevity
  }

  renderSequences() {
    const list = this.els.sequenceList; if (!list) return; list.innerHTML = '';
    this.sequences.forEach(s => {
      const li = document.createElement('li');
      li.style.display = 'flex'; li.style.gap = '8px'; li.style.alignItems = 'center';
      const name = document.createElement('span'); name.textContent = s.name; name.style.flexGrow = '1';
      const play = document.createElement('button'); play.textContent = 'Play'; play.onclick = () => this.playSequence(s);
      const del = document.createElement('button'); del.textContent = 'X'; del.onclick = () => { this.sequences = this.sequences.filter(x=>x.id!==s.id); this.renderSequences(); };
      li.appendChild(name); li.appendChild(play); li.appendChild(del); list.appendChild(li);
    });
  }
}
