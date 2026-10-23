import * as THREE from 'three'
import { Character } from './character.js'
import { rand, pick, damp } from './utils.js'

const ACCENTS = ['#41f4ff', '#ff2f8e', '#ffb84d', '#8d6bff', '#55ffa8']
const NAMES = ['ECHO', 'WRAITH', 'DEPUTY', 'KITE', 'ONYX', 'HALO', 'ZERO', 'MOTH']

export class Network {
  constructor(scene, player) {
    this.scene = scene
    this.player = player
    this.id = `p-${Math.random().toString(36).slice(2, 9)}`
    this.name = `${pick(NAMES)}-${Math.floor(rand(10, 99))}`
    this.accent = pick(ACCENTS)
    this.peers = new Map()
    this.enabled = typeof BroadcastChannel !== 'undefined'
    this.lastSend = 0
    if (!this.enabled) return
    this.channel = new BroadcastChannel('mirage-city-online-v1')
    this.channel.onmessage = (event) => this.onMessage(event.data)
    window.addEventListener('beforeunload', () => this.channel.postMessage({ type: 'leave', id: this.id }))
  }

  onMessage(message) {
    if (!message || message.id === this.id) return
    if (message.type === 'leave') {
      this.remove(message.id)
      return
    }
    if (message.type !== 'state') return
    let peer = this.peers.get(message.id)
    if (!peer) {
      const character = new Character({
        name: message.name,
        accent: message.accent,
        jacket: 0x1a2232,
        showName: true
      })
      character.group.position.set(message.x, 0.18, message.z)
      character.group.rotation.y = message.yaw
      this.scene.add(character.group)
      peer = {
        id: message.id,
        name: message.name,
        accent: message.accent,
        character,
        position: new THREE.Vector3(message.x, 0.18, message.z),
        target: new THREE.Vector3(message.x, 0.18, message.z),
        yaw: message.yaw,
        lastSeen: performance.now(),
        walking: false,
        speed: 0
      }
      this.peers.set(message.id, peer)
    }
    peer.target.set(message.x, 0.18, message.z)
    peer.yaw = message.yaw
    peer.speed = message.speed
    peer.walking = message.speed > 0.4
    peer.lastSeen = performance.now()
  }

  remove(id) {
    const peer = this.peers.get(id)
    if (!peer) return
    peer.character.dispose(this.scene)
    this.peers.delete(id)
  }

  update(dt, force = false) {
    if (!this.enabled) return
    const now = performance.now()
    if (force || now - this.lastSend > 100) {
      this.lastSend = now
      const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z)
      this.channel.postMessage({
        type: 'state',
        id: this.id,
        name: this.name,
        accent: this.accent,
        x: this.player.position.x,
        z: this.player.position.z,
        yaw: this.player.facing,
        speed
      })
    }
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > 4000) {
        this.remove(id)
        continue
      }
      peer.position.x = damp(peer.position.x, peer.target.x, 12, dt)
      peer.position.z = damp(peer.position.z, peer.target.z, 12, dt)
      peer.character.group.position.copy(peer.position)
      peer.character.group.rotation.y = damp(peer.character.group.rotation.y, peer.yaw, 10, dt)
      peer.character.update(dt, peer.walking ? peer.speed : 0, false)
    }
  }

  get count() {
    return this.peers.size
  }

  get positions() {
    return [...this.peers.values()].map((peer) => ({ position: peer.position, accent: peer.accent }))
  }
}
