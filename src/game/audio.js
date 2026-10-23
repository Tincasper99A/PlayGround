export class AudioEngine {
  constructor() {
    this.ctx = null
    this.master = null
    this.muted = false
    this.started = false
    this.engineNodes = null
    this.siren = null
  }

  init() {
    if (this.started) {
      this.ctx?.resume()
      return
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    this.ctx = new AudioContextClass()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.38
    const compressor = this.ctx.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.knee.value = 24
    compressor.ratio.value = 8
    compressor.attack.value = 0.005
    compressor.release.value = 0.28
    this.master.connect(compressor)
    compressor.connect(this.ctx.destination)
    this.noise = this.createNoise(2.4)
    this.startAmbience()
    this.started = true
  }

  createNoise(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.018 * white) / 1.018
      data[i] = last * 3.2
    }
    return buffer
  }

  startAmbience() {
    const source = this.ctx.createBufferSource()
    source.buffer = this.noise
    source.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 320
    const gain = this.ctx.createGain()
    gain.gain.value = 0.085
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    source.start()
    const padGain = this.ctx.createGain()
    padGain.gain.value = 0.022
    const padFilter = this.ctx.createBiquadFilter()
    padFilter.type = 'lowpass'
    padFilter.frequency.value = 720
    padGain.connect(padFilter)
    padFilter.connect(this.master)
    const frequencies = [55, 82.41, 110, 138.59]
    this.padOscillators = frequencies.map((frequency, index) => {
      const osc = this.ctx.createOscillator()
      osc.type = index % 2 === 0 ? 'sine' : 'triangle'
      osc.frequency.value = frequency
      osc.detune.value = index * 3 - 4
      const voice = this.ctx.createGain()
      voice.gain.value = index === 0 ? 0.55 : 0.16
      osc.connect(voice)
      voice.connect(padGain)
      osc.start()
      return osc
    })
  }

  setMuted(value) {
    this.muted = value
    if (this.master) this.master.gain.setTargetAtTime(value ? 0 : 0.38, this.ctx.currentTime, 0.06)
  }

  toggleMute() {
    this.setMuted(!this.muted)
    return this.muted
  }

  tone({ frequency = 440, endFrequency = 220, type = 'sine', duration = 0.2, gain = 0.2, delay = 0 }) {
    if (!this.ctx) return
    const now = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const amp = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, now)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration)
    amp.gain.setValueAtTime(0.0001, now)
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.008)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(amp)
    amp.connect(this.master)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  noiseBurst({ duration = 0.2, gain = 0.25, frequency = 1200, delay = 0, type = 'lowpass' }) {
    if (!this.ctx) return
    const now = this.ctx.currentTime + delay
    const source = this.ctx.createBufferSource()
    source.buffer = this.noise
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(frequency, now)
    filter.frequency.exponentialRampToValueAtTime(180, now + duration)
    const amp = this.ctx.createGain()
    amp.gain.setValueAtTime(gain, now)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    source.connect(filter)
    filter.connect(amp)
    amp.connect(this.master)
    source.start(now, Math.random() * 1.5)
    source.stop(now + duration)
  }

  gunshot() {
    this.noiseBurst({ duration: 0.22, gain: 0.5, frequency: 3200 })
    this.tone({ frequency: 150, endFrequency: 42, type: 'square', duration: 0.14, gain: 0.22 })
    this.tone({ frequency: 1100, endFrequency: 180, type: 'sawtooth', duration: 0.08, gain: 0.075 })
  }

  reload() {
    this.noiseBurst({ duration: 0.055, gain: 0.08, frequency: 2400, type: 'highpass' })
    this.tone({ frequency: 620, endFrequency: 390, type: 'square', duration: 0.06, gain: 0.05 })
    this.noiseBurst({ duration: 0.07, gain: 0.1, frequency: 3000, type: 'highpass', delay: 0.48 })
    this.tone({ frequency: 900, endFrequency: 520, type: 'square', duration: 0.08, gain: 0.06, delay: 0.48 })
  }

  footstep(sprint = false) {
    this.noiseBurst({ duration: sprint ? 0.09 : 0.07, gain: sprint ? 0.12 : 0.075, frequency: sprint ? 700 : 520 })
  }

  impact() {
    this.tone({ frequency: 120, endFrequency: 48, type: 'triangle', duration: 0.09, gain: 0.09 })
  }

  explosion() {
    this.noiseBurst({ duration: 1.2, gain: 0.85, frequency: 900 })
    this.tone({ frequency: 95, endFrequency: 28, type: 'sine', duration: 0.9, gain: 0.5 })
    this.tone({ frequency: 220, endFrequency: 36, type: 'sawtooth', duration: 0.55, gain: 0.2 })
  }

  pickup() {
    this.tone({ frequency: 520, endFrequency: 780, type: 'sine', duration: 0.15, gain: 0.12 })
    this.tone({ frequency: 780, endFrequency: 1180, type: 'sine', duration: 0.24, gain: 0.1, delay: 0.08 })
  }

  success() {
    const notes = [392, 523.25, 659.25, 783.99]
    notes.forEach((frequency, index) => {
      this.tone({ frequency, endFrequency: frequency * 1.01, type: 'triangle', duration: 0.38, gain: 0.12, delay: index * 0.11 })
    })
  }

  fail() {
    this.tone({ frequency: 220, endFrequency: 146, type: 'sawtooth', duration: 0.55, gain: 0.12 })
    this.tone({ frequency: 174, endFrequency: 98, type: 'triangle', duration: 0.75, gain: 0.1, delay: 0.16 })
  }

  click() {
    this.tone({ frequency: 1300, endFrequency: 820, type: 'square', duration: 0.04, gain: 0.035 })
  }

  startEngine() {
    if (!this.ctx || this.engineNodes) return
    const osc = this.ctx.createOscillator()
    const sub = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    sub.type = 'sine'
    osc.frequency.value = 52
    sub.frequency.value = 26
    filter.type = 'lowpass'
    filter.frequency.value = 380
    filter.Q.value = 5
    gain.gain.value = 0.0001
    osc.connect(filter)
    sub.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    osc.start()
    sub.start()
    gain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.18)
    this.engineNodes = { osc, sub, filter, gain }
  }

  updateEngine(speed, throttle) {
    if (!this.engineNodes || !this.ctx) return
    const now = this.ctx.currentTime
    const rpm = 46 + Math.min(180, Math.abs(speed) * 6.2 + Math.max(0, throttle) * 22)
    this.engineNodes.osc.frequency.setTargetAtTime(rpm, now, 0.06)
    this.engineNodes.sub.frequency.setTargetAtTime(rpm * 0.5, now, 0.08)
    this.engineNodes.filter.frequency.setTargetAtTime(300 + Math.abs(speed) * 26, now, 0.1)
    this.engineNodes.gain.gain.setTargetAtTime(0.055 + Math.min(0.09, Math.abs(speed) * 0.0028), now, 0.1)
  }

  stopEngine() {
    if (!this.engineNodes || !this.ctx) return
    const { osc, sub, gain } = this.engineNodes
    gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.12)
    osc.stop(this.ctx.currentTime + 0.5)
    sub.stop(this.ctx.currentTime + 0.5)
    this.engineNodes = null
  }

  setSiren(active) {
    if (!active) {
      if (this.siren) {
        this.siren.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1)
        this.siren.osc.stop(this.ctx.currentTime + 0.4)
        this.siren = null
      }
      return
    }
    if (!this.ctx || this.siren) return
    const osc = this.ctx.createOscillator()
    const lfo = this.ctx.createOscillator()
    const lfoGain = this.ctx.createGain()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = 740
    lfo.type = 'sine'
    lfo.frequency.value = 0.7
    lfoGain.gain.value = 170
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 900
    filter.Q.value = 2.4
    gain.gain.value = 0.0001
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    osc.start()
    lfo.start()
    gain.gain.setTargetAtTime(0.04, this.ctx.currentTime, 0.3)
    this.siren = { osc, lfo, gain }
  }

  horn() {
    this.tone({ frequency: 392, endFrequency: 392, type: 'square', duration: 0.28, gain: 0.14 })
    this.tone({ frequency: 523, endFrequency: 523, type: 'square', duration: 0.28, gain: 0.11 })
  }
}
