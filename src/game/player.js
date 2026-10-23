import * as THREE from 'three'
import { Character } from './character.js'
import { clamp, damp, angleLerp, TAU } from './utils.js'

const GROUND_Y = 0.18

export class Player {
  constructor(scene, world) {
    this.scene = scene
    this.world = world
    this.position = world.spawn.clone()
    this.velocity = new THREE.Vector3()
    this.verticalVelocity = 0
    this.grounded = true
    this.health = 100
    this.maxHealth = 100
    this.armor = 50
    this.maxArmor = 100
    this.cash = 2450
    this.ammo = 12
    this.reserve = 96
    this.reloading = false
    this.reloadTimer = 0
    this.fireTimer = 0
    this.facing = world.spawnYaw
    this.footstepDistance = 0
    this.aimTimer = 0
    this.dead = false
    this.lastHit = 0
    this.character = new Character({
      isPlayer: true,
      accent: '#41f4ff',
      jacket: 0x121725,
      skin: 0xc98f69,
      showName: false
    })
    this.character.setArmed(true)
    this.character.group.position.copy(this.position)
    this.character.group.rotation.y = this.facing
    scene.add(this.character.group)
    this.tempForward = new THREE.Vector3()
    this.tempRight = new THREE.Vector3()
    this.tempDir = new THREE.Vector3()
    this.spawn = world.spawn.clone()
  }

  update(dt, controls, cameraYaw, onFootstep) {
    this.fireTimer = Math.max(0, this.fireTimer - dt)
    this.aimTimer = Math.max(0, this.aimTimer - dt)
    if (this.reloading) {
      this.reloadTimer -= dt
      if (this.reloadTimer <= 0) {
        const need = 12 - this.ammo
        const load = Math.min(need, this.reserve)
        this.ammo += load
        this.reserve -= load
        this.reloading = false
      }
    }
    if (this.dead) return
    const moveX = controls.move.x
    const moveY = controls.move.y
    const magnitude = Math.min(1, Math.hypot(moveX, moveY))
    const sprinting = controls.sprint && magnitude > 0.55 && this.grounded
    const forward = this.tempForward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw))
    const right = this.tempRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw))
    const direction = this.tempDir.set(0, 0, 0)
    direction.addScaledVector(forward, moveY)
    direction.addScaledVector(right, moveX)
    if (direction.lengthSq() > 0.0001) direction.normalize()
    const maxSpeed = sprinting ? 9.2 : 4.7
    const targetX = direction.x * maxSpeed * magnitude
    const targetZ = direction.z * maxSpeed * magnitude
    const accel = magnitude > 0.05 ? 13 : 18
    this.velocity.x = damp(this.velocity.x, targetX, accel, dt)
    this.velocity.z = damp(this.velocity.z, targetZ, accel, dt)
    this.position.x += this.velocity.x * dt
    this.position.z += this.velocity.z * dt
    this.world.resolveCircle(this.position, 0.44)
    if (this.grounded && controls.jumpPressed) {
      this.verticalVelocity = 6.4
      this.grounded = false
    }
    if (!this.grounded) {
      this.verticalVelocity -= 18 * dt
      this.position.y += this.verticalVelocity * dt
      if (this.position.y <= GROUND_Y) {
        this.position.y = GROUND_Y
        this.verticalVelocity = 0
        this.grounded = true
      }
    } else {
      this.position.y = GROUND_Y
    }
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z)
    const moving = horizontalSpeed > 0.3
    if (this.aimTimer > 0) {
      this.facing = angleLerp(this.facing, cameraYaw + Math.PI, Math.min(1, dt * 12))
    } else if (moving) {
      const desired = Math.atan2(this.velocity.x, this.velocity.z)
      this.facing = angleLerp(this.facing, desired, Math.min(1, dt * 11))
    }
    this.character.group.position.copy(this.position)
    this.character.group.rotation.y = this.facing
    this.character.update(dt, horizontalSpeed, sprinting, !this.grounded ? 0.25 : null)
    this.footstepDistance += horizontalSpeed * dt
    if (moving && this.grounded && this.footstepDistance > (sprinting ? 2.15 : 1.55)) {
      this.footstepDistance = 0
      onFootstep?.(sprinting)
    }
    if (this.health < this.maxHealth && performance.now() - this.lastHit > 8000) {
      this.health = Math.min(this.maxHealth, this.health + dt * 2.5)
    }
  }

  faceCamera(cameraYaw) {
    this.aimTimer = 0.85
    this.facing = angleLerp(this.facing, cameraYaw + Math.PI, 0.55)
    this.character.group.rotation.y = this.facing
  }

  canFire() {
    return !this.dead && !this.reloading && this.ammo > 0 && this.fireTimer <= 0
  }

  fire() {
    if (!this.canFire()) return false
    this.ammo--
    this.fireTimer = 0.16
    return true
  }

  reload() {
    if (this.reloading || this.ammo === 12 || this.reserve <= 0 || this.dead) return false
    this.reloading = true
    this.reloadTimer = 1.25
    return true
  }

  muzzle(target = new THREE.Vector3()) {
    this.character.group.updateMatrixWorld(true)
    return this.character.muzzleWorld(target)
  }

  damage(amount, now = performance.now()) {
    if (this.dead) return
    this.lastHit = now
    let remaining = amount
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.62)
      this.armor -= absorbed
      remaining -= absorbed
    }
    this.health = Math.max(0, this.health - remaining)
    if (this.health <= 0) this.dead = true
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount)
  }

  addArmor(amount) {
    this.armor = Math.min(this.maxArmor, this.armor + amount)
  }

  respawn() {
    this.dead = false
    this.health = this.maxHealth
    this.armor = 30
    this.position.copy(this.spawn)
    this.position.y = GROUND_Y
    this.velocity.set(0, 0, 0)
    this.verticalVelocity = 0
    this.grounded = true
    this.ammo = 12
    this.reserve = 96
    this.reloading = false
    this.character.group.visible = true
    this.character.group.position.copy(this.position)
  }

  setVisible(value) {
    this.character.group.visible = value
  }
}
