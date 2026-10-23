import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { World } from './world.js'
import { Player } from './player.js'
import { Vehicle } from './vehicle.js'
import { Traffic } from './traffic.js'
import { Pedestrians } from './pedestrians.js'
import { Effects } from './effects.js'
import { AudioEngine } from './audio.js'
import { HUD } from './hud.js'
import { Input } from './input.js'
import { MissionSystem } from './missions.js'
import { Network } from './network.js'
import { clamp, damp, angleLerp, pick, rand, distance2D } from './utils.js'

const ROAD_COORDS = [-224, -168, -112, -56, 0, 56, 112, 168, 224]
const BOT_NAMES = ['VEX', 'NOVA', 'KODA', 'RIVET', 'SABLE']
const BOT_ACCENTS = ['#41f4ff', '#ff2f8e', '#ffb84d', '#8d6bff', '#55ffa8']
const ONLINE_MESSAGES = [
  'is running the north loop',
  'completed a clean getaway',
  'is shopping for new wheels',
  'just cleared the docks',
  'found a prototype near the plaza',
  'is looking for a crew',
  'secured the dead drop',
  'has a bounty in the Neon Mile'
]

export class Game {
  constructor(canvas) {
    this.canvas = canvas
    this.coarsePointer = window.matchMedia('(pointer: coarse)').matches
    const savedQuality = localStorage.getItem('mirage-quality')
    const mode = savedQuality === 'high' || savedQuality === 'performance'
      ? savedQuality
      : this.coarsePointer ? 'performance' : 'high'
    this.quality = {
      mode,
      tier: mode === 'high' ? 'high' : 'low',
      shadows: mode === 'high',
      bloom: true
    }
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false
    })
    this.renderer.setPixelRatio(this.pixelRatio())
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.06
    this.renderer.shadowMap.enabled = this.quality.shadows
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1400)
    this.camera.position.set(118, 54, 128)
    this.camera.lookAt(0, 20, 0)
    this.scene.add(this.camera)
    this.world = new World(this.scene, this.renderer, this.quality)
    this.effects = new Effects(this.scene)
    this.player = new Player(this.scene, this.world)
    this.player.setVisible(false)
    this.traffic = new Traffic(this.scene, this.world)
    this.traffic.spawn(10)
    this.pedestrians = new Pedestrians(this.scene, this.world)
    this.pedestrians.spawn(15, 5)
    this.network = new Network(this.scene, this.player)
    this.audio = new AudioEngine()
    this.audio.muted = localStorage.getItem('mirage-muted') === 'true'
    this.hud = new HUD()
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760
    this.input = new Input(canvas, {
      joystick: document.getElementById('joystick'),
      stickBase: document.getElementById('stick-base'),
      stickThumb: document.getElementById('stick-thumb'),
      fireButton: document.getElementById('btn-fire'),
      actionButton: document.getElementById('btn-action'),
      jumpButton: document.getElementById('btn-jump'),
      reloadButton: document.getElementById('btn-reload'),
      sprintButton: document.getElementById('btn-sprint'),
      pauseButton: document.getElementById('btn-pause')
    })
    this.missions = new MissionSystem(this.scene, this.world, this.effects, this.audio, this.hud)
    this.parked = []
    this.cops = []
    this.wrecks = []
    this.inVehicle = null
    this.wanted = 0
    this.wantedTimer = 0
    this.copSpawnTimer = 2
    this.lastPlayerDamage = 0
    this.lastShot = 0
    this.lastWantedToast = 0
    this.state = 'landing'
    this.elapsed = 0
    this.lastFrame = performance.now()
    this.deathTimer = 0
    this.lastMissionState = 'idle'
    this.districtTimer = 0
    this.district = 'DOWNTOWN'
    this.ambientTimer = 10
    this.stats = { missions: 0, eliminations: 0, distance: 0 }
    this.loadProgress()
    this.cameraRaycaster = new THREE.Raycaster()
    this.raycaster = new THREE.Raycaster()
    this.tempVector = new THREE.Vector3()
    this.tempVector2 = new THREE.Vector3()
    this.tempQuat = new THREE.Quaternion()
    this.parkCars()
    this.setupComposer()
    this.bindUI()
    this.hud.setCash(this.player.cash)
    this.hud.setOnline(6 + this.network.count)
    this.hud.setWanted(0)
    this.hud.setVitals(100, 50)
    this.hud.setWeapon(this.player.ammo, this.player.reserve, false)
    this.hud.setVehicle(false)
    this.hud.setMission(null)
    this.hud.setClock(0)
    this.hud.setLocation('DOWNTOWN', 'MIRAGE CITY // NIGHT SHIFT')
    this.resize()
    window.addEventListener('resize', () => this.resize())
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200))
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause()
    })
    window.addEventListener('beforeunload', () => this.saveProgress())
    this.updateSettingsUI()
    this.loop = this.loop.bind(this)
    requestAnimationFrame(this.loop)
    window.__MIRAGE_GAME__ = this
  }

  loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem('mirage-progress') || 'null')
      if (!saved) return
      const cash = Number(saved.cash)
      const missions = Number(saved.missions)
      const eliminations = Number(saved.eliminations)
      if (Number.isFinite(cash)) this.player.cash = Math.max(0, cash)
      if (Number.isFinite(missions)) this.stats.missions = Math.max(0, Math.floor(missions))
      if (Number.isFinite(eliminations)) this.stats.eliminations = Math.max(0, Math.floor(eliminations))
    } catch {}
  }

  saveProgress() {
    try {
      localStorage.setItem('mirage-progress', JSON.stringify({
        cash: this.player.cash,
        missions: this.stats.missions,
        eliminations: this.stats.eliminations
      }))
    } catch {}
  }

  pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.quality.mode === 'high' ? 1.8 : 1.25)
  }

  setupComposer() {
    this.composer = new EffectComposer(this.renderer)
    this.renderPass = new RenderPass(this.scene, this.camera)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.quality.mode === 'high' ? 0.58 : 0.38,
      0.5,
      0.82
    )
    this.outputPass = new OutputPass()
    this.composer.addPass(this.renderPass)
    this.composer.addPass(this.bloomPass)
    this.composer.addPass(this.outputPass)
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(window.innerWidth, window.innerHeight)
  }

  parkCars() {
    const configs = [
      { x: 37, z: 47, yaw: 0.72, type: 'sports', color: 0x19c4d8, hero: true },
      { x: -133, z: 78, yaw: 2.1, type: 'sports', color: 0xff3f85 },
      { x: 91, z: -133, yaw: -0.8, type: 'sedan', color: 0xdfe4e8 },
      { x: -12, z: -196, yaw: 0.2, type: 'sports', color: 0x7c4dff }
    ]
    for (const config of configs) {
      const vehicle = new Vehicle(this.scene, this.world, config)
      this.parked.push(vehicle)
    }
  }

  bindUI() {
    const play = document.getElementById('play-button')
    play?.addEventListener('click', () => this.start())
    const howto = document.getElementById('howto')
    document.getElementById('howto-button')?.addEventListener('click', () => {
      howto.classList.add('visible')
      this.audio.click()
    })
    document.querySelectorAll('[data-close="howto"]').forEach((button) => {
      button.addEventListener('click', () => howto.classList.remove('visible'))
    })
    const settings = document.getElementById('settings')
    const openSettings = () => {
      settings.classList.add('visible')
      this.audio.click()
    }
    document.getElementById('landing-settings')?.addEventListener('click', openSettings)
    document.getElementById('btn-settings')?.addEventListener('click', openSettings)
    document.querySelectorAll('[data-close="settings"]').forEach((button) => {
      button.addEventListener('click', () => settings.classList.remove('visible'))
    })
    document.getElementById('btn-resume')?.addEventListener('click', () => this.resume())
    document.getElementById('btn-quit')?.addEventListener('click', () => window.location.reload())
    document.getElementById('btn-quality')?.addEventListener('click', () => {
      this.setQuality(this.quality.mode === 'high' ? 'performance' : 'high')
      this.audio.click()
    })
    document.getElementById('btn-sound')?.addEventListener('click', () => {
      this.audio.init()
      this.audio.toggleMute()
      localStorage.setItem('mirage-muted', String(this.audio.muted))
      this.updateSettingsUI()
      this.audio.click()
    })
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => this.toggleFullscreen())
    document.getElementById('pause-button')?.addEventListener('click', () => this.pause())
    document.getElementById('hud-mute')?.addEventListener('click', () => {
      this.audio.init()
      this.audio.toggleMute()
      localStorage.setItem('mirage-muted', String(this.audio.muted))
      this.hud.toast(this.audio.muted ? 'AUDIO MUTED' : 'AUDIO ON', '', 'info', 1800)
    })
    document.getElementById('death-respawn')?.addEventListener('click', () => this.respawn())
  }

  updateSettingsUI() {
    const quality = document.getElementById('btn-quality')
    if (quality) quality.querySelector('span').textContent = this.quality.mode === 'high' ? 'HIGH' : 'PERFORMANCE'
    const sound = document.getElementById('btn-sound')
    if (sound) sound.querySelector('span').textContent = this.audio.muted ? 'OFF' : 'ON'
    const mute = document.getElementById('hud-mute')
    if (mute) mute.classList.toggle('muted', this.audio.muted)
  }

  setQuality(mode) {
    this.quality.mode = mode
    this.quality.tier = mode === 'high' ? 'high' : 'low'
    this.quality.shadows = mode === 'high'
    localStorage.setItem('mirage-quality', mode)
    this.renderer.setPixelRatio(this.pixelRatio())
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = this.quality.shadows
    this.world.sun.castShadow = this.quality.shadows
    this.bloomPass.strength = mode === 'high' ? 0.58 : 0.38
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio())
      this.composer.setSize(window.innerWidth, window.innerHeight)
    }
    this.updateSettingsUI()
    this.hud.toast('GRAPHICS UPDATED', mode === 'high' ? 'High fidelity: bloom, shadows, full detail.' : 'Performance mode: smoother frame rate.', 'info', 2600)
  }

  async toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
      else await document.exitFullscreen()
    } catch {
      this.hud.toast('FULLSCREEN UNAVAILABLE', 'Use your browser menu to enter fullscreen.', 'info', 2600)
    }
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen')
    } catch {}
  }

  start() {
    if (this.state === 'playing') return
    this.audio.init()
    this.state = 'playing'
    this.player.setVisible(true)
    this.player.position.copy(this.world.spawn)
    this.player.position.y = 0.18
    this.player.facing = this.world.spawnYaw
    this.player.character.group.position.copy(this.player.position)
    this.player.character.group.rotation.y = this.player.facing
    this.input.cameraYaw = this.player.facing + Math.PI
    this.input.cameraPitch = 0.13
    this.input.releaseAll()
    this.landing = document.getElementById('landing')
    this.landing.classList.add('leaving')
    document.body.classList.add('playing')
    setTimeout(() => this.landing.classList.add('hidden'), 850)
    this.hud.show()
    this.hud.setVitals(this.player.health, this.player.armor)
    this.hud.setWeapon(this.player.ammo, this.player.reserve, false)
    this.hud.setCash(this.player.cash)
    this.hud.setWanted(0)
    this.hud.setVehicle(false)
    this.hud.setLocation('DOWNTOWN', 'MIRAGE CITY // NIGHT SHIFT')
    this.hud.toast('WELCOME TO MIRAGE CITY', 'Night Shift is live. Find the data drives and make the drop.', 'mission', 5400)
    this.missions.start(this.player.position)
    this.hud.setMission(this.missions.getObjective(this.player.position))
    this.lastMissionState = 'idle'
    this.snapCamera = true
    this.requestWakeLock()
    this.audio.click()
    this.audio.setMuted(this.audio.muted)
    this.updateCamera(1, true)
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'dead') return
    this.state = 'paused'
    this.input.releaseAll()
    document.body.classList.add('paused')
    document.getElementById('pause-contracts').textContent = String(this.stats.missions)
    document.getElementById('pause-cash').textContent = `$${Math.floor(this.player.cash).toLocaleString('en-US')}`
    document.getElementById('pause-menu').classList.add('visible')
    this.audio.setMuted(true)
    this.saveProgress()
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = 'playing'
    this.input.releaseAll()
    document.body.classList.remove('paused')
    document.getElementById('pause-menu').classList.remove('visible')
    this.audio.setMuted(this.audio.muted)
    this.lastFrame = performance.now()
  }

  loop() {
    requestAnimationFrame(this.loop)
    const now = performance.now()
    let dt = (now - this.lastFrame) / 1000
    this.lastFrame = now
    dt = Math.min(dt, 0.05)
    this.elapsed += dt
    if (this.state === 'landing') {
      this.updateLanding(dt)
      this.render(dt)
      return
    }
    this.input.frame()
    if (this.input.consume('pause')) {
      if (this.state === 'paused') this.resume()
      else this.pause()
      this.input.endFrame()
      this.render(dt)
      return
    }
    if (this.state === 'paused') {
      this.input.endFrame()
      this.render(dt)
      return
    }
    if (this.state === 'dead') {
      this.deathTimer -= dt
      this.effects.update(dt)
      this.world.update(dt, this.elapsed, this.player.position)
      this.audio.updateEngine(0, 0)
      if (this.deathTimer <= 0) this.respawn()
      this.updateCamera(dt)
      this.render(dt)
      this.input.endFrame()
      return
    }
    this.updatePlaying(dt, now)
    this.input.endFrame()
    this.render(dt)
  }

  updateLanding(dt) {
    const radius = 145
    const angle = 0.88 + this.elapsed * 0.018
    const height = 56 + Math.sin(this.elapsed * 0.19) * 4
    this.camera.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius)
    this.camera.lookAt(-8, 23, 0)
    this.camera.fov = damp(this.camera.fov, 54, 2, dt)
    this.camera.updateProjectionMatrix()
    const focus = this.player.position
    this.world.update(dt, this.elapsed, focus)
    this.traffic.update(dt, focus)
    this.pedestrians.update(dt, focus)
    this.effects.update(dt)
    this.hud.setClock(this.elapsed)
    this.network.update(dt)
  }

  updatePlaying(dt, now) {
    const player = this.player
    if (this.input.consume('action')) {
      if (this.inVehicle) this.exitVehicle()
      else {
        const nearest = this.nearestVehicle(player.position, 4.6)
        if (nearest) this.enterVehicle(nearest)
      }
    }
    const vehicle = this.inVehicle
    let wantsFire = false
    if (vehicle && !vehicle.destroyed) {
      const throttle = this.input.move.y
      const steer = this.input.move.x
      const brake = this.input.keys.has('Space')
      vehicle.drive(dt, throttle, steer, brake)
      player.position.copy(vehicle.position)
      player.position.y = 0.18
      player.facing = vehicle.yaw
      if (this.input.consume('horn')) this.audio.horn()
      this.audio.updateEngine(vehicle.speed, throttle)
      if (vehicle.impact > 0.2) this.effects.shake = Math.max(this.effects.shake, 0.12)
      if (!this.input.drag.active) {
        const desired = vehicle.yaw + Math.PI
        this.input.cameraYaw = angleLerp(this.input.cameraYaw, desired, Math.min(1, dt * 1.3))
      }
      this.hud.setSpeed(vehicle.speed)
      this.hud.setPrompt(this.isTouch ? 'TAP' : 'F', 'EXIT VEHICLE')
      this.hud.setAction('EXIT', true)
      this.handleVehicleCollisions(vehicle, now)
    } else {
      if (vehicle?.destroyed) this.forceExitVehicle()
      const jump = this.input.consume('jump')
      player.update(dt, { move: this.input.move, sprint: this.input.sprint, jumpPressed: jump }, this.input.cameraYaw, (sprint) => this.audio.footstep(sprint))
      this.stats.distance += Math.hypot(player.velocity.x, player.velocity.z) * dt
      this.hud.setSpeed(0)
      this.audio.updateEngine(0, 0)
      if (this.input.consume('reload')) {
        if (player.reload()) this.audio.reload()
      }
      wantsFire = this.input.consume('shoot') || (this.input.fireHeld && this.isTouch)
      if (player.ammo === 0 && !player.reloading && player.reserve > 0 && now - this.lastShot > 700) {
        if (player.reload()) this.audio.reload()
      }
      this.checkTrafficHits(now)
      this.handleCarJackingPrompt()
    }
    this.updateCamera(dt)
    if (wantsFire && !vehicle) this.tryShoot(now)
    this.updateWeapons(now, vehicle)
    this.updateMission(dt)
    this.updateWanted(dt, now)
    this.updateCops(dt, now)
    this.traffic.update(dt, player.position)
    this.pedestrians.update(dt, player.position)
    this.network.update(dt)
    this.checkCarPedestrians()
    this.effects.update(dt)
    this.world.update(dt, this.elapsed, player.position)
    this.updateDistrict(dt)
    this.updateFeed(dt)
    this.hud.setVitals(player.health, player.armor)
    this.hud.setWeapon(player.ammo, player.reserve, player.reloading)
    this.hud.setCash(player.cash)
    this.hud.setOnline(6 + this.network.count)
    this.hud.setWanted(this.wanted)
    this.hud.setClock(this.elapsed)
    this.hud.setVehicle(Boolean(this.inVehicle))
    const objective = this.missions.getObjective(player.position)
    this.hud.setMission(objective)
    this.hud.drawMinimap({
      player,
      mission: objective,
      traffic: this.traffic.vehicles,
      bots: [...this.pedestrians.bots.filter((b) => !b.dead), ...this.network.positions],
      copPositions: this.cops.filter((c) => !c.destroyed).map((c) => c.position)
    })
    if (player.dead) this.die()
  }

  updateWeapons(now, vehicle) {
    if (!vehicle) return
    if (this.input.consume('shoot')) {
      this.audio.horn()
    }
    this.hud.setWeapon(this.player.ammo, this.player.reserve, this.player.reloading)
  }

  handleAction() {
    if (this.inVehicle) {
      this.exitVehicle()
      return
    }
    const nearest = this.nearestVehicle(this.player.position, 4.6)
    if (nearest) this.enterVehicle(nearest)
  }

  allVehicles() {
    return [...this.traffic.vehicles, ...this.parked, ...this.cops]
  }

  nearestVehicle(position, radius) {
    let best = null
    let distance = radius
    for (const vehicle of this.allVehicles()) {
      if (vehicle.destroyed) continue
      const d = distance2D(vehicle.position, position)
      if (d < distance) {
        best = vehicle
        distance = d
      }
    }
    return best
  }

  enterVehicle(vehicle) {
    if (vehicle.destroyed || this.inVehicle) return
    this.inVehicle = vehicle
    vehicle.setOccupied(true)
    if (vehicle.traffic) vehicle.traffic = null
    const wasCop = this.cops.includes(vehicle)
    if (wasCop) this.cops = this.cops.filter((car) => car !== vehicle)
    this.player.setVisible(false)
    this.player.position.copy(vehicle.position)
    this.audio.startEngine()
    this.audio.click()
    this.input.cameraYaw = vehicle.yaw + Math.PI
    this.hud.setVehicle(true)
    this.hud.toast('VEHICLE ACQUIRED', wasCop ? 'MIRAGE PD cruiser. That will raise some eyebrows.' : 'Engine hot. Follow the navigation marker.', 'success', 3200)
    if (wasCop) this.addWanted(2)
    this.snapCamera = true
  }

  exitVehicle() {
    if (!this.inVehicle) return
    const vehicle = this.inVehicle
    const rightX = Math.cos(vehicle.yaw)
    const rightZ = -Math.sin(vehicle.yaw)
    const position = new THREE.Vector3(vehicle.position.x + rightX * 2.2, 0.18, vehicle.position.z + rightZ * 2.2)
    this.world.resolveCircle(position, 0.45)
    this.player.position.copy(position)
    this.player.setVisible(true)
    this.player.facing = vehicle.yaw
    this.player.character.group.position.copy(position)
    this.player.character.group.rotation.y = vehicle.yaw
    vehicle.setOccupied(false)
    vehicle.speed = 0
    this.inVehicle = null
    this.audio.stopEngine()
    this.hud.setVehicle(false)
    this.hud.setSpeed(0)
    this.snapCamera = true
  }

  forceExitVehicle() {
    if (!this.inVehicle) return
    const vehicle = this.inVehicle
    const position = vehicle.position.clone()
    this.world.resolveCircle(position, 0.5)
    position.y = 0.18
    this.player.position.copy(position)
    this.player.setVisible(true)
    vehicle.setOccupied(false)
    vehicle.speed = 0
    this.inVehicle = null
    this.audio.stopEngine()
    this.hud.setVehicle(false)
    this.audio.setSiren(false)
  }

  handleCarJackingPrompt() {
    const nearest = this.nearestVehicle(this.player.position, 4.6)
    if (nearest) {
      this.hud.setPrompt(this.isTouch ? 'JACK' : 'F', 'JACK VEHICLE')
      this.hud.setAction('JACK', true)
    } else {
      this.hud.setPrompt('', '', false)
      this.hud.setAction('ACTION', false)
    }
  }

  updateCamera(dt, snap = this.snapCamera) {
    const player = this.player
    let target
    let distance
    let yaw = this.input.cameraYaw
    let pitch = this.input.cameraPitch
    let car = false
    if (this.inVehicle && !this.inVehicle.destroyed) {
      car = true
      target = this.tempVector.copy(this.inVehicle.position)
      target.y += 1.25
      distance = this.input.cameraDistance + 2
      pitch = Math.max(pitch, 0.07)
    } else {
      target = this.tempVector.copy(player.position)
      target.y += 1.42
      distance = this.input.cameraDistance
    }
    const horizontal = Math.cos(pitch) * distance
    const desired = this.tempVector2.set(
      target.x + Math.sin(yaw) * horizontal,
      target.y + Math.sin(pitch) * distance + 0.25,
      target.z + Math.cos(yaw) * horizontal
    )
    const direction = desired.clone().sub(target)
    const length = direction.length()
    direction.normalize()
    this.cameraRaycaster.set(target, direction)
    this.cameraRaycaster.far = length
    const hits = this.cameraRaycaster.intersectObjects(this.world.raycastTargets, false)
    if (hits.length && hits[0].distance < length) {
      desired.copy(target).addScaledVector(direction, Math.max(0.7, hits[0].distance - 0.32))
    }
    const smoothing = snap ? 1 : 1 - Math.exp(-(car ? 7 : 12) * dt)
    this.camera.position.lerp(desired, smoothing)
    const shake = this.effects.shake
    if (shake > 0.001) {
      this.camera.position.x += rand(-shake, shake) * 0.35
      this.camera.position.y += rand(-shake, shake) * 0.26
      this.camera.position.z += rand(-shake, shake) * 0.35
    }
    this.camera.lookAt(target)
    const targetFov = car ? 66 : 60
    this.camera.fov = damp(this.camera.fov, targetFov, 6, dt)
    this.camera.updateProjectionMatrix()
    this.snapCamera = false
  }

  shootRay(now) {
    const player = this.player
    if (!player.canFire()) {
      if (player.reloading) return
      if (player.ammo <= 0 && !player.reloading && player.reserve > 0) {
        if (player.reload()) this.audio.reload()
      } else if (player.ammo <= 0) {
        this.audio.click()
      }
      return
    }
    player.faceCamera(this.input.cameraYaw)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera)
    this.raycaster.far = 180
    const targets = [...this.world.raycastTargets]
    for (const vehicle of this.allVehicles()) {
      if (vehicle === this.inVehicle || vehicle.destroyed) continue
      targets.push(vehicle.group)
    }
    for (const ped of this.pedestrians.list) {
      if (!ped.dead) targets.push(ped.character.group)
    }
    const hits = this.raycaster.intersectObjects(targets, true)
    let hit = null
    for (const candidate of hits) {
      if (candidate.object.isSprite) continue
      if (candidate.object.userData.noHit) continue
      hit = candidate
      break
    }
    const muzzle = player.muzzle(new THREE.Vector3())
    let end
    if (hit) {
      end = hit.point.clone()
      const entity = hit.object.userData.vehicle ?? hit.object.userData.pedestrian ?? null
      const normal = hit.face?.normal
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0)
      if (entity?.character) {
        const killed = this.pedestrians.damage(entity, 38, player.position)
        this.effects.impact(end, normal, 0xffb0a0)
        this.effects.emit(end, { count: 5, color: 0xff6a6a, speed: 3.4, spread: 1.6, size: 0.08, life: 0.35, gravity: 8 })
        this.addWanted(killed ? 2 : 1)
        this.stats.eliminations += killed ? 1 : 0
        this.hud.hitMarker(killed)
      } else if (entity?.position) {
        this.effects.impact(end, normal, 0xffc577)
        const destroyed = entity.damage(32)
        this.addWanted(1)
        this.hud.hitMarker(false)
        if (destroyed) this.explodeVehicle(entity)
      } else {
        this.effects.impact(end, normal, 0xffd08a)
      }
    } else {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.18)
      const point = new THREE.Vector3()
      if (this.raycaster.ray.intersectPlane(plane, point)) end = point
      else end = this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, 140)
      this.effects.impact(end, new THREE.Vector3(0, 1, 0), 0xffcf9a)
    }
    player.fire()
    this.lastShot = now
    this.effects.tracer(muzzle, end, 0xffe2aa)
    this.effects.muzzleFlash(muzzle, 1)
    this.effects.shake = Math.max(this.effects.shake, 0.075)
    this.audio.gunshot()
    this.pedestrians.scare(player.position)
    this.hud.setWeapon(player.ammo, player.reserve, false)
    this.hud.pulseCrosshair()
  }

  tryShoot(now) {
    if (this.inVehicle || this.player.dead) return
    if (now - this.lastShot < 120) return
    this.shootRay(now)
  }

  checkTrafficHits(now) {
    if (now - this.lastPlayerDamage < 900) return
    const player = this.player
    for (const vehicle of this.traffic.vehicles) {
      if (vehicle.destroyed || vehicle.speed < 4) continue
      if (distance2D(vehicle.position, player.position) < 2.1) {
        player.damage(16)
        this.lastPlayerDamage = now
        this.hud.flashDamage()
        this.effects.impact(player.position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, 1, 0), 0xff9a63)
        this.effects.shake = Math.max(this.effects.shake, 0.22)
        this.audio.impact()
        break
      }
    }
  }

  handleVehicleCollisions(vehicle, now) {
    for (const other of this.traffic.vehicles) {
      if (other === vehicle || other.destroyed) continue
      const distance = distance2D(vehicle.position, other.position)
      if (distance < 2.6) {
        const impact = Math.abs(vehicle.speed) + Math.abs(other.speed)
        if (impact > 6) {
          other.speed *= 0.4
          vehicle.speed *= 0.45
          this.effects.impact(vehicle.position.clone().lerp(other.position, 0.5).add(new THREE.Vector3(0, 0.7, 0)), new THREE.Vector3(0, 1, 0), 0xffc577)
          this.effects.shake = Math.max(this.effects.shake, Math.min(0.4, impact * 0.01))
          if (impact > 16 && now - this.lastPlayerDamage > 900) {
            this.player.damage(5)
            this.lastPlayerDamage = now
            this.hud.flashDamage()
          }
        }
      }
    }
    for (const ped of this.pedestrians.list) {
      if (ped.dead) continue
      if (distance2D(vehicle.position, ped.position) < 1.8 && Math.abs(vehicle.speed) > 4) {
        const killed = this.pedestrians.damage(ped, 100, vehicle.position)
        this.effects.impact(ped.position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, 1, 0), 0xff8a71)
        if (killed) {
          this.addWanted(2)
          this.stats.eliminations++
        }
      }
    }
  }

  checkCarPedestrians() {
    if (!this.inVehicle) return
    const vehicle = this.inVehicle
    if (Math.abs(vehicle.speed) < 4) return
    for (const ped of this.pedestrians.list) {
      if (ped.dead) continue
      if (distance2D(vehicle.position, ped.position) < 1.8) {
        const killed = this.pedestrians.damage(ped, 100, vehicle.position)
        if (killed) {
          this.addWanted(2)
          this.stats.eliminations++
        }
      }
    }
  }

  explodeVehicle(vehicle) {
    if (vehicle.destroyed) return
    vehicle.destroyed = true
    const position = vehicle.position.clone()
    position.y += 0.8
    this.effects.explosion(position)
    this.audio.explosion()
    this.audio.setSiren(true)
    this.addWanted(1)
    if (this.inVehicle === vehicle) {
      this.inVehicle = null
      vehicle.setOccupied(false)
      this.player.setVisible(true)
      this.player.position.copy(vehicle.position)
      this.player.position.y = 0.18
      this.player.damage(88)
      this.hud.setVehicle(false)
      this.audio.stopEngine()
      this.hud.flashDamage()
    }
    if (this.player.position.distanceTo(vehicle.position) < 9) {
      const force = 1 - this.player.position.distanceTo(vehicle.position) / 9
      this.player.damage(18 * force)
      this.effects.shake = Math.max(this.effects.shake, force * 0.6)
    }
    for (const ped of this.pedestrians.list) {
      if (!ped.dead && distance2D(ped.position, vehicle.position) < 8) {
        this.pedestrians.damage(ped, 100, vehicle.position)
      }
    }
    for (const other of this.allVehicles()) {
      if (other !== vehicle && !other.destroyed && distance2D(other.position, vehicle.position) < 7) {
        other.damage(50)
      }
    }
    if (vehicle.body?.material) {
      vehicle.body.material.color.setHex(0x08080b)
      vehicle.body.material.metalness = 0.2
      vehicle.body.material.roughness = 0.95
    }
    if (vehicle.underGlow) vehicle.underGlow.visible = false
    if (vehicle.policeLights) for (const entry of vehicle.policeLights) entry.light.intensity = 0
    if (vehicle.headlight) vehicle.headlight.intensity = 0
    this.cops = this.cops.filter((cop) => cop !== vehicle)
    this.wrecks.push({ vehicle, timer: 16, smokeTimer: 0 })
  }

  updateCops(dt, now) {
    if (this.wanted === 0) {
      if (this.cops.length) this.clearCops()
      this.audio.setSiren(false)
      return
    }
    this.copSpawnTimer -= dt
    const desiredCops = Math.min(3, Math.max(1, this.wanted))
    if (this.cops.length < desiredCops && this.copSpawnTimer <= 0) {
      this.spawnCop()
      this.copSpawnTimer = 4.2
    }
    let closest = 999
    for (const cop of [...this.cops]) {
      if (cop.destroyed) {
        this.cops = this.cops.filter((car) => car !== cop)
        continue
      }
      const distance = distance2D(cop.position, this.player.position)
      closest = Math.min(closest, distance)
      if (distance > 280) {
        cop.dispose()
        this.cops = this.cops.filter((car) => car !== cop)
        continue
      }
      cop.driveTowards(this.player.position, dt, 28 + this.wanted * 1.5)
      if (distance < 26) {
        cop.shootTimer = (cop.shootTimer ?? rand(0.6, 1.4)) - dt
        if (cop.shootTimer <= 0) {
          cop.shootTimer = 1.5 + rand(0, 0.8)
          const origin = cop.position.clone().add(new THREE.Vector3(0, 1.1, 0))
          const target = this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0))
          this.effects.tracer(origin, target, 0xffd27a)
          this.effects.muzzleFlash(origin, 0.7)
          this.audio.gunshot()
          this.player.damage(4 + this.wanted * 0.8, now)
          this.hud.flashDamage()
          this.effects.shake = Math.max(this.effects.shake, 0.06)
        }
      }
      if (distance < 2.3 && Math.abs(cop.speed) > 5) {
        if (now - (cop.ramTime ?? 0) > 1400) {
          cop.ramTime = now
          this.player.damage(9, now)
          this.hud.flashDamage()
          this.effects.shake = Math.max(this.effects.shake, 0.28)
        }
      }
    }
    this.audio.setSiren(closest < 80)
  }

  spawnCop() {
    const nodes = this.world.roadNodes
    let node = null
    for (let i = 0; i < 20; i++) {
      const candidate = pick(nodes)
      const distance = distance2D(candidate, this.player.position)
      if (distance > 80 && distance < 220) {
        node = candidate
        break
      }
    }
    if (!node) node = pick(nodes)
    const cop = new Vehicle(this.scene, this.world, {
      type: 'police',
      x: node.x,
      z: node.z,
      yaw: rand(0, Math.PI * 2),
      color: 0x172033
    })
    cop.police = true
    cop.shootTimer = rand(0.8, 2)
    this.cops.push(cop)
    this.hud.chat('MIRAGE PD', 'All units, suspect spotted. Converge on the signal.', '#ff6b8a')
  }

  clearCops() {
    for (const cop of this.cops) cop.dispose()
    this.cops = []
    this.audio.setSiren(false)
  }

  updateWanted(dt, now) {
    if (this.wanted > 0) {
      this.wantedTimer -= dt
      if (this.wantedTimer <= 0) {
        this.wanted--
        this.wantedTimer = 18
        if (this.wanted === 0) {
          this.hud.toast('HEAT CLEARED', 'The department lost your trail.', 'success', 3600)
          this.audio.setSiren(false)
        }
      }
    }
    this.hud.setWanted(this.wanted)
  }

  addWanted(amount) {
    const before = this.wanted
    this.wanted = clamp(this.wanted + amount, 0, 5)
    this.wantedTimer = 32
    if (this.wanted > before) {
      this.hud.setWanted(this.wanted)
      if (performance.now() - this.lastWantedToast > 1400) {
        this.lastWantedToast = performance.now()
        this.hud.toast('WANTED LEVEL ' + this.wanted, this.wanted >= 4 ? 'Every unit in the district is responding.' : 'Mirage PD is moving on your position.', 'fail', 3000)
        this.audio.setSiren(true)
      }
    }
  }

  updateMission(dt) {
    if (this.lastMissionState === 'active' && this.missions.state === 'complete') {
      this.player.cash += this.missions.reward
      this.player.addArmor(20)
      this.stats.missions++
      this.hud.setCash(this.player.cash)
      this.saveProgress()
    }
    if (this.lastMissionState === 'active' && this.missions.state === 'failed') {
      this.player.cash = Math.max(0, this.player.cash - 150)
      this.hud.setCash(this.player.cash)
      this.saveProgress()
    }
    this.lastMissionState = this.missions.state
    this.missions.update(dt, this.player.position, this.elapsed)
  }

  updateDistrict(dt) {
    this.districtTimer -= dt
    if (this.districtTimer > 0) return
    this.districtTimer = 2
    const { x, z } = this.player.position
    let district = 'MIRAGE CITY'
    if (Math.hypot(x, z) < 100) district = 'DOWNTOWN'
    else if (z > 120) district = 'NORTH SHORE'
    else if (z < -120) district = 'DOCKSIDE'
    else if (x < -120) district = 'THE UNDERPASS'
    else if (x > 120) district = 'NEON MILE'
    else if (Math.hypot(x - 28, z - 28) < 45) district = 'MIRAGE PLAZA'
    if (district !== this.district) {
      this.district = district
      this.hud.setLocation(district.toUpperCase(), 'MIRAGE CITY // NIGHT SHIFT')
    }
  }

  updateFeed(dt) {
    this.ambientTimer -= dt
    if (this.ambientTimer > 0) return
    this.ambientTimer = rand(16, 28)
    const index = Math.floor(rand(0, BOT_NAMES.length))
    this.hud.chat(BOT_NAMES[index], pick(ONLINE_MESSAGES), BOT_ACCENTS[index])
  }

  die() {
    if (this.state !== 'playing') return
    this.state = 'dead'
    this.deathTimer = 4.2
    this.input.releaseAll()
    if (this.inVehicle) this.forceExitVehicle()
    this.player.character.visual.rotation.x = -Math.PI / 2
    this.player.character.visual.position.y = 0.16
    this.hud.showDeath()
    this.hud.setVehicle(false)
    this.audio.stopEngine()
    this.audio.setSiren(false)
    this.audio.fail()
  }

  respawn() {
    if (this.state !== 'dead') return
    this.player.character.visual.rotation.x = 0
    this.player.character.visual.position.y = 0
    this.player.respawn()
    this.player.cash = Math.max(0, this.player.cash - 500)
    this.wanted = 0
    this.hud.setWanted(0)
    this.clearCops()
    this.hud.setCash(this.player.cash)
    this.saveProgress()
    this.hud.hideDeath()
    this.state = 'playing'
    this.hud.toast('BACK ON THE STREETS', 'Medical bill: $500. The city never stops.', 'fail', 4200)
    if (this.missions.state === 'active') this.missions.fail('You were taken down before the drop.')
    this.input.releaseAll()
    this.input.cameraYaw = this.player.facing + Math.PI
    this.snapCamera = true
    this.lastFrame = performance.now()
  }

  updateWrecks(dt) {
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const wreck = this.wrecks[i]
      wreck.timer -= dt
      wreck.smokeTimer -= dt
      if (wreck.smokeTimer <= 0) {
        wreck.smokeTimer = 0.32
        this.effects.smoke(wreck.vehicle.position.clone().add(new THREE.Vector3(0, 1.1, 0)), 0x393338, 2)
      }
      if (wreck.timer <= 0) {
        wreck.vehicle.dispose()
        this.traffic.vehicles = this.traffic.vehicles.filter((vehicle) => vehicle !== wreck.vehicle)
        this.parked = this.parked.filter((vehicle) => vehicle !== wreck.vehicle)
        this.wrecks.splice(i, 1)
      }
    }
  }

  render(dt) {
    this.updateWrecks(dt)
    if (this.quality.bloom === false) {
      this.renderer.render(this.scene, this.camera)
    } else {
      this.composer.render(dt)
    }
  }

  resize() {
    const width = window.innerWidth
    const height = window.innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(this.pixelRatio())
    this.renderer.setSize(width, height)
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio())
      this.composer.setSize(width, height)
    }
    this.hud.resizeMinimap()
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || width < 760
    document.body.classList.toggle('mobile-ui', this.isTouch)
  }
}
