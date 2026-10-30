(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const STORAGE = {
    beat: "pocket-studio.beat.v1",
    lyrics: "pocket-studio.lyrics.v1",
  };
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  let master = null;
  let audioCtx = null;
  let noiseBuffer = null;

  function getCtx() {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
      master = audioCtx.createGain();
      master.gain.value = 0.85;
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 22;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      master.connect(compressor);
      compressor.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function getNoise(ctx) {
    if (!noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 1.2);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function midiToName(midi) {
    const octave = Math.floor(midi / 12) - 1;
    return NOTE_NAMES[((midi % 12) + 12) % 12] + octave;
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      /* storage can be unavailable in private mode */
    }
  }

  const toastEl = $("#toast");
  let toastTimer = null;

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("is-visible"), 1900);
  }

  /* ---------------- Drum synthesis ---------------- */

  function drumKick(time, level) {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(165, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.15);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.95 * level, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.44);
    osc.connect(gain).connect(master);
    osc.start(time);
    osc.stop(time + 0.46);

    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = "triangle";
    click.frequency.setValueAtTime(340, time);
    clickGain.gain.setValueAtTime(0.22 * level, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    click.connect(clickGain).connect(master);
    click.start(time);
    click.stop(time + 0.04);
  }

  function drumSnare(time, level) {
    const ctx = getCtx();
    if (!ctx) return;
    const noise = ctx.createBufferSource();
    noise.buffer = getNoise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5 * level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.23);
    noise.connect(hp).connect(gain).connect(master);
    noise.start(time);
    noise.stop(time + 0.25);

    const tone = ctx.createOscillator();
    const toneGain = ctx.createGain();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(190, time);
    tone.frequency.exponentialRampToValueAtTime(140, time + 0.1);
    toneGain.gain.setValueAtTime(0.26 * level, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    tone.connect(toneGain).connect(master);
    tone.start(time);
    tone.stop(time + 0.14);
  }

  function drumHat(time, open, level) {
    const ctx = getCtx();
    if (!ctx) return;
    const noise = ctx.createBufferSource();
    noise.buffer = getNoise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7800;
    const gain = ctx.createGain();
    const length = open ? 0.28 : 0.055;
    gain.gain.setValueAtTime(0.26 * level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + length);
    noise.connect(hp).connect(gain).connect(master);
    noise.start(time);
    noise.stop(time + length + 0.02);
  }

  function drumClap(time, level) {
    const ctx = getCtx();
    if (!ctx) return;
    const noise = ctx.createBufferSource();
    noise.buffer = getNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    [0, 0.012, 0.026].forEach((offset) => {
      gain.gain.setValueAtTime(0.42 * level, time + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, time + offset + 0.085);
    });
    noise.connect(bp).connect(gain).connect(master);
    noise.start(time);
    noise.stop(time + 0.16);
  }

  const DRUM_SOUNDS = {
    kick: (t, level) => drumKick(t, level),
    snare: (t, level) => drumSnare(t, level),
    hat: (t, level) => drumHat(t, false, level),
    clap: (t, level) => drumClap(t, level),
  };

  /* ---------------- Beat sequencer ---------------- */

  const TRACKS = [
    { id: "kick", name: "Kick", sub: "808" },
    { id: "snare", name: "Snare", sub: "Rim" },
    { id: "hat", name: "Hats", sub: "Closed" },
    { id: "clap", name: "Clap", sub: "Snap" },
  ];

  const PRESETS = {
    boombap: {
      kick: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
    house: {
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
    trap: {
      kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hat: [1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0],
      clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
    breaks: {
      kick: [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
      hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
  };

  function emptyPattern() {
    const pattern = {};
    TRACKS.forEach((track) => {
      pattern[track.id] = new Array(16).fill(0);
    });
    return pattern;
  }

  const beatState = {
    bpm: 92,
    pattern: JSON.parse(JSON.stringify(PRESETS.boombap)),
    levels: { kick: 0.9, snare: 0.8, hat: 0.65, clap: 0.75 },
    swing: 0,
    playing: false,
    step: 0,
    nextTime: 0,
    timer: null,
    queue: [],
    raf: null,
    painting: false,
    paintValue: 0,
    lastPainted: null,
  };

  function loadBeat() {
    const raw = safeStorageGet(STORAGE.beat);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved && typeof saved.bpm === "number" && saved.pattern) {
        beatState.bpm = Math.min(180, Math.max(60, saved.bpm));
        TRACKS.forEach((track) => {
          if (Array.isArray(saved.pattern[track.id]) && saved.pattern[track.id].length === 16) {
            beatState.pattern[track.id] = saved.pattern[track.id].map((v) => (v ? 1 : 0));
          }
          if (saved.levels && typeof saved.levels[track.id] === "number") {
            beatState.levels[track.id] = Math.min(1, Math.max(0, saved.levels[track.id]));
          }
        });
        if (typeof saved.swing === "number") {
          beatState.swing = Math.min(0.6, Math.max(0, saved.swing));
        }
      }
    } catch (err) {
      /* ignore corrupt state */
    }
  }

  function saveBeat() {
    safeStorageSet(
      STORAGE.beat,
      JSON.stringify({
        bpm: beatState.bpm,
        pattern: beatState.pattern,
        levels: beatState.levels,
        swing: beatState.swing,
      })
    );
  }

  function buildSequencer() {
    const sequencer = $("#sequencer");
    if (!sequencer) return;
    sequencer.innerHTML = "";
    const ruler = document.createElement("div");
    ruler.className = "step-ruler";
    ruler.setAttribute("aria-hidden", "true");
    ruler.innerHTML = "<span></span><div class=\"ruler-steps\" id=\"rulerSteps\"></div>";
    sequencer.appendChild(ruler);
    const rulerSteps = $("#rulerSteps", sequencer);
    for (let i = 0; i < 16; i += 1) {
      const mark = document.createElement("span");
      mark.textContent = String(i + 1);
      if (i % 4 === 0) mark.classList.add("is-beat");
      rulerSteps.appendChild(mark);
    }

    TRACKS.forEach((track) => {
      const row = document.createElement("div");
      row.className = "track";
      row.dataset.track = track.id;
      const label = document.createElement("div");
      label.className = "track-label";
      label.innerHTML = `<strong>${track.name}</strong><span>${track.sub}</span>`;
      const steps = document.createElement("div");
      steps.className = "steps";
      for (let i = 0; i < 16; i += 1) {
        const step = document.createElement("button");
        step.type = "button";
        step.className = "step";
        step.dataset.track = track.id;
        step.dataset.step = String(i);
        step.setAttribute("aria-label", `${track.name} step ${i + 1}`);
        if (i % 4 === 0) step.classList.add("is-beat");
        if (beatState.pattern[track.id][i]) step.classList.add("is-on");
        step.setAttribute("aria-pressed", beatState.pattern[track.id][i] ? "true" : "false");
        steps.appendChild(step);
      }
      row.appendChild(label);
      row.appendChild(steps);
      sequencer.appendChild(row);
    });
  }

  function syncSequencer() {
    $$("#sequencer .step").forEach((step) => {
      const on = !!beatState.pattern[step.dataset.track][Number(step.dataset.step)];
      step.classList.toggle("is-on", on);
      step.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function setCell(trackId, index, value) {
    if (!beatState.pattern[trackId]) return;
    beatState.pattern[trackId][index] = value ? 1 : 0;
    const selector = `.step[data-track="${trackId}"][data-step="${index}"]`;
    const el = $(selector);
    if (el) {
      el.classList.toggle("is-on", !!value);
      el.setAttribute("aria-pressed", value ? "true" : "false");
    }
  }

  function scheduleStep(step, time) {
    TRACKS.forEach((track) => {
      if (!beatState.pattern[track.id][step]) return;
      const level = beatState.levels[track.id];
      if (level <= 0.01) return;
      const play = DRUM_SOUNDS[track.id];
      if (play) play(time, level);
    });
    beatState.queue.push({ step, time });
  }

  function scheduler() {
    const ctx = getCtx();
    if (!ctx || !beatState.playing) return;
    const spb = 60 / beatState.bpm / 4;
    while (beatState.nextTime < ctx.currentTime + 0.12) {
      const swingOffset = beatState.step % 2 === 1 ? spb * beatState.swing : 0;
      scheduleStep(beatState.step, beatState.nextTime + swingOffset);
      beatState.nextTime += spb;
      beatState.step = (beatState.step + 1) % 16;
    }
  }

  function paintPlayhead() {
    if (!beatState.playing || !audioCtx) return;
    const ctx = audioCtx;
    let current = null;
    while (beatState.queue.length && beatState.queue[0].time <= ctx.currentTime) {
      current = beatState.queue.shift();
    }
    if (current) {
      beatState.lastPainted = current.step;
      $$("#sequencer .step").forEach((step) => {
        step.classList.toggle("is-playing", Number(step.dataset.step) === current.step);
      });
      const readout = $("#stepReadout");
      if (readout) readout.textContent = `Step ${current.step + 1} / 16`;
    }
    beatState.raf = requestAnimationFrame(paintPlayhead);
  }

  function startBeat() {
    const ctx = getCtx();
    if (!ctx) {
      toast("Audio is not supported here");
      return;
    }
    stopBeat(true);
    beatState.playing = true;
    beatState.step = 0;
    beatState.queue = [];
    beatState.nextTime = ctx.currentTime + 0.08;
    beatState.timer = window.setInterval(scheduler, 25);
    scheduler();
    const btn = $("#beatPlay");
    if (btn) {
      btn.classList.add("is-playing");
      btn.setAttribute("aria-label", "Stop beat");
    }
    const status = $("#beatStatus");
    if (status) status.textContent = "Looping…";
    paintPlayhead();
  }

  function stopBeat(silent) {
    beatState.playing = false;
    if (beatState.timer) window.clearInterval(beatState.timer);
    beatState.timer = null;
    if (beatState.raf) cancelAnimationFrame(beatState.raf);
    beatState.raf = null;
    beatState.queue = [];
    $$("#sequencer .step").forEach((step) => step.classList.remove("is-playing"));
    const btn = $("#beatPlay");
    if (btn) {
      btn.classList.remove("is-playing");
      btn.setAttribute("aria-label", "Play beat");
    }
    const readout = $("#stepReadout");
    if (readout) readout.textContent = "Step 1 / 16";
    const status = $("#beatStatus");
    if (status) status.textContent = "Loop ready";
    beatState.lastPainted = null;
  }

  function syncPresetChips() {
    const match = Object.keys(PRESETS).find((key) =>
      TRACKS.every((track) => JSON.stringify(PRESETS[key][track.id]) === JSON.stringify(beatState.pattern[track.id]))
    );
    $$("#presetRow .chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.preset === match);
    });
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    beatState.pattern = JSON.parse(JSON.stringify(preset));
    syncSequencer();
    syncPresetChips();
    saveBeat();
    const status = $("#beatStatus");
    if (status) status.textContent = `${name.charAt(0).toUpperCase()}${name.slice(1)} loaded`;
  }

  function buildMixer() {
    const grid = $("#mixGrid");
    if (!grid) return;
    grid.innerHTML = "";
    TRACKS.forEach((track) => {
      const item = document.createElement("div");
      item.className = `mix-item is-${track.id}`;
      const value = Math.round(beatState.levels[track.id] * 100);
      item.innerHTML = `
        <label for="mix-${track.id}"><span>${track.name}</span><span id="mixVal-${track.id}">${value}</span></label>
        <input id="mix-${track.id}" type="range" min="0" max="100" value="${value}" step="1" data-track="${track.id}" aria-label="${track.name} level" />
      `;
      grid.appendChild(item);
    });
    grid.addEventListener("input", (event) => {
      const input = event.target.closest("input[data-track]");
      if (!input) return;
      const trackId = input.dataset.track;
      beatState.levels[trackId] = Number(input.value) / 100;
      const readout = $(`#mixVal-${trackId}`);
      if (readout) readout.textContent = input.value;
      saveBeat();
    });
  }

  function initBeat() {
    loadBeat();
    buildSequencer();
    buildMixer();
    const swingRange = $("#swingRange");
    const swingValue = $("#swingValue");
    if (swingRange) {
      swingRange.value = String(Math.round(beatState.swing * 100));
      swingRange.addEventListener("input", () => {
        beatState.swing = Number(swingRange.value) / 100;
        if (swingValue) swingValue.textContent = `${swingRange.value}% swing`;
        saveBeat();
      });
    }
    if (swingValue) swingValue.textContent = `${Math.round(beatState.swing * 100)}% swing`;
    const bpmRange = $("#bpmRange");
    const bpmValue = $("#bpmValue");
    if (bpmRange) {
      bpmRange.value = String(beatState.bpm);
      bpmRange.addEventListener("input", () => {
        beatState.bpm = Number(bpmRange.value);
        if (bpmValue) bpmValue.textContent = String(beatState.bpm);
        saveBeat();
      });
    }
    if (bpmValue) bpmValue.textContent = String(beatState.bpm);

    $("#beatPlay")?.addEventListener("click", () => {
      if (beatState.playing) stopBeat();
      else startBeat();
    });

    $("#beatClear")?.addEventListener("click", () => {
      beatState.pattern = emptyPattern();
      syncSequencer();
      syncPresetChips();
      saveBeat();
      toast("Pattern cleared");
    });

    $$("#presetRow .chip").forEach((chip) => {
      chip.addEventListener("click", () => applyPreset(chip.dataset.preset));
    });

    const sequencer = $("#sequencer");
    if (sequencer) {
      sequencer.addEventListener("pointerdown", (event) => {
        const step = event.target.closest(".step");
        if (!step) return;
        event.preventDefault();
        beatState.painting = true;
        beatState.paintValue = step.classList.contains("is-on") ? 0 : 1;
        beatState.lastPainted = step;
        setCell(step.dataset.track, Number(step.dataset.step), beatState.paintValue);
        syncPresetChips();
        saveBeat();
      });

      window.addEventListener("pointermove", (event) => {
        if (!beatState.painting) return;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const step = target && target.closest ? target.closest(".step") : null;
        if (!step || step === beatState.lastPainted) return;
        beatState.lastPainted = step;
        setCell(step.dataset.track, Number(step.dataset.step), beatState.paintValue);
        syncPresetChips();
        saveBeat();
      });

      window.addEventListener("pointerup", () => {
        beatState.painting = false;
        beatState.lastPainted = null;
      });
      window.addEventListener("pointercancel", () => {
        beatState.painting = false;
        beatState.lastPainted = null;
      });
    }

    syncPresetChips();
  }

  /* ---------------- Piano ---------------- */

  const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12];
  const BLACK_KEYS = [
    { semi: 1, after: 0 },
    { semi: 3, after: 1 },
    { semi: 6, after: 3 },
    { semi: 8, after: 4 },
    { semi: 10, after: 5 },
  ];
  const VOICE_PRESETS = {
    grand: {
      oscillators: [
        { type: "triangle", detune: 0, gain: 0.7 },
        { type: "sine", detune: 6, gain: 0.45 },
      ],
      attack: 0.006,
      decay: 0.55,
      sustain: 0.24,
      release: 0.42,
      volume: 0.32,
    },
    epiano: {
      oscillators: [
        { type: "sine", detune: 0, gain: 0.85 },
        { type: "triangle", detune: 8, gain: 0.35 },
      ],
      attack: 0.004,
      decay: 0.45,
      sustain: 0.2,
      release: 0.55,
      volume: 0.34,
    },
    pluck: {
      oscillators: [{ type: "sawtooth", detune: 0, gain: 0.8 }],
      attack: 0.003,
      decay: 0.14,
      sustain: 0.05,
      release: 0.14,
      volume: 0.26,
      filter: 2100,
    },
    pad: {
      oscillators: [
        { type: "sawtooth", detune: -8, gain: 0.5 },
        { type: "sawtooth", detune: 8, gain: 0.5 },
      ],
      attack: 0.18,
      decay: 0.5,
      sustain: 0.4,
      release: 0.9,
      volume: 0.2,
      filter: 1350,
    },
  };
  const KEY_MAP = {
    a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
  };

  const piano = {
    octave: 4,
    voice: "grand",
    sustain: false,
    voices: new Map(),
    sustained: new Set(),
    pressed: new Map(),
    desktopKeys: new Map(),
    chordTimers: new Set(),
  };

  function baseMidi() {
    return (piano.octave + 1) * 12;
  }

  function startVoice(midi) {
    const ctx = getCtx();
    if (!ctx) return;
    if (piano.voices.has(midi)) releaseVoice(midi);
    const preset = VOICE_PRESETS[piano.voice] || VOICE_PRESETS.grand;
    const t = ctx.currentTime;
    const freq = midiToFreq(midi);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    let node = out;
    if (preset.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = preset.filter;
      filter.Q.value = 0.7;
      out.connect(filter);
      node = filter;
    }
    node.connect(master);

    const oscs = preset.oscillators.map((config) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = config.type;
      osc.frequency.setValueAtTime(freq, t);
      osc.detune.setValueAtTime(config.detune || 0, t);
      oscGain.gain.value = config.gain;
      osc.connect(oscGain).connect(out);
      osc.start(t);
      return osc;
    });

    const peak = preset.volume;
    out.gain.exponentialRampToValueAtTime(peak, t + preset.attack);
    out.gain.exponentialRampToValueAtTime(Math.max(peak * preset.sustain, 0.0001), t + preset.attack + preset.decay);

    const voice = { out, oscs, release: preset.release };
    piano.voices.set(midi, voice);
    return voice;
  }

  function releaseVoice(midi) {
    const voice = piano.voices.get(midi);
    if (!voice) return;
    piano.voices.delete(midi);
    piano.sustained.delete(midi);
    const ctx = audioCtx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const release = Math.max(voice.release, 0.08);
    if (typeof voice.out.gain.cancelAndHoldAtTime === "function") {
      voice.out.gain.cancelAndHoldAtTime(now);
    } else {
      voice.out.gain.cancelScheduledValues(now);
      voice.out.gain.setValueAtTime(Math.max(voice.out.gain.value, 0.0001), now);
    }
    voice.out.gain.exponentialRampToValueAtTime(0.0001, now + release);
    voice.oscs.forEach((osc) => {
      try {
        osc.stop(now + release + 0.03);
      } catch (err) {
        /* already stopped */
      }
    });
    window.setTimeout(() => {
      try {
        voice.out.disconnect();
      } catch (err) {
        /* disconnected */
      }
    }, (release + 0.1) * 1000);
  }

  function clearChordTimers() {
    piano.chordTimers.forEach((timer) => window.clearTimeout(timer));
    piano.chordTimers.clear();
  }

  function releaseAllVoices() {
    clearChordTimers();
    Array.from(piano.voices.keys()).forEach((midi) => releaseVoice(midi));
    piano.sustained.clear();
  }

  function flashNoteReadout(text) {
    const readout = $("#noteReadout");
    if (readout) readout.textContent = text;
    const wave = $(".note-wave");
    if (wave) {
      wave.classList.remove("is-on");
      void wave.offsetWidth;
      wave.classList.add("is-on");
    }
  }

  function playChord(offsets, name) {
    const ctx = getCtx();
    if (!ctx) return;
    releaseAllVoices();
    const base = baseMidi();
    const notes = offsets.split(",").map((value) => base + Number(value));
    const started = [];
    notes.forEach((midi, index) => {
      const timer = window.setTimeout(() => {
        piano.chordTimers.delete(timer);
        const voice = startVoice(midi);
        if (voice) started.push({ midi, voice });
      }, index * 48);
      piano.chordTimers.add(timer);
    });
    const releaseTimer = window.setTimeout(() => {
      piano.chordTimers.delete(releaseTimer);
      started.forEach(({ midi, voice }) => {
        if (piano.voices.get(midi) === voice) releaseVoice(midi);
      });
    }, 1150);
    piano.chordTimers.add(releaseTimer);
    flashNoteReadout(`${name} chord`);
  }

  function updateNoteReadout() {
    const readout = $("#noteReadout");
    if (!readout) return;
    const names = Array.from(piano.pressed.values()).map(midiToName);
    readout.textContent = names.length ? names.join(" · ") : "Play something";
    const wave = $(".note-wave");
    if (wave && names.length) {
      wave.classList.remove("is-on");
      void wave.offsetWidth;
      wave.classList.add("is-on");
    }
  }

  function pressKey(el, midi) {
    if (piano.pressed.get(el) === midi) return;
    el.classList.add("is-down");
    piano.pressed.set(el, midi);
    startVoice(midi);
    updateNoteReadout();
  }

  function releaseKey(el) {
    const midi = piano.pressed.get(el);
    if (midi == null) return;
    el.classList.remove("is-down");
    piano.pressed.delete(el);
    if (piano.sustain) {
      piano.sustained.add(midi);
    } else {
      releaseVoice(midi);
    }
    updateNoteReadout();
  }

  function buildKeyboard() {
    const keyboard = $("#keyboard");
    if (!keyboard) return;
    releaseAllVoices();
    piano.pressed.clear();
    piano.desktopKeys.clear();
    keyboard.innerHTML = "";
    const base = baseMidi();
    const whiteCount = WHITE_SEMITONES.length;
    WHITE_SEMITONES.forEach((semi, index) => {
      const key = document.createElement("button");
      key.type = "button";
      key.className = "white-key";
      key.dataset.midi = String(base + semi);
      key.setAttribute("aria-label", midiToName(base + semi));
      key.innerHTML = `<span>${midiToName(base + semi)}</span>`;
      keyboard.appendChild(key);
      if (index === 0) key.style.marginLeft = "0";
    });
    BLACK_KEYS.forEach((entry) => {
      const key = document.createElement("button");
      key.type = "button";
      key.className = "black-key";
      key.dataset.midi = String(base + entry.semi);
      key.setAttribute("aria-label", midiToName(base + entry.semi));
      key.style.left = `${((entry.after + 1) / whiteCount) * 100}%`;
      keyboard.appendChild(key);
    });
    const label = $("#octaveLabel");
    if (label) label.textContent = `C${piano.octave}`;
  }

  function initPiano() {
    buildKeyboard();
    const keyboard = $("#keyboard");
    if (!keyboard) return;
    const pointers = new Map();

    keyboard.addEventListener("pointerdown", (event) => {
      const key = event.target.closest(".white-key, .black-key");
      if (!key) return;
      event.preventDefault();
      const midi = Number(key.dataset.midi);
      pointers.set(event.pointerId, key);
      pressKey(key, midi);
    });

    keyboard.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const key = target && target.closest ? target.closest(".white-key, .black-key") : null;
      const previous = pointers.get(event.pointerId);
      if (!key || key === previous) return;
      if (previous) releaseKey(previous);
      pointers.set(event.pointerId, key);
      pressKey(key, Number(key.dataset.midi));
    });

    const endPointer = (event) => {
      const key = pointers.get(event.pointerId);
      if (!key) return;
      releaseKey(key);
      pointers.delete(event.pointerId);
    };
    keyboard.addEventListener("pointerup", endPointer);
    keyboard.addEventListener("pointercancel", endPointer);
    keyboard.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && event.buttons === 0) endPointer(event);
    });
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);

    $$("#voiceRow .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        piano.voice = chip.dataset.voice;
        $$("#voiceRow .chip").forEach((item) => item.classList.toggle("is-active", item === chip));
      });
    });

    $$("#chordGrid .chord-pad").forEach((pad) => {
      pad.addEventListener("pointerdown", () => pad.classList.add("is-down"));
      const settle = () => window.setTimeout(() => pad.classList.remove("is-down"), 220);
      pad.addEventListener("pointerup", settle);
      pad.addEventListener("pointercancel", settle);
      pad.addEventListener("pointerleave", settle);
      pad.addEventListener("click", () => playChord(pad.dataset.chord, pad.dataset.name));
    });

    $("#octDown")?.addEventListener("click", () => {
      piano.octave = Math.max(1, piano.octave - 1);
      buildKeyboard();
    });
    $("#octUp")?.addEventListener("click", () => {
      piano.octave = Math.min(7, piano.octave + 1);
      buildKeyboard();
    });

    $("#sustainBtn")?.addEventListener("click", (event) => {
      piano.sustain = !piano.sustain;
      event.currentTarget.setAttribute("aria-pressed", piano.sustain ? "true" : "false");
      event.currentTarget.textContent = piano.sustain ? "Sustain on" : "Sustain";
      if (!piano.sustain) {
        Array.from(piano.sustained).forEach((midi) => releaseVoice(midi));
        piano.sustained.clear();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const offset = KEY_MAP[event.key.toLowerCase()];
      if (offset == null) return;
      event.preventDefault();
      const midi = baseMidi() + offset;
      const key = $(`#keyboard .white-key[data-midi="${midi}"], #keyboard .black-key[data-midi="${midi}"]`);
      if (!key) return;
      piano.desktopKeys.set(event.key.toLowerCase(), key);
      pressKey(key, midi);
    });

    document.addEventListener("keyup", (event) => {
      const lower = event.key.toLowerCase();
      const key = piano.desktopKeys.get(lower);
      if (!key) return;
      releaseKey(key);
      piano.desktopKeys.delete(lower);
    });

    window.addEventListener("blur", () => {
      Array.from(piano.pressed.keys()).forEach((key) => releaseKey(key));
      piano.desktopKeys.clear();
    });
  }

  /* ---------------- Lyrics ---------------- */

  const RHYME_BANK = {
    ight: ["light", "night", "flight", "tight", "right", "sight", "bright", "might"],
    ay: ["day", "way", "play", "stay", "away", "okay", "display", "replay"],
    ain: ["rain", "pain", "chain", "again", "remain", "lane", "brain", "train"],
    ow: ["flow", "glow", "low", "slow", "know", "show", "grow", "road"],
    ee: ["free", "me", "see", "be", "three", "city", "energy", "memory"],
    ine: ["line", "shine", "mine", "fine", "divine", "design", "rhyme", "time"],
    ame: ["name", "game", "flame", "same", "frame", "claim", "aim", "fame"],
    ime: ["time", "rhyme", "climb", "prime", "crime", "sublime", "chime", "dime"],
    ove: ["love", "above", "move", "groove", "prove", "remove", "smooth", "truth"],
    ound: ["sound", "ground", "round", "found", "around", "pound", "crown", "down"],
    own: ["down", "town", "crown", "sound", "around", "known", "grown", "alone"],
    art: ["heart", "start", "part", "apart", "smart", "chart", "dark", "spark"],
    old: ["gold", "bold", "cold", "hold", "told", "soul", "control", "roll"],
    eam: ["dream", "stream", "beam", "team", "seem", "scheme", "gleam", "extreme"],
    irl: ["world", "girl", "whirl", "pearl", "unfurl", "curl", "swirl", "hurl"],
    one: ["one", "done", "run", "sun", "fun", "none", "young", "front"],
  };

  const lyrics = {
    title: "",
    text: "",
    saveTimer: null,
  };

  function lastWord(line) {
    const cleaned = line.replace(/[^\w'\s-]/g, " ").trim();
    if (!cleaned) return "";
    const parts = cleaned.split(/\s+/);
    return parts[parts.length - 1] || "";
  }

  function rhymeKey(word) {
    const clean = word.toLowerCase().replace(/[^a-z]/g, "");
    if (clean.length <= 2) return clean;
    return clean.slice(-2);
  }

  function rhymeTail(word) {
    const clean = word.toLowerCase().replace(/[^a-z]/g, "");
    const match = clean.match(/[aeiouy][a-z]*$/);
    return match ? match[0] : clean.slice(-3);
  }

  function estimateSyllables(word) {
    const clean = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!clean) return 0;
    const groups = clean.match(/[aeiouy]+/g);
    let count = groups ? groups.length : 1;
    if (clean.length > 2 && clean.endsWith("e") && !clean.endsWith("le") && !clean.endsWith("ee")) {
      count = Math.max(1, count - 1);
    }
    return Math.max(1, count);
  }

  function isSectionLine(line) {
    return /^\s*\[[^\]]*\]\s*$/.test(line);
  }

  function lineData() {
    return lyrics.text
      .split("\n")
      .map((line, index) => ({
        line,
        index,
        word: lastWord(line),
        section: isSectionLine(line),
      }))
      .filter((entry) => entry.line.trim().length > 0);
  }

  function lyricStats() {
    const lines = lineData();
    const words = lines
      .filter((entry) => !entry.section)
      .flatMap((entry) => entry.line.trim().split(/\s+/).filter(Boolean));
    const syllables = words.reduce((sum, word) => sum + estimateSyllables(word), 0);
    const groups = new Map();
    lines.forEach((entry) => {
      if (entry.section) return;
      const key = rhymeKey(entry.word);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    let rhymingLines = 0;
    groups.forEach((entries) => {
      if (entries.length > 1) rhymingLines += entries.length;
    });
    return { lines, words, syllables, rhymingLines, groups };
  }

  function renderGutter() {
    const gutter = $("#lyricGutter");
    const textarea = $("#lyricText");
    if (!gutter) return;
    const count = Math.max(1, (textarea ? textarea.value : lyrics.text).split("\n").length);
    const numbers = [];
    for (let i = 1; i <= count; i += 1) numbers.push(i);
    gutter.innerHTML = numbers.map((n) => `<div>${n}</div>`).join("");
  }

  function renderRhymes() {
    const stats = lyricStats();
    const chips = $("#rhymeChips");
    const seedEl = $("#rhymeSeed");
    if (!chips || !seedEl) return;
    const lines = stats.lines;
    const current = [...lines].reverse().find((entry) => !entry.section && entry.word);
    if (!current || !current.word) {
      seedEl.textContent = "—";
      chips.innerHTML = '<p class="hint">Add two or more lines to see rhyme matches.</p>';
      return;
    }
    seedEl.textContent = current.word;
    const seedKey = rhymeKey(current.word);
    const matches = [];
    stats.groups.forEach((entries, key) => {
      if (key !== seedKey || entries.length < 2) return;
      entries.forEach((entry) => {
        if (entry.index !== current.index && !entry.section) {
          matches.push({ word: entry.word, line: entry.line.trim(), number: entry.index + 1 });
        }
      });
    });
    if (!matches.length) {
      const tail = rhymeTail(current.word);
      const family = Object.keys(RHYME_BANK).find((key) => tail.endsWith(key) || key.endsWith(tail));
      const suggestions = family ? RHYME_BANK[family] : [];
      const filtered = suggestions.filter((word) => word.toLowerCase() !== current.word.toLowerCase());
      if (filtered.length) {
        chips.innerHTML = filtered
          .slice(0, 8)
          .map((word) => `<span class="rhyme-chip">${word}<small>${rhymeTail(word)}</small></span>`)
          .join("");
      } else {
        chips.innerHTML = '<p class="hint">Try another ending, or write a second line to compare.</p>';
      }
      return;
    }
    chips.innerHTML = matches
      .slice(0, 8)
      .map((match) => {
        const label = match.word || match.line;
        return `<span class="rhyme-chip">${escapeHtml(label)}<small>L${match.number}</small></span>`;
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function updateLyricStats() {
    const stats = lyricStats();
    const set = (id, value) => {
      const el = $(id);
      if (el) el.textContent = String(value);
    };
    set("#statLines", stats.lines.length);
    set("#statWords", stats.words.length);
    set("#statSyllables", stats.syllables);
    set("#statRhymes", stats.rhymingLines);
    renderGutter();
    renderRhymes();
    const textarea = $("#lyricText");
    const gutter = $("#lyricGutter");
    if (textarea && gutter) gutter.scrollTop = textarea.scrollTop;
  }

  function scheduleLyricSave() {
    const hint = $("#saveHint");
    if (hint) hint.textContent = "Saving…";
    window.clearTimeout(lyrics.saveTimer);
    lyrics.saveTimer = window.setTimeout(() => {
      safeStorageSet(STORAGE.lyrics, JSON.stringify({ title: lyrics.title, text: lyrics.text }));
      if (hint) hint.textContent = "Saved locally";
    }, 350);
  }

  function loadLyrics() {
    const raw = safeStorageGet(STORAGE.lyrics);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        lyrics.title = saved.title || "";
        lyrics.text = saved.text || "";
      } catch (err) {
        /* ignore corrupt state */
      }
    }
    const titleInput = $("#lyricTitle");
    const textarea = $("#lyricText");
    if (titleInput) titleInput.value = lyrics.title;
    if (textarea) textarea.value = lyrics.text;
    updateLyricStats();
  }

  function lyricDocument() {
    const title = lyrics.title.trim() || "Untitled song";
    return `${title}\n\n${lyrics.text}`.trim() + "\n";
  }

  function downloadLyrics() {
    const blob = new Blob([lyricDocument()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(lyrics.title.trim() || "untitled-song").replace(/[^\w\- ]+/g, "").trim() || "untitled-song"}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("Lyrics downloaded");
  }

  async function copyLyrics() {
    const text = lyricDocument();
    try {
      await navigator.clipboard.writeText(text);
      toast("Lyrics copied");
    } catch (err) {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      try {
        document.execCommand("copy");
        toast("Lyrics copied");
      } catch (err2) {
        toast("Copy not available");
      }
      helper.remove();
    }
  }

  function insertSection(label) {
    const textarea = $("#lyricText");
    if (!textarea) return;
    const start = typeof textarea.selectionStart === "number" ? textarea.selectionStart : textarea.value.length;
    const end = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const lead = before && !before.endsWith("\n") ? "\n" : "";
    const trail = after && !after.startsWith("\n") ? "\n" : "";
    const insertion = `${lead}${label}\n${trail}`;
    textarea.value = `${before}${insertion}${after}`;
    const position = before.length + insertion.length;
    lyrics.text = textarea.value;
    textarea.focus();
    textarea.setSelectionRange(position, position);
    updateLyricStats();
    scheduleLyricSave();
  }

  function initLyrics() {
    loadLyrics();
    const titleInput = $("#lyricTitle");
    const textarea = $("#lyricText");
    if (titleInput) {
      titleInput.addEventListener("input", () => {
        lyrics.title = titleInput.value;
        scheduleLyricSave();
      });
    }
    if (textarea) {
      textarea.addEventListener("input", () => {
        lyrics.text = textarea.value;
        updateLyricStats();
        scheduleLyricSave();
      });
      textarea.addEventListener("scroll", () => {
        const gutter = $("#lyricGutter");
        if (gutter) gutter.scrollTop = textarea.scrollTop;
      });
    }
    $$("#structureChips .structure-chip").forEach((chip) => {
      chip.addEventListener("click", () => insertSection(chip.dataset.section));
    });
    $("#lyricCopy")?.addEventListener("click", copyLyrics);
    $("#lyricDownload")?.addEventListener("click", downloadLyrics);
  }

  /* ---------------- Voice recorder ---------------- */

  const recorder = {
    mediaRecorder: null,
    stream: null,
    chunks: [],
    recording: false,
    startedAt: 0,
    timer: null,
    analyser: null,
    source: null,
    raf: null,
    data: null,
    takes: [],
    counter: 0,
    playback: null,
    playingId: null,
    audioCtx: null,
  };

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function drawIdleWave() {
    const canvas = $("#visualizer");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  function drawWave() {
    const canvas = $("#visualizer");
    if (!canvas || !recorder.analyser || !recorder.recording) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const analyser = recorder.analyser;
    const bufferLength = analyser.fftSize;
    if (!recorder.data || recorder.data.length !== bufferLength) {
      recorder.data = new Uint8Array(bufferLength);
    }
    analyser.getByteTimeDomainData(recorder.data);
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#c6ff4a");
    gradient.addColorStop(0.55, "#8fe000");
    gradient.addColorStop(1, "#55e7ff");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(198,255,74,0.5)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    const slice = width / bufferLength;
    for (let i = 0; i < bufferLength; i += 1) {
      const value = recorder.data[i] / 128;
      const y = (value * height) / 2;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * slice, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    recorder.raf = requestAnimationFrame(drawWave);
  }

  function stopWave() {
    if (recorder.raf) cancelAnimationFrame(recorder.raf);
    recorder.raf = null;
    recorder.analyser = null;
    if (recorder.source) {
      try {
        recorder.source.disconnect();
      } catch (err) {
        /* already disconnected */
      }
      recorder.source = null;
    }
    drawIdleWave();
  }

  function updateRecTimer() {
    const elapsed = (Date.now() - recorder.startedAt) / 1000;
    const timeEl = $("#recTime");
    if (timeEl) timeEl.textContent = formatDuration(elapsed);
  }

  function renderTakes() {
    const list = $("#recordingList");
    const count = $("#takeCount");
    if (count) count.textContent = `${recorder.takes.length} saved`;
    if (!list) return;
    if (!recorder.takes.length) {
      list.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/></svg>
          <p>Your takes will land here</p>
        </div>`;
      return;
    }
    list.innerHTML = recorder.takes
      .map((take) => {
        const playing = recorder.playingId === take.id;
        return `
          <div class="take" data-id="${take.id}">
            <button class="take-play" type="button" data-action="play" aria-label="${playing ? "Pause" : "Play"} ${escapeHtml(take.name)}">
              ${
                playing
                  ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.5" height="12" rx="1"/><rect x="13.5" y="6" width="3.5" height="12" rx="1"/></svg>'
                  : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>'
              }
            </button>
            <div class="take-info">
              <strong>${escapeHtml(take.name)}</strong>
              <span>${formatDuration(take.duration)} · ${(take.size / 1024).toFixed(0)} KB</span>
            </div>
            <div class="take-actions">
              <button class="icon-btn" type="button" data-action="download" aria-label="Download ${escapeHtml(take.name)}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M5 18h14"/></svg>
              </button>
              <button class="icon-btn" type="button" data-action="delete" aria-label="Delete ${escapeHtml(take.name)}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>
              </button>
            </div>
          </div>`;
      })
      .join("");
  }

  function stopPlayback() {
    if (recorder.playback) {
      recorder.playback.pause();
      recorder.playback = null;
    }
    recorder.playingId = null;
  }

  function togglePlayback(take) {
    if (recorder.playingId === take.id) {
      stopPlayback();
      renderTakes();
      return;
    }
    stopPlayback();
    const audio = new Audio(take.url);
    recorder.playback = audio;
    recorder.playingId = take.id;
    audio.addEventListener("ended", () => {
      recorder.playingId = null;
      recorder.playback = null;
      renderTakes();
    });
    audio.addEventListener("error", () => {
      toast("Could not play this take");
      recorder.playingId = null;
      recorder.playback = null;
      renderTakes();
    });
    audio.play().then(renderTakes).catch(() => {
      toast("Could not play this take");
      recorder.playingId = null;
      recorder.playback = null;
      renderTakes();
    });
  }

  function downloadTake(take) {
    const link = document.createElement("a");
    link.href = take.url;
    const ext = take.blob.type.includes("mp4") ? "m4a" : "webm";
    link.download = `${take.name.replace(/\s+/g, "-").toLowerCase()}.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast("Take downloaded");
  }

  function deleteTake(take) {
    if (recorder.playingId === take.id) stopPlayback();
    URL.revokeObjectURL(take.url);
    recorder.takes = recorder.takes.filter((item) => item.id !== take.id);
    renderTakes();
    toast("Take deleted");
  }

  function finalizeRecording() {
    const blob = new Blob(recorder.chunks, { type: recorder.mediaRecorder?.mimeType || "audio/webm" });
    recorder.chunks = [];
    if (blob.size === 0) {
      const status = $("#recStatus");
      if (status) status.textContent = "Nothing was captured";
      return;
    }
    recorder.counter += 1;
    const take = {
      id: `take-${Date.now()}`,
      name: `Take ${recorder.counter}`,
      blob,
      url: URL.createObjectURL(blob),
      duration: Math.max(0.1, (Date.now() - recorder.startedAt) / 1000),
      size: blob.size,
    };
    recorder.takes.unshift(take);
    renderTakes();
  }

  async function startRecording() {
    if (recorder.recording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      toast("Recording is not supported in this browser");
      const status = $("#recStatus");
      if (status) status.textContent = "Recording unsupported";
      return;
    }
    const status = $("#recStatus");
    if (status) status.textContent = "Requesting microphone…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      recorder.stream = stream;
      const ctx = getCtx();
      if (ctx) {
        recorder.audioCtx = ctx;
        recorder.source = ctx.createMediaStreamSource(stream);
        recorder.analyser = ctx.createAnalyser();
        recorder.analyser.fftSize = 1024;
        recorder.analyser.smoothingTimeConstant = 0.82;
        recorder.source.connect(recorder.analyser);
      }

      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      const mimeType = mimeCandidates.find((type) => {
        try {
          return MediaRecorder.isTypeSupported(type);
        } catch (err) {
          return false;
        }
      });
      recorder.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.chunks = [];
      recorder.mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) recorder.chunks.push(event.data);
      });
      recorder.mediaRecorder.addEventListener("stop", () => {
        finalizeRecording();
        if (recorder.stream) {
          recorder.stream.getTracks().forEach((track) => track.stop());
          recorder.stream = null;
        }
        const badge = $("#recBadge");
        if (badge) badge.hidden = true;
        const statusEl = $("#recStatus");
        if (statusEl) statusEl.textContent = "Take saved. Tap to record again";
      });
      recorder.mediaRecorder.start();
      recorder.recording = true;
      recorder.startedAt = Date.now();
      recorder.timer = window.setInterval(updateRecTimer, 250);
      const btn = $("#recBtn");
      if (btn) {
        btn.classList.add("is-recording");
        btn.setAttribute("aria-label", "Stop recording");
      }
      const badge = $("#recBadge");
      if (badge) badge.hidden = false;
      if (status) status.textContent = "Recording… tap to stop";
      updateRecTimer();
      drawWave();
    } catch (err) {
      if (status) status.textContent = "Microphone access is needed to record";
      toast("Microphone permission denied");
      if (recorder.stream) {
        recorder.stream.getTracks().forEach((track) => track.stop());
        recorder.stream = null;
      }
    }
  }

  function stopRecording() {
    if (!recorder.recording) return;
    recorder.recording = false;
    if (recorder.timer) window.clearInterval(recorder.timer);
    recorder.timer = null;
    stopWave();
    const btn = $("#recBtn");
    if (btn) {
      btn.classList.remove("is-recording");
      btn.setAttribute("aria-label", "Start recording");
    }
    try {
      recorder.mediaRecorder.stop();
    } catch (err) {
      if (recorder.stream) {
        recorder.stream.getTracks().forEach((track) => track.stop());
        recorder.stream = null;
      }
    }
  }

  function initVoice() {
    drawIdleWave();
    renderTakes();
    $("#recBtn")?.addEventListener("click", () => {
      if (recorder.recording) stopRecording();
      else startRecording();
    });
    $("#recordingList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const card = button.closest(".take");
      const take = card && recorder.takes.find((item) => item.id === card.dataset.id);
      if (!take) return;
      if (button.dataset.action === "play") togglePlayback(take);
      else if (button.dataset.action === "download") downloadTake(take);
      else if (button.dataset.action === "delete") deleteTake(take);
    });
  }

  /* ---------------- Shell ---------------- */

  function switchTab(name) {
    $$(".tab").forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    $$(".panel").forEach((panel) => {
      const active = panel.dataset.tab === name;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
      if (active) panel.scrollTop = 0;
    });
    const labels = { beat: "Beat Maker", piano: "Piano", lyrics: "Lyric Creator", voice: "Voice Recorder" };
    const label = $("#contextLabel");
    if (label) label.textContent = labels[name] || "";
    if (name === "piano") {
      const keyboard = $("#keyboard");
      if (keyboard && !keyboard.children.length) buildKeyboard();
    }
    if (name === "voice") drawIdleWave();
  }

  function initTabs() {
    const tabs = $$(".tab");
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
      tab.addEventListener("keydown", (event) => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[next].focus();
        tabs[next].click();
      });
    });
  }

  function initPanic() {
    $("#panicBtn")?.addEventListener("click", () => {
      stopBeat(true);
      releaseAllVoices();
      stopPlayback();
      toast("All sound stopped");
    });
  }

  function init() {
    initTabs();
    initBeat();
    initPiano();
    initLyrics();
    initVoice();
    initPanic();
    drawIdleWave();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
