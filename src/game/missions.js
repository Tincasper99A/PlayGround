import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { rand, pick, distance2D, makeCanvas, canvasTexture, makeNameplate } from './utils.js'

function beamMaterial(color, opacity = 0.14) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  })
}

function labelTexture(text, color) {
  const canvas = makeCanvas(512, 128)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(4,10,18,0.72)'
  ctx.beginPath()
  ctx.roundRect(16, 24, 480, 80, 16)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = '400 50px "Bebas Neue", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.letterSpacing = '4px'
  ctx.fillText(text, 256, 66)
  return canvasTexture(canvas)
}

export class MissionSystem {
  constructor(scene, world, effects, audio, hud) {
    this.scene = scene
    this.world = world
    this.effects = effects
    this.audio = audio
    this.hud = hud
    this.state = 'idle'
    this.phase = 'collect'
    this.title = 'NIGHT RUN'
    this.points = []
    this.currentIndex = 0
    this.timer = null
    this.reward = 0
    this.dropPoint = null
    this.contractCooldown = 0
    this.lightPulse = 0
    this.buildMarkers()
  }

  buildMarkers() {
    this.caseGroup = new THREE.Group()
    const shell = new THREE.Mesh(
      new RoundedBoxGeometry(0.85, 0.58, 0.26, 3, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x161b28, metalness: 0.7, roughness: 0.28 })
    )
    shell.position.y = 0.3
    this.caseGroup.add(shell)
    const insert = new THREE.Mesh(
      new RoundedBoxGeometry(0.64, 0.38, 0.04, 2, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x41f4ff })
    )
    insert.position.set(0, 0.3, 0.145)
    this.caseGroup.add(insert)
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.035, 6, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x9ba9bc, metalness: 0.9, roughness: 0.24 })
    )
    handle.position.set(0, 0.63, 0)
    handle.rotation.x = Math.PI / 2
    this.caseGroup.add(handle)
    this.caseBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 18, 20, 1, true), beamMaterial(0x41f4ff, 0.1))
    this.caseBeam.position.y = 9
    this.caseGroup.add(this.caseBeam)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.06, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0x41f4ff, transparent: true, opacity: 0.9 })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.08
    this.caseGroup.add(ring)
    this.caseRing = ring
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.38, 0),
      new THREE.MeshBasicMaterial({ color: 0x9dfbff })
    )
    diamond.position.y = 3.2
    this.caseGroup.add(diamond)
    this.caseDiamond = diamond
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture('DATA DRIVE', '#7afaff'),
      transparent: true,
      depthWrite: false
    }))
    label.position.y = 4.3
    label.scale.set(3.6, 0.9, 1)
    this.caseGroup.add(label)
    this.caseGroup.visible = false
    this.scene.add(this.caseGroup)

    this.dropGroup = new THREE.Group()
    this.dropBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 22, 24, 1, true), beamMaterial(0xff2f8e, 0.11))
    this.dropBeam.position.y = 11
    this.dropGroup.add(this.dropBeam)
    const dropRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.5, 0.09, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xff2f8e })
    )
    dropRing.rotation.x = Math.PI / 2
    dropRing.position.y = 0.08
    this.dropGroup.add(dropRing)
    this.dropRing = dropRing
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.15, 48),
      new THREE.MeshBasicMaterial({ color: 0xff7bbd, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    )
    inner.rotation.x = -Math.PI / 2
    inner.position.y = 0.07
    this.dropGroup.add(inner)
    const dropDiamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshBasicMaterial({ color: 0xff8acb })
    )
    dropDiamond.position.y = 4.2
    this.dropGroup.add(dropDiamond)
    this.dropDiamond = dropDiamond
    const dropLabel = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture('DEAD DROP', '#ff9ccf'),
      transparent: true,
      depthWrite: false
    }))
    dropLabel.position.y = 5.4
    dropLabel.scale.set(3.9, 1, 1)
    this.dropGroup.add(dropLabel)
    this.dropGroup.visible = false
    this.scene.add(this.dropGroup)
  }

  start(playerPosition) {
    if (this.state === 'active') return
    this.state = 'active'
    this.phase = 'collect'
    this.title = pick(['NIGHT RUN', 'DEAD DROP', 'AFTER HOURS', 'GHOST SIGNAL'])
    this.currentIndex = 0
    this.timer = null
    this.reward = 2500 + Math.floor(rand(0, 6)) * 250
    this.points = this.pickPoints(playerPosition, 3)
    this.dropPoint = this.pickDrop(this.points)
    this.caseGroup.visible = true
    this.dropGroup.visible = false
    this.caseGroup.position.copy(this.points[0])
    this.dropGroup.position.copy(this.dropPoint)
    this.hud.toast(this.title, 'Three encrypted drives are live. Recover them before the drop.', 'mission', 5200)
    this.audio.tone({ frequency: 420, endFrequency: 720, type: 'triangle', duration: 0.22, gain: 0.09 })
  }

  pickPoints(playerPosition, count) {
    const candidates = [...this.world.missionPoints]
    const chosen = []
    while (chosen.length < count && candidates.length) {
      const index = Math.floor(Math.random() * candidates.length)
      const point = candidates.splice(index, 1)[0]
      if (distance2D(point, playerPosition) > 38 && distance2D(point, playerPosition) < 205) chosen.push(point.clone())
    }
    while (chosen.length < count) chosen.push(new THREE.Vector3(rand(-180, 180), 0.18, rand(-180, 180)))
    return chosen
  }

  pickDrop(points) {
    const candidates = this.world.missionPoints.filter((point) => points.every((p) => distance2D(p, point) > 75))
    return (candidates.length ? pick(candidates) : pick(this.world.missionPoints)).clone()
  }

  update(dt, playerPosition, elapsed) {
    if (this.contractCooldown > 0) {
      this.contractCooldown -= dt
      if (this.contractCooldown <= 0 && this.state !== 'active') this.start(playerPosition)
    }
    if (this.state !== 'active') {
      this.caseGroup.visible = false
      this.dropGroup.visible = false
      return
    }
    this.lightPulse += dt
    if (this.phase === 'collect') {
      this.caseGroup.visible = true
      this.caseGroup.rotation.y += dt * 0.55
      this.caseDiamond.rotation.y += dt * 1.4
      this.caseDiamond.position.y = 3.2 + Math.sin(elapsed * 2.6) * 0.16
      this.caseRing.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.08)
      this.caseBeam.material.opacity = 0.07 + (Math.sin(elapsed * 1.8) + 1) * 0.025
      const distance = distance2D(playerPosition, this.points[this.currentIndex])
      if (distance < 2.8) this.collect(playerPosition)
    } else if (this.phase === 'deliver') {
      this.timer -= dt
      this.dropGroup.visible = true
      this.dropRing.rotation.z += dt * 0.8
      this.dropDiamond.rotation.y -= dt * 1.1
      this.dropDiamond.position.y = 4.2 + Math.sin(elapsed * 2.3) * 0.2
      this.dropBeam.material.opacity = 0.08 + (Math.sin(elapsed * 1.6) + 1) * 0.025
      if (distance2D(playerPosition, this.dropPoint) < 3.4) this.complete()
      if (this.timer <= 0) this.fail('The buyer moved on. The drives went dark.')
    }
  }

  collect(playerPosition) {
    this.effects.pickup(this.points[this.currentIndex].clone().add(new THREE.Vector3(0, 0.6, 0)))
    this.audio.pickup()
    this.currentIndex++
    if (this.currentIndex >= this.points.length) {
      this.phase = 'deliver'
      this.timer = 150
      this.caseGroup.visible = false
      this.dropGroup.visible = true
      this.hud.toast('ALL DRIVES SECURED', 'Lose the heat and reach the dead drop. 2:30 on the clock.', 'success', 5200)
      this.audio.tone({ frequency: 680, endFrequency: 1000, type: 'triangle', duration: 0.22, gain: 0.1 })
    } else {
      this.caseGroup.position.copy(this.points[this.currentIndex])
      const left = this.points.length - this.currentIndex
      this.hud.toast('DRIVE RECOVERED', `${left} encrypted drive${left === 1 ? '' : 's'} remaining.`, 'success')
    }
  }

  complete() {
    this.state = 'complete'
    this.caseGroup.visible = false
    this.dropGroup.visible = false
    this.timer = null
    this.effects.pickup(this.dropPoint.clone().add(new THREE.Vector3(0, 1, 0)))
    this.audio.success()
    this.hud.toast('CONTRACT COMPLETE', `Payout secured: $${this.reward.toLocaleString('en-US')}. New job incoming.`, 'success', 5600)
    this.contractCooldown = 7
  }

  fail(message) {
    this.state = 'failed'
    this.caseGroup.visible = false
    this.dropGroup.visible = false
    this.timer = null
    this.audio.fail()
    this.hud.toast('CONTRACT FAILED', message, 'fail', 5200)
    this.contractCooldown = 6
  }

  getObjective(playerPosition) {
    if (this.state !== 'active') return null
    if (this.phase === 'collect') {
      const target = this.points[this.currentIndex]
      return {
        title: this.title,
        objective: `RECOVER ENCRYPTED DRIVES  ${this.currentIndex + 1}/${this.points.length}`,
        timer: null,
        distance: distance2D(playerPosition, target),
        position: target
      }
    }
    if (this.phase === 'deliver') {
      return {
        title: this.title,
        objective: 'REACH THE DEAD DROP',
        timer: this.timer,
        distance: distance2D(playerPosition, this.dropPoint),
        position: this.dropPoint
      }
    }
    return null
  }

  positionForMap() {
    if (this.state !== 'active') return null
    if (this.phase === 'collect') return this.points[this.currentIndex]
    return this.dropPoint
  }
}
