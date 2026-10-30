import * as THREE from '../vendor/three.module.js';
import { clamp, damp, angleDamp, angleDelta } from './utils.js';
import { resolveCircle, CITY } from './world.js';

const CAR_COLORS = [0xd93a4a, 0x2f7fe0, 0xf0b429, 0x2fbf7a, 0xe8e6e1, 0x7a4bce, 0xff6f3d, 0x1cc7d9, 0x9b1d3a, 0x2a2f3a];

let glowTexCache = null;
function getGlow() {
  if (glowTexCache) return glowTexCache;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexCache = new THREE.CanvasTexture(c);
  return glowTexCache;
}

const GEO = {};
function geo(key, make) { return GEO[key] || (GEO[key] = make()); }

const wheelGeo = () => geo('wheel', () => new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12));
const rimGeo = () => geo('rim', () => new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8));
const bodyGeo = () => geo('body', () => new THREE.BoxGeometry(1.94, 0.56, 4.5));
const noseGeo = () => geo('nose', () => new THREE.BoxGeometry(1.86, 0.28, 1.1));
const cabinGeo = () => geo('cabin', () => new THREE.BoxGeometry(1.66, 0.56, 2.0));
const glassGeo = () => geo('glass', () => new THREE.BoxGeometry(1.72, 0.38, 2.04));
const spoilerGeo = () => geo('spoiler', () => new THREE.BoxGeometry(1.7, 0.1, 0.4));
const lightGeo = () => geo('light', () => new THREE.BoxGeometry(0.42, 0.16, 0.07));
const barGeo = () => geo('bar', () => new THREE.BoxGeometry(1.1, 0.1, 0.3));

const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0x8d94a3, roughness: 0.35, metalness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.12, metalness: 0.75 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3cf, toneMapped: false });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2233, toneMapped: false });
const underMat = new THREE.MeshBasicMaterial({ color: 0x2ff3ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

export function createCarMesh({ color = 0xd93a4a, police = false, underglow = null } = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.26, metalness: 0.65 });
  const accentMat = new THREE.MeshStandardMaterial({ color: police ? 0x101828 : 0x16181f, roughness: 0.45, metalness: 0.5 });

  const body = new THREE.Mesh(bodyGeo(), bodyMat);
  body.position.y = 0.72;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const nose = new THREE.Mesh(noseGeo(), bodyMat);
  nose.position.set(0, 0.58, 2.05);
  nose.castShadow = true;
  group.add(nose);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.16, 4.1), accentMat);
  skirt.position.y = 0.38;
  group.add(skirt);

  const cabin = new THREE.Mesh(cabinGeo(), bodyMat);
  cabin.position.set(0, 1.22, -0.28);
  cabin.castShadow = true;
  group.add(cabin);

  const glass = new THREE.Mesh(glassGeo(), glassMat);
  glass.position.set(0, 1.27, -0.28);
  group.add(glass);

  const spoiler = new THREE.Mesh(spoilerGeo(), accentMat);
  spoiler.position.set(0, 1.16, -2.13);
  group.add(spoiler);
  for (const sx of [-0.66, 0.66]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, 0.16), accentMat);
    stand.position.set(sx, 1.02, -2.1);
    group.add(stand);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.07, 1.86), accentMat);
  roof.position.set(0, 1.52, -0.28);
  group.add(roof);

  const rearBar = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.055, 0.05), tailMat);
  rearBar.position.set(0, 0.92, -2.315);
  group.add(rearBar);

  const wheels = [];
  for (const sx of [-0.95, 0.95]) {
    for (const sz of [1.4, -1.42]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx, 0.4, sz);
      const roll = new THREE.Group();
      const w = new THREE.Mesh(wheelGeo(), wheelMat);
      w.rotation.z = Math.PI / 2;
      w.castShadow = true;
      const rim = new THREE.Mesh(rimGeo(), rimMat);
      rim.rotation.z = Math.PI / 2;
      roll.add(w, rim);
      pivot.add(roll);
      group.add(pivot);
      wheels.push({ pivot, roll, front: sz > 0 });
    }
  }

  const headlights = [];
  for (const sx of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(lightGeo(), headMat);
    hl.position.set(sx, 0.76, 2.44);
    group.add(hl);
    headlights.push(hl);
  }
  const tails = [];
  for (const sx of [-0.64, 0.64]) {
    const tl = new THREE.Mesh(lightGeo(), tailMat);
    tl.position.set(sx, 0.78, -2.3);
    group.add(tl);
    tails.push(tl);
  }

  let lightbar = null;
  if (police) {
    lightbar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: 0xff2233, toneMapped: false }));
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: 0x2244ff, toneMapped: false }));
    red.position.x = -0.29; blue.position.x = 0.29;
    lightbar.add(red, blue);
    lightbar.position.set(0, 1.56, -0.2);
    group.add(lightbar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.22, 1.1), new THREE.MeshStandardMaterial({ color: 0x0e2f66, roughness: .5, metalness: .4 }));
    stripe.position.set(0, 0.72, 0.4);
    group.add(stripe);
  }

  if (underglow !== null) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 5.8), underMat.clone());
    glow.material.color.setHex(underglow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.06;
    group.add(glow);
    const light = new THREE.PointLight(underglow, 1.5, 11, 2);
    light.position.y = 0.35;
    group.add(light);
  }

  const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlow(), color: 0xfff0c0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  headGlow.position.set(0, 0.6, 2.75);
  headGlow.scale.set(4.6, 1.6, 1);
  group.add(headGlow);

  return { group, wheels, bodyMat, headlights, tails, lightbar, headGlow, body };
}

export class Vehicle {
  constructor(scene, world, { x = 0, z = 0, heading = 0, color, police = false, parked = false, player = false, name = 'CAR', maxSpeed = 55, underglow = null } = {}) {
    this.world = world;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.maxSpeed = maxSpeed;
    this.accel = police ? 32 : 24;
    this.health = 100;
    this.police = police;
    this.parked = parked;
    this.player = player;
    this.name = name;
    this.radius = 1.55;
    this.collisionCooldown = 0;
    this.braking = false;
    this.boosting = false;
    this.ai = null;
    this.flash = 0;
    this.stopped = parked;
    const built = createCarMesh({ color: color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], police, underglow });
    this.mesh = built.group;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    this.wheels = built.wheels;
    this.headlights = built.headlights;
    this.tails = built.tails;
    this.lightbar = built.lightbar;
    this.bodyMat = built.bodyMat;
    this.headGlow = built.headGlow;
    this.scene = scene;
    scene.add(this.mesh);
  }

  setAI(axis, sign, roadCoord) {
    this.ai = { axis, sign, roadCoord, next: this._nextTarget(axis, sign, roadCoord) };
  }

  _nextTarget(axis, sign, roadCoord) {
    const coords = CITY.roadCoords;
    const cur = axis === 'x' ? this.pos.x : this.pos.z;
    let next = null;
    if (sign > 0) next = coords.find(c => c > cur + 6);
    else for (let i = coords.length - 1; i >= 0; i--) { if (coords[i] < cur - 6) { next = coords[i]; break; } }
    if (next === null) { sign = -sign; next = axis === 'x' ? (sign > 0 ? 294 : -294) : (sign > 0 ? 294 : -294); }
    const lane = sign > 0 ? 4.6 : -4.6;
    return {
      x: axis === 'x' ? next : roadCoord + lane,
      z: axis === 'x' ? roadCoord + lane : next,
      axis, sign, roadCoord, coord: next,
    };
  }

  updateTraffic(dt, playerPos) {
    if (!this.ai || this.stopped) return;
    const t = this.ai.next;
    let dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 4.5) {
      const goStraight = Math.random() < 0.52;
      let axis = this.ai.axis, sign = this.ai.sign, roadCoord = this.ai.roadCoord;
      if (!goStraight) {
        const left = Math.random() < 0.5;
        if (axis === 'x') { roadCoord = this.pos.x + (sign > 0 ? -4.6 : 4.6); axis = 'z'; sign = left ? 1 : -1; }
        else { roadCoord = this.pos.z + (sign > 0 ? 4.6 : -4.6); axis = 'x'; sign = left ? -1 : 1; }
      } else {
        roadCoord = axis === 'x' ? this.pos.z : this.pos.x;
      }
      this.ai = { axis, sign, roadCoord, next: this._nextTarget(axis, sign, roadCoord) };
      return;
    }
    const desired = Math.atan2(dx, dz);
    this.heading = angleDamp(this.heading, desired, 4.5, dt);
    let targetSpeed = this.police ? 34 : (this.maxSpeed * 0.42);
    if (playerPos) {
      const pd = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      if (pd < 14) targetSpeed *= 0.25;
    }
    this.speed = damp(this.speed, targetSpeed, 1.5, dt);
    this._move(dt);
    this._animateWheels(dt);
    this._sync();
  }

  updatePolice(dt, targetPos, targetSpeed = 0) {
    if (!targetPos) return;
    const dx = targetPos.x - this.pos.x, dz = targetPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    const delta = angleDelta(this.heading, desired);
    const steer = clamp(delta * 2.2, -1, 1);
    const throttle = dist > 6 ? 1 : 0.15;
    const brake = dist < 4 ? 1 : 0;
    this.drive(dt, throttle, steer, brake, false, true);
    if (dist > 70) this.speed = Math.max(this.speed, 25);
  }

  drive(dt, throttle, steer, brake, boost, ignoreInput = false) {
    this.steer = damp(this.steer, steer, 8, dt);
    this.braking = brake > 0.1;
    this.boosting = !!boost;
    const max = this.boosting ? this.maxSpeed * 1.28 : this.maxSpeed;
    let target = throttle * max;
    if (brake > 0.1) target = 0;
    if (throttle < -0.1) target = -13;
    const rate = brake > 0.1 ? 34 : (throttle > 0 ? this.accel : 18);
    const delta = target - this.speed;
    this.speed += clamp(delta, -rate * dt, rate * dt);
    if (Math.abs(this.speed) < 0.4) this.speed = 0;
    const speedFactor = clamp(Math.abs(this.speed) / 13, 0, 1);
    const turn = this.steer * (1.75 + (this.boosting ? 0.22 : 0)) * speedFactor;
    if (this.speed < -0.5) this.heading -= turn * dt;
    else this.heading += turn * dt;
    if (this.boosting && this.speed > 20) this.speed *= 1 + 0.25 * dt;
    this._move(dt, brake > 0.1);
    this._animateWheels(dt);
    this._sync();
  }

  _move(dt, handbrake = false) {
    const fwdX = Math.sin(this.heading), fwdZ = Math.cos(this.heading);
    const steps = Math.max(1, Math.ceil(Math.abs(this.speed) * dt / 1.4));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.pos.x += fwdX * this.speed * sdt;
      this.pos.z += fwdZ * this.speed * sdt;
      const res = resolveCircle(this.pos.x, this.pos.z, this.radius, this.world.colliders);
      if (Math.abs(res.x - this.pos.x) > 0.001 || Math.abs(res.z - this.pos.z) > 0.001) {
        this.pos.x = res.x; this.pos.z = res.z;
        if (this.collisionCooldown <= 0) {
          this.health -= Math.min(18, Math.abs(this.speed) * 0.5);
          this.collisionCooldown = 0.4;
        }
        this.speed *= -0.18;
        break;
      }
    }
    this.collisionCooldown -= dt;
    const limit = CITY.extent - 8;
    this.pos.x = clamp(this.pos.x, -limit, limit);
    this.pos.z = clamp(this.pos.z, -limit, limit);
    if (handbrake) this.speed *= 1 - 2.2 * dt;
  }

  _animateWheels(dt) {
    const spin = this.speed * dt / 0.38;
    for (const w of this.wheels) {
      w.roll.rotation.x += spin;
      if (w.front) w.pivot.rotation.y = this.steer * 0.42;
    }
  }

  _sync() {
    this.mesh.position.set(this.pos.x, 0.02, this.pos.z);
    this.mesh.rotation.y = this.heading;
  }

  updateLights(dt, nightFactor, heat = 0) {
    if (this.lightbar) {
      this.flash += dt * (this.police ? 9 : 0);
      const red = this.lightbar.children[0], blue = this.lightbar.children[1];
      if (red && blue) {
        const on = Math.sin(this.flash) > 0;
        red.material.color.setHex(on ? 0xff2233 : 0x220008);
        blue.material.color.setHex(on ? 0x0a0a44 : 0x3355ff);
      }
    }
    const glow = 0.4 + nightFactor * 0.6;
    for (const h of this.headlights) h.material.color.setRGB(glow, glow * 0.94, glow * 0.8);
    if (this.headGlow) this.headGlow.material.opacity = 0.18 + nightFactor * 0.55;
    for (const t of this.tails) t.material.color.setHex(this.braking ? 0xff5566 : 0xbb1122);
  }

  damage(amount) {
    this.health -= amount;
    this.bodyMat.emissive = new THREE.Color(0x551111);
    this.bodyMat.emissiveIntensity = 0.6;
    setTimeout(() => { this.bodyMat.emissiveIntensity = 0; }, 140);
    return this.health <= 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.traverse(o => { if (o.material && o.material !== underMat) o.material.dispose?.(); });
  }
}
