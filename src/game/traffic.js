import * as THREE from 'three'
import { Vehicle } from './vehicle.js'
import { rand, randInt, pick } from './utils.js'

const ROAD_COORDS = [-224, -168, -112, -56, 0, 56, 112, 168, 224]

export class Traffic {
  constructor(scene, world) {
    this.scene = scene
    this.world = world
    this.vehicles = []
    this.spawned = false
  }

  spawn(count = 10) {
    if (this.spawned) return
    this.spawned = true
    const used = new Set()
    for (let i = 0; i < count; i++) {
      let ix
      let iz
      let key
      do {
        ix = randInt(1, ROAD_COORDS.length - 2)
        iz = randInt(1, ROAD_COORDS.length - 2)
        key = `${ix},${iz}`
      } while (used.has(key))
      used.add(key)
      const type = pick(['sedan', 'sports', 'sedan', 'taxi', 'sports'])
      const vehicle = new Vehicle(this.scene, this.world, {
        type,
        color: type === 'taxi' ? 0xe4b432 : null,
        x: ROAD_COORDS[ix],
        z: ROAD_COORDS[iz],
        yaw: rand(0, Math.PI * 2)
      })
      vehicle.traffic = {
        ix,
        iz,
        target: new THREE.Vector3(),
        speedBias: rand(-1.4, 2.6),
        lastTurn: 0,
        chooseNext: () => this.chooseNext(vehicle)
      }
      this.moveToNode(vehicle, true)
      this.vehicles.push(vehicle)
    }
  }

  chooseNext(vehicle) {
    const traffic = vehicle.traffic
    const options = []
    if (traffic.ix > 0) options.push([traffic.ix - 1, traffic.iz])
    if (traffic.ix < ROAD_COORDS.length - 1) options.push([traffic.ix + 1, traffic.iz])
    if (traffic.iz > 0) options.push([traffic.ix, traffic.iz - 1])
    if (traffic.iz < ROAD_COORDS.length - 1) options.push([traffic.ix, traffic.iz + 1])
    const reverse = traffic.prev
    const filtered = options.filter(([x, z]) => !reverse || x !== reverse[0] || z !== reverse[1])
    const next = pick(filtered.length ? filtered : options)
    traffic.prev = [traffic.ix, traffic.iz]
    traffic.ix = next[0]
    traffic.iz = next[1]
    this.moveToNode(vehicle, false)
  }

  moveToNode(vehicle, snap) {
    const traffic = vehicle.traffic
    const x = ROAD_COORDS[traffic.ix]
    const z = ROAD_COORDS[traffic.iz]
    const target = new THREE.Vector3(x, 0, z)
    traffic.target.copy(target)
    const dx = target.x - vehicle.position.x
    const dz = target.z - vehicle.position.z
    if (snap || Math.hypot(dx, dz) > 0.1) {
      const distance = Math.hypot(dx, dz)
      if (distance > 0.1) {
        const dirX = dx / distance
        const dirZ = dz / distance
        const rightX = dirZ
        const rightZ = -dirX
        const lane = 2.6
        if (snap) {
          vehicle.position.set(x + rightX * lane, 0, z + rightZ * lane)
          vehicle.yaw = Math.atan2(dirX, dirZ)
        }
        traffic.target.set(x + rightX * lane, 0, z + rightZ * lane)
      }
    }
  }

  update(dt, playerPosition) {
    for (const vehicle of this.vehicles) {
      if (vehicle.destroyed || vehicle.occupied) {
        vehicle.animate(dt)
        continue
      }
      const distanceToPlayer = Math.hypot(vehicle.position.x - playerPosition.x, vehicle.position.z - playerPosition.z)
      if (distanceToPlayer > 320) continue
      vehicle.updateTraffic(dt)
    }
  }

  nearest(position, radius = 5, includeDestroyed = false) {
    let best = null
    let bestDistance = radius
    for (const vehicle of this.vehicles) {
      if (vehicle.destroyed && !includeDestroyed) continue
      const distance = Math.hypot(vehicle.position.x - position.x, vehicle.position.z - position.z)
      if (distance < bestDistance) {
        best = vehicle
        bestDistance = distance
      }
    }
    return best
  }

  remove(vehicle) {
    vehicle.dispose()
    this.vehicles = this.vehicles.filter((item) => item !== vehicle)
  }
}
