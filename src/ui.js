import { clamp, formatMoney, formatTime, makeCanvas, roundRect } from './utils.js';
import { CITY } from './world.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), menu: $('menu'), promo: $('promo'),
      health: $('health-fill'), armor: $('armor-fill'), xp: $('xp-fill'),
      cash: $('hud-cash'), level: $('hud-level'), name: $('hud-name'),
      missionText: $('mission-text'), missionTimer: $('mission-timer'),
      objTitle: $('obj-title'), objSub: $('obj-sub'), objDist: $('obj-dist'), objIcon: $('obj-icon'),
      wanted: $('wanted'), onlineCount: $('online-count'),
      speedo: $('speedo'), speedNum: $('speed-num'), gear: $('gear'), carName: $('car-name'),
      prompt: $('prompt'), promptKey: $('prompt-key'), promptText: $('prompt-text'),
      toast: $('toast'), bigmsg: $('bigmsg'), chat: $('chat'),
      minimap: $('minimap'), clock: $('clock'), menuPlayers: $('menu-players'),
      btnActionLabel: $('btn-action-label'), btnAction: $('btn-action'),
      speedlines: $('speedlines'),
    };
    this.ctx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.bigTimer = null;
    this.lastHud = {};
    this.installPrompt = null;
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this._bindInstall();
    this._clockTimer = setInterval(() => this._tickClock(), 1000);
    this._tickClock();
    this.setOnline(Math.floor(20 + Math.random() * 12));
  }

  _bindInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e;
      $('install-banner').classList.remove('hidden');
    });
    $('btn-install-banner')?.addEventListener('click', () => this.promptInstall());
    $('btn-install')?.addEventListener('click', () => this.promptInstall());
    $('btn-install-dismiss')?.addEventListener('click', () => $('install-banner').classList.add('hidden'));
    $('install-hint')?.addEventListener('click', () => this.showInstallHelp());
    for (const b of document.querySelectorAll('[data-close]')) {
      b.addEventListener('click', () => this.closeModals());
    }
  }

  async promptInstall() {
    if (this.installPrompt) {
      this.installPrompt.prompt();
      const choice = await this.installPrompt.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') this.toast('Installing Neon District…', 'gold');
      this.installPrompt = null;
      $('install-banner').classList.add('hidden');
    } else {
      this.showInstallHelp();
    }
  }

  showInstallHelp() {
    const copy = $('install-help-copy');
    if (this.isIOS) copy.textContent = 'Open this page in Safari, tap the Share button, then choose “Add to Home Screen”. Neon District will launch fullscreen with no browser bars.';
    else copy.textContent = 'Open your browser menu and choose “Install app” or “Add to Home screen”. On Android Chrome, neon District installs as a fullscreen app and works offline.';
    $('install-help').classList.remove('hidden');
  }

  _tickClock() {
    const now = new Date();
    this.el.clock.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.el.menuPlayers.textContent = (24000 + Math.floor(Math.random() * 900)).toLocaleString('en-US');
  }

  hidden(el, v) { el.classList.toggle('hidden', v); }

  showMenu(on) {
    this.el.menu.classList.toggle('hidden', !on);
    document.body.classList.toggle('menu-open', on);
  }

  showHUD(on) {
    this.el.hud.classList.toggle('hidden', !on);
    document.body.classList.toggle('playing', on);
  }

  showPanel(id, on) {
    const el = $(id);
    if (el) el.classList.toggle('hidden', !on);
    if (on) this.el.menu.classList.add('hidden');
  }

  closeModals() {
    for (const id of ['panel-online', 'panel-garage', 'panel-settings', 'panel-controls', 'install-help']) {
      $(id)?.classList.add('hidden');
    }
  }

  setPause(on) { $('pause').classList.toggle('hidden', !on); }

  setProfile({ name, level, cash, health, armor, xp }) {
    if (name !== undefined) this.el.name.textContent = name;
    if (level !== undefined) this.el.level.textContent = `LV ${level}`;
    if (cash !== undefined) this.el.cash.textContent = formatMoney(cash);
    if (health !== undefined) this.el.health.style.width = `${clamp(health, 0, 100)}%`;
    if (armor !== undefined) this.el.armor.style.width = `${clamp(armor, 0, 100)}%`;
    if (xp !== undefined) this.el.xp.style.width = `${clamp(xp, 0, 100)}%`;
  }

  setMission(text, time = null) {
    if (text !== this.lastHud.mission) {
      this.el.missionText.textContent = text;
      this.lastHud.mission = text;
    }
    if (time === null) {
      this.el.missionTimer.hidden = true;
    } else {
      this.el.missionTimer.hidden = false;
      this.el.missionTimer.textContent = formatTime(time);
    }
  }

  setObjective(title, sub, distance, icon = '◆') {
    if (title !== this.lastHud.objTitle) { this.el.objTitle.textContent = title; this.lastHud.objTitle = title; }
    if (sub !== this.lastHud.objSub) { this.el.objSub.textContent = sub; this.lastHud.objSub = sub; }
    if (distance !== this.lastHud.objDist) {
      this.el.objDist.textContent = distance == null ? '—' : (distance > 999 ? `${(distance / 1000).toFixed(1)}km` : `${Math.round(distance)}m`);
      this.lastHud.objDist = distance;
    }
    if (icon !== this.lastHud.objIcon) { this.el.objIcon.textContent = icon; this.lastHud.objIcon = icon; }
  }

  setWanted(heat) {
    const stars = this.el.wanted.children;
    for (let i = 0; i < stars.length; i++) stars[i].classList.toggle('on', i < heat);
    this.el.wanted.classList.toggle('on', heat > 0);
  }

  setSpeed(mph, gear, name) {
    this.el.speedNum.textContent = Math.round(mph);
    this.el.gear.textContent = gear;
    this.el.carName.textContent = name;
  }

  setDriving(on) {
    this.el.speedo.classList.toggle('hidden', !on);
    document.body.classList.toggle('driving', on);
    this.el.btnActionLabel.textContent = on ? 'EXIT' : 'ENTER';
  }

  setActionContext(text) {
    if (text) { this.el.btnActionLabel.textContent = text; this.el.btnAction.classList.add('alert'); }
    else { this.el.btnAction.classList.remove('alert'); }
  }

  setOnline(n) {
    this.el.onlineCount.textContent = n;
  }

  prompt(key, text) {
    this.el.prompt.classList.remove('hidden');
    this.el.promptKey.textContent = key;
    this.el.promptText.textContent = text;
  }
  hidePrompt() { this.el.prompt.classList.add('hidden'); }

  toast(text, tone = '') {
    const t = this.el.toast;
    t.textContent = text;
    t.className = `toast show ${tone}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  big(text, sub = '', duration = 2400) {
    const b = this.el.bigmsg;
    b.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    b.classList.add('show');
    clearTimeout(this.bigTimer);
    this.bigTimer = setTimeout(() => b.classList.remove('show'), duration);
  }

  chat(name, text, sys = false) {
    const line = document.createElement('div');
    line.className = `chat-line${sys ? ' sys' : ''}`;
    line.innerHTML = `<b>${name}</b> ${text}`;
    this.el.chat.appendChild(line);
    while (this.el.chat.children.length > 4) this.el.chat.removeChild(this.el.chat.firstChild);
    setTimeout(() => line.remove(), 12000);
  }

  buildLobby(sessions, selectedIndex, onSelect) {
    const wrap = $('lobby-list');
    wrap.innerHTML = '';
    const emojis = ['🌆', '🌉', '🏙️', '🌃', '🌇'];
    sessions.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = `lobby-row${i === selectedIndex ? ' active' : ''}`;
      row.innerHTML = `
        <div class="lr-map">${emojis[i % emojis.length]}</div>
        <div class="lr-main"><b>${s.name}</b><small>${s.mode} · ${s.weather} · ${s.region}</small></div>
        <div class="lr-players">${s.players}/${s.max}</div>
        <div class="lr-ping">${s.ping}ms</div>`;
      row.addEventListener('click', () => onSelect(i));
      wrap.appendChild(row);
    });
  }

  buildCrew() {
    const wrap = $('crew-members');
    const names = ['NOVA_9', 'GHOSTFOX', 'KIRA', 'M4VERICK', 'NYX'];
    wrap.innerHTML = '';
    names.forEach((n, i) => {
      const row = document.createElement('div');
      row.className = 'crew-row';
      row.innerHTML = `<span class="dot">${n.slice(0, 2)}</span><span>${n}</span><span>${['HOST', 'LV 41', 'LV 36', 'LV 28', 'LV 55'][i]}</span>`;
      wrap.appendChild(row);
    });
  }

  buildGarage(cars, selected, onSelect) {
    const wrap = $('garage-list');
    wrap.innerHTML = '';
    cars.forEach((car, i) => {
      const card = document.createElement('button');
      card.className = `car-card${i === selected ? ' active' : ''}`;
      card.innerHTML = `<span class="car-swatch" style="background:#${car.color.toString(16).padStart(6, '0')}"></span><b>${car.name}</b><small>${car.cls} · ${car.locked ? 'LOCKED' : 'READY'}</small>`;
      card.addEventListener('click', () => onSelect(i));
      wrap.appendChild(card);
    });
  }

  drawMinimap({ player, yaw, vehicles = [], peds = [], markers = [], heat = 0 }) {
    const ctx = this.ctx;
    const S = this.el.minimap.width;
    const cx = S / 2, cy = S / 2;
    const R = 100;
    const scale = (S / 2 - 8) / R;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#12141d';
    ctx.fillRect(0, 0, S, S);

    const px = player.pos.x, pz = player.pos.z;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(yaw + Math.PI);

    const blockPx = CITY.block * scale;
    // blocks
    for (const bx of CITY.blockCenters) {
      for (const bz of CITY.blockCenters) {
        const dx = (bx - px) * scale, dz = (bz - pz) * scale;
        if (Math.abs(dx) > S / 2 + blockPx || Math.abs(dz) > S / 2 + blockPx) continue;
        ctx.fillStyle = '#202430';
        ctx.fillRect(dx - blockPx / 2, dz - blockPx / 2, blockPx, blockPx);
        ctx.strokeStyle = 'rgba(120,130,160,.25)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(dx - blockPx / 2, dz - blockPx / 2, blockPx, blockPx);
      }
    }
    // roads lane hints
    ctx.strokeStyle = 'rgba(180,190,220,.12)';
    ctx.lineWidth = 2;
    for (const r of CITY.roadCoords) {
      const dx = (r - px) * scale, dz = (r - pz) * scale;
      ctx.beginPath(); ctx.moveTo(dx, -S); ctx.lineTo(dx, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-S, dz); ctx.lineTo(S, dz); ctx.stroke();
    }

    // vehicles
    for (const v of vehicles) {
      const dx = (v.pos.x - px) * scale, dz = (v.pos.z - pz) * scale;
      if (Math.hypot(dx, dz) > S / 2) continue;
      ctx.fillStyle = v.police ? (Math.sin(performance.now() / 120) > 0 ? '#ff3355' : '#4466ff') : 'rgba(235,240,255,.6)';
      ctx.beginPath(); ctx.arc(dx, dz, v.police ? 4.5 : 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // peds / online
    for (const p of peds) {
      const dx = (p.pos.x - px) * scale, dz = (p.pos.z - pz) * scale;
      if (Math.hypot(dx, dz) > S / 2) continue;
      ctx.fillStyle = p.online ? '#ffcc4d' : 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(dx, dz, p.online ? 3.2 : 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // markers
    for (const m of markers) {
      const dx = (m.x - px) * scale, dz = (m.z - pz) * scale;
      const dist = Math.hypot(dx, dz);
      let mx = dx, mz = dz;
      if (dist > S / 2 - 16) { mx = dx / dist * (S / 2 - 16); mz = dz / dist * (S / 2 - 16); }
      ctx.save();
      ctx.translate(mx, mz);
      ctx.rotate(-(yaw + Math.PI));
      ctx.fillStyle = m.color || '#ffcc4d';
      ctx.shadowColor = m.color || '#ffcc4d';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(7, 0); ctx.lineTo(0, 7); ctx.lineTo(-7, 0); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // heading cone
    ctx.save();
    ctx.translate(cx, cy);
    const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, 54);
    grad.addColorStop(0, 'rgba(47,243,255,.35)');
    grad.addColorStop(1, 'rgba(47,243,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 54, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    ctx.closePath();
    ctx.fill();
    // player arrow
    ctx.fillStyle = '#eafcff';
    ctx.shadowColor = '#2ff3ff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, -15); ctx.lineTo(10, 10); ctx.lineTo(0, 5); ctx.lineTo(-10, 10); ctx.closePath();
    ctx.fill();
    ctx.restore();

    // outer ring tick
    ctx.strokeStyle = 'rgba(47,243,255,.18)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (S / 2 - 6), cy + Math.sin(a) * (S / 2 - 6));
      ctx.lineTo(cx + Math.cos(a) * (S / 2 - 11), cy + Math.sin(a) * (S / 2 - 11));
      ctx.stroke();
    }
    ctx.restore();
  }

  updateBoost(on) {
    document.body.classList.toggle('boosting', on);
  }
}

export function drawGaragePreview(canvas, makeCar, colors, selected) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * .5, h * .25, 10, w * .5, h * .5, w * .8);
  g.addColorStop(0, '#242b44');
  g.addColorStop(1, '#07080f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(47,243,255,.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    ctx.beginPath(); ctx.moveTo(0, h - i * 14); ctx.lineTo(w, h - i * 14 - 60); ctx.stroke();
  }
  ctx.save();
  ctx.translate(w / 2, h * 0.62);
  ctx.rotate(-0.12);
  const color = `#${(colors[selected] ?? 0xff2d75).toString(16).padStart(6, '0')}`;
  const cw = w * 0.62, ch = h * 0.22;
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.beginPath(); ctx.ellipse(0, ch * 1.1, cw * 0.56, 18, 0, 0, Math.PI * 2); ctx.fill();
  const grad = ctx.createLinearGradient(0, -ch, 0, ch);
  grad.addColorStop(0, '#ffffff42');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, '#08080e');
  ctx.fillStyle = grad;
  roundRect(ctx, -cw / 2, -ch * 0.5, cw, ch, 24);
  ctx.fill();
  ctx.fillStyle = '#0a1018';
  roundRect(ctx, -cw * 0.26, -ch * 1.02, cw * 0.52, ch * 0.72, 16);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,210,255,.5)';
  roundRect(ctx, -cw * 0.23, -ch * 0.96, cw * 0.46, ch * 0.55, 12);
  ctx.fill();
  ctx.fillStyle = '#0c0e14';
  for (const sx of [-cw * 0.32, cw * 0.32]) {
    ctx.beginPath(); ctx.arc(sx, ch * 0.38, ch * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8b94a5'; ctx.beginPath(); ctx.arc(sx, ch * 0.38, ch * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0c0e14';
  }
  ctx.fillStyle = '#ffe9b8';
  ctx.shadowColor = '#ffe9b8'; ctx.shadowBlur = 14;
  ctx.fillRect(cw * 0.22, ch * 0.1, cw * 0.12, 4);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff3355';
  ctx.fillRect(-cw * 0.34, ch * 0.1, cw * 0.1, 4);
  ctx.restore();
  if (makeCar) makeCar();
}
