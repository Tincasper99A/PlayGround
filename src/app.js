const STYLES = {
  cinematic: {
    label: "Cinematic",
    palettes: [
      ["#071018", "#17394e", "#5d8aa3", "#e8b57a", "#f5eee1"],
      ["#0a0f1a", "#1d2d45", "#495d7a", "#e05d3d", "#f4d8b0"],
      ["#071210", "#154043", "#3f7a73", "#d9a05b", "#f0ead6"]
    ]
  },
  neon: {
    label: "Neon bloom",
    palettes: [
      ["#06020c", "#210636", "#ff2e93", "#00e5ff", "#a66bff"],
      ["#08020e", "#2a073d", "#ff6a00", "#00ffc8", "#ff2e93"],
      ["#05030f", "#170a35", "#7b2ff7", "#ff8a00", "#00f0ff"]
    ]
  },
  ethereal: {
    label: "Ethereal",
    palettes: [
      ["#0b1720", "#1c3b48", "#8ccfc3", "#f4c9d6", "#eaf6f4"],
      ["#101822", "#273c55", "#b6d8f2", "#f4dcc7", "#f6f1e7"],
      ["#0d1a1d", "#2b4e49", "#a6e3cf", "#f7c7b8", "#eef8f2"]
    ]
  },
  cosmic: {
    label: "Cosmic",
    palettes: [
      ["#03010a", "#170a30", "#7b2ff7", "#ff8a00", "#f9f871"],
      ["#02030c", "#0b1745", "#2f6bff", "#ff2e93", "#f9f871"],
      ["#06010b", "#2b0a3b", "#ff4f9a", "#5ce1e6", "#f6e27a"]
    ]
  },
  analog: {
    label: "Analog",
    palettes: [
      ["#17110d", "#3b2c21", "#b07a4a", "#d45a3e", "#efe3cc"],
      ["#121411", "#283328", "#7c8f5a", "#c46a3a", "#e8ddc7"],
      ["#1a1011", "#4a2624", "#b94f3f", "#e0a458", "#f1e6d2"]
    ]
  },
  brutalist: {
    label: "Brutalist",
    palettes: [
      ["#e9e4da", "#c7c0b2", "#ff4d00", "#0047ff", "#111111"],
      ["#e5e5e0", "#b8c0c4", "#ff4d00", "#121212", "#f4f0e8"],
      ["#f1ece2", "#d2c9b8", "#0047ff", "#ff4d00", "#101010"]
    ]
  }
};

const RATIOS = {
  "1:1": [1100, 1100],
  "4:5": [960, 1200],
  "16:9": [1280, 720],
  "9:16": [720, 1280]
};

const PROMPTS = [
  "A quiet monolith at the edge of a luminous sea",
  "Chrome flowers drifting through a violet void",
  "A glass observatory above an ocean of clouds",
  "Solar wind folding across a salt desert",
  "An impossible staircase made of morning light",
  "A bioluminescent forest after the rain",
  "Saturn rising over a brutalist courtyard",
  "A paper moon caught in silver birch branches",
  "A lone diver suspended in a cathedral of light",
  "Velvet mountains under a sky of liquid mercury",
  "A forgotten satellite garden orbiting in bloom",
  "Warm fog curling through a neon greenhouse"
];

const $ = (selector) => document.querySelector(selector);

const els = {
  stage: $("#stage"),
  frame: $("#artFrame"),
  canvas: $("#artCanvas"),
  loading: $("#stageLoading"),
  prompt: $("#promptInput"),
  form: $("#promptForm"),
  charCount: $("#charCount"),
  styleGrid: $("#styleGrid"),
  ratio: $("#ratioSelect"),
  detail: $("#detailRange"),
  detailValue: $("#detailValue"),
  generate: $("#generateBtn"),
  generateLabel: $(".generate-label"),
  surprise: $("#surpriseBtn"),
  reroll: $("#rerollBtn"),
  download: $("#downloadBtn"),
  motion: $("#motionBtn"),
  motionState: $("#motionState"),
  fullscreen: $("#fullscreenBtn"),
  currentPrompt: $("#currentPrompt"),
  artTitle: $("#artTitle"),
  artIndex: $("#artIndex"),
  artChip: $("#artChip"),
  historyStrip: $("#historyStrip"),
  clearHistory: $("#clearHistory"),
  toast: $("#toast")
};

const state = {
  prompt: els.prompt.value.trim(),
  style: "cinematic",
  ratio: "1:1",
  detail: 78,
  seed: 73491,
  generation: 0,
  history: [],
  historyId: 0,
  currentHistoryId: null,
  generating: false,
  tiltEnabled: false,
  fullscreen: false
};

let renderToken = 0;
let toastTimer = 0;
let motionHandler = null;
let historySeq = 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(hex, alpha) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function pickPalette(style, random) {
  const palettes = STYLES[style].palettes;
  return palettes[Math.floor(random() * palettes.length) % palettes.length];
}

function ratioValue(ratio = state.ratio) {
  const [width, height] = ratio.split(":").map(Number);
  return width / height;
}

function titleFromPrompt(prompt) {
  const stop = new Set(["a", "an", "the", "at", "of", "in", "on", "and", "with", "under", "through", "over", "for", "to", "from", "by"]);
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((word) => word && !stop.has(word))
    .slice(0, 3);
  const title = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return title || "Untitled dream";
}

function glow(ctx, x, y, radius, color, alpha) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.45, rgba(color, alpha * 0.35));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawBackground(ctx, width, height, palette, random) {
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, palette[0]);
  base.addColorStop(0.56, palette[1]);
  base.addColorStop(1, palette[0]);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const washes = 4 + Math.floor(random() * 3);
  for (let index = 0; index < washes; index += 1) {
    const colors = [palette[2], palette[3], palette[4]];
    glow(
      ctx,
      width * (0.08 + random() * 0.84),
      height * (0.08 + random() * 0.84),
      Math.max(width, height) * (0.18 + random() * 0.3),
      colors[index % colors.length],
      0.18 + random() * 0.18
    );
  }
}

function drawStars(ctx, width, height, palette, random, detail) {
  const count = Math.floor(70 + detail * 260);
  ctx.save();
  for (let index = 0; index < count; index += 1) {
    const x = random() * width;
    const y = random() * height * 0.78;
    const radius = random() < 0.9 ? random() * 1.2 + 0.2 : random() * 2.4 + 1;
    ctx.fillStyle = rgba(palette[4], 0.12 + random() * 0.65);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOrb(ctx, width, height, palette, random, detail) {
  const cx = width * (0.42 + random() * 0.18);
  const cy = height * (0.4 + random() * 0.14);
  const radius = Math.min(width, height) * (0.17 + random() * 0.1);

  glow(ctx, cx, cy, radius * 3.2, palette[2], 0.42);
  glow(ctx, cx - radius * 0.4, cy - radius * 0.4, radius * 1.3, palette[4], 0.2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.4 + random() * 0.8);
  ctx.scale(1, 0.3 + random() * 0.12);
  ctx.strokeStyle = rgba(palette[4], 0.32);
  ctx.lineWidth = Math.max(1.4, radius * 0.012);
  ctx.beginPath();
  ctx.arc(0, 0, radius * (1.6 + random() * 0.3), 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(palette[2], 0.5);
  ctx.lineWidth = Math.max(1, radius * 0.006);
  ctx.beginPath();
  ctx.arc(0, 0, radius * (1.88 + random() * 0.16), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const sphere = ctx.createRadialGradient(cx - radius * 0.34, cy - radius * 0.4, radius * 0.04, cx, cy, radius);
  sphere.addColorStop(0, rgba(palette[4], 0.98));
  sphere.addColorStop(0.18, rgba(palette[3], 0.98));
  sphere.addColorStop(0.52, rgba(palette[2], 0.96));
  sphere.addColorStop(0.86, rgba(palette[1], 0.98));
  sphere.addColorStop(1, rgba(palette[0], 1));
  ctx.fillStyle = sphere;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  const shade = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  shade.addColorStop(0.32, "rgba(0,0,0,0)");
  shade.addColorStop(0.78, rgba(palette[0], 0.42));
  shade.addColorStop(1, rgba(palette[0], 0.86));
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.strokeStyle = rgba(palette[4], 0.66);
  ctx.lineWidth = Math.max(1.2, radius * 0.012);
  ctx.shadowColor = rgba(palette[3], 0.9);
  ctx.shadowBlur = radius * 0.18;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.995, -0.9, 0.42);
  ctx.stroke();
  ctx.restore();

  const moons = Math.floor(2 + detail * 5);
  for (let index = 0; index < moons; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = radius * (1.35 + random() * 1.2);
    const moonRadius = radius * (0.012 + random() * 0.035);
    ctx.fillStyle = rgba(palette[4], 0.3 + random() * 0.5);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance * 0.55, moonRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRidges(ctx, width, height, palette, random, detail, prompt) {
  const horizon = height * (0.53 + random() * 0.08);
  const sunX = width * (0.28 + random() * 0.44);
  const sunRadius = Math.min(width, height) * (0.065 + random() * 0.045);

  glow(ctx, sunX, horizon - height * 0.16, sunRadius * 4.4, palette[3], 0.42);
  const sun = ctx.createRadialGradient(sunX, horizon - height * 0.16, 0, sunX, horizon - height * 0.16, sunRadius);
  sun.addColorStop(0, rgba(palette[4], 0.98));
  sun.addColorStop(0.6, rgba(palette[3], 0.95));
  sun.addColorStop(1, rgba(palette[3], 0));
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(sunX, horizon - height * 0.16, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  const haze = ctx.createLinearGradient(0, horizon - height * 0.08, 0, horizon + height * 0.1);
  haze.addColorStop(0, rgba(palette[3], 0));
  haze.addColorStop(0.48, rgba(palette[4], 0.22));
  haze.addColorStop(1, rgba(palette[2], 0));
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - height * 0.08, width, height * 0.18);

  ctx.save();
  for (let index = 0; index < 22; index += 1) {
    const spread = index / 22;
    const y = horizon + spread * spread * height * 0.38;
    const lineWidth = width * (0.04 + random() * 0.2) * (1 - spread * 0.6);
    ctx.fillStyle = rgba(palette[4], (1 - spread) * 0.09);
    ctx.fillRect(sunX - lineWidth / 2, y, lineWidth, height * 0.003 + 0.5);
  }
  ctx.restore();

  const layers = 5 + Math.floor(detail * 3);
  for (let layer = 0; layer < layers; layer += 1) {
    const depth = layer / Math.max(1, layers - 1);
    const baseY = horizon + depth * height * 0.14;
    const amplitude = height * (0.014 + depth * 0.045);
    const frequency = 1.2 + random() * 2.4 + layer * 0.4;
    const phase = random() * Math.PI * 2;
    const color = depth > 0.62 ? palette[0] : depth > 0.3 ? palette[1] : palette[2];
    const alpha = 0.42 + depth * 0.52;

    ctx.beginPath();
    ctx.moveTo(-width * 0.02, height * 1.02);
    for (let step = 0; step <= 48; step += 1) {
      const x = (step / 48) * width * 1.04 - width * 0.02;
      const y = baseY + Math.sin((step / 48) * Math.PI * frequency + phase) * amplitude + (random() - 0.5) * amplitude * 0.55;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width * 1.02, height * 1.02);
    ctx.closePath();
    ctx.fillStyle = rgba(color, alpha);
    ctx.fill();

    ctx.strokeStyle = rgba(palette[4], 0.055 + depth * 0.035);
    ctx.lineWidth = Math.max(0.6, height * 0.0014);
    ctx.stroke();
  }

  if (/monolith|tower|obelisk|statue|cathedral|arch/i.test(prompt)) {
    const monolithWidth = width * (0.028 + random() * 0.022);
    const monolithHeight = height * (0.23 + random() * 0.15);
    const x = sunX - monolithWidth / 2;
    const y = horizon - monolithHeight + height * 0.035;
    const stone = ctx.createLinearGradient(x, y, x + monolithWidth, y);
    stone.addColorStop(0, rgba(palette[0], 0.98));
    stone.addColorStop(0.18, rgba(palette[1], 0.98));
    stone.addColorStop(0.85, rgba(palette[0], 0.99));
    stone.addColorStop(1, rgba(palette[4], 0.2));
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.roundRect(x, y, monolithWidth, monolithHeight, [monolithWidth * 0.32, monolithWidth * 0.32, 2, 2]);
    ctx.fill();
    ctx.fillStyle = rgba(palette[4], 0.45);
    ctx.fillRect(x + monolithWidth * 0.16, y - height * 0.006, monolithWidth * 0.68, Math.max(1, height * 0.002));
    glow(ctx, sunX, y + height * 0.01, monolithWidth * 2.1, palette[3], 0.32);
  }

  const horizonLine = ctx.createLinearGradient(0, 0, width, 0);
  horizonLine.addColorStop(0, rgba(palette[4], 0));
  horizonLine.addColorStop(0.5, rgba(palette[4], 0.24));
  horizonLine.addColorStop(1, rgba(palette[4], 0));
  ctx.fillStyle = horizonLine;
  ctx.fillRect(0, horizon, width, Math.max(1, height * 0.0018));
}

function drawRibbons(ctx, width, height, palette, random, detail) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const count = Math.floor(9 + detail * 23);
  for (let index = 0; index < count; index += 1) {
    const startY = height * (0.1 + random() * 0.8);
    const endY = height * (0.1 + random() * 0.8);
    const gradient = ctx.createLinearGradient(0, startY, width, endY);
    const color = [palette[2], palette[3], palette[4]][index % 3];
    gradient.addColorStop(0, rgba(color, 0));
    gradient.addColorStop(0.32 + random() * 0.2, rgba(color, 0.08 + random() * 0.18));
    gradient.addColorStop(0.7, rgba(color, 0.05 + random() * 0.14));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = height * (0.003 + random() * 0.045);
    ctx.lineCap = "round";
    ctx.shadowColor = rgba(color, 0.55);
    ctx.shadowBlur = height * (0.01 + random() * 0.04);
    ctx.beginPath();
    ctx.moveTo(-width * 0.08, startY);
    ctx.bezierCurveTo(
      width * (0.2 + random() * 0.2),
      height * random(),
      width * (0.58 + random() * 0.24),
      height * random(),
      width * 1.08,
      endY
    );
    ctx.stroke();
  }
  ctx.restore();

  const cx = width * (0.35 + random() * 0.3);
  const cy = height * (0.35 + random() * 0.3);
  glow(ctx, cx, cy, Math.min(width, height) * 0.34, palette[4], 0.23);
  ctx.fillStyle = rgba(palette[4], 0.1);
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.min(width, height) * 0.14, Math.min(width, height) * 0.045, random() * Math.PI, 0, Math.PI * 2);
  ctx.fill();
}

function drawBloom(ctx, width, height, palette, random, detail) {
  const cx = width * (0.36 + random() * 0.28);
  const cy = height * (0.36 + random() * 0.26);
  const radius = Math.min(width, height) * (0.18 + random() * 0.1);

  glow(ctx, cx, cy, radius * 2.8, palette[2], 0.34);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(random() * Math.PI);
  const petals = Math.floor(20 + detail * 52);
  for (let index = 0; index < petals; index += 1) {
    const angle = (index / petals) * Math.PI * 2;
    const length = radius * (0.6 + random() * 0.62);
    const widthRatio = 0.05 + random() * 0.09;
    const color = [palette[2], palette[3], palette[4]][index % 3];
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = rgba(color, 0.1 + random() * 0.2);
    ctx.beginPath();
    ctx.ellipse(0, -length * 0.66, radius * widthRatio, length * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  const core = ctx.createRadialGradient(cx - radius * 0.12, cy - radius * 0.12, radius * 0.01, cx, cy, radius * 0.31);
  core.addColorStop(0, rgba(palette[4], 1));
  core.addColorStop(0.42, rgba(palette[3], 0.88));
  core.addColorStop(1, rgba(palette[2], 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.31, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rgba(palette[4], 0.36);
  ctx.lineWidth = Math.max(1, radius * 0.006);
  const rings = 3 + Math.floor(detail * 4);
  for (let index = 1; index <= rings; index += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (0.4 + index * 0.09), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGeometric(ctx, width, height, palette, random, detail) {
  ctx.fillStyle = rgba(palette[4], 0.78);
  ctx.fillRect(width * 0.06, height * 0.06, width * 0.88, Math.max(1, height * 0.004));
  ctx.fillRect(width * 0.06, height * 0.94, width * 0.88, Math.max(1, height * 0.004));

  const cx = width * (0.38 + random() * 0.14);
  const cy = height * (0.42 + random() * 0.12);
  const radius = Math.min(width, height) * (0.21 + random() * 0.1);
  ctx.fillStyle = rgba(palette[2], 0.96);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rgba(palette[4], 0.92);
  ctx.lineWidth = Math.max(2, radius * 0.035);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.translate(width * 0.64, height * 0.67);
  ctx.rotate(-0.38 + random() * 0.12);
  ctx.fillStyle = rgba(palette[3], 0.94);
  ctx.fillRect(-width * 0.33, -height * 0.045, width * 0.66, height * 0.09);
  ctx.restore();

  ctx.save();
  ctx.translate(width * 0.72, height * 0.27);
  ctx.rotate(0.28);
  ctx.fillStyle = rgba(palette[4], 0.9);
  ctx.fillRect(-width * 0.18, -height * 0.012, width * 0.36, Math.max(2, height * 0.024));
  ctx.restore();

  const columns = 6 + Math.floor(detail * 12);
  ctx.strokeStyle = rgba(palette[4], 0.09);
  ctx.lineWidth = 1;
  for (let index = 0; index <= columns; index += 1) {
    const x = (index / columns) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let index = 0; index <= columns; index += 1) {
    const y = (index / columns) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = rgba(palette[4], 0.9);
  ctx.beginPath();
  ctx.arc(width * 0.79, height * 0.77, Math.min(width, height) * 0.026, 0, Math.PI * 2);
  ctx.fill();
}

function addTexture(ctx, width, height, palette, random, amount) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const strength = amount * 255;
  for (let index = 0; index < data.length; index += 4) {
    const noise = (random() - 0.5) * strength;
    data[index] += noise;
    data[index + 1] += noise;
    data[index + 2] += noise;
  }
  ctx.putImageData(image, 0, 0);

  const vignette = ctx.createRadialGradient(width * 0.5, height * 0.46, Math.min(width, height) * 0.2, width * 0.5, height * 0.5, Math.max(width, height) * 0.74);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.72, "rgba(0,0,0,0.06)");
  vignette.addColorStop(1, rgba(palette[0], 0.52));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function compositionFor(prompt, style, random) {
  if (/flower|bloom|petal|garden|forest|branch/i.test(prompt)) return "bloom";
  if (/city|brutal|courtyard|architecture|building|structure/i.test(prompt)) return "geometric";
  if (/sea|ocean|mountain|desert|horizon|valley|monolith|tower|sunset|dune/i.test(prompt)) return "ridges";
  if (/ribbon|wind|aurora|silk|smoke|fog|curtain/i.test(prompt)) return "ribbons";
  if (style === "brutalist") return "geometric";
  if (style === "cinematic" || style === "analog") return random() < 0.7 ? "ridges" : "orb";
  if (style === "ethereal") return random() < 0.6 ? "bloom" : "ribbons";
  return random() < 0.55 ? "orb" : "ribbons";
}

function drawArtwork(canvas, options) {
  const { prompt, style, ratio, detail, seed } = options;
  const [width, height] = RATIOS[ratio] || RATIOS["1:1"];
  canvas.width = width;
  canvas.height = height;

  const random = mulberry32(hashString(`${prompt}|${style}|${seed}|${detail}`));
  const palette = pickPalette(style, random);
  const ctx = canvas.getContext("2d", { alpha: false });
  const isLight = style === "brutalist";
  const strength = clamp(detail, 20, 100) / 100;

  ctx.clearRect(0, 0, width, height);
  drawBackground(ctx, width, height, palette, random);

  if (!isLight) {
    drawStars(ctx, width, height, palette, random, strength);
  }

  const composition = compositionFor(prompt, style, random);
  if (composition === "orb") drawOrb(ctx, width, height, palette, random, strength);
  if (composition === "ridges") drawRidges(ctx, width, height, palette, random, strength, prompt);
  if (composition === "ribbons") drawRibbons(ctx, width, height, palette, random, strength);
  if (composition === "bloom") drawBloom(ctx, width, height, palette, random, strength);
  if (composition === "geometric") drawGeometric(ctx, width, height, palette, random, strength);

  if (style === "analog") {
    ctx.fillStyle = "rgba(0,0,0,0.035)";
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 1);
    }
  }

  addTexture(ctx, width, height, palette, random, isLight ? 0.018 : 0.05);
  return { width, height, composition, palette };
}

function fitFrame() {
  if (state.fullscreen) return;
  const stageRect = els.stage.getBoundingClientRect();
  const padding = window.innerWidth <= 900 ? 24 : 44;
  const maxWidth = Math.max(120, stageRect.width - padding);
  const maxHeight = Math.max(120, stageRect.height - padding);
  const ratio = ratioValue();
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  els.frame.style.width = `${Math.round(width)}px`;
  els.frame.style.height = `${Math.round(height)}px`;
  els.frame.style.setProperty("--ar", String(ratio));
}

function setGenerating(isGenerating) {
  state.generating = isGenerating;
  els.generate.classList.toggle("is-loading", isGenerating);
  els.generate.disabled = isGenerating;
  els.generateLabel.textContent = isGenerating ? "Rendering…" : "Generate image";
  els.stage.classList.toggle("is-generating", isGenerating);
  els.loading.classList.toggle("is-visible", isGenerating);
  document.body.dataset.generating = isGenerating ? "true" : "false";
}

function updateMeta(result) {
  state.generation += 1;
  els.artIndex.textContent = String(state.generation).padStart(2, "0");
  els.artTitle.textContent = titleFromPrompt(state.prompt);
  els.artChip.textContent = STYLES[state.style].label;
  els.currentPrompt.textContent = state.prompt;
  els.frame.style.setProperty("--ar", String(result.width / result.height));
}

function createThumbnail(source) {
  const size = 180;
  const thumb = document.createElement("canvas");
  thumb.width = size;
  thumb.height = size;
  const context = thumb.getContext("2d");
  const sourceRatio = source.width / source.height;
  let sx = 0;
  let sy = 0;
  let sw = source.width;
  let sh = source.height;
  if (sourceRatio > 1) {
    sw = source.height;
    sx = (source.width - sw) / 2;
  } else if (sourceRatio < 1) {
    sh = source.width;
    sy = (source.height - sh) / 2;
  }
  context.drawImage(source, sx, sy, sw, sh, 0, 0, size, size);
  return thumb.toDataURL("image/jpeg", 0.72);
}

function renderHistory() {
  els.historyStrip.replaceChildren();
  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Your creations will appear here.";
    els.historyStrip.append(empty);
    return;
  }

  for (const entry of state.history) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-thumb";
    if (entry.id === state.currentHistoryId) button.classList.add("is-current");
    button.dataset.historyId = String(entry.id);
    button.title = entry.prompt;
    button.setAttribute("aria-label", `Restore ${entry.title}`);
    const image = document.createElement("img");
    image.src = entry.thumb;
    image.alt = entry.title;
    button.append(image);
    els.historyStrip.append(button);
  }
}

function addHistory(thumb) {
  historySeq += 1;
  const entry = {
    id: historySeq,
    thumb,
    prompt: state.prompt,
    style: state.style,
    ratio: state.ratio,
    detail: state.detail,
    seed: state.seed,
    title: titleFromPrompt(state.prompt)
  };
  state.history.unshift(entry);
  state.history = state.history.slice(0, 8);
  state.currentHistoryId = entry.id;
  renderHistory();
}

function saveSettings() {
  try {
    localStorage.setItem("luma-settings", JSON.stringify({
      prompt: state.prompt,
      style: state.style,
      ratio: state.ratio,
      detail: state.detail
    }));
  } catch {
    /* Storage can be unavailable in private contexts. */
  }
}

async function generate({ withHistory = true, delay = 620 } = {}) {
  const prompt = els.prompt.value.trim() || "An untitled dream in soft light";
  const token = ++renderToken;
  setGenerating(true);

  if (delay > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, delay));
  }
  if (token !== renderToken) return;

  state.prompt = prompt;
  const result = drawArtwork(els.canvas, {
    prompt: state.prompt,
    style: state.style,
    ratio: state.ratio,
    detail: state.detail,
    seed: state.seed
  });

  els.canvas.classList.remove("is-ready");
  void els.canvas.offsetWidth;
  els.canvas.classList.add("is-ready");
  els.canvas.dataset.rendered = "1";
  updateMeta(result);
  fitFrame();
  setGenerating(false);
  document.documentElement.dataset.ready = "true";
  if (withHistory) addHistory(createThumbnail(els.canvas));
  saveSettings();
}

function setStyle(style, { announce = false } = {}) {
  if (!STYLES[style]) return;
  state.style = style;
  for (const button of els.styleGrid.querySelectorAll(".style-card")) {
    const active = button.dataset.style === style;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  if (announce) toast(`${STYLES[style].label} selected`);
}

function setMotionState(enabled) {
  state.tiltEnabled = enabled;
  els.motion.setAttribute("aria-pressed", String(enabled));
  els.motionState.textContent = enabled ? "On" : "Off";
  els.motionState.classList.toggle("is-on", enabled);
  if (!enabled) {
    els.frame.style.setProperty("--tilt-x", "0deg");
    els.frame.style.setProperty("--tilt-y", "0deg");
    els.frame.style.setProperty("--shine-x", "30%");
    els.frame.style.setProperty("--shine-y", "20%");
  }
}

function handleOrientation(event) {
  if (!state.tiltEnabled) return;
  const gamma = clamp(event.gamma || 0, -32, 32);
  const beta = clamp((event.beta || 45) - 45, -34, 34);
  els.frame.style.setProperty("--tilt-y", `${(gamma * 0.17).toFixed(2)}deg`);
  els.frame.style.setProperty("--tilt-x", `${(-beta * 0.12).toFixed(2)}deg`);
  els.frame.style.setProperty("--shine-x", `${(50 + gamma * 1.3).toFixed(1)}%`);
  els.frame.style.setProperty("--shine-y", `${(30 + beta * 0.9).toFixed(1)}%`);
}

async function toggleMotion() {
  if (state.tiltEnabled) {
    if (motionHandler) window.removeEventListener("deviceorientation", motionHandler, true);
    motionHandler = null;
    setMotionState(false);
    toast("Tilt control off");
    return;
  }

  if (typeof window.DeviceOrientationEvent === "undefined") {
    toast("Motion sensors are not available on this device");
    return;
  }

  try {
    if (typeof window.DeviceOrientationEvent.requestPermission === "function") {
      const permission = await window.DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") {
        toast("Motion access was not granted");
        return;
      }
    }
  } catch {
    toast("Motion permission could not be requested");
    return;
  }

  motionHandler = handleOrientation;
  window.addEventListener("deviceorientation", motionHandler, true);
  setMotionState(true);
  toast("Tilt enabled — move your device");
}

function toast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
}

function downloadArtwork() {
  if (els.canvas.dataset.rendered !== "1") {
    toast("Generate an image first");
    return;
  }
  els.canvas.toBlob((blob) => {
    if (!blob) {
      toast("Could not prepare the download");
      return;
    }
    const slug = state.prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "luma-artwork";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${slug}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    toast("Artwork downloaded");
  }, "image/png");
}

function toggleFullscreen() {
  state.fullscreen = !state.fullscreen;
  els.frame.classList.toggle("is-fullscreen", state.fullscreen);
  document.body.classList.toggle("has-fullscreen", state.fullscreen);
  els.fullscreen.setAttribute("aria-label", state.fullscreen ? "Exit fullscreen preview" : "Enter fullscreen preview");
  if (!state.fullscreen) window.requestAnimationFrame(fitFrame);
  toast(state.fullscreen ? "Fullscreen preview — press Esc to exit" : "Fullscreen off");
}

function applySavedSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("luma-settings") || "null");
    if (!saved) return;
    if (typeof saved.prompt === "string" && saved.prompt.trim()) {
      els.prompt.value = saved.prompt.slice(0, 220);
      state.prompt = els.prompt.value.trim();
    }
    if (STYLES[saved.style]) setStyle(saved.style);
    if (RATIOS[saved.ratio]) {
      state.ratio = saved.ratio;
      els.ratio.value = saved.ratio;
    }
    if (Number.isFinite(saved.detail)) {
      state.detail = clamp(saved.detail, 20, 100);
      els.detail.value = String(state.detail);
    }
  } catch {
    /* Ignore malformed settings. */
  }
}

function updateDetail() {
  state.detail = Number(els.detail.value);
  els.detailValue.textContent = `${state.detail}%`;
  const progress = ((state.detail - 20) / 80) * 100;
  els.detail.style.setProperty("--range-progress", `${progress}%`);
}

function syncCharCount() {
  els.charCount.textContent = `${els.prompt.value.length} / 220`;
}

function init() {
  applySavedSettings();
  syncCharCount();
  updateDetail();
  setStyle(state.style);
  fitFrame();
  renderHistory();

  els.prompt.addEventListener("input", syncCharCount);
  els.detail.addEventListener("input", updateDetail);

  els.styleGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".style-card");
    if (!button) return;
    setStyle(button.dataset.style, { announce: true });
  });

  els.ratio.addEventListener("change", () => {
    state.ratio = els.ratio.value;
    fitFrame();
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.generating) return;
    state.seed = Math.floor(Math.random() * 900000) + 1000;
    generate();
  });

  els.reroll.addEventListener("click", () => {
    if (state.generating) return;
    state.seed = Math.floor(Math.random() * 900000) + 1000;
    els.prompt.value = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    state.prompt = els.prompt.value;
    syncCharCount();
    generate();
  });

  els.surprise.addEventListener("click", () => {
    const styles = Object.keys(STYLES);
    const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    els.prompt.value = prompt;
    state.prompt = prompt;
    setStyle(styles[Math.floor(Math.random() * styles.length)]);
    syncCharCount();
    if (state.generating) return;
    state.seed = Math.floor(Math.random() * 900000) + 1000;
    generate();
    toast("A little serendipity");
  });

  els.download.addEventListener("click", downloadArtwork);
  els.motion.addEventListener("click", toggleMotion);
  els.fullscreen.addEventListener("click", toggleFullscreen);

  els.historyStrip.addEventListener("click", (event) => {
    const button = event.target.closest(".history-thumb");
    if (!button || state.generating) return;
    const entry = state.history.find((item) => String(item.id) === button.dataset.historyId);
    if (!entry) return;
    els.prompt.value = entry.prompt;
    state.prompt = entry.prompt;
    state.seed = entry.seed;
    state.ratio = entry.ratio;
    state.detail = entry.detail;
    els.ratio.value = entry.ratio;
    els.detail.value = String(entry.detail);
    updateDetail();
    syncCharCount();
    setStyle(entry.style);
    state.currentHistoryId = entry.id;
    renderHistory();
    generate({ withHistory: false, delay: 180 });
  });

  els.clearHistory.addEventListener("click", () => {
    state.history = [];
    state.currentHistoryId = null;
    renderHistory();
    toast("History cleared");
  });

  els.prompt.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      els.form.requestSubmit();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.fullscreen) toggleFullscreen();
  });

  window.addEventListener("resize", fitFrame);
  if ("ResizeObserver" in window) {
    new ResizeObserver(fitFrame).observe(els.stage);
  }

  window.addEventListener("orientationchange", () => window.setTimeout(fitFrame, 220));

  state.seed = 73491;
  generate({ delay: 240 });
}

init();
