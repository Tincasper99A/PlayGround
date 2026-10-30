import * as THREE from '../vendor/three.module.js';
import { mulberry32, clamp, lerp, smoothstep, makeCanvas, roundRect, pick } from './utils.js';

export const CITY = {
  block: 64,
  halfBlock: 32,
  roadWidth: 20,
  spacing: 84,
  blocks: 7,
  blockRange: 3,
  extent: 338,
  roadCoords: [-294, -210, -126, -42, 42, 126, 210, 294],
  blockCenters: [-252, -168, -84, 0, 84, 168, 252],
};

const SIGN_WORDS = ['NEON', 'MOTEL', 'ARCADE', '24/7', 'SUSHI', 'PAWN', 'LIQUOR', 'HOTEL', 'TATTOO', 'RADIO', 'DINER', 'CLUB', 'BAIL', 'NOODLE', 'GARAGE', 'VICE'];
const SIGN_COLORS = ['#ff2d75', '#2ff3ff', '#ffcc4d', '#8dffb0', '#c78bff', '#ff7a3d'];

function noiseTexture(size, base, spread, extra) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * spread;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  extra?.(ctx, size);
  return c;
}

function makeAsphaltTexture() {
  return new THREE.CanvasTexture(noiseTexture(256, '#33353f', 26, (ctx, s) => {
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = i % 2 ? '#000' : '#5e6472';
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      const y = Math.random() * s;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(s * 0.3, y + (Math.random() - 0.5) * 20, s * 0.7, y + (Math.random() - 0.5) * 20, s, y + (Math.random() - 0.5) * 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.16)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.4, 1.4);
    }
  }));
}

function makeConcreteTexture() {
  return new THREE.CanvasTexture(noiseTexture(256, '#646976', 18, (ctx, s) => {
    ctx.strokeStyle = 'rgba(20,22,28,.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo((i / 4) * s, 0); ctx.lineTo((i / 4) * s, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (i / 4) * s); ctx.lineTo(s, (i / 4) * s); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let i = 0; i < 60; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }));
}

function makeGrassTexture() {
  return new THREE.CanvasTexture(noiseTexture(128, '#314c30', 30, (ctx, s) => {
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${60 + Math.random() * 40},${90 + Math.random() * 60},${50 + Math.random() * 30},.5)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1, 2 + Math.random() * 3);
    }
  }));
}

const FACADE_PALETTES = [
  { base: '#39404f', trim: '#242a36', lit: ['#ffdba6', '#ffe9c9', '#bfe8ff'] },
  { base: '#4b3a38', trim: '#2c2323', lit: ['#ffc98f', '#ffe0b0', '#ffd6e8'] },
  { base: '#2c3a44', trim: '#1d262e', lit: ['#9fe8ff', '#c9f5ff', '#ffe3a8'] },
  { base: '#403c4c', trim: '#282433', lit: ['#ffb3d0', '#ffd7e6', '#ffe9b0'] },
  { base: '#454139', trim: '#2b2923', lit: ['#ffe0a0', '#ffce85', '#bfe8ff'] },
  { base: '#243244', trim: '#18202d', lit: ['#b6e6ff', '#8ed4ff', '#ffe6b8'] },
];

function makeFacadeTextures(rng, variant) {
  const pal = FACADE_PALETTES[variant % FACADE_PALETTES.length];
  const W = 256, H = 512;
  const map = makeCanvas(W, H);
  const emi = makeCanvas(W, H);
  const ctx = map.getContext('2d');
  const ectx = emi.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, pal.base);
  grad.addColorStop(1, pal.trim);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);

  const cols = 4, rows = 8;
  const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.18;
      const y = r * ch + ch * 0.2;
      const w = cw * 0.64;
      const h = ch * 0.56;
      const lit = rng() > 0.58;
      const shade = 18 + rng() * 16;
      ctx.fillStyle = `rgb(${shade},${shade + 5},${shade + 12})`;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(x, y, w, h * 0.18);
      if (lit) {
        const color = pick(rng, pal.lit);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ctx.globalAlpha = 1;
        ectx.fillStyle = color;
        ectx.globalAlpha = 0.9;
        ectx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ectx.globalAlpha = 1;
      } else {
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.fillRect(x, y + h * .72, w, h * .28);
      }
      ctx.strokeStyle = 'rgba(0,0,0,.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(0, r * ch, W, 2);
  }
  for (let c = 1; c < cols; c++) {
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(c * cw - 1, 0, 2, H);
  }
  const mapTex = new THREE.CanvasTexture(map);
  const emiTex = new THREE.CanvasTexture(emi);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  emiTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  emiTex.wrapS = emiTex.wrapT = THREE.RepeatWrapping;
  mapTex.anisotropy = 4;
  return { mapTex, emiTex };
}

function makeStorefrontTextures(rng, variant) {
  const W = 512, H = 128;
  const map = makeCanvas(W, H);
  const emi = makeCanvas(W, H);
  const ctx = map.getContext('2d');
  const ectx = emi.getContext('2d');
  ctx.fillStyle = '#181a22';
  ctx.fillRect(0, 0, W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);
  const shops = 4;
  const sw = W / shops;
  const neon = SIGN_COLORS[variant % SIGN_COLORS.length];
  for (let i = 0; i < shops; i++) {
    const x = i * sw + 6;
    ctx.fillStyle = i % 2 ? '#232633' : '#1c1e28';
    ctx.fillRect(x, 6, sw - 12, H - 12);
    const lit = rng() > 0.35;
    const glass = lit ? (rng() > 0.5 ? '#ffd49a' : '#a8ecff') : '#101521';
    ctx.fillStyle = glass;
    ctx.globalAlpha = lit ? 0.5 : 0.9;
    ctx.fillRect(x + 6, 36, sw - 24, H - 52);
    ctx.globalAlpha = 1;
    if (lit) {
      ectx.fillStyle = glass;
      ectx.globalAlpha = 0.55;
      ectx.fillRect(x + 6, 36, sw - 24, H - 52);
      ectx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.strokeRect(x + 6, 36, sw - 24, H - 52);
    ctx.fillStyle = neon;
    ctx.fillRect(x + 10, 16, sw - 32, 8);
    ectx.fillStyle = neon;
    ectx.fillRect(x + 10, 16, sw - 32, 8);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    for (let k = 1; k < 3; k++) ctx.fillRect(x + 6 + (sw - 24) * k / 3, 36, 2, H - 52);
  }
  const mapTex = new THREE.CanvasTexture(map);
  const emiTex = new THREE.CanvasTexture(emi);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  emiTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  emiTex.wrapS = emiTex.wrapT = THREE.RepeatWrapping;
  return { mapTex, emiTex };
}

function makeGlowTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,.75)');
  g.addColorStop(0.42, 'rgba(255,255,255,.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeSignTexture(word, color, vertical = true) {
  const W = vertical ? 160 : 512;
  const H = vertical ? 640 : 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(6,6,12,.92)';
  roundRect(ctx, 3, 3, W - 6, H - 6, 10);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  roundRect(ctx, 8, 8, W - 16, H - 16, 8);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `900 ${vertical ? 88 : 92}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (vertical) {
    const letters = word.split('');
    const step = (H - 100) / letters.length;
    letters.forEach((ch, i) => {
      ctx.shadowBlur = 26;
      ctx.fillText(ch, W / 2, 55 + step * (i + 0.5));
    });
  } else {
    ctx.fillText(word, W / 2, H / 2);
  }
  ctx.shadowBlur = 0;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBillboardTexture(title, sub, color, color2) {
  const W = 640, H = 320;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, color);
  g.addColorStop(1, color2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000';
  for (let i = 0; i < 12; i++) ctx.fillRect(0, i * 28, W, 10);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(4,5,12,.82)';
  roundRect(ctx, 26, 26, W - 52, H - 52, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '900 66px "Arial Black", Arial, sans-serif';
  ctx.shadowColor = color2;
  ctx.shadowBlur = 20;
  ctx.fillText(title, W / 2, 148);
  ctx.shadowBlur = 0;
  ctx.fillStyle = color2;
  ctx.font = '700 24px "Arial Narrow", Arial, sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillText(sub, W / 2, 205);
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = '600 16px Arial, sans-serif';
  ctx.fillText('SUNSET CITY · NEON DISTRICT', W / 2, 262);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene, opts = {}) {
  const quality = opts.quality || 'high';
  const mobile = !!opts.mobile;
  const rng = mulberry32(0x5eed1a7);
  const root = new THREE.Group();
  root.name = 'city';
  scene.add(root);

  const colliders = [];
  const carSpawns = [];
  const buildings = [];
  const neonSigns = [];
  const facadeMats = [];
  const storeMats = [];
  const glowTex = makeGlowTexture();
  const lampGlowPositions = [];

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x2a2230, 2.0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd0a0, 2.4);
  sun.position.set(-220, 180, -140);
  sun.castShadow = true;
  const shadowSize = mobile ? 1024 : quality === 'high' ? 2048 : 1536;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 620;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  const rim = new THREE.DirectionalLight(0x6a7dff, 0.7);
  rim.position.set(180, 90, 220);
  scene.add(rim);

  const ambient = new THREE.AmbientLight(0x7184b8, 0.6);
  scene.add(ambient);

  const fill = new THREE.DirectionalLight(0x9db6ff, 0.5);
  fill.position.set(-120, 70, 160);
  scene.add(fill);

  // -------------------------------------------------------------- sky
  const skyUniforms = {
    topColor: { value: new THREE.Color('#2a2050') },
    horizonColor: { value: new THREE.Color('#ff9a5c') },
    sunColor: { value: new THREE.Color('#ffd9a0') },
    sunDir: { value: new THREE.Vector3(0.4, 0.2, -0.8).normalize() },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunColor; uniform vec3 sunDir;
      void main(){
        float y = clamp(vDir.y, 0.0, 1.0);
        float grad = pow(y, 0.52);
        vec3 col = mix(horizonColor, topColor, grad);
        float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * (pow(d, 260.0) * 2.2 + pow(d, 9.0) * 0.28 + pow(d, 2.0) * 0.06);
        float band = sin(vDir.y * 42.0) * 0.004;
        col += band;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 20), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffe2b0, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.95,
  }));
  sunSprite.scale.set(340, 340, 1);
  scene.add(sunSprite);

  const starsGeo = new THREE.BufferGeometry();
  const starCount = 420;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(rng() * 0.95);
    const r = 2100;
    starPos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    starPos[i * 3 + 1] = Math.cos(phi) * r;
    starPos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starsMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.2, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, toneMapped: false });
  const stars = new THREE.Points(starsGeo, starsMat);
  scene.add(stars);

  // -------------------------------------------------------------- ground
  const asphaltTex = makeAsphaltTexture();
  asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
  asphaltTex.repeat.set(4, 4);
  asphaltTex.colorSpace = THREE.SRGBColorSpace;
  const concreteTex = makeConcreteTexture();
  concreteTex.wrapS = concreteTex.wrapT = THREE.RepeatWrapping;
  concreteTex.colorSpace = THREE.SRGBColorSpace;
  const grassTex = makeGrassTexture();
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.colorSpace = THREE.SRGBColorSpace;

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1d2230, roughness: 0.98, metalness: 0.0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  ground.name = 'ground';
  root.add(ground);

  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0xffffff, roughness: 0.9, metalness: 0.02 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: 0xd6d9e2, roughness: 0.88, metalness: 0.05 });
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, color: 0x9ab08e, roughness: 1 });

  function addRoad(w, l, x, z) {
    const geo = new THREE.PlaneGeometry(w, l);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 14, uv.getY(i) * l / 14);
    const m = new THREE.Mesh(geo, asphaltMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.01, z);
    m.receiveShadow = true;
    root.add(m);
  }
  for (const r of CITY.roadCoords) {
    addRoad(700, CITY.roadWidth, 0, r);
    addRoad(CITY.roadWidth, 700, r, 0);
  }

  const blockGeo = new THREE.BoxGeometry(CITY.block + 2, 0.32, CITY.block + 2);
  const blockTopGeo = new THREE.BoxGeometry(CITY.block, 0.06, CITY.block);

  // -------------------------------------------------------------- facades
  for (let v = 0; v < 6; v++) {
    const { mapTex, emiTex } = makeFacadeTextures(rng, v);
    const mat = new THREE.MeshStandardMaterial({
      map: mapTex, emissiveMap: emiTex, emissive: 0xffffff, emissiveIntensity: 0.12,
      color: 0xffffff, roughness: 0.6, metalness: 0.22,
    });
    facadeMats.push(mat);
    const st = makeStorefrontTextures(rng, v);
    const smat = new THREE.MeshStandardMaterial({
      map: st.mapTex, emissiveMap: st.emiTex, emissive: 0xffffff, emissiveIntensity: 0.32,
      color: 0xffffff, roughness: 0.5, metalness: 0.3,
    });
    storeMats.push(smat);
  }
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x24262e, roughness: 0.95 });
  const roofMat2 = new THREE.MeshStandardMaterial({ color: 0x353139, roughness: 0.9 });
  const antennaMat = new THREE.MeshStandardMaterial({ color: 0x777d8c, roughness: 0.5, metalness: 0.7 });
  const neonMats = [];

  function buildBuilding(bx, bz, w, d, h, idx) {
    const variant = Math.floor(rng() * 6);
    const facade = facadeMats[variant].clone();
    facade.emissiveIntensity = 0.12;
    facadeMats.push(facade);
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      let sx, sy;
      if (f === 0 || f === 1) { sx = d / 13; sy = h / 24; }
      else if (f === 4 || f === 5) { sx = w / 13; sy = h / 24; }
      else { sx = w / 13; sy = d / 13; }
      const ox = rng() * 0.5, oy = rng() * 0.5;
      for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * sx + ox, uv.getY(i) * sy + oy);
    }
    const mats = [facade, facade, roofMat, roofMat2, facade, facade];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(bx, h / 2 + 0.3, bz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);

    const baseH = Math.min(5.5, h * 0.2);
    const baseGeo = new THREE.BoxGeometry(w + 0.8, baseH, d + 0.8);
    const bmat = storeMats[variant].clone();
    bmat.emissiveIntensity = 0.16;
    storeMats.push(bmat);
    const base = new THREE.Mesh(baseGeo, bmat);
    base.position.set(bx, baseH / 2 + 0.3, bz);
    base.castShadow = true;
    base.receiveShadow = true;
    root.add(base);

    if (h > 24 && rng() > 0.25) {
      const rw = w * (0.22 + rng() * 0.2), rd = d * (0.2 + rng() * 0.22), rh = 1.4 + rng() * 2.2;
      const roofBox = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), rng() > 0.5 ? roofMat : roofMat2);
      roofBox.position.set(bx + (rng() - 0.5) * w * 0.35, h + 0.3 + rh / 2, bz + (rng() - 0.5) * d * 0.35);
      roofBox.castShadow = true;
      root.add(roofBox);
      if (h > 45 && rng() > 0.45) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 8 + rng() * 8, 5), antennaMat);
        mast.position.set(bx, h + 4.3 + 4, bz);
        root.add(mast);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false }));
        beacon.position.set(bx, h + 8.4 + (mast.geometry.parameters.height - 8) / 2, bz);
        root.add(beacon);
      }
    }

    colliders.push({ minX: bx - w / 2 - 0.6, maxX: bx + w / 2 + 0.6, minZ: bz - d / 2 - 0.6, maxZ: bz + d / 2 + 0.6, h });
    buildings.push({ x: bx, z: bz, w, d, h, variant });

    // neon signs on tall street-facing buildings
    if (h > 20 && rng() > 0.32) {
      const side = ['z+', 'z-', 'x+', 'x-'][Math.floor(rng() * 4)];
      const word = pick(rng, SIGN_WORDS);
      const color = pick(rng, SIGN_COLORS);
      const tex = makeSignTexture(word, color);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
      const sw = 3.6, sh = 12;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
      const yy = 9 + rng() * Math.min(16, h * 0.42);
      if (side === 'z+') { sign.position.set(bx + (rng() - .5) * w * .5, yy, bz + d / 2 + 0.35); sign.rotation.y = 0; }
      else if (side === 'z-') { sign.position.set(bx + (rng() - .5) * w * .5, yy, bz - d / 2 - 0.35); sign.rotation.y = Math.PI; }
      else if (side === 'x+') { sign.position.set(bx + w / 2 + 0.35, yy, bz + (rng() - .5) * d * .5); sign.rotation.y = Math.PI / 2; }
      else { sign.position.set(bx - w / 2 - 0.35, yy, bz + (rng() - .5) * d * .5); sign.rotation.y = -Math.PI / 2; }
      sign.userData.base = 0.82 + rng() * 0.18;
      sign.userData.phase = rng() * 10;
      root.add(sign);
      neonSigns.push(sign);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      glow.scale.set(13, 17, 1);
      glow.position.copy(sign.position);
      glow.position.y = yy;
      glow.userData.sign = sign;
      root.add(glow);
      neonSigns.push(glow);
    }
    return { mesh, h };
  }

  // -------------------------------------------------------------- blocks
  const palmSpots = [];
  const benchSpots = [];
  const lampSpots = [];
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      const cx = i * CITY.spacing;
      const cz = j * CITY.spacing;
      const distFromCenter = Math.hypot(cx, cz);
      const isPark = rng() > 0.82;
      const isLot = !isPark && rng() > 0.88;

      const slab = new THREE.Mesh(blockGeo, sidewalkMat);
      slab.position.set(cx, 0.16, cz);
      slab.receiveShadow = true;
      slab.castShadow = true;
      root.add(slab);

      if (isPark) {
        const lawn = new THREE.Mesh(new THREE.BoxGeometry(CITY.block - 8, 0.1, CITY.block - 8), grassMat);
        lawn.position.set(cx, 0.36, cz);
        lawn.receiveShadow = true;
        root.add(lawn);
        const n = 3 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          palmSpots.push({ x: cx + (rng() - .5) * 42, z: cz + (rng() - .5) * 42, s: 0.75 + rng() * 0.5 });
        }
        for (let k = 0; k < 3; k++) {
          benchSpots.push({ x: cx + (rng() - .5) * 40, z: cz + (rng() - .5) * 40, r: rng() * Math.PI });
        }
        const fountain = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.9, 18), sidewalkMat);
        fountain.position.set(cx, 0.8, cz);
        fountain.castShadow = true;
        root.add(fountain);
        const water = new THREE.Mesh(new THREE.CircleGeometry(4, 18), new THREE.MeshStandardMaterial({ color: 0x2b6f82, roughness: 0.15, metalness: 0.5, emissive: 0x0a2a33, emissiveIntensity: 0.4 }));
        water.rotation.x = -Math.PI / 2;
        water.position.set(cx, 1.28, cz);
        root.add(water);
        colliders.push({ minX: cx - 5.2, maxX: cx + 5.2, minZ: cz - 5.2, maxZ: cz + 5.2, h: 1.2 });
      } else if (isLot) {
        const lot = new THREE.Mesh(new THREE.BoxGeometry(CITY.block - 10, 0.08, CITY.block - 10), asphaltMat);
        lot.position.set(cx, 0.37, cz);
        lot.receiveShadow = true;
        root.add(lot);
        for (let k = 0; k < 3; k++) {
          carSpawns.push({ x: cx + (k - 1) * 15, z: cz + (rng() - .5) * 16, heading: rng() > .5 ? 0 : Math.PI, parked: true });
        }
      } else {
        if (distFromCenter < 250 && rng() > 0.45) {
          const w1 = 32 + rng() * 16, d1 = 20 + rng() * 12;
          const w2 = 64 - w1 - 8, d2 = 24 + rng() * 14;
          buildBuilding(cx - 32 + w1 / 2 + 2, cz + (rng() - .5) * 10, w1, Math.min(d1, 34), 20 + (1 - distFromCenter / 380) * 52 + rng() * 26, buildings.length);
          if (w2 > 12) buildBuilding(cx + 32 - w2 / 2 - 2, cz + (rng() - .5) * 10, w2, Math.min(d2, 34), 14 + (1 - distFromCenter / 380) * 34 + rng() * 20, buildings.length);
        } else {
          const w = 26 + rng() * 22;
          const d = 26 + rng() * 20;
          const h = 12 + Math.max(0, 1 - distFromCenter / 380) * 58 + rng() * 22;
          buildBuilding(cx + (rng() - .5) * 8, cz + (rng() - .5) * 8, w, d, h, buildings.length);
        }
        if (rng() > 0.6) palmSpots.push({ x: cx + (rng() > .5 ? 28 : -28), z: cz + (rng() - .5) * 30, s: 0.7 + rng() * 0.4 });
      }

      // sidewalk lamps
      const lampSide = rng() > .5 ? 1 : -1;
      lampSpots.push({ x: cx + lampSide * 28, z: cz + 28, h: 5 + rng() * 0.4 });
      lampSpots.push({ x: cx - lampSide * 28, z: cz - 28, h: 5 + rng() * 0.4 });
    }
  }

  // outer-street parked cars
  for (let n = 0; n < 16; n++) {
    const r = pick(rng, CITY.roadCoords);
    const horizontal = rng() > 0.5;
    const off = pick(rng, [-7, 7]);
    const along = (rng() - 0.5) * 520;
    if (horizontal) carSpawns.push({ x: along, z: r + off, heading: off > 0 ? Math.PI : 0, parked: true });
    else carSpawns.push({ x: r + off, z: along, heading: off > 0 ? -Math.PI / 2 : Math.PI / 2, parked: true });
  }

  // -------------------------------------------------------------- road markings
  const markMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c0, toneMapped: false });
  const dashGeo = new THREE.BoxGeometry(0.22, 0.02, 3);
  let dashCount = 0;
  for (const r of CITY.roadCoords) {
    for (let t = -330; t <= 330; t += 8) {
      if (CITY.roadCoords.some(rc => Math.abs(t - rc) < 14)) continue;
      dashCount += 2;
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, markMat, dashCount);
  const dummy = new THREE.Object3D();
  let di = 0;
  for (const r of CITY.roadCoords) {
    for (let t = -330; t <= 330; t += 8) {
      if (CITY.roadCoords.some(rc => Math.abs(t - rc) < 14)) continue;
      dummy.position.set(t, 0.045, r); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      dashes.setMatrixAt(di++, dummy.matrix);
      dummy.position.set(r, 0.045, t); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix();
      dashes.setMatrixAt(di++, dummy.matrix);
    }
  }
  dashes.count = di;
  dashes.instanceMatrix.needsUpdate = true;
  root.add(dashes);

  const crossMat = new THREE.MeshBasicMaterial({ color: 0xdedbd0, toneMapped: false });
  const crossGeo = new THREE.BoxGeometry(0.7, 0.02, 4.6);
  const crossCount = CITY.roadCoords.length * CITY.roadCoords.length * 16;
  const crosses = new THREE.InstancedMesh(crossGeo, crossMat, crossCount);
  let ci = 0;
  for (const rx of CITY.roadCoords) {
    for (const rz of CITY.roadCoords) {
      for (const s of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          dummy.position.set(rx + s * (7 + k * 1.9), 0.05, rz + (s > 0 ? 0 : 0));
          dummy.rotation.set(0, Math.PI / 2, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          crosses.setMatrixAt(ci++, dummy.matrix);
          dummy.position.set(rx, 0.05, rz + s * (7 + k * 1.9));
          dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
          crosses.setMatrixAt(ci++, dummy.matrix);
        }
      }
    }
  }
  crosses.count = ci;
  crosses.instanceMatrix.needsUpdate = true;
  root.add(crosses);

  // -------------------------------------------------------------- lamps
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 1, 6);
  const headGeo = new THREE.BoxGeometry(0.34, 0.22, 1.5);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x23262f, roughness: 0.6, metalness: 0.7 });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
  const lampMesh = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length * 2 + 8);
  const headMesh = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length * 2 + 8);
  let li = 0;
  for (const s of lampSpots) {
    dummy.position.set(s.x, s.h / 2 + 0.3, s.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, s.h, 1); dummy.updateMatrix();
    lampMesh.setMatrixAt(li, dummy.matrix);
    dummy.position.set(s.x, s.h + 0.1, s.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    headMesh.setMatrixAt(li, dummy.matrix);
    li++;
    lampGlowPositions.push(s.x, s.h + 0.2, s.z);
  }
  lampMesh.count = li; headMesh.count = li;
  lampMesh.instanceMatrix.needsUpdate = true; headMesh.instanceMatrix.needsUpdate = true;
  lampMesh.castShadow = true;
  root.add(lampMesh, headMesh);

  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampGlowPositions, 3));
  const glowMat = new THREE.PointsMaterial({
    map: glowTex, color: 0xffc98a, size: 9, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false,
  });
  const lampGlow = new THREE.Points(glowGeo, glowMat);
  root.add(lampGlow);

  const poolMat = new THREE.MeshBasicMaterial({
    map: glowTex, color: 0xffb877, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const poolGeo = new THREE.PlaneGeometry(15, 15);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, lampSpots.length);
  let poolI = 0;
  for (const s of lampSpots) {
    dummy.position.set(s.x, 0.42, s.z);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pools.setMatrixAt(poolI++, dummy.matrix);
  }
  pools.count = poolI;
  pools.instanceMatrix.needsUpdate = true;
  root.add(pools);

  // -------------------------------------------------------------- palms
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.26, 1, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3628, roughness: 0.95 });
  const frondGeo = new THREE.BoxGeometry(0.2, 0.06, 4.6);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.85, side: THREE.DoubleSide });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 7);
  let pti = 0, pfi = 0;
  for (const p of palmSpots) {
    const h = 6.5 * p.s;
    dummy.position.set(p.x, h / 2 + 0.35, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(p.s, h, p.s); dummy.updateMatrix();
    trunks.setMatrixAt(pti++, dummy.matrix);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + p.x * 0.1;
      dummy.position.set(p.x + Math.cos(a) * 1.9 * p.s, h + 0.25 - 0.25 * Math.sin(k), p.z + Math.sin(a) * 1.9 * p.s);
      dummy.rotation.set(0, -a + Math.PI / 2, -0.16 - (k % 2) * 0.12);
      dummy.scale.set(p.s, 1, p.s * 1.15);
      dummy.updateMatrix();
      fronds.setMatrixAt(pfi++, dummy.matrix);
    }
  }
  trunks.count = pti; fronds.count = pfi;
  trunks.instanceMatrix.needsUpdate = true; fronds.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  root.add(trunks, fronds);

  // benches
  const benchGeo = new THREE.BoxGeometry(2.6, 0.12, 0.55);
  const benchLegGeo = new THREE.BoxGeometry(0.12, 0.5, 0.5);
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.85 });
  const benches = new THREE.InstancedMesh(benchGeo, benchMat, benchSpots.length);
  const legs = new THREE.InstancedMesh(benchLegGeo, poleMat, benchSpots.length * 2);
  let bi = 0, bli = 0;
  for (const b of benchSpots) {
    dummy.position.set(b.x, 0.85, b.z); dummy.rotation.set(0, b.r, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    benches.setMatrixAt(bi++, dummy.matrix);
    for (const s of [-0.95, 0.95]) {
      dummy.position.set(b.x + Math.cos(b.r) * s, 0.55, b.z - Math.sin(b.r) * s);
      dummy.rotation.set(0, b.r, 0); dummy.updateMatrix();
      legs.setMatrixAt(bli++, dummy.matrix);
    }
  }
  benches.count = bi; legs.count = bli;
  benches.instanceMatrix.needsUpdate = true; legs.instanceMatrix.needsUpdate = true;
  benches.castShadow = true;
  root.add(benches, legs);

  // -------------------------------------------------------------- billboards
  const billboards = [
    { title: 'SUNSET FM', sub: '98.5 · THE SOUND OF THE CITY', a: '#2a0f38', b: '#ff2d75' },
    { title: 'VANTA MOTORS', sub: 'DRIVE THE NIGHT', a: '#071c2c', b: '#2ff3ff' },
    { title: 'NIGHT RUNNERS', sub: 'CREW RECRUITMENT OPEN', a: '#1c1206', b: '#ffcc4d' },
  ];
  buildings.filter(b => b.h > 38).slice(0, 3).forEach((b, idx) => {
    const ad = billboards[idx % billboards.length];
    const tex = makeBillboardTexture(ad.title, ad.sub, ad.a, ad.b);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), mat);
    board.position.set(b.x, b.h + 10, b.z);
    board.rotation.y = rng() > .5 ? 0.3 : Math.PI + 0.2;
    board.rotation.x = -0.05;
    root.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(27, 14, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: .8 }));
    frame.position.copy(board.position);
    frame.position.y -= 0.1;
    frame.rotation.copy(board.rotation);
    frame.position.x += 0.2;
    root.add(frame);
    for (const s of [-8, 8]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), antennaMat);
      post.position.set(b.x + s, b.h + 4, b.z);
      root.add(post);
    }
  });

  // -------------------------------------------------------------- skyline haze
  const farMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2c, fog: true });
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const r = 620 + rng() * 150;
    const w = 24 + rng() * 50;
    const h = 50 + rng() * 170;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), farMat);
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    m.rotation.y = a;
    root.add(m);
  }

  // -------------------------------------------------------------- atmosphere
  const dustGeo = new THREE.BufferGeometry();
  const dustCount = mobile ? 90 : 170;
  const dpos = new Float32Array(dustCount * 3);
  const dvel = [];
  for (let i = 0; i < dustCount; i++) {
    dpos[i * 3] = (rng() - .5) * 170;
    dpos[i * 3 + 1] = rng() * 26 + 1;
    dpos[i * 3 + 2] = (rng() - .5) * 170;
    dvel.push({ x: (rng() - .5) * .5, y: (rng() - .5) * .16, z: (rng() - .5) * .5 });
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dustMat = new THREE.PointsMaterial({ map: glowTex, color: 0xffb877, size: 1.4, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  scene.fog = new THREE.Fog(0xff9a5c, 150, 900);

  // -------------------------------------------------------------- day cycle
  const palette = [
    { t: 0.00, top: '#04050d', hor: '#0d1220', sun: '#24305a', hemi: 0.5, dir: 0.28, exp: 1.05 },
    { t: 0.20, top: '#1a1d42', hor: '#5b3a63', sun: '#3d3f78', hemi: 0.85, dir: 0.7, exp: 1.06 },
    { t: 0.30, top: '#345582', hor: '#ffb072', sun: '#ffd0a0', hemi: 1.9, dir: 2.9, exp: 1.1 },
    { t: 0.50, top: '#2f66b8', hor: '#bfe4ff', sun: '#fff6e2', hemi: 2.4, dir: 3.1, exp: 1.05 },
    { t: 0.68, top: '#314f8f', hor: '#ffc08a', sun: '#ffe0b0', hemi: 1.75, dir: 2.7, exp: 1.14 },
    { t: 0.80, top: '#241e52', hor: '#ff855f', sun: '#ff9f6a', hemi: 1.15, dir: 1.55, exp: 1.16 },
    { t: 0.88, top: '#0b0d25', hor: '#382449', sun: '#55345f', hemi: 0.7, dir: 0.55, exp: 1.08 },
    { t: 1.00, top: '#04050d', hor: '#0d1220', sun: '#24305a', hemi: 0.5, dir: 0.28, exp: 1.05 },
  ];
  const ctop = new THREE.Color(), chor = new THREE.Color(), csun = new THREE.Color();
  let dayTime = 0.735;
  const dayLength = 330;
  let nightFactor = 0;

  function paletteAt(t) {
    let a = palette[0], b = palette[palette.length - 1];
    for (let i = 0; i < palette.length - 1; i++) {
      if (t >= palette[i].t && t <= palette[i + 1].t) { a = palette[i]; b = palette[i + 1]; break; }
    }
    const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    ctop.set(a.top).lerp(new THREE.Color(b.top), k);
    chor.set(a.hor).lerp(new THREE.Color(b.hor), k);
    csun.set(a.sun).lerp(new THREE.Color(b.sun), k);
    return { hemi: lerp(a.hemi, b.hemi, k), dir: lerp(a.dir, b.dir, k), exp: lerp(a.exp, b.exp, k) };
  }

  const fogColor = new THREE.Color();
  function applyTime(t) {
    const p = paletteAt(t);
    const sunAngle = (t - 0.25) * Math.PI * 2;
    const sunHeight = Math.sin(sunAngle);
    const sunDir = new THREE.Vector3(Math.cos(sunAngle) * 0.85, sunHeight, -0.45).normalize();
    skyUniforms.topColor.value.copy(ctop);
    skyUniforms.horizonColor.value.copy(chor);
    skyUniforms.sunColor.value.copy(csun);
    skyUniforms.sunDir.value.copy(sunDir);
    sun.color.copy(csun);
    sun.intensity = p.dir;
    rim.intensity = 0.35 + (1 - clamp(sunHeight, 0, 1)) * 0.55;
    hemi.intensity = p.hemi;
    ambient.intensity = 0.58 + nightFactor * 0.28;
    fill.intensity = 0.32 + (1 - nightFactor) * 0.22;
    hemi.color.copy(ctop).lerp(new THREE.Color(0xffffff), 0.35);
    hemi.groundColor.set(0x38263a);
    sun.position.set(sunDir.x * 300, Math.max(20, sunDir.y * 300), sunDir.z * 300);
    sunSprite.position.set(sunDir.x * 1800, sunDir.y * 1800, sunDir.z * 1800);
    sunSprite.material.color.copy(csun);
    sunSprite.material.opacity = clamp(sunHeight * 1.9 + 0.22, 0, 1);
    nightFactor = smoothstep(0.16, -0.12, sunHeight);
    starsMat.opacity = clamp(nightFactor * 0.9, 0, 1);
    stars.rotation.y = t * Math.PI * 2;
    fogColor.copy(chor).lerp(ctop, 0.35);
    scene.fog.color.copy(fogColor);
    scene.fog.near = 130 - nightFactor * 40;
    scene.fog.far = 880 - nightFactor * 180;
    for (const m of facadeMats) m.emissiveIntensity = 0.06 + nightFactor * 1.55;
    for (const m of storeMats) m.emissiveIntensity = 0.1 + nightFactor * 0.95;
    glowMat.opacity = 0.14 + nightFactor * 0.8;
    if (poolMat) poolMat.opacity = 0.12 + nightFactor * 0.42;
    dustMat.opacity = 0.18 + nightFactor * 0.45;
    rendererExposure = p.exp;
    sky.rotation.y = t * Math.PI * 2 * 0.1;
  }

  let rendererExposure = 1.05;

  // -------------------------------------------------------------- update
  let elapsed = 0;
  let flickerTimer = 0;
  function update(dt, playerPos) {
    elapsed += dt;
    if (playerPos) {
      dayTime = (dayTime + dt / dayLength) % 1;
    }
    applyTime(dayTime);

    if (playerPos) {
      dust.position.x = playerPos.x;
      dust.position.z = playerPos.z;
      const pos = dustGeo.attributes.position;
      for (let i = 0; i < dustCount; i++) {
        let x = pos.getX(i) + dvel[i].x * dt;
        let y = pos.getY(i) + dvel[i].y * dt;
        let z = pos.getZ(i) + dvel[i].z * dt;
        if (x > 90) x -= 180; if (x < -90) x += 180;
        if (z > 90) z -= 180; if (z < -90) z += 180;
        if (y > 30 || y < 0.6) y = 1 + Math.random() * 24;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
      sun.target.position.set(playerPos.x, 0, playerPos.z);
      sun.target.updateMatrixWorld();
      sun.position.set(playerPos.x + sunDirCache.x * 260, Math.max(24, sunDirCache.y * 260), playerPos.z + sunDirCache.z * 260);
      sun.shadow.camera.updateProjectionMatrix();
    }

    flickerTimer += dt;
    for (let i = 0; i < neonSigns.length; i++) {
      const s = neonSigns[i];
      if (s.isSprite) {
        const sign = s.userData.sign;
        if (sign) s.material.opacity = clamp((0.1 + nightFactor * 0.45) * sign.userData.base, 0, 1);
      } else {
        const f = 0.86 + Math.sin(elapsed * 3.1 + s.userData.phase) * 0.07 + (Math.sin(elapsed * 17 + s.userData.phase) > 0.985 ? -0.35 : 0);
        s.material.opacity = clamp(f * (0.35 + nightFactor * 0.65), 0, 1);
      }
    }
    if (playerPos) dust.material.opacity = 0.12 + nightFactor * 0.5;
  }

  const sunDirCache = new THREE.Vector3(0.4, 0.2, -0.8).normalize();
  // capture actual sun direction while applying time
  const _applyTime = applyTime;
  applyTime = function (t) {
    _applyTime(t);
    const sunAngle = (t - 0.25) * Math.PI * 2;
    sunDirCache.set(Math.cos(sunAngle) * 0.85, Math.sin(sunAngle), -0.45).normalize();
  };

  function dispose() {
    root.traverse(o => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
      else o.material?.dispose?.();
    });
  }

  applyTime(dayTime);

  return {
    root, colliders, carSpawns, buildings, dayLength,
    get dayTime() { return dayTime; },
    set dayTime(v) { dayTime = v; applyTime(dayTime); },
    get nightFactor() { return nightFactor; },
    get exposure() { return rendererExposure; },
    update, dispose,
    sun, hemi, sky, stars, sunSprite,
    getNeonFactor: () => nightFactor,
  };
}

export function groundHeightAt(x, z) {
  const bx = Math.round(x / CITY.spacing) * CITY.spacing;
  const bz = Math.round(z / CITY.spacing) * CITY.spacing;
  if (Math.abs(x - bx) < CITY.halfBlock + 1 && Math.abs(z - bz) < CITY.halfBlock + 1) return 0.32;
  return 0.02;
}

export function resolveCircle(x, z, radius, colliders) {
  for (let iter = 0; iter < 2; iter++) {
    for (const c of colliders) {
      if (x + radius < c.minX || x - radius > c.maxX || z + radius < c.minZ || z - radius > c.maxZ) continue;
      const left = x + radius - c.minX;
      const right = c.maxX - (x - radius);
      const top = z + radius - c.minZ;
      const bottom = c.maxZ - (z - radius);
      const min = Math.min(left, right, top, bottom);
      if (min === left) x = c.minX - radius;
      else if (min === right) x = c.maxX + radius;
      else if (min === top) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return { x, z };
}

export function nearestRoadPoint(x, z) {
  let bestX = CITY.roadCoords[0], bdX = Infinity;
  for (const r of CITY.roadCoords) { const d = Math.abs(x - r); if (d < bdX) { bdX = d; bestX = r; } }
  let bestZ = CITY.roadCoords[0], bdZ = Infinity;
  for (const r of CITY.roadCoords) { const d = Math.abs(z - r); if (d < bdZ) { bdZ = d; bestZ = r; } }
  return { x: bestX, z: bestZ, distX: bdX, distZ: bdZ };
}
