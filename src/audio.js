import { clamp, lerp } from './utils.js';

const NOTES = [110, 130.81, 146.83, 164.81, 174.61, 196, 220, 261.63];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.music = null;
    this.engine = null;
    this.siren = null;
    this.volume = 0.55;
    this.playing = false;
    this.driving = false;
    this.speed = 0;
    this.stepTimer = 0;
    this.chordTimer = 0;
    this.chordIndex = 0;
    this.enabled = true;
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(this.ctx.destination);
      this._buildMusic();
      this._buildEngine();
      this._buildSiren();
    } catch { this.enabled = false; }
  }

  _osc(type, freq, gainValue = 0.1) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = gainValue;
    o.connect(g);
    return { o, g };
  }

  _buildMusic() {
    if (!this.ctx) return;
    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    this.music = { bus, voices: [] };
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      o.type = i === 0 ? 'sawtooth' : 'sine';
      o.frequency.value = NOTES[i * 2] * (i === 2 ? 2 : 1);
      o.detune.value = (i - 1) * 7;
      filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = 0.7;
      g.gain.value = i === 0 ? 0.035 : 0.05;
      o.connect(filter).connect(g).connect(bus);
      o.start();
      this.music.voices.push({ o, g, filter, base: o.frequency.value });
    }
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 0.05; lg.gain.value = 0.018;
    lfo.connect(lg).connect(bus.gain);
    lfo.start();

    const noiseSrc = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseSrc.buffer = buffer; noiseSrc.loop = true;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 380; nf.Q.value = 0.6;
    const ng = this.ctx.createGain(); ng.gain.value = 0.012;
    noiseSrc.connect(nf).connect(ng).connect(bus);
    noiseSrc.start();
  }

  _buildEngine() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.value = 50; o2.frequency.value = 25;
    filter.type = 'lowpass'; filter.frequency.value = 320; filter.Q.value = 4;
    g.gain.value = 0;
    o.connect(filter); o2.connect(filter); filter.connect(g).connect(this.master);
    o.start(); o2.start();
    this.engine = { o, o2, g, filter };
  }

  _buildSiren() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = 780;
    lfo.type = 'sine'; lfo.frequency.value = 0.7; lg.gain.value = 220;
    g.gain.value = 0;
    lfo.connect(lg).connect(o.frequency);
    o.connect(g).connect(this.master);
    o.start(); lfo.start();
    this.siren = { o, g, lfo };
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    if (this.volume === 0) this.enabled = false; else this.enabled = true;
  }

  setPlaying(on) {
    this.playing = on;
    if (!this.ctx) return;
    if (on) this.ctx.resume?.();
    const t = this.ctx.currentTime;
    this.music?.bus.gain.setTargetAtTime(on ? 0.6 : 0, t, 0.8);
    if (!on) this.engine?.g.gain.setTargetAtTime(0, t, 0.2);
  }

  setDriving(on) {
    this.driving = on;
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    this.engine.g.gain.setTargetAtTime(on ? 0.055 : 0, t, 0.15);
  }

  update(dt, { speed = 0, boosting = false, moving = false, heat = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    if (this.engine) {
      const s = clamp(Math.abs(speed) / 55, 0, 1.2);
      this.engine.o.frequency.setTargetAtTime(42 + s * 150 + (boosting ? 30 : 0), t, 0.06);
      this.engine.o2.frequency.setTargetAtTime(21 + s * 70, t, 0.08);
      this.engine.filter.frequency.setTargetAtTime(260 + s * 900, t, 0.1);
      if (this.driving) this.engine.g.gain.setTargetAtTime(0.045 + s * 0.05, t, 0.1);
    }
    if (this.siren) {
      this.siren.g.gain.setTargetAtTime(heat > 0 && this.playing ? 0.028 : 0, t, 0.5);
    }
    if (this.music) {
      this.chordTimer += dt;
      if (this.chordTimer > 9) {
        this.chordTimer = 0;
        this.chordIndex = (this.chordIndex + 1) % 5;
        const roots = [0, 3, 5, 2, 4];
        this.music.voices.forEach((v, i) => {
          const n = NOTES[(roots[this.chordIndex] + i * 2) % NOTES.length] * (i === 2 ? 2 : 1);
          v.o.frequency.setTargetAtTime(n, t, 1.4);
        });
      }
    }
    if (moving && !this.driving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.stepTimer = 0.46; this._step(); }
    } else this.stepTimer = Math.min(this.stepTimer, 0.2);
  }

  _step() {
    if (!this.ctx || !this.playing) return;
    const src = this.ctx.createBufferSource();
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = this.ctx.createGain(); g.gain.value = 0.13;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  burst({ freq = 180, dur = 0.12, gain = 0.12, type = 'noise' } = {}) {
    if (!this.ctx || !this.enabled || !this.playing) return;
    const t = this.ctx.currentTime;
    if (type === 'noise') {
      const src = this.ctx.createBufferSource();
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
      const g = this.ctx.createGain(); g.gain.value = gain;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
    } else {
      const { o, g } = this._osc(type, freq, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
      g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    }
  }

  shot() { this.burst({ freq: 900, dur: 0.14, gain: 0.16 }); this.burst({ freq: 120, dur: 0.2, gain: 0.1, type: 'sine' }); }
  hit() { this.burst({ freq: 520, dur: 0.09, gain: 0.09 }); }
  ui() { this.burst({ freq: 1600, dur: 0.05, gain: 0.05, type: 'sine' }); }
  cash() { this.burst({ freq: 1200, dur: 0.08, gain: 0.06, type: 'triangle' }); setTimeout(() => this.burst({ freq: 1800, dur: 0.1, gain: 0.05, type: 'triangle' }), 70); }
  horn() {
    if (!this.ctx || !this.playing) return;
    const t = this.ctx.currentTime;
    [392, 494].forEach(freq => {
      const { o, g } = this._osc('square', freq, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.02);
      g.gain.setValueAtTime(0.035, t + 0.28);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      g.connect(this.master);
      o.start(t); o.stop(t + 0.45);
    });
  }
  sirenBlip() { this.burst({ freq: 1100, dur: 0.18, gain: 0.05, type: 'triangle' }); }
}
