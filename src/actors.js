import * as THREE from '../vendor/three.module.js';
import { clamp, damp, angleDamp, makeCanvas, roundRect } from './utils.js';
import { resolveCircle, groundHeightAt, CITY } from './world.js';

const SKIN = [0xf0c9a5, 0xd9a67c, 0x9c6b4a, 0x6f4630, 0xffd9b8];
const JACKETS = [0x2ff3ff, 0xff2d75, 0xffcc4d, 0x8dffb0, 0xc78bff, 0xff7a3d, 0x5a7dff, 0xe8e6e1];
const PANTS = [0x1a1d28, 0x24252f, 0x2e2b3a, 0x152a3a];
const HAIR = [0x15120f, 0x2a1c12, 0x4a2a1a, 0x0d0d10, 0x6d4a2a];

function createNameSprite(name, color = '#2ff3ff', sub = '') {
  const c = makeCanvas(384, 96);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 384, 96);
  ctx.fillStyle = 'rgba(5,7,14,.72)';
  roundRect(ctx, 8, 10, 368, 76, 22);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillRect(18, 40, 4, 24);
  ctx.font = '700 30px "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4f6ff';
  ctx.fillText(name, 34, 48);
  if (sub) {
    ctx.font = '600 18px Arial, sans-serif';
    ctx.fillStyle = 'rgba(210,220,240,.72)';
    ctx.fillText(sub, 238, 50);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.2, 1.05, 1);
  return sprite;
}

function buildHuman({ jacket, pants, skin, hair, hat = false, scale = 1 } = {}) {
  const group = new THREE.Group();
  const jacketMat = new THREE.MeshStandardMaterial({ color: jacket ?? 0x2ff3ff, emissive: jacket ?? 0x2ff3ff, emissiveIntensity: 0.09, roughness: 0.62, metalness: 0.15 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants ?? 0x1a1d28, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin ?? 0xf0c9a5, roughness: 0.75 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair ?? 0x15120f, roughness: 0.9 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x101116, roughness: 0.6 });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x2ff3ff, toneMapped: false });

  const hips = new THREE.Group();
  hips.position.y = 0.95;
  group.add(hips);

  const legs = [];
  for (const sx of [-0.15, 0.15]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 0, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.62, 4, 7), pantsMat);
    leg.position.y = -0.42;
    leg.castShadow = true;
    pivot.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.38), shoeMat);
    shoe.position.set(0, -0.86, 0.06);
    pivot.add(shoe);
    hips.add(pivot);
    legs.push(pivot);
  }

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.34), jacketMat);
  torso.position.y = 0.34;
  torso.castShadow = true;
  hips.add(torso);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.045, 0.35), trimMat);
  trim.position.y = 0.5;
  hips.add(trim);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.3), jacketMat);
  collar.position.y = 0.71;
  hips.add(collar);

  const arms = [];
  for (const sx of [-0.36, 0.36]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 0.64, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.52, 4, 7), jacketMat);
    arm.position.y = -0.3;
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), skinMat);
    hand.position.y = -0.62;
    pivot.add(hand);
    hips.add(pivot);
    arms.push(pivot);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 10), skinMat);
  head.position.y = 0.94;
  head.castShadow = true;
  hips.add(head);
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.178, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hairMesh.position.y = 0.955;
  hips.add(hairMesh);
  if (hat) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.13, 10), jacketMat);
    cap.position.y = 1.03;
    hips.add(cap);
  }

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  group.scale.setScalar(scale);
  return { group, hips, legs, arms, head, torso, shadow, materials: { jacketMat, pantsMat, trimMat } };
}

export class Player {
  constructor(scene, world, opts = {}) {
    this.scene = scene;
    this.world = world;
    this.pos = new THREE.Vector3(opts.x ?? 42, 0, opts.z ?? 30);
    this.vel = new THREE.Vector3();
    this.heading = opts.heading ?? Math.PI;
    this.vy = 0;
    this.grounded = true;
    this.speed = 0;
    this.walkPhase = 0;
    this.health = 100;
    this.armor = 65;
    this.inVehicle = null;
    this.name = opts.name || 'ROOK';
    const built = buildHuman({ jacket: 0x2ff3ff, pants: 0x1a1d28, skin: 0xe8b98f, hair: 0x15120f, hat: false, scale: 1.02 });
    this.model = built;
    this.group = built.group;
    this.group.position.set(this.pos.x, groundHeightAt(this.pos.x, this.pos.z), this.pos.z);
    this.group.rotation.y = this.heading;
    scene.add(this.group);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.62, 24), new THREE.MeshBasicMaterial({ color: 0x2ff3ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.group.add(ring);

    const selfLight = new THREE.PointLight(0x53eaff, 1.15, 9, 2);
    selfLight.position.y = 1.5;
    this.group.add(selfLight);
  }

  setVisible(v) { this.group.visible = v; }

  update(dt, input, camYaw) {
    if (this.inVehicle) return;
    const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, input.forward).addScaledVector(right, input.strafe);
    const mag = Math.min(1, wish.length());
    if (mag > 0.001) wish.normalize();
    const speed = (input.sprint ? 9.0 : 5.1) * mag;
    const targetVX = wish.x * speed;
    const targetVZ = wish.z * speed;
    this.vel.x = damp(this.vel.x, targetVX, 14, dt);
    this.vel.z = damp(this.vel.z, targetVZ, 14, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const res = resolveCircle(this.pos.x, this.pos.z, 0.42, this.world.colliders);
    this.pos.x = res.x; this.pos.z = res.z;
    const limit = CITY.extent - 6;
    this.pos.x = clamp(this.pos.x, -limit, limit);
    this.pos.z = clamp(this.pos.z, -limit, limit);

    const ground = groundHeightAt(this.pos.x, this.pos.z);
    if (input.jump && this.grounded) { this.vy = 5.6; this.grounded = false; }
    this.vy -= 18 * dt;
    let y = this.group.position.y + this.vy * dt;
    if (y <= ground) { y = ground; this.vy = 0; this.grounded = true; }
    this.group.position.set(this.pos.x, y, this.pos.z);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    if (mag > 0.05) {
      const targetHeading = Math.atan2(wish.x, wish.z);
      this.heading = angleDamp(this.heading, targetHeading, 12, dt);
      this.group.rotation.y = this.heading;
    }

    const stride = this.speed > 0.2 ? 1 : 0;
    this.walkPhase += dt * (3.5 + this.speed * 1.15) * stride;
    const swing = Math.sin(this.walkPhase) * (0.5 + this.speed * 0.035);
    const idle = Math.sin(performance.now() * 0.002) * 0.02;
    for (let i = 0; i < 2; i++) {
      this.model.legs[i].rotation.x = stride ? swing * (i === 0 ? 1 : -1) : 0;
      this.model.arms[i].rotation.x = (stride ? -swing * 0.75 * (i === 0 ? 1 : -1) : 0) + idle;
      this.model.arms[i].rotation.z = (i === 0 ? 0.06 : -0.06);
    }
    this.model.hips.position.y = 0.95 + (stride ? Math.abs(Math.sin(this.walkPhase)) * 0.035 : idle * 0.3);
    this.model.torso.rotation.z = stride ? Math.sin(this.walkPhase) * 0.025 : 0;
    this.model.head.rotation.y = Math.sin(performance.now() * 0.0004) * 0.15;
    this.model.shadow.material.opacity = this.grounded ? 0.3 : 0.12;
  }

  damage(amount) {
    if (this.armor > 0) {
      const absorb = Math.min(this.armor, amount * 0.7);
      this.armor -= absorb;
      amount -= absorb;
    }
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  reset(x, z) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.health = 100;
    this.armor = 65;
    this.vy = 0;
    this.inVehicle = null;
    this.group.visible = true;
    this.group.position.set(x, groundHeightAt(x, z), z);
  }
}

export class Pedestrian {
  constructor(scene, world, { x, z, name = null, online = false, jacket = null } = {}) {
    this.scene = scene;
    this.world = world;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.target = new THREE.Vector3(x, 0, z);
    this.online = online;
    this.name = name;
    this.fleeTimer = 0;
    this.walkPhase = Math.random() * 10;
    this.baseSpeed = online ? 2.0 : 1.35;
    this.radius = 0.4;
    const built = buildHuman({
      jacket: jacket ?? JACKETS[Math.floor(Math.random() * JACKETS.length)],
      pants: PANTS[Math.floor(Math.random() * PANTS.length)],
      skin: SKIN[Math.floor(Math.random() * SKIN.length)],
      hair: HAIR[Math.floor(Math.random() * HAIR.length)],
      hat: Math.random() > 0.8,
      scale: 0.92 + Math.random() * 0.12,
    });
    this.model = built;
    this.group = built.group;
    this.group.position.set(x, groundHeightAt(x, z), z);
    scene.add(this.group);
    if (name) {
      this.tag = createNameSprite(name, online ? '#ffcc4d' : '#9aa0b4', online ? 'ONLINE' : '');
      this.tag.position.y = 2.45;
      this.tag.scale.set(3.8, 0.95, 1);
      this.group.add(this.tag);
    }
    this._pickTarget();
  }

  _pickTarget() {
    const bc = CITY.blockCenters;
    const bx = bc[Math.floor(Math.random() * bc.length)];
    const bz = bc[Math.floor(Math.random() * bc.length)];
    const edge = Math.random() > 0.5;
    const off = (Math.random() > 0.5 ? 1 : -1) * (26 + Math.random() * 3);
    const tx = edge ? bx + (Math.random() - 0.5) * 40 : bx + off;
    const tz = edge ? bz + off : bz + (Math.random() - 0.5) * 40;
    this.target.set(clamp(tx, -330, 330), 0, clamp(tz, -330, 330));
  }

  update(dt, playerPos, heat, panic = false) {
    let tx = this.target.x, tz = this.target.z;
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      const dx = this.pos.x - playerPos.x, dz = this.pos.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = this.pos.x + dx / d * 40;
      tz = this.pos.z + dz / d * 40;
    } else if (panic || heat > 0) {
      this.fleeTimer = 3 + Math.random() * 5;
    }
    if (this.fleeTimer > 0) {
      const dx = this.pos.x - playerPos.x, dz = this.pos.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = clamp(this.pos.x + dx / d * 40, -320, 320);
      tz = clamp(this.pos.z + dz / d * 40, -320, 320);
    }
    let dx = tx - this.pos.x, dz = tz - this.pos.z;
    let d = Math.hypot(dx, dz);
    if (d < 2.2) { this._pickTarget(); return; }
    if (this.fleeTimer > 0) d = Math.max(d, 1);
    const desired = Math.atan2(dx, dz);
    this.heading = angleDamp(this.heading, desired, 5, dt);
    const targetSpeed = (this.fleeTimer > 0 ? 4.6 : this.baseSpeed) * (this.online ? 1.05 : 1);
    this.speed = damp(this.speed, targetSpeed, 4, dt);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    const res = resolveCircle(this.pos.x, this.pos.z, this.radius, this.world.colliders);
    this.pos.x = res.x; this.pos.z = res.z;
    this.group.position.set(this.pos.x, groundHeightAt(this.pos.x, this.pos.z), this.pos.z);
    this.group.rotation.y = this.heading;
    this.walkPhase += dt * (5.5 + this.speed * 1.5);
    const swing = Math.sin(this.walkPhase) * (0.32 + this.speed * 0.03);
    for (let i = 0; i < 2; i++) {
      this.model.legs[i].rotation.x = swing * (i === 0 ? 1 : -1);
      this.model.arms[i].rotation.x = -swing * 0.7 * (i === 0 ? 1 : -1);
    }
    this.model.hips.position.y = 0.95 + Math.abs(Math.sin(this.walkPhase)) * 0.02;
  }
}

export class OnlineSquad {
  constructor(scene, world, count = 7) {
    this.members = [];
    const names = ['NOVA_9', 'GHOSTFOX', 'KIRA', 'M4VERICK', 'SOULJA', 'R3DLINE', 'ZEROCOOL', 'NYX'];
    for (let i = 0; i < count; i++) {
      const bc = CITY.blockCenters;
      const x = bc[Math.floor(Math.random() * bc.length)] + (Math.random() - .5) * 30;
      const z = bc[Math.floor(Math.random() * bc.length)] + (Math.random() - .5) * 30;
      this.members.push(new Pedestrian(scene, world, {
        x, z, name: names[i % names.length], online: true,
        jacket: [0xff2d75, 0xffcc4d, 0x2ff3ff, 0x8dffb0, 0xc78bff][i % 5],
      }));
    }
  }
  update(dt, playerPos) {
    for (const p of this.members) p.update(dt, playerPos, 0, false);
  }
}
