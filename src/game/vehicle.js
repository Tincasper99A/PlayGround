import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { clamp, damp, blobShadow, makeCanvas, canvasTexture } from './utils.js'

function glowTexture() {
  const canvas = makeCanvas(128, 128)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.3)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return canvasTexture(canvas, { srgb: false })
}

const PAINTS = [0xd42a4b, 0x1d7fd6, 0xe3a52e, 0x6c4ce0, 0xe8e5df, 0x1a1a22, 0x1ab79a, 0xff4f9a]
const TYPES = {
  sports: { width: 1.92, length: 4.35, height: 1.12, cabinZ: -0.15, cabinScale: 0.88, wheel: 0.37, maxSpeed: 36 },
  sedan: { width: 1.86, length: 4.2, height: 1.2, cabinZ: 0.02, cabinScale: 1, wheel: 0.36, maxSpeed: 29 },
  police: { width: 1.9, length: 4.3, height: 1.25, cabinZ: 0.02, cabinScale: 1, wheel: 0.37, maxSpeed: 33 },
  taxi: { width: 1.86, length: 4.2, height: 1.22, cabinZ: 0.02, cabinScale: 1, wheel: 0.36, maxSpeed: 28 }
}

let vehicleId = 0

export class Vehicle {
  constructor(scene, world, {
    type = 'sports',
    color = null,
    x = 0,
    z = 0,
    yaw = 0,
    hero = false,
    name = ''
  } = {}) {
    this.id = vehicleId++
    this.scene = scene
    this.world = world
    this.type = type
    this.spec = TYPES[type] ?? TYPES.sports
    this.color = color ?? PAINTS[this.id % PAINTS.length]
    this.position = new THREE.Vector3(x, 0, z)
    this.yaw = yaw
    this.speed = 0
    this.steer = 0
    this.health = 100
    this.destroyed = false
    this.occupied = false
    this.hero = hero
    this.name = name
    this.ai = null
    this.group = new THREE.Group()
    this.bodyGroup = new THREE.Group()
    this.group.add(this.bodyGroup)
    this.wheels = []
    this.braking = false
    this.throttle = 0
    this.honk = 0
    this.build()
    this.shadow = blobShadow(this.spec.width * 0.95, 0.6)
    this.group.add(this.shadow)
    this.group.traverse((object) => { object.userData.vehicle = this })
    this.scene.add(this.group)
    this.sync()
  }

  build() {
    const spec = this.spec
    const paint = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.2,
      metalness: 0.82,
      envMapIntensity: 1.45
    })
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b12, roughness: 0.48, metalness: 0.5 })
    const trim = new THREE.MeshStandardMaterial({ color: 0x1b1b24, roughness: 0.35, metalness: 0.7 })
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x07131d,
      roughness: 0.08,
      metalness: 0.45,
      transmission: 0.18,
      transparent: true,
      opacity: 0.86,
      envMapIntensity: 1.8
    })
    const body = new THREE.Mesh(new RoundedBoxGeometry(spec.width, 0.52, spec.length, 3, 0.18), paint)
    body.position.y = 0.55
    body.castShadow = true
    body.receiveShadow = true
    this.bodyGroup.add(body)
    this.body = body
    const lower = new THREE.Mesh(new RoundedBoxGeometry(spec.width + 0.06, 0.22, spec.length - 0.18, 2, 0.09), trim)
    lower.position.y = 0.33
    this.bodyGroup.add(lower)
    const hood = new THREE.Mesh(new RoundedBoxGeometry(spec.width * 0.9, 0.12, spec.length * 0.3, 2, 0.05), paint)
    hood.position.set(0, 0.82, spec.length * 0.3)
    hood.rotation.x = -0.035
    this.bodyGroup.add(hood)
    const trunk = new THREE.Mesh(new RoundedBoxGeometry(spec.width * 0.92, 0.11, spec.length * 0.18, 2, 0.05), paint)
    trunk.position.set(0, 0.81, -spec.length * 0.38)
    this.bodyGroup.add(trunk)
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(spec.width * 0.76, 0.54, spec.length * 0.42 * spec.cabinScale, 3, 0.16), glass)
    cabin.position.set(0, 1.03, spec.cabinZ)
    cabin.castShadow = true
    this.bodyGroup.add(cabin)
    const roof = new THREE.Mesh(new RoundedBoxGeometry(spec.width * 0.66, 0.08, spec.length * 0.28 * spec.cabinScale, 2, 0.04), paint)
    roof.position.set(0, 1.32, spec.cabinZ - 0.03)
    this.bodyGroup.add(roof)
    const skirtLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, spec.length * 0.55), trim)
    skirtLeft.position.set(-spec.width / 2 - 0.01, 0.36, 0)
    this.bodyGroup.add(skirtLeft)
    const skirtRight = skirtLeft.clone()
    skirtRight.position.x = spec.width / 2 + 0.01
    this.bodyGroup.add(skirtRight)
    const frontBumper = new THREE.Mesh(new RoundedBoxGeometry(spec.width + 0.03, 0.18, 0.18, 2, 0.05), dark)
    frontBumper.position.set(0, 0.36, spec.length / 2 - 0.02)
    this.bodyGroup.add(frontBumper)
    const rearBumper = frontBumper.clone()
    rearBumper.position.z = -spec.length / 2 + 0.02
    this.bodyGroup.add(rearBumper)

    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff0cb })
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff233f })
    this.tailMaterial = tailMat
    for (const side of [-1, 1]) {
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.11, 0.045), headlightMat)
      headlight.position.set(side * 0.59, 0.67, spec.length / 2 + 0.01)
      this.bodyGroup.add(headlight)
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.04), tailMat)
      tail.position.set(side * 0.58, 0.68, -spec.length / 2 - 0.01)
      this.bodyGroup.add(tail)
    }
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.13, 0.018),
      new THREE.MeshBasicMaterial({ color: 0xdfe7ee })
    )
    plate.position.set(0, 0.48, -spec.length / 2 - 0.03)
    this.bodyGroup.add(plate)
    const plateGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.1),
      new THREE.MeshBasicMaterial({ map: this.plateTexture(), transparent: true })
    )
    plateGlow.position.set(0, 0.48, -spec.length / 2 - 0.045)
    plateGlow.rotation.y = Math.PI
    this.bodyGroup.add(plateGlow)

    const tireGeo = new THREE.CylinderGeometry(spec.wheel, spec.wheel, 0.25, 14)
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x09090d, roughness: 0.88, metalness: 0.15 })
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xa3a9b4, roughness: 0.24, metalness: 0.95 })
    const positions = [
      [-spec.width / 2 + 0.1, spec.wheel, spec.length * 0.3],
      [spec.width / 2 - 0.1, spec.wheel, spec.length * 0.3],
      [-spec.width / 2 + 0.1, spec.wheel, -spec.length * 0.31],
      [spec.width / 2 - 0.1, spec.wheel, -spec.length * 0.31]
    ]
    this.wheelPivots = []
    for (const [x, y, z] of positions) {
      const pivot = new THREE.Group()
      pivot.position.set(x, y, z)
      const tire = new THREE.Mesh(tireGeo, tireMat)
      tire.rotation.z = Math.PI / 2
      tire.castShadow = this.hero
      pivot.add(tire)
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(spec.wheel * 0.56, spec.wheel * 0.56, 0.27, 10), rimMat)
      rim.rotation.z = Math.PI / 2
      pivot.add(rim)
      this.bodyGroup.add(pivot)
      this.wheels.push(pivot)
      this.wheelPivots.push(pivot)
    }
    if (this.hero) {
      const light = new THREE.SpotLight(0xffdfb7, 28, 55, 0.46, 0.65, 1.2)
      light.position.set(0, 0.85, spec.length / 2)
      light.target.position.set(0, 0.1, spec.length / 2 + 20)
      this.bodyGroup.add(light)
      this.bodyGroup.add(light.target)
      this.headlight = light
    }
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.width * 2.2, spec.length * 1.5),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: new THREE.Color(this.hero ? '#41f4ff' : '#ff2f8e'),
        transparent: true,
        opacity: this.hero ? 0.25 : 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    under.rotation.x = -Math.PI / 2
    under.position.y = 0.05
    this.bodyGroup.add(under)
    this.underGlow = under
    if (this.type === 'police') {
      this.addPoliceLights()
    }
    if (this.type === 'taxi') {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.2, 0.34),
        new THREE.MeshBasicMaterial({ color: 0xffc23d })
      )
      sign.position.set(0, 1.45, 0.1)
      this.bodyGroup.add(sign)
    }
  }

  plateTexture() {
    const canvas = makeCanvas(256, 64)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#dfe7ee'
    ctx.fillRect(0, 0, 256, 64)
    ctx.fillStyle = '#172033'
    ctx.font = '700 34px "Space Grotesk", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`MIRAGE ${String(1000 + this.id * 37).slice(-4)}`, 128, 34)
    return canvasTexture(canvas)
  }

  addPoliceLights() {
    this.policeLights = []
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: 0x111118, metalness: 0.5, roughness: 0.3 }))
    bar.position.set(0, 1.45, 0.05)
    this.bodyGroup.add(bar)
    for (const side of [-1, 1]) {
      const material = new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff1f4f : 0x1f7bff })
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.09, 0.23), material)
      lamp.position.set(side * 0.27, 1.53, 0.05)
      this.bodyGroup.add(lamp)
      const light = new THREE.PointLight(side < 0 ? 0xff1f4f : 0x1f7bff, 5, 16, 2)
      light.position.copy(lamp.position)
      this.bodyGroup.add(light)
      this.policeLights.push({ material, light, side })
    }
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.32, 0.4),
      new THREE.MeshBasicMaterial({
        map: this.decalTexture('MIRAGE PD', '#e9f3ff', '#0b1528'),
        transparent: true
      })
    )
    decal.position.set(0, 0.66, -this.spec.length / 2 - 0.052)
    decal.rotation.y = Math.PI
    this.bodyGroup.add(decal)
  }

  decalTexture(text, color, background) {
    const canvas = makeCanvas(512, 128)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, 512, 128)
    ctx.fillStyle = color
    ctx.font = '700 64px "Bebas Neue", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 70)
    return canvasTexture(canvas)
  }

  setOccupied(value) {
    this.occupied = value
    if (this.underGlow) this.underGlow.material.opacity = value ? 0.34 : 0.2
  }

  drive(dt, throttle, steerInput, brake = false) {
    if (this.destroyed) return
    this.throttle = throttle
    this.steer = damp(this.steer, steerInput, 9, dt)
    this.braking = brake || (throttle < 0 && this.speed > 0)
    const max = this.spec.maxSpeed
    if (throttle > 0) this.speed += 17 * throttle * dt
    else if (throttle < 0) this.speed += 19 * throttle * dt
    if (brake) this.speed *= Math.max(0, 1 - 4.2 * dt)
    const drag = 0.42 + Math.abs(this.speed) * 0.012
    this.speed *= Math.max(0, 1 - drag * dt)
    this.speed = clamp(this.speed, -10, max)
    const grip = clamp(Math.abs(this.speed) / 8, 0, 1)
    this.yaw += this.steer * 1.65 * grip * dt * Math.sign(this.speed || 1)
    const forwardX = Math.sin(this.yaw)
    const forwardZ = Math.cos(this.yaw)
    this.position.x += forwardX * this.speed * dt
    this.position.z += forwardZ * this.speed * dt
    const collided = this.world.resolveCircle(this.position, 1.35)
    if (collided) {
      this.speed *= -0.18
      this.impact = 1
    }
    this.sync()
    this.animate(dt)
  }

  driveTowards(target, dt, maxSpeed = this.spec.maxSpeed) {
    if (this.destroyed) return
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    const distance = Math.hypot(dx, dz)
    const desired = Math.atan2(dx, dz)
    let delta = ((desired - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    const steer = clamp(delta * 2.2, -1, 1)
    const targetSpeed = distance > 8 ? Math.min(maxSpeed, distance * 0.8) : 0
    if (this.speed < targetSpeed) this.speed += 12 * dt
    else this.speed *= Math.max(0, 1 - 2.2 * dt)
    this.speed = clamp(this.speed, -6, targetSpeed + 2)
    this.steer = damp(this.steer, steer, 5, dt)
    this.yaw += this.steer * Math.min(1, Math.abs(this.speed) / 6) * 1.55 * dt * Math.sign(this.speed || 1)
    this.position.x += Math.sin(this.yaw) * this.speed * dt
    this.position.z += Math.cos(this.yaw) * this.speed * dt
    if (this.world.resolveCircle(this.position, 1.35)) {
      this.speed *= -0.12
      this.impact = 1
      this.yaw += 0.35
    }
    this.sync()
    this.animate(dt)
  }

  updateTraffic(dt) {
    if (this.destroyed || !this.traffic) return
    const traffic = this.traffic
    const target = traffic.target
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    const distance = Math.hypot(dx, dz)
    if (distance < 2.2) {
      traffic.chooseNext()
      return
    }
    const desired = Math.atan2(dx, dz)
    let delta = ((desired - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    const steer = clamp(delta * 3, -1, 1)
    const targetSpeed = 7.5 + traffic.speedBias
    if (this.speed < targetSpeed) this.speed += 6 * dt
    else this.speed = Math.max(targetSpeed, this.speed - 5 * dt)
    this.steer = damp(this.steer, steer, 6, dt)
    this.yaw += this.steer * Math.min(1, this.speed / 5) * 1.1 * dt
    this.position.x += Math.sin(this.yaw) * this.speed * dt
    this.position.z += Math.cos(this.yaw) * this.speed * dt
    this.world.resolveCircle(this.position, 1.2)
    this.sync()
    this.animate(dt)
  }

  animate(dt) {
    const spin = this.speed * dt / this.spec.wheel
    for (const wheel of this.wheels) wheel.rotation.x += spin
    if (this.wheelPivots[0]) {
      this.wheelPivots[0].rotation.y = this.steer * 0.38
      this.wheelPivots[1].rotation.y = this.steer * 0.38
    }
    this.bodyGroup.rotation.z = damp(this.bodyGroup.rotation.z, -this.steer * Math.min(0.08, Math.abs(this.speed) * 0.003), 4, 1 / 60)
    const pitch = this.impact ? this.impact * 0.06 : 0
    this.impact = damp(this.impact || 0, 0, 7, dt)
    this.bodyGroup.rotation.x = damp(this.bodyGroup.rotation.x, pitch, 8, dt)
    if (this.tailMaterial) {
      const intensity = this.braking ? 3.2 : 0.72
      this.tailMaterial.color.setRGB(0.5 * intensity, 0.02 * intensity, 0.08 * intensity)
    }
    if (this.policeLights) {
      const flash = Math.floor(performance.now() / 220) % 2 === 0
      for (const { material, light, side } of this.policeLights) {
        const active = flash ? side < 0 : side > 0
        material.color.setHex(active ? (side < 0 ? 0xff1f4f : 0x1f7bff) : 0x080810)
        light.intensity = active ? 9 : 0
      }
    }
  }

  sync() {
    this.group.position.copy(this.position)
    this.group.rotation.y = this.yaw
  }

  damage(amount) {
    if (this.destroyed) return false
    this.health -= amount
    if (this.health <= 0) {
      this.health = 0
      this.destroyed = true
      this.speed = 0
      if (this.underGlow) this.underGlow.visible = false
      return true
    }
    return false
  }

  dispose() {
    this.scene.remove(this.group)
    this.group.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) {
        if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose())
        else object.material.dispose()
      }
    })
  }
}
