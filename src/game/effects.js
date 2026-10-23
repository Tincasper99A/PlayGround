import * as THREE from 'three'
import { rand, makeCanvas, canvasTexture } from './utils.js'

function radialTexture() {
  const canvas = makeCanvas(128, 128)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.9)')
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.25)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return canvasTexture(canvas, { srgb: false })
}

export class Effects {
  constructor(scene) {
    this.scene = scene
    this.capacity = 900
    this.particles = []
    this.positions = new Float32Array(this.capacity * 3)
    this.colors = new Float32Array(this.capacity * 3)
    this.sizes = new Float32Array(this.capacity)
    this.alphas = new Float32Array(this.capacity)
    for (let i = 0; i < this.capacity; i++) {
      this.positions[i * 3 + 1] = -100
      this.alphas[i] = 0
      this.sizes[i] = 0
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1))
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1))
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uScale: { value: window.devicePixelRatio || 1 }
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale * (320.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          float a = smoothstep(0.5, 0.02, d) * vAlpha;
          if (a < 0.008) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `
    })
    this.points = new THREE.Points(geometry, material)
    this.points.frustumCulled = false
    this.scene.add(this.points)
    this.free = Array.from({ length: this.capacity }, (_, i) => i).reverse()
    this.tracerPool = []
    for (let i = 0; i < 28; i++) {
      const tracerGeometry = new THREE.BufferGeometry()
      tracerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const tracerMaterial = new THREE.LineBasicMaterial({
        color: 0xffe4a6,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
      const line = new THREE.Line(tracerGeometry, tracerMaterial)
      line.frustumCulled = false
      line.visible = false
      this.scene.add(line)
      this.tracerPool.push({ line, life: 0, maxLife: 0.16 })
    }
    this.muzzle = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture(),
      color: 0xffdca0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }))
    this.muzzle.scale.setScalar(0.85)
    this.muzzle.visible = false
    this.scene.add(this.muzzle)
    this.muzzleLife = 0
    this.rings = []
    for (let i = 0; i < 5; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xff9d5b,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), material)
      ring.rotation.x = -Math.PI / 2
      ring.visible = false
      this.scene.add(ring)
      this.rings.push({ mesh: ring, life: 0, maxLife: 0.8 })
    }
    this.lights = []
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xff8a45, 0, 30, 2)
      this.scene.add(light)
      this.lights.push({ light, life: 0, maxLife: 0.5 })
    }
    this.shake = 0
  }

  allocate() {
    return this.free.pop()
  }

  emit(position, options = {}) {
    const {
      count = 10,
      color = 0xffb35c,
      speed = 4,
      spread = 2,
      size = 0.18,
      life = 0.6,
      gravity = 4,
      drag = 1.6,
      direction = null,
      directionSpread = 1
    } = options
    for (let i = 0; i < count; i++) {
      const index = this.allocate()
      if (index === undefined) return
      const offsetX = rand(-0.08, 0.08)
      const offsetY = rand(-0.08, 0.08)
      const offsetZ = rand(-0.08, 0.08)
      this.positions[index * 3] = position.x + offsetX
      this.positions[index * 3 + 1] = position.y + offsetY
      this.positions[index * 3 + 2] = position.z + offsetZ
      const c = new THREE.Color(color)
      const variance = rand(0.78, 1.18)
      this.colors[index * 3] = c.r * variance
      this.colors[index * 3 + 1] = c.g * variance
      this.colors[index * 3 + 2] = c.b * variance
      this.sizes[index] = size * rand(0.6, 1.5)
      this.alphas[index] = 1
      const vx = direction ? direction.x * speed + rand(-spread, spread) * directionSpread : rand(-spread, spread)
      const vy = direction ? direction.y * speed + rand(-spread, spread) * directionSpread : rand(0.2, spread)
      const vz = direction ? direction.z * speed + rand(-spread, spread) * directionSpread : rand(-spread, spread)
      this.particles.push({
        index,
        vx,
        vy,
        vz,
        gravity,
        drag,
        life,
        maxLife: life,
        fade: rand(0.7, 1.2)
      })
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.aColor.needsUpdate = true
    this.points.geometry.attributes.aSize.needsUpdate = true
    this.points.geometry.attributes.aAlpha.needsUpdate = true
  }

  tracer(from, to, color = 0xffe3a6, width = 1) {
    const tracer = this.tracerPool.find((item) => item.life <= 0)
    if (!tracer) return
    const positions = tracer.line.geometry.attributes.position.array
    positions[0] = from.x
    positions[1] = from.y
    positions[2] = from.z
    positions[3] = to.x
    positions[4] = to.y
    positions[5] = to.z
    tracer.line.geometry.attributes.position.needsUpdate = true
    tracer.line.material.color.setHex(color)
    tracer.line.material.opacity = 0.95
    tracer.line.visible = true
    tracer.life = 0.16
    tracer.width = width
  }

  muzzleFlash(position, scale = 1) {
    this.muzzle.position.copy(position)
    this.muzzle.material.opacity = 1
    this.muzzle.scale.setScalar(0.9 * scale)
    this.muzzle.visible = true
    this.muzzleLife = 0.055
    const light = this.lights.find((entry) => entry.life <= 0)
    if (light) {
      light.light.position.copy(position)
      light.light.color.setHex(0xffb45e)
      light.light.intensity = 22
      light.life = light.maxLife
    }
  }

  impact(position, normal, color = 0xffc577) {
    const direction = normal ? normal.clone().multiplyScalar(0.8) : new THREE.Vector3(0, 1, 0)
    this.emit(position, { count: 9, color, speed: 5, spread: 2.4, size: 0.1, life: 0.42, gravity: 9, direction, directionSpread: 1.2 })
    this.emit(position, { count: 3, color: 0xffffff, speed: 2, spread: 1, size: 0.06, life: 0.2, gravity: 2 })
  }

  explosion(position) {
    this.emit(position, { count: 62, color: 0xff7b2e, speed: 12, spread: 5, size: 0.9, life: 1.1, gravity: -1.2, drag: 1.1 })
    this.emit(position, { count: 34, color: 0xffe38f, speed: 8, spread: 3, size: 0.5, life: 0.65, gravity: 1.5 })
    this.emit(position, { count: 30, color: 0x29252d, speed: 5, spread: 3, size: 1.5, life: 1.8, gravity: -2.2, drag: 0.8 })
    this.emit(position, { count: 28, color: 0xffc27a, speed: 15, spread: 8, size: 0.12, life: 1, gravity: 10, drag: 0.8 })
    const ring = this.rings.find((entry) => entry.life <= 0)
    if (ring) {
      ring.mesh.position.copy(position)
      ring.mesh.position.y = 0.2
      ring.mesh.scale.setScalar(0.4)
      ring.mesh.material.opacity = 0.9
      ring.mesh.visible = true
      ring.life = ring.maxLife
    }
    const light = this.lights.find((entry) => entry.life <= 0)
    if (light) {
      light.light.position.copy(position)
      light.light.position.y += 1.4
      light.light.color.setHex(0xff7a3d)
      light.light.intensity = 60
      light.life = 0.55
    }
    this.shake = Math.max(this.shake, 0.7)
  }

  pickup(position) {
    this.emit(position, { count: 32, color: 0x41f4ff, speed: 4.5, spread: 1.8, size: 0.18, life: 0.8, gravity: -1.5 })
    this.emit(position, { count: 12, color: 0xffffff, speed: 2.6, spread: 1, size: 0.09, life: 0.5, gravity: 0 })
    this.shake = Math.max(this.shake, 0.12)
  }

  smoke(position, color = 0x4c4249, count = 2) {
    this.emit(position, { count, color, speed: 1.6, spread: 1.2, size: 1.2, life: 1.8, gravity: -1.8, drag: 0.6 })
  }

  update(dt) {
    const attrPosition = this.points.geometry.attributes.position
    const attrAlpha = this.points.geometry.attributes.aAlpha
    const attrSize = this.points.geometry.attributes.aSize
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i]
      particle.life -= dt
      if (particle.life <= 0) {
        this.alphas[particle.index] = 0
        this.positions[particle.index * 3 + 1] = -100
        this.free.push(particle.index)
        this.particles.splice(i, 1)
        continue
      }
      const idx = particle.index
      this.positions[idx * 3] += particle.vx * dt
      this.positions[idx * 3 + 1] += particle.vy * dt
      this.positions[idx * 3 + 2] += particle.vz * dt
      particle.vy -= particle.gravity * dt
      const drag = Math.max(0, 1 - particle.drag * dt)
      particle.vx *= drag
      particle.vz *= drag
      const t = particle.life / particle.maxLife
      this.alphas[idx] = Math.pow(t, particle.fade)
      this.sizes[idx] *= 1 + dt * 0.35
    }
    attrPosition.needsUpdate = true
    attrAlpha.needsUpdate = true
    attrSize.needsUpdate = true

    for (const tracer of this.tracerPool) {
      if (tracer.life > 0) {
        tracer.life -= dt
        tracer.line.material.opacity = Math.max(0, tracer.life / 0.16) * 0.95
        if (tracer.life <= 0) tracer.line.visible = false
      }
    }
    if (this.muzzleLife > 0) {
      this.muzzleLife -= dt
      this.muzzle.material.opacity = Math.max(0, this.muzzleLife / 0.055)
      if (this.muzzleLife <= 0) this.muzzle.visible = false
    }
    for (const ring of this.rings) {
      if (ring.life > 0) {
        ring.life -= dt
        const t = ring.life / ring.maxLife
        ring.mesh.scale.setScalar(0.4 + (1 - t) * 7)
        ring.mesh.material.opacity = t * 0.55
        if (ring.life <= 0) ring.mesh.visible = false
      }
    }
    for (const light of this.lights) {
      if (light.life > 0) {
        light.life -= dt
        light.light.intensity *= Math.max(0, 1 - dt * 7)
        if (light.life <= 0) light.light.intensity = 0
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.8)
  }
}
