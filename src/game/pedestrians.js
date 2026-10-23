import * as THREE from 'three'
import { Character } from './character.js'
import { rand, pick, distance2D, clamp } from './utils.js'

const BLOCK_CENTERS = [-196, -140, -84, -28, 28, 84, 140, 196]
const ACCENTS = ['#41f4ff', '#ff2f8e', '#ffb84d', '#8d6bff', '#55ffa8', '#ff6b6b']
const BOT_NAMES = ['VEX', 'NOVA', 'KODA', 'RIVET', 'SABLE']

function randomSidewalkPoint() {
  const cx = pick(BLOCK_CENTERS)
  const cz = pick(BLOCK_CENTERS)
  const angle = rand(0, Math.PI * 2)
  const radius = rand(19.3, 21.4)
  return new THREE.Vector3(cx + Math.cos(angle) * radius, 0.18, cz + Math.sin(angle) * radius)
}

export class Pedestrians {
  constructor(scene, world) {
    this.scene = scene
    this.world = world
    this.list = []
    this.bots = []
    this.spawned = false
    this.feedHandler = null
  }

  spawn(count = 14, botCount = 5) {
    if (this.spawned) return
    this.spawned = true
    for (let i = 0; i < count; i++) this.createPedestrian()
    for (let i = 0; i < botCount; i++) this.createBot(i)
  }

  createPedestrian(position = null) {
    const spot = position ?? randomSidewalkPoint()
    const character = new Character({
      accent: pick(ACCENTS),
      showName: false
    })
    const ped = {
      character,
      position: spot.clone(),
      target: new THREE.Vector3(),
      state: 'walk',
      stateTimer: 0,
      speed: rand(1.1, 2.1),
      baseSpeed: 0,
      health: 40,
      dead: false,
      deadTimer: 0,
      isBot: false,
      wanderTimer: rand(2, 7),
      friction: 0
    }
    ped.baseSpeed = ped.speed
    this.pickTarget(ped)
    character.group.position.copy(ped.position)
    character.group.rotation.y = rand(0, Math.PI * 2)
    this.scene.add(character.group)
    character.group.traverse((object) => {
      if (object.isMesh) object.userData.pedestrian = ped
    })
    this.list.push(ped)
    return ped
  }

  createBot(index) {
    const start = new THREE.Vector3(
      [31, 39, 21, 34, 24][index],
      0.18,
      [34, 31, 40, 24, 19][index]
    )
    const character = new Character({
      name: BOT_NAMES[index],
      accent: ACCENTS[index % ACCENTS.length],
      jacket: [0x111827, 0x25122a, 0x0e2528, 0x2b2312, 0x1d172d][index],
      showName: true
    })
    const bot = {
      character,
      position: start,
      target: new THREE.Vector3(),
      state: 'idle',
      stateTimer: rand(1, 5),
      speed: rand(1.2, 1.9),
      baseSpeed: 1.5,
      health: 100,
      dead: false,
      deadTimer: 0,
      isBot: true,
      name: BOT_NAMES[index],
      accent: ACCENTS[index % ACCENTS.length],
      wanderTimer: rand(3, 8)
    }
    bot.baseSpeed = bot.speed
    this.pickBotTarget(bot)
    character.group.position.copy(bot.position)
    character.group.rotation.y = rand(0, Math.PI * 2)
    this.scene.add(character.group)
    character.group.traverse((object) => {
      if (object.isMesh) object.userData.pedestrian = bot
    })
    this.bots.push(bot)
    this.list.push(bot)
    return bot
  }

  pickTarget(ped) {
    for (let i = 0; i < 12; i++) {
      const target = randomSidewalkPoint()
      if (target.distanceTo(ped.position) > 6 && target.distanceTo(ped.position) < 34 && !this.world.isBlocked(target.x, target.z, 0.6)) {
        ped.target.copy(target)
        return
      }
    }
    ped.target.copy(ped.position)
  }

  pickBotTarget(bot) {
    const center = new THREE.Vector3(28, 0.18, 28)
    for (let i = 0; i < 10; i++) {
      const angle = rand(0, Math.PI * 2)
      const radius = rand(9, 30)
      const target = new THREE.Vector3(center.x + Math.cos(angle) * radius, 0.18, center.z + Math.sin(angle) * radius)
      if (!this.world.isBlocked(target.x, target.z, 0.6)) {
        bot.target.copy(target)
        return
      }
    }
    bot.target.copy(bot.position)
  }

  scare(origin) {
    for (const ped of this.list) {
      if (ped.dead) continue
      const distance = distance2D(ped.position, origin)
      if (distance < 34) {
        const dx = ped.position.x - origin.x
        const dz = ped.position.z - origin.z
        const inv = 1 / Math.max(0.1, Math.hypot(dx, dz))
        ped.target.set(ped.position.x + dx * inv * 22, 0.18, ped.position.z + dz * inv * 22)
        ped.state = 'flee'
        ped.stateTimer = rand(4, 7)
        ped.speed = rand(5.2, 7.2)
      }
    }
  }

  damage(ped, amount, sourcePosition) {
    if (ped.dead) return false
    ped.health -= amount
    ped.state = 'flee'
    ped.stateTimer = 5
    ped.speed = rand(5, 7.4)
    if (sourcePosition) {
      const dx = ped.position.x - sourcePosition.x
      const dz = ped.position.z - sourcePosition.z
      const inv = 1 / Math.max(0.1, Math.hypot(dx, dz))
      ped.target.set(ped.position.x + dx * inv * 24, 0.18, ped.position.z + dz * inv * 24)
    }
    if (ped.health <= 0) {
      ped.dead = true
      ped.deadTimer = 12
      ped.character.visual.rotation.x = -Math.PI / 2
      ped.character.visual.position.y = 0.16
      if (ped.character.nameplate) ped.character.nameplate.visible = false
      return true
    }
    return false
  }

  update(dt, playerPosition) {
    for (const ped of this.list) {
      if (ped.dead) {
        ped.deadTimer -= dt
        if (ped.deadTimer <= 0) this.respawn(ped)
        continue
      }
      const distance = distance2D(ped.position, playerPosition)
      if (distance > 230) {
        ped.character.group.visible = false
        continue
      }
      ped.character.group.visible = true
      ped.wanderTimer -= dt
      ped.stateTimer -= dt
      if (ped.state === 'flee') {
        if (ped.stateTimer <= 0) {
          ped.state = 'walk'
          ped.speed = ped.baseSpeed
          this.pickTarget(ped)
        }
      } else if (ped.state === 'idle') {
        if (ped.stateTimer <= 0) {
          ped.state = 'walk'
          if (ped.isBot) this.pickBotTarget(ped)
          else this.pickTarget(ped)
        }
      } else if (ped.wanderTimer <= 0) {
        ped.wanderTimer = rand(3, 9)
        if (ped.isBot && Math.random() < 0.5) {
          ped.state = 'idle'
          ped.stateTimer = rand(1.4, 4.5)
        } else if (ped.isBot) {
          this.pickBotTarget(ped)
        } else {
          this.pickTarget(ped)
        }
      }
      const dx = ped.target.x - ped.position.x
      const dz = ped.target.z - ped.position.z
      const targetDistance = Math.hypot(dx, dz)
      let moving = false
      if (ped.state !== 'idle' && targetDistance > 0.65) {
        const speed = ped.state === 'flee' ? ped.speed : ped.baseSpeed
        const inv = 1 / targetDistance
        const nextX = ped.position.x + dx * inv * speed * dt
        const nextZ = ped.position.z + dz * inv * speed * dt
        if (!this.world.isBlocked(nextX, nextZ, 0.35)) {
          ped.position.x = nextX
          ped.position.z = nextZ
          moving = true
          const desired = Math.atan2(dx, dz)
          ped.character.group.rotation.y += ((desired - ped.character.group.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 7)
        } else {
          if (ped.isBot) this.pickBotTarget(ped)
          else this.pickTarget(ped)
        }
      }
      if (!moving && targetDistance <= 0.8 && ped.state === 'walk') {
        if (ped.isBot) {
          ped.state = 'idle'
          ped.stateTimer = rand(1.3, 4.2)
        } else {
          this.pickTarget(ped)
        }
      }
      ped.character.group.position.copy(ped.position)
      ped.character.update(dt, moving ? (ped.state === 'flee' ? ped.speed : ped.baseSpeed) : 0, ped.state === 'flee')
    }
  }

  respawn(ped) {
    const spot = ped.isBot
      ? new THREE.Vector3(rand(18, 38), 0.18, rand(18, 38))
      : randomSidewalkPoint()
    ped.position.copy(spot)
    ped.health = ped.isBot ? 100 : 40
    ped.dead = false
    ped.state = ped.isBot ? 'idle' : 'walk'
    ped.stateTimer = rand(1, 4)
    ped.character.visual.rotation.x = 0
    ped.character.visual.position.y = 0
    ped.character.group.position.copy(ped.position)
    if (ped.character.nameplate) ped.character.nameplate.visible = true
    if (ped.isBot) this.pickBotTarget(ped)
    else this.pickTarget(ped)
  }

  nearest(position, radius = 40, includeBots = true) {
    let best = null
    let distance = radius
    for (const ped of this.list) {
      if (ped.dead) continue
      if (!includeBots && ped.isBot) continue
      const d = distance2D(ped.position, position)
      if (d < distance) {
        distance = d
        best = ped
      }
    }
    return best
  }
}
