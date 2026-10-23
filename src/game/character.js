import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { TAU, makeNameplate, blobShadow } from './utils.js'

const skinTones = [0xd9a07a, 0xb97a58, 0x8f5c43, 0xf0bd98, 0x6d4433]
const jacketColors = [0x141a2b, 0x241322, 0x142326, 0x2b2116, 0x201a2b]
const pantColors = [0x14141c, 0x1b1c25, 0x101823, 0x211b18]

export class Character {
  constructor({
    name = '',
    isPlayer = false,
    accent = '#41f4ff',
    jacket = null,
    skin = null,
    hair = 0x111018,
    showName = false
  } = {}) {
    this.name = name
    this.isPlayer = isPlayer
    this.accent = accent
    this.speed = 0
    this.animTime = Math.random() * 10
    this.armed = false
    this.group = new THREE.Group()
    this.visual = new THREE.Group()
    this.group.add(this.visual)
    this.parts = {}
    this.skin = skin ?? skinTones[Math.floor(Math.random() * skinTones.length)]
    this.jacket = jacket ?? jacketColors[Math.floor(Math.random() * jacketColors.length)]
    this.pants = pantColors[Math.floor(Math.random() * pantColors.length)]
    this.build()
    this.shadow = blobShadow(0.72, 0.45)
    this.group.add(this.shadow)
    if (showName) {
      this.nameplate = makeNameplate(name, '#ffffff', accent)
      this.nameplate.position.y = 2.5
      this.group.add(this.nameplate)
    }
  }

  build() {
    const skinMat = new THREE.MeshStandardMaterial({ color: this.skin, roughness: 0.72, metalness: 0.03 })
    const jacketMat = new THREE.MeshStandardMaterial({ color: this.jacket, roughness: 0.58, metalness: 0.2 })
    const pantsMat = new THREE.MeshStandardMaterial({ color: this.pants, roughness: 0.8, metalness: 0.08 })
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dd, roughness: 0.45, metalness: 0.2 })
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x0c0b10, roughness: 0.78 })
    const accentMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent) })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x090a10, roughness: 0.5, metalness: 0.4 })

    const hips = new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.26, 0.32, 2, 0.08), pantsMat)
    hips.position.y = 0.91
    this.visual.add(hips)
    this.parts.hips = hips

    const torso = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.7, 0.36, 3, 0.09), jacketMat)
    torso.position.y = 1.3
    torso.castShadow = true
    this.visual.add(torso)
    this.parts.torso = torso

    const collar = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.15, 0.33, 2, 0.05), darkMat)
    collar.position.set(0, 1.62, -0.01)
    this.visual.add(collar)

    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.58, 0.02), accentMat)
    zip.position.set(0, 1.29, 0.188)
    this.visual.add(zip)
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.37), accentMat)
    shoulder.position.set(-0.37, 1.5, 0)
    shoulder.rotation.z = -0.12
    this.visual.add(shoulder)

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.14, 8), skinMat)
    neck.position.y = 1.7
    this.visual.add(neck)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.225, 16, 12), skinMat)
    head.position.y = 1.9
    head.scale.set(0.92, 1.06, 0.96)
    head.castShadow = true
    this.visual.add(head)
    this.parts.head = head

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.233, 16, 10, 0, TAU, 0, Math.PI * 0.58), hairMat)
    hair.position.set(0, 1.94, -0.012)
    hair.rotation.x = -0.16
    this.visual.add(hair)
    const fade = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.08, 0.1), hairMat)
    fade.position.set(0, 1.84, -0.2)
    fade.rotation.x = 0.2
    this.visual.add(fade)

    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.085, 0.055), darkMat)
    glasses.position.set(0, 1.925, 0.195)
    glasses.rotation.x = -0.08
    this.visual.add(glasses)
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.012), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent) }))
    lens.position.set(0, 1.928, 0.224)
    this.visual.add(lens)

    const armGeo = new THREE.CylinderGeometry(0.085, 0.075, 0.58, 8)
    const handGeo = new THREE.SphereGeometry(0.085, 8, 6)
    const makeArm = (side) => {
      const pivot = new THREE.Group()
      pivot.position.set(side * 0.41, 1.55, 0)
      const upper = new THREE.Mesh(armGeo, jacketMat)
      upper.position.y = -0.29
      upper.castShadow = true
      pivot.add(upper)
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.062, 0.42, 8), jacketMat)
      lower.position.y = -0.71
      lower.rotation.z = side * -0.05
      pivot.add(lower)
      const hand = new THREE.Mesh(handGeo, skinMat)
      hand.position.y = -0.95
      pivot.add(hand)
      this.visual.add(pivot)
      return pivot
    }
    this.parts.armL = makeArm(-1)
    this.parts.armR = makeArm(1)

    const legGeo = new THREE.CylinderGeometry(0.115, 0.095, 0.82, 8)
    const shoeGeo = new RoundedBoxGeometry(0.21, 0.13, 0.42, 2, 0.05)
    const makeLeg = (side) => {
      const pivot = new THREE.Group()
      pivot.position.set(side * 0.17, 0.87, 0)
      const leg = new THREE.Mesh(legGeo, pantsMat)
      leg.position.y = -0.41
      leg.castShadow = true
      pivot.add(leg)
      const shoe = new THREE.Mesh(shoeGeo, shoeMat)
      shoe.position.set(0, -0.83, 0.08)
      pivot.add(shoe)
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.43), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent) }))
      sole.position.set(0, -0.895, 0.08)
      pivot.add(sole)
      this.visual.add(pivot)
      return pivot
    }
    this.parts.legL = makeLeg(-1)
    this.parts.legR = makeLeg(1)

    if (!this.isPlayer) {
      const bag = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.46, 0.16, 2, 0.06), darkMat)
      bag.position.set(0, 1.28, -0.26)
      bag.rotation.x = -0.08
      this.visual.add(bag)
    }

    this.weapon = this.buildWeapon()
    this.weapon.visible = false
    this.visual.add(this.weapon)
  }

  buildWeapon() {
    const group = new THREE.Group()
    const metal = new THREE.MeshStandardMaterial({ color: 0x12141c, roughness: 0.3, metalness: 0.85 })
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x1c1b22, roughness: 0.68, metalness: 0.3 })
    const slide = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.1, 0.42, 2, 0.018), metal)
    slide.position.set(0, 0.02, 0.1)
    group.add(slide)
    const grip = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.24, 0.12, 2, 0.02), gripMat)
    grip.position.set(0, -0.13, -0.04)
    grip.rotation.x = -0.2
    group.add(grip)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 6), metal)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.025, 0.31)
    group.add(barrel)
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.025, 0.035), new THREE.MeshBasicMaterial({ color: 0x41f4ff }))
    sight.position.set(0, 0.079, 0.06)
    group.add(sight)
    group.position.set(0.31, 1.23, 0.33)
    group.rotation.x = 0.02
    group.rotation.y = -0.08
    group.userData.muzzle = new THREE.Vector3(0, 0.025, 0.38)
    return group
  }

  setArmed(value) {
    this.armed = value
    this.weapon.visible = value
  }

  setVisible(value) {
    this.group.visible = value
  }

  update(dt, speed = 0, sprint = false, override = null) {
    this.speed = speed
    const moving = speed > 0.22
    this.animTime += dt * (moving ? 4.2 + Math.min(speed, 10) * 0.85 : 1.8)
    const swing = moving ? Math.sin(this.animTime) * Math.min(0.78, 0.22 + speed * 0.085) : 0
    const bob = moving ? Math.abs(Math.sin(this.animTime)) * 0.035 * Math.min(1, speed / 4) : Math.sin(this.animTime * 0.7) * 0.005

    if (override) {
      this.parts.legL.rotation.x = override
      this.parts.legR.rotation.x = -override
      this.parts.armL.rotation.x = -override * 0.7
    } else {
      this.parts.legL.rotation.x = swing
      this.parts.legR.rotation.x = -swing
      this.parts.armL.rotation.x = -swing * 0.75
    }
    if (this.armed) {
      this.parts.armR.rotation.x = -1.18 + (moving ? Math.sin(this.animTime) * 0.035 : 0)
      this.parts.armR.rotation.z = -0.18
      this.parts.armL.rotation.x = -0.4 - swing * 0.3
    } else {
      this.parts.armR.rotation.x = swing * 0.75
      this.parts.armR.rotation.z = 0
    }
    this.visual.position.y = bob
    this.parts.torso.rotation.x = moving && sprint ? 0.12 : 0
    this.parts.torso.rotation.z = moving ? Math.sin(this.animTime * 0.5) * 0.02 : 0
    this.parts.head.rotation.y = moving ? Math.sin(this.animTime * 0.32) * 0.05 : Math.sin(this.animTime * 0.22) * 0.04
    this.weapon.position.y = 1.23 + bob
  }

  muzzleWorld(target = new THREE.Vector3()) {
    return this.weapon.localToWorld(target.copy(this.weapon.userData.muzzle))
  }

  dispose(scene) {
    scene.remove(this.group)
    this.group.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) {
        if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose())
        else object.material.dispose()
      }
    })
  }
}
