import * as THREE from '../vendor/three.module.js';
import { buildWorld, CITY, groundHeightAt, resolveCircle } from './world.js';
import { Player, Pedestrian, OnlineSquad } from './actors.js';
import { Vehicle } from './vehicles.js';
import { UI, drawGaragePreview } from './ui.js';
import { AudioEngine } from './audio.js';
import { clamp, damp, angleDamp, angleDelta, dist, load, store, pick, makeCanvas, roundRect, formatMoney } from './utils.js';

const $ = (id) => document.getElementById(id);
const isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const isSmall = window.innerWidth < 900;
if (isTouch) document.body.classList.add('touch');

const SAVE_KEY = 'neon-district.save.v1';
const save = load(SAVE_KEY, {
  cash: 4250, xp: 120, level: 1, car: 0,
  quality: isTouch ? 'medium' : 'high',
  volume: 55, sens: 100, invert: false, dynamic: true,
});

const CARS = [
  { name: 'VANTA GT', cls: 'SPORTS · RWD', color: 0xd93a4a, maxSpeed: 58, underglow: 0xff2d75, level: 1 },
  { name: 'KYOTO RX', cls: 'DRIFT · AWD', color: 0x2ff3ff, maxSpeed: 52, underglow: 0x2ff3ff, level: 1 },
  { name: 'NIGHTFALL', cls: 'MUSCLE · RWD', color: 0xffcc4d, maxSpeed: 62, underglow: 0xffcc4d, level: 2 },
  { name: 'PHANTOM', cls: 'HYPER · AWD', color: 0xc78bff, maxSpeed: 70, underglow: 0xc78bff, level: 5 },
  { name: 'VANGUARD', cls: 'SUV · AWD', color: 0x8dffb0, maxSpeed: 46, underglow: 0x8dffb0, level: 3 },
  { name: 'SIDEWINDER', cls: 'MUSCLE · RWD', color: 0xff7a3d, maxSpeed: 56, underglow: 0xff7a3d, level: 4 },
];

const SIGN_NAMES = ['NOVA_9', 'GHOSTFOX', 'KIRA', 'M4VERICK', 'SOULJA', 'R3DLINE', 'ZEROCOOL', 'NYX', 'VANDAL', 'TAXI_DRIVER'];
const CHAT_LINES = [
  ['NOVA_9', 'anyone running deliveries downtown?'],
  ['GHOSTFOX', 'cops are heavy near the dock, watch out'],
  ['KIRA', 'that Vanta GT sounds insane at night'],
  ['M4VERICK', 'crew meet at the fountain in 5'],
  ['R3DLINE', 'just cleared a 3 star chase 😤'],
  ['ZEROCOOL', 'who wants to race the boulevard?'],
  ['NYX', 'double cash on deliveries today, easy money'],
  ['SOULJA', 'spotted a gold marker by the arcade'],
  ['VANDAL', 'new to the district, how do i get a car?'],
  ['TAXI_DRIVER', 'ride anywhere for $50, dm me'],
];
const JOB_DEFS = [
  { type: 'delivery', name: 'HOT DELIVERY', icon: '$', color: '#ffcc4d', time: 120, reward: 2400, xp: 70, sub: 'Steal a ride, then hit the drop-off' },
  { type: 'bounty', name: 'BOUNTY: GHOST', icon: '★', color: '#ff2d75', time: 0, reward: 1800, xp: 55, sub: 'Reach the target and tag them' },
  { type: 'race', name: 'STREET SPRINT', icon: '⚑', color: '#2ff3ff', time: 120, reward: 3200, xp: 90, sub: 'Hit 3 checkpoints before the clock' },
  { type: 'cash', name: 'CASH GRAB', icon: '◆', color: '#8dffb0', time: 100, reward: 2600, xp: 75, sub: 'Collect 3 stashes on foot' },
];

const SESSIONS = [
  { name: 'SUNSET CITY · FREEMODE', mode: 'Freemode', weather: 'Golden hour', region: 'EU-WEST', players: 24, max: 32, ping: 24 },
  { name: 'NEON DOCKS · DELIVERIES', mode: 'Jobs', weather: 'Night rain', region: 'US-EAST', players: 18, max: 24, ping: 41 },
  { name: 'MIDTOWN · STREET RACES', mode: 'Racing', weather: 'Clear night', region: 'EU-NORTH', players: 12, max: 16, ping: 33 },
  { name: 'OLD QUARTER · BOUNTIES', mode: 'Bounty', weather: 'Dusk', region: 'ASIA-SE', players: 28, max: 32, ping: 72 },
  { name: 'THE STRIP · FREEMODE', mode: 'Freemode', weather: 'Sunset', region: 'US-WEST', players: 9, max: 24, ping: 58 },
];

// ------------------------------------------------------------------ renderer
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance', stencil: false });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.25, 2800);
const basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
let resolutionScale = 1;
renderer.setPixelRatio(basePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = save.quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const ui = new UI();
const audio = new AudioEngine();

let state = 'loading';
let world = null;
let player = null;
let online = null;
let vehicles = [];
let peds = [];
let police = [];
let jobs = [];
let activeMission = null;
let missionMarkers = [];
let markers = [];
let bountyPed = null;
let garageMarker = null;
let garagePos = { x: 210, z: 42 };
let heat = 0;
let heatDecay = 0;
let spawnTimer = 0;
let pedHitCooldown = 0;
let bustedTimer = 0;
let respawning = false;
let onlineChatTimer = 8;
let onlineCount = 24;
let cameraShake = 0;
let elapsed = 0;
let last = performance.now();
let fpsAccum = 0, fpsFrames = 0, fpsAvg = 60, resTimer = 0, highFpsTimer = 0;
let lastLookTime = 0;
let loadProgress = 0;
let pendingStart = null;
let menuNeedsRender = true;

const camState = {
  yaw: Math.PI + 0.15,
  pitch: 0.2,
  dist: isTouch ? 8.2 : 7.4,
  pos: new THREE.Vector3(42, 10, 110),
  look: new THREE.Vector3(42, 2, 90),
};
const spawnPoint = { x: 42, z: 88 };

// ------------------------------------------------------------------ input
class Input {
  constructor() {
    this.keys = new Set();
    this.edges = new Set();
    this.held = { sprint: false, jump: false };
    this.stick = { x: 0, y: 0, active: false, id: null };
    this.drag = { active: false, id: null, x: 0, y: 0 };
    this.lookX = 0;
    this.lookY = 0;
    this.lastLook = 0;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.held.sprint = true;
      if (e.code === 'Space') { this.held.jump = true; this.edges.add('jump'); }
      if (e.code === 'KeyE' || e.code === 'KeyF') this.edges.add('action');
      if (e.code === 'KeyH') this.edges.add('horn');
      if (e.code === 'KeyC') this.edges.add('cam');
      if (e.code === 'Escape') this.edges.add('pause');
      if (e.code === 'KeyM') this.edges.add('map');
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.held.sprint = false;
      if (e.code === 'Space') this.held.jump = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.held.sprint = false; this.held.jump = false; this.stick.x = 0; this.stick.y = 0; });

    canvas.addEventListener('pointerdown', (e) => {
      if (state !== 'playing') return;
      this.drag.active = true; this.drag.id = e.pointerId;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag.active || e.pointerId !== this.drag.id) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      this.lookX += dx;
      this.lookY += dy;
      this.lastLook = performance.now();
    });
    const end = (e) => {
      if (e.pointerId === this.drag.id) { this.drag.active = false; this.drag.id = null; }
      if (e.pointerId === this.stick.id) this._endStick();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (state !== 'playing') return;
      camState.dist = clamp(camState.dist + e.deltaY * 0.006, 4.4, 14);
      e.preventDefault();
    }, { passive: false });

    const stickEl = $('stick'), knob = $('stick-knob');
    const updateStick = (e) => {
      const r = stickEl.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.36);
      let dy = (e.clientY - (r.top + r.height / 2)) / (r.height * 0.36);
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      this.stick.x = dx; this.stick.y = dy;
      knob.style.transform = `translate(${dx * r.width * 0.3}px, ${dy * r.height * 0.3}px)`;
    };
    stickEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.stick.active = true; this.stick.id = e.pointerId;
      stickEl.setPointerCapture?.(e.pointerId);
      updateStick(e);
    });
    stickEl.addEventListener('pointermove', (e) => {
      if (!this.stick.active || e.pointerId !== this.stick.id) return;
      e.stopPropagation();
      updateStick(e);
    });
    stickEl.addEventListener('pointerup', (e) => { e.stopPropagation(); this._endStick(); });
    stickEl.addEventListener('pointercancel', () => this._endStick());

    const bindHold = (id, onDown, onUp) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        el.classList.add('pressed');
        onDown?.();
      });
      const up = (e) => { e.stopPropagation(); el.classList.remove('pressed'); onUp?.(); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    bindHold('btn-action', () => this.edges.add('action'));
    bindHold('btn-sprint', () => { this.held.sprint = true; }, () => { this.held.sprint = false; });
    bindHold('btn-jump', () => { this.held.jump = true; this.edges.add('jump'); }, () => { this.held.jump = false; });
    bindHold('btn-horn', () => this.edges.add('horn'));
    bindHold('btn-cam', () => this.edges.add('cam'));
    $('btn-pause').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.edges.add('pause'); });
  }

  _endStick() {
    this.stick.active = false; this.stick.id = null;
    this.stick.x = 0; this.stick.y = 0;
    $('stick-knob').style.transform = 'translate(0,0)';
  }

  take(name) {
    if (this.edges.has(name)) { this.edges.delete(name); return true; }
    return false;
  }

  axis() {
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.stick.active) { x += this.stick.x; y -= this.stick.y; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  consumeLook() {
    const x = this.lookX, y = this.lookY;
    this.lookX = 0; this.lookY = 0;
    return { x, y };
  }

  get sprint() { return this.held.sprint; }
  get brake() { return this.held.jump; }
}

const input = new Input();

// ------------------------------------------------------------------ boot
function setLoad(p, text) {
  loadProgress = p;
  $('load-fill').style.width = `${p}%`;
  if (text) $('load-text').textContent = text;
}

function makeMarker(x, z, color, icon = '◆', size = 1) {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, toneMapped: false, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9 * size, 0.09, 8, 40), baseMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  group.add(ring);
  const beamMat = baseMat.clone(); beamMat.opacity = 0.15;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * size, 1.5 * size, 8, 18, 1, true), beamMat);
  beam.position.y = 4;
  group.add(beam);
  const orbMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.46 * size, 0), orbMat);
  orb.position.y = 1.9;
  group.add(orb);

  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.shadowColor = color; ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(64, 64, 42, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#07080f';
  ctx.font = '900 58px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(icon, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(1.5 * size, 1.5 * size, 1);
  sprite.position.y = 4.2;
  group.add(sprite);

  group.position.set(x, groundHeightAt(x, z), z);
  group.userData = { ring, orb, beam, sprite, phase: Math.random() * 9, color, icon };
  scene.add(group);
  markers.push(group);
  return group;
}

function removeMarker(marker) {
  if (!marker) return;
  const idx = markers.indexOf(marker);
  if (idx >= 0) markers.splice(idx, 1);
  scene.remove(marker);
  marker.traverse?.(o => {
    o.geometry?.dispose?.();
    if (o.material) { if (o.material.map) o.material.map.dispose?.(); o.material.dispose?.(); }
  });
}

function randomRoadPoint(minD = 60, maxD = 300, from = null) {
  const origin = from || (player ? player.pos : { x: 42, z: 88 });
  for (let i = 0; i < 60; i++) {
    const alongX = Math.random() > 0.5;
    const r = pick(CITY.roadCoords, Math.random);
    const t = (Math.random() - 0.5) * 540;
    const x = alongX ? r : t;
    const z = alongX ? t : r;
    const d = dist(x, z, origin.x, origin.z);
    if (d > minD && d < maxD) return { x, z };
  }
  return { x: 42, z: -84 };
}

function spawnStartingVehicles() {
  const carDef = CARS[save.car] || CARS[0];
  const startCar = new Vehicle(scene, world, {
    x: 38.5, z: 72, heading: Math.PI, color: carDef.color, player: false,
    name: carDef.name, maxSpeed: carDef.maxSpeed, underglow: carDef.underglow, parked: true,
  });
  startCar.isStartCar = true;
  vehicles.push(startCar);

  const spawns = world.carSpawns
    .filter(s => dist(s.x, s.z, 42, 72) > 9 && dist(s.x, s.z, spawnPoint.x, spawnPoint.z) > 8)
    .sort(() => Math.random() - 0.5)
    .slice(0, isTouch ? 12 : 18);
  for (const s of spawns) {
    const car = new Vehicle(scene, world, {
      x: s.x, z: s.z, heading: s.heading,
      color: pick([0x2f7fe0, 0xf0b429, 0x2fbf7a, 0xe8e6e1, 0x7a4bce, 0xff6f3d], Math.random),
      name: 'PARKED', parked: true, maxSpeed: 40,
    });
    vehicles.push(car);
  }
}

function spawnTraffic() {
  const count = isTouch ? 9 : 14;
  for (let i = 0; i < count; i++) {
    const alongX = Math.random() > 0.5;
    const r = pick(CITY.roadCoords, Math.random);
    const t = (Math.random() - 0.5) * 540;
    const x = alongX ? r : t, z = alongX ? t : r;
    if (dist(x, z, spawnPoint.x, spawnPoint.z) < 30) continue;
    const sign = Math.random() > 0.5 ? 1 : -1;
    const car = new Vehicle(scene, world, {
      x, z, heading: alongX ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : (sign > 0 ? 0 : Math.PI),
      color: pick([0x2f7fe0, 0xf0b429, 0x2fbf7a, 0xe8e6e1, 0x7a4bce, 0xff6f3d, 0x9b1d3a], Math.random),
      name: 'TRAFFIC', maxSpeed: 42,
    });
    car.setAI(alongX ? 'x' : 'z', sign, r);
    vehiclePool.push(car);
  }
}
const vehiclePool = [];

function spawnPeds() {
  const count = isTouch ? 10 : 16;
  const bc = CITY.blockCenters;
  for (let i = 0; i < count; i++) {
    const bx = bc[Math.floor(Math.random() * bc.length)] + (Math.random() - 0.5) * 44;
    const bz = bc[Math.floor(Math.random() * bc.length)] + (Math.random() - 0.5) * 44;
    peds.push(new Pedestrian(scene, world, { x: bx, z: bz }));
  }
}

function spawnJobs() {
  for (const j of jobs) removeMarker(j.marker);
  jobs = [];
  const used = new Set();
  for (let i = 0; i < 3; i++) {
    let p = i === 0 && player && dist(player.pos.x, player.pos.z, spawnPoint.x, spawnPoint.z) < 45
      ? { x: 42, z: 12 }
      : randomRoadPoint(70, 260);
    let guard = 0;
    while (guard++ < 20 && [...used].some(u => dist(u.x, u.z, p.x, p.z) < 45)) p = randomRoadPoint(70, 260);
    const key = `${Math.round(p.x)},${Math.round(p.z)}`;
    if (used.has(key)) continue;
    used.add(key);
    const def = JOB_DEFS[(i + Math.floor(Math.random() * 2)) % JOB_DEFS.length];
    const marker = makeMarker(p.x, p.z, def.color, def.icon, 1.1);
    jobs.push({ def, marker, x: p.x, z: p.z });
  }
  if (jobs.length === 0) {
    const p = randomRoadPoint(70, 260);
    const def = JOB_DEFS[0];
    jobs.push({ def, marker: makeMarker(p.x, p.z, def.color, def.icon, 1.1), x: p.x, z: p.z });
  }
}

function setupWorld() {
  world = buildWorld(scene, { quality: save.quality, mobile: isTouch });

  player = new Player(scene, world, { x: spawnPoint.x, z: spawnPoint.z, heading: Math.PI });
  player.name = 'ROOK';
  ui.setProfile({ name: 'ROOK', level: save.level, cash: save.cash, health: player.health, armor: player.armor, xp: save.xp % 100 });
  ui.setWanted(0);

  spawnStartingVehicles();
  spawnTraffic();
  spawnPeds();
  online = new OnlineSquad(scene, world, isTouch ? 6 : 8);

  garageMarker = makeMarker(garagePos.x, garagePos.z, '#2ff3ff', 'S', 1.4);
  garageMarker.userData.garage = true;

  spawnJobs();
  camState.pos.set(spawnPoint.x + 26, 16, spawnPoint.z + 34);
  camState.look.set(spawnPoint.x, 2, spawnPoint.z - 10);
  camera.position.copy(camState.pos);
  camera.lookAt(camState.look);
}

async function boot() {
  setLoad(8, 'BOOTING DISTRICT OS');
  await new Promise(r => setTimeout(r, 60));
  setLoad(22, 'GENERATING SUNSET CITY');
  await new Promise(r => requestAnimationFrame(r));
  try {
    setupWorld();
  } catch (error) {
    console.error(error);
    setLoad(100, 'CITY FAILED TO LOAD — CHECK CONSOLE');
    return;
  }
  setLoad(70, 'STREAMING TRAFFIC & CITIZENS');
  await new Promise(r => setTimeout(r, 80));
  setLoad(88, 'CALIBRATING NEON');
  await new Promise(r => requestAnimationFrame(r));
  setLoad(100, 'READY');
  state = 'menu';
  setMenuRender(true);
  applyPixelRatio();
  ui.showMenu(true);
  ui.showHUD(false);
  $('loading').classList.add('done');
  registerServiceWorker();
  if (pendingStart !== null) { const fromLobby = pendingStart === 'lobby'; pendingStart = null; startGame(fromLobby); }
  window.__NEON__ = {
    get state() { return state; },
    get player() { return player; },
    get world() { return world; },
    get vehicle() { return player?.inVehicle; },
    get vehicles() { return vehicles; },
    get traffic() { return vehiclePool; },
    get police() { return police; },
    get heat() { return heat; },
    get mission() { return activeMission; },
    get jobs() { return jobs; },
    get cash() { return save.cash; },
    get peds() { return peds; },
    teleport(x, z) {
      if (player.inVehicle) { player.inVehicle.pos.set(x, 0, z); player.inVehicle.mesh.position.set(x, 0, z); }
      else player.reset(x, z);
      snapCamera();
    },
    enterNearest(d = 100) { const v = nearestVehicle(d); if (v) enterVehicle(v); return v; },
    startJob(i = 0) { if (jobs[i]) startMission(jobs[i]); },
    startType(type) {
      const def = JOB_DEFS.find(d => d.type === type);
      if (!def || activeMission) return null;
      startMission({ def, x: player.pos.x, z: player.pos.z });
      return activeMission;
    },
    setDay(t) { if (world) world.dayTime = t; },
    act() { doAction(); },
    setHeat(n = 2) { addHeat(n); },
    clearHeat() { clearHeat(); },
    missionTarget() { return missionTarget(); },
    completeMission() { completeMission(); },
    setCash(n) { save.cash = n; ui.setProfile({ cash: save.cash }); store(SAVE_KEY, save); },
    pause() { pauseGame(); },
    resume() { resumeGame(); },
  };
  requestAnimationFrame(animate);
}

// ------------------------------------------------------------------ game flow
function ensureAudio() {
  audio.init();
  audio.setVolume(save.volume / 100);
  audio.setPlaying(true);
}

function startGame(fromLobby = false) {
  if (!world || !player || state === 'loading') {
    pendingStart = fromLobby ? 'lobby' : 'solo';
    ensureAudio();
    return;
  }
  ensureAudio();
  ui.closeModals();
  ui.showMenu(false);
  ui.showHUD(true);
  ui.setPause(false);
  document.body.classList.add('playing');
  state = 'playing';
  setMenuRender(false);
  applyQuality();
  activeMission = null;
  clearMission();
  heat = 0;
  heatDecay = 0;
  bustedTimer = 0;
  respawning = false;
  police.forEach(p => { scene.remove(p.mesh); });
  police = [];
  ui.setWanted(0);
  player.reset(spawnPoint.x, spawnPoint.z);
  player.heading = Math.PI;
  player.group.rotation.y = Math.PI;
  const car = vehicles.find(v => v.isStartCar);
  if (car) { car.pos.set(38.5, 0, 72); car.heading = Math.PI; car.speed = 0; car.health = 100; car.mesh.position.set(38.5, 0, 72); car.mesh.rotation.y = Math.PI; }
  camState.yaw = Math.PI;
  camState.pitch = 0.18;
  camState.dist = isTouch ? 8.2 : 7.4;
  snapCamera();
  ui.big('NEON DISTRICT', fromLobby ? 'SUNSET CITY · SESSION JOINED' : 'SUNSET CITY · FREEMODE', 2600);
  ui.toast(isTouch ? 'Drag the right side to look · left stick to move' : 'WASD to move · E to grab a ride · F to interact', 'gold');
  ui.chat('SYSTEM', 'Welcome to Sunset City. Take a job at the gold marker.', true);
  audio.setDriving(false);
  audio.ui();
  setTimeout(() => { if (state === 'playing') ui.big('', '', 10); }, 2700);
}

function quitToMenu() {
  state = 'menu';
  menuNeedsRender = true;
  setMenuRender(true);
  applyPixelRatio();
  document.body.classList.remove('playing', 'driving', 'boosting');
  ui.showHUD(false);
  ui.showMenu(true);
  ui.setPause(false);
  ui.closeModals();
  if (player.inVehicle) exitVehicle(true);
  audio.setPlaying(false);
  audio.setDriving(false);
  ui.setDriving(false);
  camState.yaw = Math.PI + 0.2;
  camState.pitch = 0.32;
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  ui.setPause(true);
  audio.setPlaying(false);
  document.body.classList.remove('playing');
}
function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  ui.setPause(false);
  audio.setPlaying(true);
  document.body.classList.add('playing');
}

function snapCamera() {
  const actor = player.inVehicle || player;
  const target = new THREE.Vector3(actor.pos.x, player.inVehicle ? 1.05 : 1.5, actor.pos.z);
  const f = new THREE.Vector3(Math.sin(camState.yaw), 0, Math.cos(camState.yaw));
  const d = camState.dist * (player.inVehicle ? 1.32 : 1);
  const vert = d * Math.sin(camState.pitch) + 0.85;
  camera.position.set(target.x - f.x * d * Math.cos(camState.pitch), target.y + vert, target.z - f.z * d * Math.cos(camState.pitch));
  camera.lookAt(target.x + f.x * 2.4, target.y + 0.4, target.z + f.z * 2.4);
}

// ------------------------------------------------------------------ vehicles
function nearestVehicle(maxDist = 4.4) {
  let best = null, bd = maxDist;
  for (const v of [...vehicles, ...police]) {
    if (v.wrecked) continue;
    const d = dist(v.pos.x, v.pos.z, player.pos.x, player.pos.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function enterVehicle(v) {
  if (!v || player.inVehicle) return;
  if (v.wrecked) { ui.toast('That ride is wrecked', 'pink'); return; }
  player.inVehicle = v;
  v.parked = false;
  v.ai = null;
  v.stopped = false;
  v.speed = 0;
  v.player = true;
  player.setVisible(false);
  ui.setDriving(true);
  audio.setDriving(true);
  camState.yaw = v.heading;
  if (v.police) addHeat(1);
  ui.toast(`${v.name} · ${v.boosting ? '' : 'acquired'}`, 'gold');
  audio.ui();
}

function exitVehicle(silent = false) {
  const v = player.inVehicle;
  if (!v) return;
  const right = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading));
  let x = v.pos.x + right.x * 2.5;
  let z = v.pos.z + right.z * 2.5;
  const res = resolveCircle(x, z, 0.45, world.colliders);
  x = clamp(res.x, -CITY.extent + 5, CITY.extent - 5);
  z = clamp(res.z, -CITY.extent + 5, CITY.extent - 5);
  player.pos.set(x, 0, z);
  player.vel.set(0, 0, 0);
  player.heading = v.heading;
  player.group.position.set(x, groundHeightAt(x, z), z);
  player.group.rotation.y = v.heading;
  player.setVisible(true);
  player.inVehicle = null;
  v.player = false;
  v.speed = 0;
  ui.setDriving(false);
  audio.setDriving(false);
  if (!silent) audio.ui();
}

// ------------------------------------------------------------------ heat / police
function addHeat(n = 1) {
  const before = heat;
  heat = clamp(heat + n, 0, 5);
  heatDecay = 0;
  ui.setWanted(heat);
  if (heat > before) {
    audio.sirenBlip();
    ui.toast(heat >= 4 ? 'MAJOR HEAT · AIR SUPPORT INBOUND' : 'WANTED LEVEL INCREASED', 'pink');
  }
}

function clearHeat() {
  heat = 0;
  heatDecay = 0;
  ui.setWanted(0);
  for (const p of police) { scene.remove(p.mesh); }
  police = [];
}

function spawnPolice(target) {
  const point = randomRoadPoint(65, 110, target);
  const p = new Vehicle(scene, world, {
    x: point.x, z: point.z, heading: Math.atan2(target.x - point.x, target.z - point.z),
    color: 0xf2f2ee, police: true, name: 'POLICE', maxSpeed: 60,
  });
  p.chaseCooldown = 0;
  police.push(p);
  audio.sirenBlip();
}

function updatePolice(dt) {
  const target = player.inVehicle ? player.inVehicle.pos : player.pos;
  spawnTimer -= dt;
  if (heat > 0 && spawnTimer <= 0) {
    const want = Math.min(heat + 1, isTouch ? 3 : 4);
    if (police.length < want) { spawnPolice(target); spawnTimer = 2.2; }
  }
  for (let i = police.length - 1; i >= 0; i--) {
    const p = police[i];
    p.updatePolice(dt, target);
    p.updateLights(dt, world.nightFactor, heat);
    const d = dist(p.pos.x, p.pos.z, target.x, target.z);
    if (d > 170 && heat === 0) { scene.remove(p.mesh); police.splice(i, 1); continue; }
    p.chaseCooldown = (p.chaseCooldown || 0) - dt;
    if (d < 3.6 && p.chaseCooldown <= 0) {
      p.chaseCooldown = 1.1;
      audio.hit();
      if (player.inVehicle) {
        player.inVehicle.health -= 8;
        player.inVehicle.speed *= 0.65;
        player.damage(4);
        cameraShake = 0.35;
      } else {
        player.damage(9);
        const dx = player.pos.x - p.pos.x, dz = player.pos.z - p.pos.z;
        const dd = Math.hypot(dx, dz) || 1;
        player.pos.x += dx / dd * 1.2;
        player.pos.z += dz / dd * 1.2;
      }
      if (player.health <= 0) knockedOut('POLICE');
    }
    if (player.inVehicle && d < 3.2) {
      const dx = player.inVehicle.pos.x - p.pos.x, dz = player.inVehicle.pos.z - p.pos.z;
      const dd = Math.hypot(dx, dz) || 1;
      player.inVehicle.pos.x += dx / dd * 0.08;
      player.inVehicle.pos.z += dz / dd * 0.08;
      p.pos.x -= dx / dd * 0.08;
      p.pos.z -= dz / dd * 0.08;
      p.mesh.position.set(p.pos.x, 0.02, p.pos.z);
    }
  }
  if (heat > 0) {
    const near = police.some(p => dist(p.pos.x, p.pos.z, target.x, target.z) < 34);
    if (!near) {
      heatDecay += dt;
      if (heatDecay > 20) { heat -= 1; heatDecay = 0; ui.setWanted(heat); ui.toast(heat ? 'HEAT DROPPING' : 'YOU LOST THE COPS', heat ? 'gold' : 'gold'); if (heat === 0) clearHeat(); }
    } else heatDecay = 0;
  }
  if (heat > 0 && !player.inVehicle) {
    const close = police.some(p => dist(p.pos.x, p.pos.z, player.pos.x, player.pos.z) < 3.4);
    bustedTimer = close ? bustedTimer + dt : 0;
    if (bustedTimer > 4.5) { bustedTimer = 0; knockedOut('BUSTED'); }
  } else bustedTimer = 0;
}

function knockedOut(reason = 'DOWN') {
  if (respawning) return;
  respawning = true;
  audio.hit();
  ui.big(reason === 'BUSTED' ? 'BUSTED' : 'KNOCKED OUT', reason === 'BUSTED' ? '-$500 · HEAT CLEARED' : '-$250 · HOSPITAL BILL', 2200);
  addCash(reason === 'BUSTED' ? -500 : -250);
  clearHeat();
  if (player.inVehicle) exitVehicle(true);
  player.reset(spawnPoint.x, spawnPoint.z);
  player.heading = Math.PI;
  camState.yaw = Math.PI;
  snapCamera();
  setTimeout(() => { respawning = false; }, 1600);
}

// ------------------------------------------------------------------ missions
function clearMission() {
  for (const m of missionMarkers) removeMarker(m);
  missionMarkers = [];
  if (bountyPed) { scene.remove(bountyPed.group); bountyPed = null; }
  for (const j of jobs) { j.marker.visible = !activeMission; }
}

function addMissionMarker(x, z, color, icon, size = 1.15) {
  const m = makeMarker(x, z, color, icon, size);
  missionMarkers.push(m);
  return m;
}

function startMission(job) {
  if (activeMission) return;
  const def = job.def;
  const origin = player.inVehicle ? player.inVehicle.pos : player.pos;
  activeMission = {
    type: def.type, def, name: def.name, icon: def.icon, color: def.color,
    time: def.time, maxTime: def.time, reward: def.reward, xp: def.xp,
    targets: [], index: 0, marker: null, sub: def.sub, done: 0,
  };
  for (const j of jobs) j.marker.visible = false;
  if (def.type === 'delivery') {
    const t = randomRoadPoint(130, 320, origin);
    activeMission.targets.push({ x: t.x, z: t.z });
    activeMission.marker = addMissionMarker(t.x, t.z, def.color, '$');
    activeMission.sub = 'Steal a ride, then reach the drop-off';
  } else if (def.type === 'bounty') {
    const t = randomRoadPoint(55, 210, origin);
    activeMission.targets.push({ x: t.x, z: t.z });
    activeMission.marker = addMissionMarker(t.x, t.z, def.color, '★');
    bountyPed = new Pedestrian(scene, world, { x: t.x, z: t.z, name: 'GHOST', online: true, jacket: 0xff2d75 });
    activeMission.sub = 'Reach GHOST and tag the target';
  } else if (def.type === 'race') {
    const p1 = randomRoadPoint(80, 200, origin);
    const p2 = randomRoadPoint(80, 230, p1);
    const p3 = randomRoadPoint(80, 250, p2);
    activeMission.targets.push(p1, p2, p3);
    activeMission.marker = addMissionMarker(p1.x, p1.z, def.color, '1');
    activeMission.sub = 'Checkpoint 1 / 3 · get a vehicle';
  } else if (def.type === 'cash') {
    const base = randomRoadPoint(40, 140, origin);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 26;
      activeMission.targets.push({ x: base.x + Math.cos(a) * r, z: base.z + Math.sin(a) * r });
    }
    activeMission.marker = addMissionMarker(activeMission.targets[0].x, activeMission.targets[0].z, def.color, '◆', 0.85);
    activeMission.sub = 'Collect stash 1 / 3 on foot';
  }
  ui.big('JOB STARTED', def.name, 1800);
  ui.toast(def.sub, 'gold');
  audio.ui();
}

function missionTarget() {
  if (!activeMission) return null;
  return activeMission.targets[activeMission.index] || null;
}

function completeMission() {
  if (!activeMission) return;
  const m = activeMission;
  const bonus = 1;
  addCash(Math.round(m.reward * bonus));
  addXP(m.xp);
  audio.cash();
  ui.big('JOB COMPLETE', `+${formatMoney(Math.round(m.reward * bonus))} · +${m.xp} XP`, 2600);
  ui.toast(`${m.name} complete`, 'gold');
  clearMission();
  activeMission = null;
  for (const j of jobs) j.marker.visible = true;
  setTimeout(() => { if (state === 'playing' && !activeMission) spawnJobs(); }, 2600);
}

function failMission(reason) {
  if (!activeMission) return;
  ui.big('JOB FAILED', reason, 2200);
  ui.toast(reason, 'pink');
  clearMission();
  activeMission = null;
  for (const j of jobs) j.marker.visible = true;
  setTimeout(() => { if (state === 'playing' && !activeMission) spawnJobs(); }, 2200);
}

function missionInteract() {
  if (!activeMission) return false;
  const t = missionTarget();
  if (!t) return false;
  const actor = player.inVehicle ? player.inVehicle.pos : player.pos;
  const d = dist(actor.x, actor.z, t.x, t.z);
  if (activeMission.type === 'bounty' && d < 4.6) {
    if (bountyPed) { scene.remove(bountyPed.group); bountyPed = null; }
    activeMission.index++;
    completeMission();
    return true;
  }
  if (activeMission.type === 'cash' && d < 3.8 && !player.inVehicle) {
    audio.cash();
    activeMission.done++;
    activeMission.index++;
    if (activeMission.index >= activeMission.targets.length) {
      completeMission();
    } else {
      removeMarker(activeMission.marker);
      const nt = activeMission.targets[activeMission.index];
      activeMission.marker = addMissionMarker(nt.x, nt.z, activeMission.color, '◆', 0.85);
      activeMission.sub = `Collect stash ${activeMission.index + 1} / 3 on foot`;
      ui.toast(`Stash collected · ${activeMission.index} / 3`, 'gold');
    }
    return true;
  }
  return false;
}

function updateMission(dt) {
  if (!activeMission) return;
  const m = activeMission;
  if (m.time > 0) {
    m.time -= dt;
    if (m.time <= 0) { failMission('OUT OF TIME'); return; }
  }
  const t = missionTarget();
  if (!t) return;
  const actor = player.inVehicle ? player.inVehicle.pos : player.pos;
  if (m.type === 'delivery') {
    if (player.inVehicle && dist(actor.x, actor.z, t.x, t.z) < 9) completeMission();
  } else if (m.type === 'race') {
    if (player.inVehicle && dist(actor.x, actor.z, t.x, t.z) < 10) {
      audio.sirenBlip();
      m.index++;
      if (m.index >= m.targets.length) completeMission();
      else {
        removeMarker(m.marker);
        const nt = m.targets[m.index];
        m.marker = addMissionMarker(nt.x, nt.z, m.color, String(m.index + 1));
        m.sub = `Checkpoint ${m.index + 1} / 3`;
        ui.toast(`Checkpoint ${m.index} / 3`, 'gold');
      }
    }
  } else if (m.type === 'bounty') {
    if (bountyPed) {
      bountyPed.update(dt, player.pos, heat, true);
      t.x = bountyPed.pos.x; t.z = bountyPed.pos.z;
      if (m.marker) m.marker.position.set(t.x, groundHeightAt(t.x, t.z), t.z);
    }
  } else if (m.type === 'cash') {
    if (m.marker) {
      m.marker.position.y = groundHeightAt(t.x, t.z);
      m.marker.userData.orb.position.y = 1.4 + Math.sin(elapsed * 2.3) * 0.18;
    }
  }
}

// ------------------------------------------------------------------ interaction / action
let promptAction = null;

function updateInteraction() {
  promptAction = null;
  if (state !== 'playing' || respawning) { ui.hidePrompt(); ui.setActionContext(null); return; }
  const actor = player.inVehicle ? player.inVehicle.pos : player.pos;
  if (player.inVehicle) {
    ui.prompt('E', 'Exit vehicle');
    ui.setActionContext('EXIT');
  } else {
    const actorPos = player.pos;
    if (activeMission) {
      const t = missionTarget();
      if (t) {
        const d = dist(actorPos.x, actorPos.z, t.x, t.z);
        if (activeMission.type === 'bounty' && d < 4.6) {
          ui.prompt('F', 'Tag the target');
          ui.setActionContext('TAG');
          promptAction = { type: 'mission' };
        } else if (activeMission.type === 'cash' && d < 3.8) {
          ui.prompt('F', 'Grab the stash');
          ui.setActionContext('GRAB');
          promptAction = { type: 'mission' };
        }
      }
    }
    if (!promptAction && dist(actorPos.x, actorPos.z, garagePos.x, garagePos.z) < 6.5) {
      if (heat > 0) {
        ui.prompt('F', `Respray · ${formatMoney(500)} clears heat`);
        ui.setActionContext('SPRAY');
        promptAction = { type: 'garage' };
      } else {
        ui.prompt('F', 'Spray shop · no heat to clear');
        ui.setActionContext('SPRAY');
        promptAction = { type: 'garage' };
      }
    }
    if (!promptAction && !activeMission) {
      let best = null, bd = 5.2;
      for (const j of jobs) {
        const d = dist(actorPos.x, actorPos.z, j.x, j.z);
        if (d < bd) { bd = d; best = j; }
      }
      if (best) {
        ui.prompt('F', `Start ${best.def.name}`);
        ui.setActionContext('START');
        promptAction = { type: 'job', job: best };
      }
    }
    if (!promptAction) {
      const v = nearestVehicle(4.6);
      if (v) {
        ui.prompt('E', `Enter ${v.name}`);
        ui.setActionContext('ENTER');
        promptAction = { type: 'enter', v };
      }
    }
    if (!promptAction) ui.hidePrompt();
    if (!promptAction) ui.setActionContext(null);
  }
}

function doAction() {
  if (state !== 'playing' || respawning) return;
  if (player.inVehicle) { exitVehicle(); return; }
  if (promptAction?.type === 'mission') { missionInteract(); return; }
  if (promptAction?.type === 'job') { startMission(promptAction.job); return; }
  if (promptAction?.type === 'garage') { respray(); return; }
  if (promptAction?.type === 'enter') { enterVehicle(promptAction.v); return; }
  // Nothing nearby: a light shove / dry fire
  audio.hit();
  cameraShake = 0.12;
}

function respray() {
  if (heat <= 0) { ui.toast('No heat to clear', ''); return; }
  if (save.cash < 500) { ui.toast('Not enough cash — need $500', 'pink'); return; }
  addCash(-500);
  clearHeat();
  ui.toast('RESPRAYED · heat cleared', 'gold');
  ui.big('CLEAN GETAWAY', 'WANTED LEVEL CLEARED', 2000);
  audio.cash();
}

// ------------------------------------------------------------------ economy / progression
function addCash(n) {
  save.cash = Math.max(0, save.cash + n);
  ui.setProfile({ cash: save.cash });
  store(SAVE_KEY, save);
}
function addXP(n) {
  save.xp += n;
  const newLevel = Math.floor(save.xp / 100) + 1;
  if (newLevel > save.level) {
    save.level = newLevel;
    ui.big('LEVEL UP', `REP ${save.level}`, 2200);
    ui.toast(`Level ${save.level} reached`, 'gold');
    audio.cash();
  }
  ui.setProfile({ level: save.level, xp: save.xp % 100 });
  store(SAVE_KEY, save);
}

// ------------------------------------------------------------------ update
function updatePlayer(dt) {
  const axis = input.axis();
  const jump = input.take('jump');
  const look = input.consumeLook();
  const sens = save.sens / 100;
  if (look.x || look.y) {
    camState.yaw += look.x * 0.0042 * sens;
    camState.pitch = clamp(camState.pitch + look.y * 0.003 * sens * (save.invert ? -1 : 1), -0.12, 0.92);
  }
  if (!player.inVehicle) {
    player.update(dt, {
      forward: axis.y, strafe: axis.x,
      sprint: input.sprint, jump,
    }, camState.yaw);
  }
  if (player.inVehicle) {
    const v = player.inVehicle;
    const throttle = Math.abs(axis.y) > 0.12 ? axis.y : 0;
    const steer = Math.abs(axis.x) > 0.08 ? axis.x : 0;
    v.drive(dt, throttle, steer, input.brake ? 1 : 0, input.sprint && v.speed > 4);
    v.updateLights(dt, world.nightFactor, heat);
    if (v.health <= 0 && !v.wrecked) {
      v.wrecked = true;
      v.speed = 0;
      cameraShake = 0.6;
      ui.big('RIDE WRECKED', 'FIND ANOTHER SET OF WHEELS', 2200);
      player.damage(12);
      setTimeout(() => { if (player.inVehicle === v) exitVehicle(); }, 1200);
    }
    if (v.health <= 0) v.speed *= 0.9;
  }
  if (input.take('cam')) {
    camState.dist = camState.dist > 11 ? 6.2 : camState.dist + 2.2;
    audio.ui();
  }
  if (input.take('horn') && player.inVehicle) audio.horn();
}

function updateCamera(dt, now) {
  if (state === 'menu' || state === 'loading') {
    const t = now * 0.000045;
    const radius = isSmall ? 230 : 260;
    const tx = Math.sin(t) * radius;
    const tz = Math.cos(t) * radius;
    const ty = 66 + Math.sin(t * 2.1) * 10;
    camState.pos.x = damp(camState.pos.x, tx, 1.6, dt);
    camState.pos.y = damp(camState.pos.y, ty, 1.6, dt);
    camState.pos.z = damp(camState.pos.z, tz, 1.6, dt);
    camState.look.x = damp(camState.look.x, 0, 2, dt);
    camState.look.y = damp(camState.look.y, 18, 2, dt);
    camState.look.z = damp(camState.look.z, 0, 2, dt);
    camera.position.copy(camState.pos);
    camera.lookAt(camState.look);
    return;
  }
  if (state === 'paused') return;
  const actor = player.inVehicle || player;
  const heading = player.inVehicle ? player.inVehicle.heading : player.heading;
  if (player.inVehicle && !input.drag.active && now - input.lastLook > 1300) {
    camState.yaw = angleDamp(camState.yaw, heading, 2.6, dt);
    camState.pitch = damp(camState.pitch, 0.17, 2, dt);
  }
  const target = new THREE.Vector3(actor.pos.x, (player.inVehicle ? 1.05 : 1.5), actor.pos.z);
  const f = new THREE.Vector3(Math.sin(camState.yaw), 0, Math.cos(camState.yaw));
  const dist = camState.dist * (player.inVehicle ? 1.34 : 1);
  const horiz = dist * Math.cos(camState.pitch);
  const vert = dist * Math.sin(camState.pitch) + 0.85;
  const desired = new THREE.Vector3(target.x - f.x * horiz, target.y + vert, target.z - f.z * horiz);
  // simple wall clamp
  let maxT = 1;
  for (let i = 1; i <= 8; i++) {
    const k = i / 8;
    const px = target.x + (desired.x - target.x) * k;
    const pz = target.z + (desired.z - target.z) * k;
    let hit = false;
    for (const c of world.colliders) {
      if (px > c.minX - 0.4 && px < c.maxX + 0.4 && pz > c.minZ - 0.4 && pz < c.maxZ + 0.4) { hit = true; break; }
    }
    if (hit) { maxT = Math.max(0.22, (i - 1) / 8); break; }
  }
  if (maxT < 1) {
    desired.x = target.x + (desired.x - target.x) * maxT;
    desired.z = target.z + (desired.z - target.z) * maxT;
    desired.y = target.y + (desired.y - target.y) * maxT;
  }
  camera.position.x = damp(camera.position.x, desired.x, 9, dt);
  camera.position.y = damp(camera.position.y, desired.y, 9, dt);
  camera.position.z = damp(camera.position.z, desired.z, 9, dt);
  const lookAhead = player.inVehicle ? 5.5 : 2.4;
  const lookY = target.y + 0.45;
  camState.look.x = target.x + f.x * lookAhead;
  camState.look.y = lookY;
  camState.look.z = target.z + f.z * lookAhead;
  if (cameraShake > 0) {
    const s = cameraShake * 0.35;
    camera.position.x += Math.sin(now * 0.09) * s;
    camera.position.y += Math.cos(now * 0.13) * s;
    cameraShake = Math.max(0, cameraShake - dt * 1.8);
  }
  camera.lookAt(camState.look);
  camera.fov = damp(camera.fov, player.inVehicle && player.inVehicle.speed > 25 ? 68 : 62, 3, dt);
  camera.updateProjectionMatrix();
}

function collideWithTraffic() {
  const pv = player.inVehicle;
  if (!pv) {
    for (const v of police) {
      if (dist(v.pos.x, v.pos.z, player.pos.x, player.pos.z) < 2.0 && Math.abs(v.speed) > 5) {
        player.damage(6);
        cameraShake = 0.2;
      }
    }
    return;
  }
  for (const v of vehiclePool) {
    const d = dist(v.pos.x, v.pos.z, pv.pos.x, pv.pos.z);
    if (d < 3.1 && d > 0.01) {
      const dx = (pv.pos.x - v.pos.x) / d, dz = (pv.pos.z - v.pos.z) / d;
      const push = (3.1 - d) * 0.5;
      pv.pos.x += dx * push; pv.pos.z += dz * push;
      v.pos.x -= dx * push; v.pos.z -= dz * push;
      if (Math.abs(pv.speed) > 7) {
        if (pv.collisionCooldown <= 0) { pv.health -= 5; pv.collisionCooldown = 0.7; audio.hit(); cameraShake = 0.25; }
        pv.speed *= 0.72;
        v.speed *= 0.55;
      }
    }
  }
  for (const p of police) {
    if (dist(p.pos.x, p.pos.z, pv.pos.x, pv.pos.z) < 3.3) {
      pv.speed *= 0.9;
    }
  }
}

function updatePeds(dt) {
  pedHitCooldown -= dt;
  const pv = player.inVehicle;
  for (const p of peds) {
    p.update(dt, player.pos, heat, false);
    if (pv && pv.speed > 4 && pedHitCooldown <= 0 && dist(pv.pos.x, pv.pos.z, p.pos.x, p.pos.z) < 2.0) {
      pedHitCooldown = 2.2;
      p.fleeTimer = 7;
      pv.speed *= 0.8;
      audio.hit();
      addHeat(1);
      ui.toast('ASSAULT · WANTED LEVEL UP', 'pink');
      cameraShake = 0.3;
    }
  }
  online.update(dt, player.pos);
}

function updateTraffic(dt) {
  const target = player.inVehicle ? player.inVehicle.pos : player.pos;
  for (const v of vehiclePool) {
    v.updateTraffic(dt, target);
    v.updateLights(dt, world.nightFactor, 0);
  }
}

function updateMarkers(dt) {
  for (const m of markers) {
    const u = m.userData;
    if (!u.ring) continue;
    u.phase += dt;
    u.ring.rotation.z += dt * 0.6;
    const pulse = 1 + Math.sin(u.phase * 2) * 0.08;
    u.ring.scale.set(pulse, pulse, pulse);
    u.orb.rotation.y += dt * 1.6;
    u.orb.position.y = 1.9 + Math.sin(u.phase * 2.2) * 0.18;
    u.beam.material.opacity = 0.1 + Math.sin(u.phase * 2) * 0.04 + world.nightFactor * 0.05;
  }
}

function updateHUD() {
  const actor = player.inVehicle;
  const target = missionTarget();
  let objDist = null;
  if (activeMission && target) {
    const p = actor ? actor.pos : player.pos;
    objDist = dist(p.x, p.z, target.x, target.z);
    ui.setObjective(activeMission.name, activeMission.sub, objDist, activeMission.icon);
    ui.setMission(`${activeMission.name} · ${activeMission.sub}`, activeMission.time > 0 ? activeMission.time : null);
  } else if (heat > 0) {
    const d = dist(player.pos.x, player.pos.z, garagePos.x, garagePos.z);
    ui.setObjective('LOSE THE HEAT', 'Spray shop clears your wanted level', d, '★');
    ui.setMission(`WANTED · ${heat} STAR${heat > 1 ? 'S' : ''}`, null);
  } else {
    let best = null, bd = Infinity;
    for (const j of jobs) {
      const d = dist(player.pos.x, player.pos.z, j.x, j.z);
      if (d < bd) { bd = d; best = j; }
    }
    if (best) {
      ui.setObjective('PICK UP A JOB', `${best.def.name} · ${best.def.sub}`, bd, '◆');
      ui.setMission(`Freemode · ${jobs.length} jobs available`, null);
    } else {
      ui.setObjective('EXPLORE SUNSET CITY', 'Drive, explore, and take a job at a gold marker', null, '◆');
      ui.setMission('Freemode · Sunset City', null);
    }
  }
  ui.setProfile({ health: player.health, armor: player.armor });
  ui.setWanted(heat);
  if (player.inVehicle) {
    const mph = Math.abs(player.inVehicle.speed) * 2.23694;
    ui.setSpeed(mph, player.inVehicle.speed < -0.5 ? 'R' : (mph < 1 ? 'N' : 'D'), player.inVehicle.name);
    ui.updateBoost(player.inVehicle.boosting && player.inVehicle.speed > 20);
  } else {
    ui.setDriving(false);
    ui.updateBoost(false);
  }
}

function updateOnline(dt) {
  onlineChatTimer -= dt;
  if (onlineChatTimer <= 0) {
    onlineChatTimer = 9 + Math.random() * 9;
    const line = pick(CHAT_LINES, Math.random);
    ui.chat(line[0], line[1]);
  }
  if (Math.random() < dt * 0.05) {
    onlineCount = clamp(onlineCount + (Math.random() > 0.5 ? 1 : -1), 18, 32);
    ui.setOnline(onlineCount);
  }
}

let minimapAccum = 0;
function updateMinimap(dt) {
  minimapAccum += dt;
  if (minimapAccum < 0.06) return;
  minimapAccum = 0;
  const actor = player.inVehicle || player;
  const yaw = player.inVehicle ? player.inVehicle.heading : player.heading;
  const mapMarkers = [];
  if (activeMission && missionTarget()) {
    const t = missionTarget();
    mapMarkers.push({ x: t.x, z: t.z, color: activeMission.color });
  } else {
    for (const j of jobs) mapMarkers.push({ x: j.x, z: j.z, color: j.def.color });
  }
  mapMarkers.push({ x: garagePos.x, z: garagePos.z, color: '#2ff3ff' });
  ui.drawMinimap({
    player: actor,
    yaw,
    vehicles: [...vehiclePool, ...police, ...(player.inVehicle ? [] : vehicles.filter(v => !v.player))],
    peds: online.members,
    markers: mapMarkers,
    heat,
  });
}

function updateGame(dt, now) {
  elapsed += dt;
  if (input.take('pause')) { pauseGame(); return; }
  updatePlayer(dt);
  updateTraffic(dt);
  updatePolice(dt);
  updatePeds(dt);
  collideWithTraffic();
  updateMission(dt);
  updateInteraction();
  if (input.take('action')) doAction();
  if (input.take('map')) ui.toast(isTouch ? 'Minimap is always live, top right' : 'Minimap is always live, top right');
  updateMarkers(dt);
  updateOnline(dt);
  updateHUD();
  updateMinimap(dt);
  if (player.health <= 0 && !respawning) knockedOut('DOWN');
  audio.update(dt, {
    speed: player.inVehicle ? player.inVehicle.speed : player.speed,
    boosting: !!player.inVehicle?.boosting,
    moving: !player.inVehicle && player.speed > 0.5,
    heat,
  });
}

// ------------------------------------------------------------------ loop
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;

  if (state === 'playing') updateGame(dt, now);
  else if (state === 'paused') {
    if (input.take('pause')) resumeGame();
    updateMarkers(dt);
  } else if (state === 'menu') {
    if (input.take('pause')) { /* ignore */ }
    updateMarkers(dt);
  }

  if (world) {
    const p = (state === 'playing' || state === 'paused') && player ? player.pos : { x: 0, z: 0 };
    world.update(dt, p);
    const exposure = world.exposure;
    renderer.toneMappingExposure = damp(renderer.toneMappingExposure, exposure, 2.2, dt);
    if (qualityChanged) applyQuality();
  }
  updateCamera(dt, now);
  if (state !== 'menu' || menuNeedsRender) {
    renderer.render(scene, camera);
    if (state === 'menu') menuNeedsRender = false;
  }

  fpsAccum += dt; fpsFrames++;
  if (fpsAccum > 1) {
    fpsAvg = fpsFrames / fpsAccum;
    fpsAccum = 0; fpsFrames = 0;
    adaptResolution();
  }
}

let qualityChanged = false;
function adaptResolution() {
  if (state !== 'playing' || !save.dynamic) return;
  if (fpsAvg < 44) {
    highFpsTimer = 0;
    if (resolutionScale > 0.66) { resolutionScale = Math.max(0.66, resolutionScale - 0.12); applyPixelRatio(); }
  } else if (fpsAvg > 57) {
    highFpsTimer += 1;
    if (highFpsTimer > 4 && resolutionScale < 1) { resolutionScale = Math.min(1, resolutionScale + 0.08); applyPixelRatio(); }
  } else highFpsTimer = 0;
}

function applyPixelRatio() {
  const qScale = save.quality === 'low' ? 0.8 : save.quality === 'medium' ? 0.9 : 1;
  const menuScale = (state === 'menu' || state === 'loading') ? 0.42 : 1;
  renderer.setPixelRatio(basePixelRatio * resolutionScale * qScale * menuScale);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function setMenuRender(menu) {
  renderer.shadowMap.enabled = !menu && save.quality !== 'low';
  if (world) world.sun.castShadow = !menu && save.quality !== 'low';
}

function applyQuality() {
  qualityChanged = false;
  renderer.shadowMap.enabled = save.quality !== 'low';
  if (world) {
    world.sun.castShadow = save.quality !== 'low';
    world.sun.shadow.mapSize.set(save.quality === 'high' ? (isTouch ? 1024 : 2048) : 1024, save.quality === 'high' ? (isTouch ? 1024 : 2048) : 1024);
    if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
    world.sun.shadow.needsUpdate = true;
  }
  applyPixelRatio();
}

// ------------------------------------------------------------------ UI wiring
function bindUI() {
  $('btn-play').addEventListener('click', () => startGame(false));
  $('btn-join').addEventListener('click', () => startGame(true));
  let selectedSession = 0;
  const renderLobby = () => {
    ui.buildLobby(SESSIONS, selectedSession, (idx) => {
      selectedSession = idx;
      audio.ui();
      renderLobby();
    });
  };
  const openOnline = () => {
    ensureAudio();
    audio.ui();
    renderLobby();
    ui.buildCrew();
    ui.showPanel('panel-online', true);
    $('btn-join-lobby').onclick = () => startGame(true);
  };
  $('btn-online').addEventListener('click', openOnline);
  $('btn-garage').addEventListener('click', () => {
    ensureAudio(); audio.ui();
    const colors = CARS.map(c => c.color);
    const render = () => {
      drawGaragePreview($('garage-canvas'), null, colors, save.car);
      $('garage-name').textContent = CARS[save.car].name;
      $('garage-class').textContent = CARS[save.car].cls;
      ui.buildGarage(CARS.map(c => ({ ...c, locked: save.level < c.level, cls: c.cls })), save.car, (i) => {
        if (save.level < CARS[i].level) { ui.toast(`Unlocks at REP ${CARS[i].level}`, 'pink'); return; }
        save.car = i; store(SAVE_KEY, save); audio.ui(); render();
        const car = vehicles.find(v => v.isStartCar);
        if (car) {
          car.bodyMat.color.setHex(CARS[i].color);
          car.name = CARS[i].name;
          car.maxSpeed = CARS[i].maxSpeed;
        }
      });
    };
    render();
    ui.showPanel('panel-garage', true);
  });
  $('btn-settings').addEventListener('click', () => { ensureAudio(); audio.ui(); ui.showPanel('panel-settings', true); });
  $('btn-controls').addEventListener('click', () => { ensureAudio(); audio.ui(); ui.showPanel('panel-controls', true); });
  $('btn-pause-settings').addEventListener('click', () => { ui.setPause(false); ui.showPanel('panel-settings', true); });
  $('btn-resume').addEventListener('click', () => { audio.ui(); resumeGame(); });
  $('btn-quit').addEventListener('click', () => { audio.ui(); quitToMenu(); });
  $('btn-reset-save').addEventListener('click', () => {
    if (!confirm('Reset all Neon District progress?')) return;
    save.cash = 2500; save.xp = 0; save.level = 1; save.car = 0;
    store(SAVE_KEY, save);
    ui.setProfile({ cash: save.cash, level: save.level, xp: 0 });
    ui.toast('Progress reset', 'gold');
  });
  $('set-quality').value = save.quality;
  $('set-quality').addEventListener('change', (e) => { save.quality = e.target.value; store(SAVE_KEY, save); qualityChanged = true; audio.ui(); });
  $('set-volume').value = save.volume;
  $('set-volume').addEventListener('input', (e) => { save.volume = Number(e.target.value); audio.setVolume(save.volume / 100); store(SAVE_KEY, save); });
  $('set-sens').value = save.sens;
  $('set-sens').addEventListener('input', (e) => { save.sens = Number(e.target.value); store(SAVE_KEY, save); });
  $('set-invert').checked = save.invert;
  $('set-invert').addEventListener('change', (e) => { save.invert = e.target.checked; store(SAVE_KEY, save); });
  $('set-dynamic').checked = save.dynamic;
  $('set-dynamic').addEventListener('change', (e) => { save.dynamic = e.target.checked; store(SAVE_KEY, save); });
  for (const b of document.querySelectorAll('.back, [data-close]')) {
    b.addEventListener('click', () => {
      if (state === 'paused') { ui.setPause(true); }
      audio.ui();
    });
  }
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    menuNeedsRender = true;
    applyPixelRatio();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pauseGame();
    store(SAVE_KEY, save);
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Kick off
bindUI();
ui.showMenu(true);
ui.showHUD(false);
applyPixelRatio();
boot();
