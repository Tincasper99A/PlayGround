import './style.css'
import { Game } from './game/game.js'

const boot = document.getElementById('boot')
const errorPanel = document.getElementById('webgl-error')
const canvas = document.getElementById('game')

function showError(message) {
  boot?.classList.add('done')
  errorPanel?.classList.remove('hidden')
  if (message) console.error(message)
}

function hasWebGL() {
  try {
    const probe = document.createElement('canvas')
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'))
  } catch {
    return false
  }
}

function finishBoot() {
  let frames = 0
  const settle = () => {
    frames++
    if (frames < 3) {
      requestAnimationFrame(settle)
      return
    }
    boot?.classList.add('done')
    setTimeout(() => boot?.remove(), 900)
  }
  requestAnimationFrame(settle)
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

if (!hasWebGL()) {
  showError('WebGL is not available in this browser context.')
} else {
  try {
    const game = new Game(canvas)
    finishBoot()
    game.requestWakeLock()
    if (new URLSearchParams(window.location.search).get('play') === '1') {
      setTimeout(() => game.start(), 280)
    }
    if (import.meta.env.PROD) registerServiceWorker()
    document.addEventListener('pointerdown', () => {
      document.documentElement.classList.add('touched')
    }, { once: true, passive: true })
  } catch (error) {
    showError(error)
  }
}
