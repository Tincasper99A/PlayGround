import { clamp, TAU } from './utils.js'

const ROAD_COORDS = [-224, -168, -112, -56, 0, 56, 112, 168, 224]
const ROAD_WIDTH = 12

function formatCash(value) {
  return `$${Math.floor(value).toLocaleString('en-US')}`
}

export class HUD {
  constructor() {
    this.root = document.getElementById('hud')
    this.minimap = document.getElementById('minimap')
    this.mapCtx = this.minimap.getContext('2d')
    this.cash = document.getElementById('hud-cash')
    this.ammo = document.getElementById('hud-ammo')
    this.reserve = document.getElementById('hud-reserve')
    this.weapon = document.getElementById('weapon-name')
    this.healthFill = document.getElementById('health-fill')
    this.armorFill = document.getElementById('armor-fill')
    this.healthText = document.getElementById('health-value')
    this.armorText = document.getElementById('armor-value')
    this.wantedWrap = document.getElementById('wanted')
    this.wantedStars = [...document.querySelectorAll('#wanted .star')]
    this.starsBox = document.getElementById('wanted-stars')
    this.onlineCount = document.getElementById('online-count')
    this.mission = document.getElementById('mission')
    this.missionTitle = document.getElementById('mission-title')
    this.missionObjective = document.getElementById('mission-objective')
    this.missionTimer = document.getElementById('mission-timer')
    this.missionDistance = document.getElementById('mission-distance')
    this.prompt = document.getElementById('interaction')
    this.promptKey = document.getElementById('interaction-key')
    this.promptText = document.getElementById('interaction-text')
    this.feed = document.getElementById('feed')
    this.speedo = document.getElementById('speedo')
    this.speedValue = document.getElementById('speed-value')
    this.speedGear = document.getElementById('speed-gear')
    this.actionButton = document.getElementById('btn-action')
    this.actionLabel = document.getElementById('action-label')
    this.fireButton = document.getElementById('btn-fire')
    this.jumpButton = document.getElementById('btn-jump')
    this.reloadButton = document.getElementById('btn-reload')
    this.location = document.getElementById('location-title')
    this.session = document.getElementById('hud-session')
    this.clock = document.getElementById('hud-clock')
    this.crosshair = document.getElementById('crosshair')
    this.lastMap = 0
    this.lastMinimapUpdate = 0
    this.cache = {}
    this.mapSize = 190
    this.resizeMinimap()
    window.addEventListener('resize', () => this.resizeMinimap())
    this.setCash(0)
  }

  resizeMinimap() {
    const rect = this.minimap.getBoundingClientRect()
    const size = Math.max(140, Math.round(rect.width || this.mapSize))
    this.mapSize = size
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.minimap.width = size * dpr
    this.minimap.height = size * dpr
    this.mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  show() {
    this.root.classList.remove('hidden')
    this.root.setAttribute('aria-hidden', 'false')
  }

  hide() {
    this.root.classList.add('hidden')
    this.root.setAttribute('aria-hidden', 'true')
  }

  setText(element, value) {
    if (!element) return
    if (element.textContent !== value) element.textContent = value
  }

  setCash(value) {
    const text = formatCash(value)
    if (this.cache.cash !== text) {
      this.cache.cash = text
      this.cash.textContent = text
      this.cash.classList.remove('bump')
      void this.cash.offsetWidth
      this.cash.classList.add('bump')
    }
  }

  setOnline(value) {
    this.setText(this.onlineCount, String(value))
    this.setText(this.session, `${value} ONLINE`)
  }

  setVehicle(active) {
    if (this.cache.vehicle === active) return
    this.cache.vehicle = active
    this.root.classList.toggle('in-car', active)
    this.speedo.classList.toggle('visible', active)
    this.crosshair.classList.toggle('hidden', active)
    if (this.jumpButton) this.jumpButton.classList.toggle('disabled', active)
    if (this.reloadButton) this.reloadButton.classList.toggle('disabled', active)
    this.setText(this.weapon, active ? 'VEHICLE' : 'VELOCITY 9')
  }

  setAction(label, visible = true) {
    if (this.cache.action !== label) {
      this.cache.action = label
      this.setText(this.actionLabel, label)
    }
    if (this.actionButton) this.actionButton.classList.toggle('available', visible)
  }

  setPrompt(key, text, visible = true) {
    if (this.cache.prompt === `${key}:${text}:${visible}`) return
    this.cache.prompt = `${key}:${text}:${visible}`
    this.prompt.classList.toggle('visible', visible)
    this.setText(this.promptKey, key)
    this.setText(this.promptText, text)
  }

  setWeapon(ammo, reserve, reloading) {
    if (this.cache.ammo !== ammo) {
      this.cache.ammo = ammo
      this.setText(this.ammo, String(ammo).padStart(2, '0'))
    }
    if (this.cache.reserve !== reserve) {
      this.cache.reserve = reserve
      this.setText(this.reserve, String(reserve))
    }
    if (this.cache.reloading !== reloading) {
      this.cache.reloading = reloading
      this.weapon.textContent = reloading ? 'RELOADING' : 'VELOCITY 9'
      this.weapon.classList.toggle('reloading', reloading)
    }
  }

  setVitals(health, armor, maxHealth = 100, maxArmor = 100) {
    const hp = clamp(health / maxHealth, 0, 1)
    const ap = clamp(armor / maxArmor, 0, 1)
    if (this.cache.health !== Math.round(health)) {
      this.cache.health = Math.round(health)
      this.healthFill.style.width = `${hp * 100}%`
      this.setText(this.healthText, String(Math.round(health)))
    }
    if (this.cache.armor !== Math.round(armor)) {
      this.cache.armor = Math.round(armor)
      this.armorFill.style.width = `${ap * 100}%`
      this.setText(this.armorText, String(Math.round(armor)))
    }
  }

  setWanted(level) {
    if (this.cache.wanted === level) return
    this.cache.wanted = level
    this.wantedWrap.classList.toggle('active', level > 0)
    this.starsBox.classList.toggle('active', level > 0)
    this.wantedStars.forEach((star, index) => star.classList.toggle('lit', index < level))
    if (level > 0) {
      this.wantedWrap.classList.remove('pulse')
      void this.wantedWrap.offsetWidth
      this.wantedWrap.classList.add('pulse')
    }
  }

  setMission(mission) {
    if (!mission) {
      this.mission.classList.remove('visible')
      this.cache.mission = null
      return
    }
    this.mission.classList.add('visible')
    const title = mission.title ?? 'NIGHT SHIFT'
    const objective = mission.objective ?? ''
    const timer = mission.timer !== null && mission.timer !== undefined ? this.formatTimer(mission.timer) : ''
    const distance = mission.distance !== null && mission.distance !== undefined ? `${Math.round(mission.distance)} M` : ''
    if (this.cache.missionTitle !== title) {
      this.cache.missionTitle = title
      this.setText(this.missionTitle, title)
    }
    if (this.cache.objective !== objective) {
      this.cache.objective = objective
      this.setText(this.missionObjective, objective)
    }
    if (this.cache.timerText !== timer) {
      this.cache.timerText = timer
      this.setText(this.missionTimer, timer)
      this.missionTimer.classList.toggle('urgent', Boolean(mission.timer !== null && mission.timer < 30))
    }
    if (this.cache.distance !== distance) {
      this.cache.distance = distance
      this.setText(this.missionDistance, distance)
    }
  }

  formatTimer(seconds) {
    const value = Math.max(0, Math.ceil(seconds))
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
  }

  setSpeed(speed) {
    const kmh = Math.round(Math.abs(speed) * 3.6)
    if (this.cache.speed !== kmh) {
      this.cache.speed = kmh
      this.setText(this.speedValue, String(kmh).padStart(3, '0'))
      this.speedGear.textContent = speed < -0.5 ? 'R' : speed > 0.5 ? 'D' : 'N'
    }
  }

  setClock(t) {
    const totalMinutes = Math.floor((23 * 60 + 47 + t * 2.6) % (24 * 60))
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const minutes = String(totalMinutes % 60).padStart(2, '0')
    const text = `${hours}:${minutes}`
    if (this.cache.clock !== text) {
      this.cache.clock = text
      this.setText(this.clock, text)
    }
  }

  setLocation(title, subtitle = '') {
    if (this.cache.location === title) return
    this.cache.location = title
    this.location.innerHTML = `<span>${title}</span>${subtitle ? `<small>${subtitle}</small>` : ''}`
    this.location.classList.remove('show')
    void this.location.offsetWidth
    this.location.classList.add('show')
  }

  toast(title, message = '', type = 'info', duration = 4200) {
    const item = document.createElement('div')
    item.className = `toast toast-${type}`
    item.innerHTML = `<div class="toast-mark"></div><div><strong>${title}</strong>${message ? `<p>${message}</p>` : ''}</div>`
    this.feed.appendChild(item)
    while (this.feed.children.length > 4) this.feed.firstElementChild.remove()
    requestAnimationFrame(() => item.classList.add('show'))
    setTimeout(() => {
      item.classList.remove('show')
      setTimeout(() => item.remove(), 400)
    }, duration)
  }

  chat(name, text, accent = '#41f4ff') {
    const row = document.createElement('div')
    row.className = 'chat-row'
    row.innerHTML = `<span class="chat-dot" style="--accent:${accent}"></span><strong>${name}</strong><span>${text}</span>`
    const eventFeed = document.getElementById('event-feed')
    eventFeed.appendChild(row)
    while (eventFeed.children.length > 4) eventFeed.firstElementChild.remove()
    requestAnimationFrame(() => row.classList.add('show'))
    setTimeout(() => {
      row.classList.remove('show')
      setTimeout(() => row.remove(), 400)
    }, 6500)
  }

  showDeath() {
    document.getElementById('death').classList.add('visible')
  }

  hideDeath() {
    document.getElementById('death').classList.remove('visible')
  }

  flashDamage() {
    document.body.classList.remove('damage-flash')
    void document.body.offsetWidth
    document.body.classList.add('damage-flash')
  }

  hitMarker(kill = false) {
    const marker = document.getElementById('hitmarker')
    if (!marker) return
    marker.classList.remove('show', 'kill')
    void marker.offsetWidth
    marker.classList.add('show')
    if (kill) marker.classList.add('kill')
    setTimeout(() => marker.classList.remove('show', 'kill'), 180)
  }

  pulseCrosshair() {
    if (!this.crosshair) return
    this.crosshair.classList.remove('pulse')
    void this.crosshair.offsetWidth
    this.crosshair.classList.add('pulse')
  }

  drawMinimap(data) {
    const now = performance.now()
    if (now - this.lastMinimapUpdate < 60) return
    this.lastMinimapUpdate = now
    const ctx = this.mapCtx
    const size = this.mapSize
    const center = size / 2
    const range = 105
    const scale = center / range
    const player = data.player
    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.beginPath()
    ctx.arc(center, center, center - 1, 0, TAU)
    ctx.clip()
    const bg = ctx.createRadialGradient(center, center, 8, center, center, center)
    bg.addColorStop(0, '#101b28')
    bg.addColorStop(1, '#060b12')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = 'rgba(90,140,170,0.10)'
    ctx.lineWidth = 1
    for (let x = 0; x < size; x += 18) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, size)
      ctx.stroke()
    }
    for (let y = 0; y < size; y += 18) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(size, y)
      ctx.stroke()
    }
    const drawRoad = (coord, vertical) => {
      const offset = (coord - (vertical ? player.x : player.z)) * scale
      if (Math.abs(offset) > center + 12) return
      ctx.strokeStyle = 'rgba(57,82,104,0.95)'
      ctx.lineWidth = ROAD_WIDTH * scale
      ctx.beginPath()
      if (vertical) {
        ctx.moveTo(center + offset, 0)
        ctx.lineTo(center + offset, size)
      } else {
        ctx.moveTo(0, center + offset)
        ctx.lineTo(size, center + offset)
      }
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,198,120,0.18)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    for (const coord of ROAD_COORDS) {
      drawRoad(coord, true)
      drawRoad(coord, false)
    }
    const drawDot = (position, color, radius = 2.4, alpha = 1) => {
      const x = center + (position.x - player.x) * scale
      const y = center + (position.z - player.z) * scale
      if (Math.hypot(x - center, y - center) > center - 4) return
      ctx.globalAlpha = alpha
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    for (const car of data.traffic ?? []) drawDot(car.position, car.type === 'police' ? '#ff3d64' : '#b9c6d6', 2.2, 0.75)
    for (const ped of data.bots ?? []) drawDot(ped.position, ped.accent, 2.1, 0.86)
    if (data.copPositions) {
      for (const pos of data.copPositions) drawDot(pos, '#ff3d64', 3, 1)
    }
    if (data.mission) {
      const x = center + (data.mission.position.x - player.x) * scale
      const y = center + (data.mission.position.z - player.z) * scale
      const edge = Math.hypot(x - center, y - center) > center - 10
      if (edge) {
        const angle = Math.atan2(y - center, x - center)
        const px = center + Math.cos(angle) * (center - 10)
        const py = center + Math.sin(angle) * (center - 10)
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(angle + Math.PI / 2)
        ctx.fillStyle = '#ffcf5c'
        ctx.beginPath()
        ctx.moveTo(0, -7)
        ctx.lineTo(6, 6)
        ctx.lineTo(-6, 6)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      } else {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = '#ffcf5c'
        ctx.shadowColor = '#ffb547'
        ctx.shadowBlur = 10
        ctx.fillRect(-4.5, -4.5, 9, 9)
        ctx.restore()
      }
    }
    ctx.save()
    ctx.translate(center, center)
    ctx.rotate(Math.PI - player.facing)
    ctx.fillStyle = '#7afaff'
    ctx.shadowColor = '#41f4ff'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.moveTo(0, -8)
    ctx.lineTo(6.4, 7)
    ctx.lineTo(0, 3.6)
    ctx.lineTo(-6.4, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.restore()
    ctx.strokeStyle = 'rgba(105,240,255,0.45)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(center, center, center - 2, 0, TAU)
    ctx.stroke()
    const compass = [[0, 'N'], [center * 2, 'S']]
    ctx.font = '600 8px "Space Grotesk", sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.textAlign = 'center'
    ctx.fillText('N', center, 10)
    ctx.fillText('S', center, size - 5)
    ctx.fillText('W', 8, center + 3)
    ctx.fillText('E', size - 8, center + 3)
  }
}
