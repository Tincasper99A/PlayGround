import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import {
  TAU, clamp, rand, randInt, pick, makeCanvas, canvasTexture,
  textTexture, blobShadow
} from './utils.js'

const ROAD = 56
const ROAD_WIDTH = 12
const BLOCK = 44
const GROUND_Y = 0.18
const CITY_EDGE = 228
const ROAD_COORDS = [-224, -168, -112, -56, 0, 56, 112, 168, 224]
const BLOCK_CENTERS = [-196, -140, -84, -28, 28, 84, 140, 196]
const GROUND = 0.05

const NEON = ['#41f4ff', '#ff2f8e', '#ffb84d', '#8d6bff', '#55ffa8']
const FACADES = [
  { base: '#171a2d', glass: '#293149', lit: '#ffc56e', cool: '#72d8ff' },
  { base: '#211827', glass: '#38223d', lit: '#ff9166', cool: '#ff5fc4' },
  { base: '#101c24', glass: '#163243', lit: '#ffd284', cool: '#4fdcff' },
  { base: '#191820', glass: '#2c2b39', lit: '#ffb35c', cool: '#9bdcff' },
  { base: '#1d1a19', glass: '#35302e', lit: '#ffcf95', cool: '#ffd27a' }
]

function seededRandom(seed = 91237) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeFacadeTextures(palette, index) {
  const random = seededRandom(100 + index * 137)
  const canvas = makeCanvas(256, 512)
  const glow = makeCanvas(256, 512)
  const ctx = canvas.getContext('2d')
  const gctx = glow.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 256, 512)
  gradient.addColorStop(0, palette.base)
  gradient.addColorStop(1, palette.glass)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 512)
  gctx.fillStyle = '#000'
  gctx.fillRect(0, 0, 256, 512)
  const cols = 8
  const rows = 16
  const cellW = 256 / cols
  const cellH = 512 / rows
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellW
      const y = row * cellH
      ctx.fillStyle = 'rgba(0,0,0,0.42)'
      ctx.fillRect(x + 3, y + 4, cellW - 6, cellH - 8)
      const lit = random() < 0.22
      const cool = random() < 0.52
      const shade = lit ? (cool ? palette.cool : palette.lit) : '#0c1220'
      ctx.fillStyle = shade
      ctx.globalAlpha = lit ? 0.88 : 0.32
      ctx.fillRect(x + 6, y + 7, cellW - 12, cellH - 14)
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.fillRect(x + 6, y + 7, cellW - 12, 3)
      if (lit) {
        gctx.fillStyle = lit ? (cool ? palette.cool : palette.lit) : '#000'
        gctx.globalAlpha = 0.75 + random() * 0.25
        gctx.fillRect(x + 6, y + 7, cellW - 12, cellH - 14)
        gctx.globalAlpha = 1
      }
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  for (let row = 0; row < rows; row++) ctx.fillRect(0, row * cellH + cellH - 2, 256, 2)
  const map = canvasTexture(canvas, { repeat: true })
  const emissive = canvasTexture(glow, { repeat: true })
  return { map, emissive }
}

function makeAsphaltTexture() {
  const canvas = makeCanvas(256, 256)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#17151d'
  ctx.fillRect(0, 0, 256, 256)
  const image = ctx.getImageData(0, 0, 256, 256)
  for (let i = 0; i < image.data.length; i += 4) {
    const n = 18 + Math.random() * 22
    image.data[i] = n
    image.data[i + 1] = n
    image.data[i + 2] = n + 3
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  ctx.strokeStyle = 'rgba(90,90,105,0.08)'
  for (let i = 0; i < 22; i++) {
    ctx.beginPath()
    const x = Math.random() * 256
    const y = Math.random() * 256
    ctx.moveTo(x, y)
    ctx.lineTo(x + rand(-26, 26), y + rand(-20, 20))
    ctx.stroke()
  }
  return canvasTexture(canvas, { repeat: true })
}

function makeSidewalkTexture() {
  const canvas = makeCanvas(256, 256)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#24212b'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(140,135,155,0.09)'
  ctx.lineWidth = 2
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 256)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(256, i)
    ctx.stroke()
  }
  const gradient = ctx.createLinearGradient(0, 0, 256, 256)
  gradient.addColorStop(0, 'rgba(255,181,110,0.05)')
  gradient.addColorStop(0.5, 'rgba(89,216,255,0.03)')
  gradient.addColorStop(1, 'rgba(255,74,163,0.04)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)
  return canvasTexture(canvas, { repeat: true })
}

function makeGlowTexture() {
  const canvas = makeCanvas(128, 128)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.44)')
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.08)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return canvasTexture(canvas, { srgb: false })
}

function makePuddleTexture() {
  const canvas = makeCanvas(128, 128)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(255,255,255,0.92)')
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.55)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.ellipse(64, 64, 60, 48, 0, 0, TAU)
  ctx.fill()
  return canvasTexture(canvas, { srgb: false })
}

function makeEnvironment(renderer) {
  const canvas = makeCanvas(1024, 512)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 0, 512)
  gradient.addColorStop(0, '#050511')
  gradient.addColorStop(0.38, '#12102c')
  gradient.addColorStop(0.63, '#3a1b3a')
  gradient.addColorStop(0.78, '#d5514b')
  gradient.addColorStop(0.9, '#ff9e63')
  gradient.addColorStop(1, '#08070f')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1024, 512)
  const sun = ctx.createRadialGradient(270, 385, 2, 270, 385, 130)
  sun.addColorStop(0, 'rgba(255,239,191,1)')
  sun.addColorStop(0.12, 'rgba(255,180,111,0.8)')
  sun.addColorStop(1, 'rgba(255,97,78,0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, 1024, 512)
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 1024
    const h = 8 + Math.random() * 65
    ctx.fillStyle = `rgba(8,8,20,${0.35 + Math.random() * 0.4})`
    ctx.fillRect(x, 410 - h, 10 + Math.random() * 18, h)
  }
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = pick(['rgba(65,244,255,0.8)', 'rgba(255,47,142,0.8)', 'rgba(255,184,77,0.7)'])
    ctx.fillRect(Math.random() * 1024, 340 + Math.random() * 80, 3, 2)
  }
  const texture = canvasTexture(canvas)
  texture.mapping = THREE.EquirectangularReflectionMapping
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromEquirectangular(texture)
  texture.dispose()
  pmrem.dispose()
  return target.texture
}

export class World {
  constructor(scene, renderer, quality) {
    this.scene = scene
    this.renderer = renderer
    this.quality = quality
    this.colliders = []
    this.raycastTargets = []
    this.palms = []
    this.neonMaterials = []
    this.signMaterials = []
    this.spawn = new THREE.Vector3(28, GROUND_Y, 38)
    this.spawnYaw = 0.35
    this.missionPoints = []
    this.roadNodes = []
    this.lampLights = []
    this.time = 0
    this.random = seededRandom(8137)
    this.build()
  }

  build() {
    this.scene.fog = new THREE.FogExp2(0x120b1d, 0.0041)
    this.scene.environment = makeEnvironment(this.renderer)
    this.createSky()
    this.createLights()
    this.createOcean()
    this.createRoads()
    this.createSidewalks()
    this.createCity()
    this.createPlaza()
    this.createLandmark()
    this.createProps()
    this.createSkyline()
    this.createAirship()
    this.createRain()
    this.collectMissionPoints()
  }

  createSky() {
    const geometry = new THREE.SphereGeometry(900, 48, 32)
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color('#03030d') },
        uMid: { value: new THREE.Color('#17102f') },
        uHorizon: { value: new THREE.Color('#ff6348') },
        uGlow: { value: new THREE.Color('#ffb36d') },
        uSunDir: { value: new THREE.Vector3(-0.58, 0.085, -0.81).normalize() }
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 uTop;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform vec3 uGlow;
        uniform vec3 uSunDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          vec3 dir = normalize(vWorld);
          float h = clamp(dir.y, -0.12, 1.0);
          float t = smoothstep(-0.06, 0.52, h);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.38, t));
          col = mix(col, uTop, smoothstep(0.32, 1.0, t));
          float sunDot = max(dot(dir, uSunDir), 0.0);
          float glow = pow(sunDot, 18.0);
          float core = smoothstep(0.9992, 0.9998, sunDot);
          col += uGlow * glow * 1.4;
          col += vec3(1.0, 0.82, 0.6) * core * 3.0;
          float starNoise = hash(floor(dir.xz * 680.0));
          float stars = step(0.9972, starNoise) * smoothstep(0.12, 0.5, dir.y) * (0.7 + 0.3 * sin(dir.x * 90.0));
          col += vec3(0.72, 0.84, 1.0) * stars * 0.8;
          float cloud = noise(vec2(atan(dir.z, dir.x) * 2.4, dir.y * 8.0)) * smoothstep(0.02, 0.3, dir.y) * smoothstep(0.65, 0.35, dir.y);
          col += vec3(0.52, 0.24, 0.32) * cloud * 0.18;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
    this.sky = new THREE.Mesh(geometry, material)
    this.sky.frustumCulled = false
    this.scene.add(this.sky)
  }

  createLights() {
    const hemi = new THREE.HemisphereLight(0x8d8cff, 0x2c1628, 1.7)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffa36f, 2.5)
    sun.position.set(-95, 110, -120)
    sun.castShadow = this.quality.shadows
    if (this.quality.shadows) {
      sun.shadow.mapSize.set(this.quality.tier === 'high' ? 2048 : 1024, this.quality.tier === 'high' ? 2048 : 1024)
      sun.shadow.camera.left = -65
      sun.shadow.camera.right = 65
      sun.shadow.camera.top = 65
      sun.shadow.camera.bottom = -65
      sun.shadow.camera.near = 1
      sun.shadow.camera.far = 260
      sun.shadow.bias = -0.0008
      sun.shadow.normalBias = 0.035
    }
    this.sun = sun
    this.scene.add(sun)
    this.scene.add(sun.target)
    const rim = new THREE.DirectionalLight(0x4de7ff, 0.85)
    rim.position.set(100, 45, 80)
    this.scene.add(rim)
    const fill = new THREE.PointLight(0xff2f8e, 7, 45, 2)
    fill.position.set(16, 6, 30)
    this.scene.add(fill)
  }

  createOcean() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({
        color: 0x070c17,
        roughness: 0.16,
        metalness: 0.86,
        envMapIntensity: 1.15
      })
    )
    water.rotation.x = -Math.PI / 2
    water.position.y = -0.68
    water.receiveShadow = true
    this.scene.add(water)
    this.water = water
    const island = new THREE.Mesh(
      new THREE.BoxGeometry(CITY_EDGE * 2 + 18, 0.8, CITY_EDGE * 2 + 18),
      new THREE.MeshStandardMaterial({ color: 0x0d0c14, roughness: 0.9, metalness: 0.1 })
    )
    island.position.y = -0.4
    island.receiveShadow = true
    this.scene.add(island)
    const pierMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1922, roughness: 0.72, metalness: 0.22 })
    for (let i = 0; i < 4; i++) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 34), pierMaterial)
      pier.position.set(-CITY_EDGE - 24 - i * 52, -0.1, 185)
      pier.receiveShadow = true
      this.scene.add(pier)
    }
  }

  createRoads() {
    const asphalt = makeAsphaltTexture()
    asphalt.repeat.set(1, 26)
    const material = new THREE.MeshStandardMaterial({
      map: asphalt,
      color: 0x8e8b9a,
      roughness: 0.26,
      metalness: 0.62,
      envMapIntensity: 0.75
    })
    for (const coord of ROAD_COORDS) {
      const vertical = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, CITY_EDGE * 2 + 8), material)
      vertical.rotation.x = -Math.PI / 2
      vertical.position.set(coord, 0.012, 0)
      vertical.receiveShadow = true
      this.scene.add(vertical)
      const horizontal = new THREE.Mesh(new THREE.PlaneGeometry(CITY_EDGE * 2 + 8, ROAD_WIDTH), material)
      horizontal.rotation.x = -Math.PI / 2
      horizontal.position.set(0, 0.011, coord)
      horizontal.receiveShadow = true
      this.scene.add(horizontal)
      for (let i = 0; i < ROAD_COORDS.length; i++) this.roadNodes.push(new THREE.Vector3(coord, 0, ROAD_COORDS[i]))
    }
    const lineGeo = new THREE.BoxGeometry(0.14, 0.018, 2.6)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffc978, transparent: true, opacity: 0.62 })
    const lines = new THREE.InstancedMesh(lineGeo, lineMat, 2200)
    let index = 0
    const dummy = new THREE.Object3D()
    for (let i = 0; i < 9; i++) {
      const coord = ROAD_COORDS[i]
      for (let d = -223; d < 224; d += 8) {
        if (Math.abs(Math.round(d / ROAD) * ROAD - d) < 1) continue
        dummy.position.set(coord, 0.03, d)
        dummy.updateMatrix()
        if (index < 2200) lines.setMatrixAt(index++, dummy.matrix)
        dummy.position.set(d, 0.031, coord)
        dummy.rotation.y = Math.PI / 2
        dummy.updateMatrix()
        if (index < 2200) lines.setMatrixAt(index++, dummy.matrix)
        dummy.rotation.y = 0
      }
      for (let d = -223; d < 224; d += 8) {
        dummy.position.set(coord - 3.4, 0.028, d)
        dummy.updateMatrix()
        if (index < 2200) lines.setMatrixAt(index++, dummy.matrix)
        dummy.position.set(coord + 3.4, 0.029, d)
        dummy.updateMatrix()
        if (index < 2200) lines.setMatrixAt(index++, dummy.matrix)
      }
    }
    lines.count = index
    lines.instanceMatrix.needsUpdate = true
    this.scene.add(lines)
    this.createCrosswalks()
    this.createPuddles()
  }

  createCrosswalks() {
    const material = new THREE.MeshBasicMaterial({ color: 0xd8d3c9, transparent: true, opacity: 0.18 })
    const geometry = new THREE.BoxGeometry(1.1, 0.014, 0.34)
    const stripes = new THREE.InstancedMesh(geometry, material, 3000)
    let index = 0
    const dummy = new THREE.Object3D()
    for (const x of ROAD_COORDS) {
      for (const z of ROAD_COORDS) {
        for (let side = 0; side < 4; side++) {
          for (let s = -4; s <= 4; s++) {
            const offset = s * 1.32
            if (side < 2) {
              dummy.position.set(x + offset, 0.028, z + (side === 0 ? 7.4 : -7.4))
              dummy.rotation.y = 0
            } else {
              dummy.position.set(x + (side === 2 ? 7.4 : -7.4), 0.028, z + offset)
              dummy.rotation.y = Math.PI / 2
            }
            dummy.updateMatrix()
            if (index < 3000) stripes.setMatrixAt(index++, dummy.matrix)
          }
        }
      }
    }
    stripes.count = index
    stripes.instanceMatrix.needsUpdate = true
    this.scene.add(stripes)
  }

  createPuddles() {
    const puddleTexture = makePuddleTexture()
    const material = new THREE.MeshStandardMaterial({
      color: 0x8a9db8,
      metalness: 0.95,
      roughness: 0.06,
      transparent: true,
      alphaMap: puddleTexture,
      opacity: 0.52,
      depthWrite: false,
      envMapIntensity: 1.6
    })
    const geometry = new THREE.CircleGeometry(1, 24)
    const puddles = new THREE.InstancedMesh(geometry, material, 52)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < 52; i++) {
      let x
      let z
      if (Math.random() < 0.5) {
        x = pick(ROAD_COORDS) + rand(-4.2, 4.2)
        z = rand(-220, 220)
      } else {
        x = rand(-220, 220)
        z = pick(ROAD_COORDS) + rand(-4.2, 4.2)
      }
      dummy.position.set(x, 0.04 + Math.random() * 0.004, z)
      dummy.rotation.x = -Math.PI / 2
      dummy.rotation.z = Math.random() * TAU
      dummy.scale.set(rand(1.2, 4.4), rand(0.6, 2.2), 1)
      dummy.updateMatrix()
      puddles.setMatrixAt(i, dummy.matrix)
    }
    puddles.instanceMatrix.needsUpdate = true
    this.scene.add(puddles)
  }

  createSidewalks() {
    const texture = makeSidewalkTexture()
    texture.repeat.set(3, 3)
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0x8d8996,
      roughness: 0.88,
      metalness: 0.08
    })
    const geometry = new THREE.BoxGeometry(BLOCK, 0.32, BLOCK)
    for (const z of BLOCK_CENTERS) {
      for (const x of BLOCK_CENTERS) {
        const sidewalk = new THREE.Mesh(geometry, material)
        sidewalk.position.set(x, 0.04, z)
        sidewalk.receiveShadow = true
        this.scene.add(sidewalk)
      }
    }
  }

  createCity() {
    this.facades = FACADES.map((palette, index) => makeFacadeTextures(palette, index))
    this.signTextures = [
      { text: 'MIRAGE', color: '#61f7ff', bg: '#07131d', sub: 'AFTER HOURS' },
      { text: 'NEON', color: '#ff8bbf', bg: '#1d0818', sub: 'NOODLE BAR' },
      { text: 'SYNTH', color: '#ffd36d', bg: '#181006', sub: 'RECORDS' },
      { text: 'HOTEL', color: '#8de9ff', bg: '#071822', sub: 'VACANCY' },
      { text: 'ARCADE', color: '#ff78c6', bg: '#150718', sub: 'OPEN 24H' }
    ]
    let seed = 91
    for (const z of BLOCK_CENTERS) {
      for (const x of BLOCK_CENTERS) {
        if (this.isPlaza(x, z)) continue
        if (x === -28 && z === 28) continue
        const distance = Math.hypot(x, z)
        const downtown = 1 - clamp(distance / 260, 0, 1)
        const split = this.random() < (downtown > 0.55 ? 0.25 : 0.6)
        seed++
        if (split) {
          const alongX = this.random() < 0.5
          const gap = 2.6
          for (const side of [-1, 1]) {
            const width = alongX ? 18.6 : rand(27, 33)
            const depth = alongX ? rand(28, 34) : 18.6
            const offset = side * (9.3 + gap / 2)
            const px = x + (alongX ? offset : rand(-2.5, 2.5))
            const pz = z + (alongX ? rand(-2.5, 2.5) : offset)
            const height = this.buildingHeight(downtown, this.random())
            this.addBuilding(px, pz, width, depth, height, seed, downtown)
          }
        } else {
          const width = downtown > 0.55 ? rand(29, 37) : rand(27, 35)
          const depth = downtown > 0.55 ? rand(29, 37) : rand(27, 35)
          const height = this.buildingHeight(downtown, this.random())
          this.addBuilding(x + rand(-2, 2), z + rand(-2, 2), width, depth, height, seed, downtown)
        }
        if (this.random() < 0.32) this.addPalm(x + rand(-18, 18), z + rand(-18, 18), rand(4.8, 7.2))
      }
    }
  }

  buildingHeight(downtown, value) {
    if (downtown > 0.7) return 28 + Math.pow(value, 1.7) * 60
    if (downtown > 0.35) return 13 + Math.pow(value, 1.5) * 34
    return 8 + value * 18
  }

  isPlaza(x, z) {
    return (x === 28 && z === 28) || (x === -140 && z === 84) || (x === 84 && z === -140)
  }

  addBuilding(x, z, width, depth, height, seed, downtown) {
    const palette = this.facades[seed % this.facades.length]
    const map = palette.map.clone()
    const emissive = palette.emissive.clone()
    const repeatX = Math.max(1, Math.round(width / 24))
    const repeatY = Math.max(1, Math.round(height / 34))
    map.repeat.set(repeatX, repeatY)
    emissive.repeat.set(repeatX, repeatY)
    map.needsUpdate = true
    emissive.needsUpdate = true
    const material = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: emissive,
      emissive: 0xffffff,
      emissiveIntensity: this.quality.tier === 'high' ? 1.35 : 0.9,
      roughness: downtown > 0.6 ? 0.48 : 0.7,
      metalness: downtown > 0.6 ? 0.38 : 0.16,
      envMapIntensity: 0.55
    })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    mesh.position.set(x, GROUND_Y + height / 2, z)
    mesh.castShadow = this.quality.shadows
    mesh.receiveShadow = this.quality.shadows
    mesh.userData.solid = true
    this.scene.add(mesh)
    this.raycastTargets.push(mesh)
    this.colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      height
    })
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.2, 0.5, depth + 0.2),
      new THREE.MeshStandardMaterial({ color: 0x0c0c16, roughness: 0.9, metalness: 0.15 })
    )
    roof.position.set(x, GROUND_Y + height + 0.22, z)
    roof.castShadow = this.quality.shadows
    this.scene.add(roof)
    if (height > 24) {
      const crownColor = pick(NEON)
      const crown = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.42, 0.36, depth + 0.42),
        new THREE.MeshBasicMaterial({ color: crownColor })
      )
      crown.position.set(x, GROUND_Y + height - 0.45, z)
      this.scene.add(crown)
      this.neonMaterials.push({ material: crown.material, base: new THREE.Color(crownColor), phase: Math.random() * TAU })
      if (height > 48) {
        const spire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.32, 7 + Math.random() * 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x221f31, metalness: 0.9, roughness: 0.35 })
        )
        spire.position.set(x, GROUND_Y + height + 4, z)
        this.scene.add(spire)
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.34, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff375f })
        )
        beacon.position.set(x, GROUND_Y + height + 9.5, z)
        this.scene.add(beacon)
        this.neonMaterials.push({ material: beacon.material, base: new THREE.Color(0xff375f), phase: Math.random() * TAU })
      }
    }
    this.addBuildingDetails(x, z, width, depth, height, seed)
  }

  addBuildingDetails(x, z, width, depth, height, seed) {
    const accent = NEON[seed % NEON.length]
    if (height > 18 && this.random() < 0.55) {
      const stripHeight = height * rand(0.4, 0.82)
      const side = this.random() < 0.5 ? -1 : 1
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, stripHeight, 0.15),
        new THREE.MeshBasicMaterial({ color: accent })
      )
      strip.position.set(x + side * (width / 2 + 0.08), GROUND_Y + stripHeight / 2 + 1.5, z + depth / 2 + 0.08)
      this.scene.add(strip)
      this.neonMaterials.push({ material: strip.material, base: new THREE.Color(accent), phase: Math.random() * TAU })
    }
    if (height < 42 && this.random() < 0.4) {
      const sign = this.signTextures[seed % this.signTextures.length]
      const texture = textTexture(sign.text, {
        width: 512,
        height: 256,
        color: sign.color,
        background: sign.bg,
        font: '400 150px "Bebas Neue", sans-serif',
        glow: sign.color
      })
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(rand(5.5, 9), rand(2.4, 3.8)),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })
      )
      const face = randInt(0, 3)
      const ox = face === 0 ? 0 : face === 1 ? 0 : face === 2 ? -1 : 1
      const oz = face === 0 ? -1 : face === 1 ? 1 : 0
      plane.position.set(x + ox * (width / 2 + 0.14), GROUND_Y + rand(3.5, 8), z + oz * (depth / 2 + 0.14))
      plane.rotation.y = face === 0 ? Math.PI : face === 1 ? 0 : face === 2 ? Math.PI / 2 : -Math.PI / 2
      this.scene.add(plane)
      this.signMaterials.push({ mesh: plane, phase: Math.random() * TAU, base: 0.8 })
    }
    if (height > 18 && this.random() < 0.45) {
      const sign = pick(this.signTextures)
      const texture = textTexture(sign.text, {
        width: 256,
        height: 1024,
        color: sign.color,
        background: 'rgba(5,8,16,0.9)',
        font: '400 120px "Bebas Neue", sans-serif',
        glow: sign.color
      })
      const vert = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 8.8),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })
      )
      const sideX = this.random() < 0.5 ? -1 : 1
      vert.position.set(x + sideX * (width / 2 + 0.16), GROUND_Y + rand(8, 15), z + rand(-depth / 3, depth / 3))
      vert.rotation.y = sideX > 0 ? Math.PI / 2 : -Math.PI / 2
      this.scene.add(vert)
      this.signMaterials.push({ mesh: vert, phase: Math.random() * TAU, base: 0.7 })
    }
    if (height > 9) {
      const unitMat = new THREE.MeshStandardMaterial({ color: 0x15141d, roughness: 0.8, metalness: 0.3 })
      const units = randInt(1, 3)
      for (let i = 0; i < units; i++) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(rand(1.5, 3), rand(0.7, 1.4), rand(1.5, 3)), unitMat)
        box.position.set(x + rand(-width / 3, width / 3), GROUND_Y + height + 0.7, z + rand(-depth / 3, depth / 3))
        this.scene.add(box)
      }
    }
    if (this.random() < 0.5) {
      const shopColors = [0x41f4ff, 0xff2f8e, 0xffb84d]
      const color = pick(shopColors)
      const shop = new THREE.Mesh(
        new THREE.BoxGeometry(rand(6, 12), 0.22, 0.2),
        new THREE.MeshBasicMaterial({ color })
      )
      shop.position.set(x, GROUND_Y + 3.2, z + depth / 2 + 0.15)
      this.scene.add(shop)
      this.neonMaterials.push({ material: shop.material, base: new THREE.Color(color), phase: Math.random() * TAU })
    }
  }

  createPlaza() {
    const plazaPositions = [
      { x: 28, z: 28 }, { x: -140, z: 84 }, { x: 84, z: -140 }
    ]
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x41f4ff })
    for (let p = 0; p < plazaPositions.length; p++) {
      const { x, z } = plazaPositions[p]
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(p === 0 ? 14 : 11, p === 0 ? 14 : 11, 0.22, 48),
        new THREE.MeshStandardMaterial({ color: 0x1d1a25, roughness: 0.55, metalness: 0.35 })
      )
      base.position.set(x, GROUND_Y + 0.1, z)
      base.receiveShadow = true
      this.scene.add(base)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(p === 0 ? 12.4 : 9.5, 0.08, 8, 72), ringMaterial)
      ring.rotation.x = Math.PI / 2
      ring.position.set(x, GROUND_Y + 0.25, z)
      this.scene.add(ring)
      this.neonMaterials.push({ material: ring.material, base: new THREE.Color(0x41f4ff), phase: p * 2.1 })
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * TAU + p
        this.addPalm(x + Math.cos(angle) * (p === 0 ? 17 : 14), z + Math.sin(angle) * (p === 0 ? 17 : 14), rand(5.4, 7))
      }
    }
    const holo = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 5.8, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x41f4ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })
    )
    holo.position.set(28, 3.1, 28)
    this.scene.add(holo)
    this.holo = holo
    const holoSign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.4),
      new THREE.MeshBasicMaterial({
        map: textTexture('MIRAGE', { color: '#7afaff', background: 'rgba(2,12,18,0.7)', font: '400 165px "Bebas Neue", sans-serif', glow: '#41f4ff' }),
        transparent: true,
        toneMapped: false,
        side: THREE.DoubleSide
      })
    )
    holoSign.position.set(28, 6.8, 28)
    this.scene.add(holoSign)
    this.holoSign = holoSign
  }

  createLandmark() {
    const x = -28
    const z = 28
    const width = 27
    const depth = 27
    const height = 98
    const facade = makeFacadeTextures(FACADES[2], 50)
    const map = facade.map.clone()
    const emissive = facade.emissive.clone()
    map.repeat.set(1.4, 4)
    emissive.repeat.set(1.4, 4)
    const material = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: emissive,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      roughness: 0.32,
      metalness: 0.62,
      envMapIntensity: 1.05
    })
    const tower = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 2, 0.8), material)
    tower.position.set(x, GROUND_Y + height / 2, z)
    tower.castShadow = this.quality.shadows
    tower.receiveShadow = this.quality.shadows
    tower.userData.solid = true
    this.scene.add(tower)
    this.raycastTargets.push(tower)
    this.colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, height })
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(13.4, 14.6, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x161321, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.4 })
    )
    crown.position.set(x, GROUND_Y + height + 0.8, z)
    this.scene.add(crown)
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 16, 8), new THREE.MeshBasicMaterial({ color: 0xff2f8e }))
    beacon.position.set(x, GROUND_Y + height + 9, z)
    this.scene.add(beacon)
    this.neonMaterials.push({ material: beacon.material, base: new THREE.Color(0xff2f8e), phase: 1.4 })
    const title = textTexture('MIRAGE', {
      width: 512,
      height: 256,
      color: '#8cf8ff',
      background: 'rgba(3,10,18,0.82)',
      font: '400 160px "Bebas Neue", sans-serif',
      glow: '#41f4ff'
    })
    for (const side of [-1, 1]) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(18, 9),
        new THREE.MeshBasicMaterial({ map: title, transparent: true, toneMapped: false })
      )
      sign.position.set(x + side * (width / 2 + 0.2), GROUND_Y + 76, z)
      sign.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2
      this.scene.add(sign)
    }
    const baseGlow = new THREE.PointLight(0xff2f8e, 18, 50, 2)
    baseGlow.position.set(x, 3, z + 14)
    this.scene.add(baseGlow)
  }

  addPalm(x, z, height = 6) {
    if (!this.palmTrunks) {
      this.palmTrunks = []
      this.palmLeaves = []
    }
    this.palmTrunks.push({ x, z, height, rotation: Math.random() * TAU })
  }

  commitPalms() {
    if (!this.palmTrunks?.length) return
    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 1, 5)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x44352d, roughness: 0.9 })
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, this.palmTrunks.length)
    const leafGeo = new THREE.ConeGeometry(0.45, 3.3, 4, 1, true)
    leafGeo.translate(0, 1.6, 0)
    leafGeo.rotateZ(Math.PI / 2)
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x183d31, roughness: 0.72, side: THREE.DoubleSide, metalness: 0.05 })
    const leafCount = this.palmTrunks.length * 8
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount)
    const dummy = new THREE.Object3D()
    let leafIndex = 0
    for (let t = 0; t < this.palmTrunks.length; t++) {
      const palm = this.palmTrunks[t]
      dummy.position.set(palm.x, GROUND_Y + palm.height / 2, palm.z)
      dummy.scale.set(1, palm.height, 1)
      dummy.rotation.set(0, palm.rotation, 0)
      dummy.updateMatrix()
      trunks.setMatrixAt(t, dummy.matrix)
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * TAU + palm.rotation
        dummy.position.set(palm.x + Math.cos(angle) * 0.2, GROUND_Y + palm.height - 0.15, palm.z + Math.sin(angle) * 0.2)
        dummy.rotation.set(0, -angle, rand(-0.15, 0.3))
        dummy.scale.set(rand(0.8, 1.2), rand(0.8, 1.15), rand(0.8, 1.1))
        dummy.updateMatrix()
        leaves.setMatrixAt(leafIndex++, dummy.matrix)
      }
    }
    trunks.instanceMatrix.needsUpdate = true
    leaves.instanceMatrix.needsUpdate = true
    trunks.castShadow = this.quality.shadows
    leaves.castShadow = this.quality.shadows
    this.scene.add(trunks)
    this.scene.add(leaves)
  }

  createProps() {
    this.commitPalms()
    this.createStreetlights()
    this.createTrafficLights()
    this.createRoadGlow()
  }

  createStreetlights() {
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.2, 6)
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x191822, roughness: 0.55, metalness: 0.75 })
    const positions = []
    for (const x of ROAD_COORDS) {
      for (const z of ROAD_COORDS) {
        if (Math.abs(x) < 220 && Math.abs(z) < 220) {
          positions.push({ x: x + 7.2, z: z + 7.2 })
          positions.push({ x: x - 7.2, z: z - 7.2 })
        }
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, positions.length)
    const dummy = new THREE.Object3D()
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffd49a })
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.14, 0.8), headMat, positions.length)
    const glowMat = new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      color: 0xffb66e,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(6, 6), glowMat, positions.length)
    positions.forEach((p, i) => {
      dummy.position.set(p.x, GROUND_Y + 2.6, p.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      poles.setMatrixAt(i, dummy.matrix)
      dummy.position.set(p.x, GROUND_Y + 5.22, p.z)
      dummy.updateMatrix()
      heads.setMatrixAt(i, dummy.matrix)
      dummy.position.set(p.x, 0.08, p.z)
      dummy.rotation.x = -Math.PI / 2
      dummy.updateMatrix()
      glows.setMatrixAt(i, dummy.matrix)
    })
    poles.castShadow = this.quality.shadows
    this.scene.add(poles, heads, glows)
    const light = new THREE.PointLight(0xffb66e, 9, 24, 2)
    light.position.set(35, 5.6, 38)
    this.scene.add(light)
    this.lampLights.push(light)
  }

  createTrafficLights() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x171720, metalness: 0.8, roughness: 0.45 })
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.8, 6)
    const housingGeo = new THREE.BoxGeometry(0.42, 1.1, 0.34)
    const positions = [[0, 0], [56, 56], [-112, 56], [112, -56], [-56, 168], [168, 56]]
    for (const [x, z] of positions) {
      const group = new THREE.Group()
      const pole = new THREE.Mesh(poleGeo, poleMat)
      pole.position.y = 2.4
      group.add(pole)
      const housing = new THREE.Mesh(housingGeo, poleMat)
      housing.position.y = 4.1
      group.add(housing)
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3d5e }))
      red.position.set(0, 4.34, 0.19)
      group.add(red)
      const green = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x4dff9c }))
      green.position.set(0, 3.92, 0.19)
      group.add(green)
      group.position.set(x + 6.6, GROUND_Y, z - 6.6)
      group.rotation.y = Math.random() * TAU
      this.scene.add(group)
      this.neonMaterials.push({ material: red.material, base: new THREE.Color(0xff3d5e), phase: Math.random() * TAU, blink: true })
    }
  }

  createRoadGlow() {
    const color = 0x41f4ff
    const geometry = new THREE.BoxGeometry(0.08, 0.02, 3.4)
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 })
    const glow = new THREE.InstancedMesh(geometry, material, 180)
    const dummy = new THREE.Object3D()
    let index = 0
    for (let i = 0; i < 180; i++) {
      const x = pick(ROAD_COORDS) + (Math.random() < 0.5 ? -4.4 : 4.4)
      const z = rand(-220, 220)
      dummy.position.set(x, 0.041, z)
      dummy.rotation.y = 0
      dummy.updateMatrix()
      glow.setMatrixAt(index++, dummy.matrix)
    }
    glow.instanceMatrix.needsUpdate = true
    this.scene.add(glow)
  }

  createSkyline() {
    const count = 90
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0x0a0913, fog: true })
    const skyline = new THREE.InstancedMesh(geometry, material, count)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU + rand(-0.02, 0.02)
      const radius = rand(280, 410)
      const height = rand(18, 76)
      dummy.position.set(Math.cos(angle) * radius, height / 2 - 0.4, Math.sin(angle) * radius)
      dummy.scale.set(rand(12, 34), height, rand(12, 34))
      dummy.rotation.y = rand(0, TAU)
      dummy.updateMatrix()
      skyline.setMatrixAt(i, dummy.matrix)
    }
    skyline.instanceMatrix.needsUpdate = true
    this.scene.add(skyline)
  }

  createAirship() {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 18),
      new THREE.MeshStandardMaterial({ color: 0x161420, metalness: 0.55, roughness: 0.45 })
    )
    body.scale.set(24, 7.2, 7.2)
    group.add(body)
    const gondola = new THREE.Mesh(
      new RoundedBoxGeometry(12, 2.4, 3.2, 2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x262232, metalness: 0.5, roughness: 0.4 })
    )
    gondola.position.y = -6
    group.add(gondola)
    const finMat = new THREE.MeshStandardMaterial({ color: 0x221c30, metalness: 0.5, roughness: 0.5 })
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 0.3), finMat)
      fin.position.set(-20, 2, side * 2.6)
      fin.rotation.x = side * 0.45
      group.add(fin)
    }
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff2f8e })
    const led = new THREE.Mesh(new THREE.TorusGeometry(24, 0.08, 4, 80), ledMat)
    led.scale.y = 0.3
    group.add(led)
    this.neonMaterials.push({ material: ledMat, base: new THREE.Color(0xff2f8e), phase: 0 })
    const signTexture = textTexture('MIRAGE ONLINE', {
      color: '#9afaff',
      background: 'rgba(3,12,20,0.82)',
      width: 1024,
      height: 256,
      font: '400 120px "Bebas Neue", sans-serif',
      glow: '#41f4ff'
    })
    for (const side of [-1, 1]) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(18, 4.5),
        new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false, side: THREE.DoubleSide })
      )
      sign.position.set(0, 0.5, side * 7.25)
      sign.rotation.y = side > 0 ? 0 : Math.PI
      group.add(sign)
    }
    const light = new THREE.PointLight(0x41f4ff, 6, 40, 2)
    light.position.set(0, -5, 0)
    group.add(light)
    group.position.set(-90, 76, -150)
    group.rotation.y = 0.7
    this.scene.add(group)
    this.airship = group
  }

  createRain() {
    const count = this.quality.tier === 'high' ? 900 : 420
    const positions = new Float32Array(count * 6)
    const velocities = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const x = rand(-50, 50)
      const y = rand(0, 38)
      const z = rand(-50, 50)
      const length = rand(0.35, 1.1)
      positions[i * 6] = x
      positions[i * 6 + 1] = y
      positions[i * 6 + 2] = z
      positions[i * 6 + 3] = x + 0.06
      positions[i * 6 + 4] = y + length
      positions[i * 6 + 5] = z + 0.08
      velocities[i] = rand(24, 40)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.LineBasicMaterial({ color: 0xa9c9ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
    this.rain = new THREE.LineSegments(geometry, material)
    this.rain.frustumCulled = false
    this.rainVelocities = velocities
    this.scene.add(this.rain)
  }

  collectMissionPoints() {
    this.missionPoints = [
      new THREE.Vector3(-140, GROUND_Y, 84),
      new THREE.Vector3(84, GROUND_Y, -140),
      new THREE.Vector3(-84, GROUND_Y, 84),
      new THREE.Vector3(140, GROUND_Y, 84),
      new THREE.Vector3(-140, GROUND_Y, -84),
      new THREE.Vector3(84, GROUND_Y, 140),
      new THREE.Vector3(196, GROUND_Y, -28),
      new THREE.Vector3(-28, GROUND_Y, 196)
    ]
  }

  resolveCircle(position, radius) {
    let collided = false
    for (const box of this.colliders) {
      const nearestX = clamp(position.x, box.minX, box.maxX)
      const nearestZ = clamp(position.z, box.minZ, box.maxZ)
      const dx = position.x - nearestX
      const dz = position.z - nearestZ
      const distance = Math.hypot(dx, dz)
      if (distance < radius) {
        collided = true
        if (distance > 0.0001) {
          const push = (radius - distance) / distance
          position.x += dx * push
          position.z += dz * push
        } else {
          const left = Math.abs(position.x - box.minX)
          const right = Math.abs(box.maxX - position.x)
          const front = Math.abs(position.z - box.minZ)
          const back = Math.abs(box.maxZ - position.z)
          const min = Math.min(left, right, front, back)
          if (min === left) position.x = box.minX - radius
          else if (min === right) position.x = box.maxX + radius
          else if (min === front) position.z = box.minZ - radius
          else position.z = box.maxZ + radius
        }
      }
    }
    position.x = clamp(position.x, -CITY_EDGE, CITY_EDGE)
    position.z = clamp(position.z, -CITY_EDGE, CITY_EDGE)
    return collided
  }

  isBlocked(x, z, radius = 0.5) {
    for (const box of this.colliders) {
      if (x > box.minX - radius && x < box.maxX + radius && z > box.minZ - radius && z < box.maxZ + radius) return true
    }
    return false
  }

  update(dt, elapsed, playerPosition) {
    this.time = elapsed
    for (const neon of this.neonMaterials) {
      const pulse = 0.82 + Math.sin(elapsed * (neon.blink ? 6.4 : 1.6) + neon.phase) * (neon.blink ? 0.28 : 0.1)
      neon.material.color.copy(neon.base).multiplyScalar(pulse)
    }
    for (const sign of this.signMaterials) {
      sign.mesh.material.opacity = 0.86 + Math.sin(elapsed * 1.2 + sign.phase) * 0.1
    }
    this.holo.rotation.y += dt * 0.6
    this.holoSign.rotation.y = Math.sin(elapsed * 0.25) * 0.22
    this.airship.position.x = Math.cos(elapsed * 0.028) * 160
    this.airship.position.z = Math.sin(elapsed * 0.028) * 160
    this.airship.rotation.y = -elapsed * 0.028 + 1.4
    this.airship.position.y = 74 + Math.sin(elapsed * 0.25) * 2
    this.updateRain(dt, playerPosition)
    if (this.sun) {
      this.sun.position.set(playerPosition.x - 95, 110, playerPosition.z - 120)
      this.sun.target.position.set(playerPosition.x, 0, playerPosition.z)
      this.sun.target.updateMatrixWorld()
    }
    if (this.lampLights[0]) {
      this.lampLights[0].position.set(playerPosition.x + 20, 6, playerPosition.z + 20)
    }
  }

  updateRain(dt, playerPosition) {
    const positions = this.rain.geometry.attributes.position.array
    for (let i = 0; i < this.rainVelocities.length; i++) {
      const fall = this.rainVelocities[i] * dt
      positions[i * 6 + 1] -= fall
      positions[i * 6 + 4] -= fall
      positions[i * 6] += dt * 2.4
      positions[i * 6 + 3] += dt * 2.4
      if (positions[i * 6 + 1] < 0) {
        const x = playerPosition.x + rand(-46, 46)
        const z = playerPosition.z + rand(-46, 46)
        positions[i * 6] = x
        positions[i * 6 + 1] = rand(22, 40)
        positions[i * 6 + 2] = z
        positions[i * 6 + 3] = x + 0.06
        positions[i * 6 + 4] = positions[i * 6 + 1] + rand(0.35, 1.1)
        positions[i * 6 + 5] = z + 0.08
      }
    }
    this.rain.geometry.attributes.position.needsUpdate = true
  }
}
