import * as THREE from 'three'

export const TAU = Math.PI * 2

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt))
export const rand = (min = 0, max = 1) => min + Math.random() * (max - min)
export const randInt = (min, max) => Math.floor(rand(min, max + 1))
export const pick = (array) => array[Math.floor(Math.random() * array.length)]
export const distance2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI
  return a + d * t
}

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export function canvasTexture(canvas, { repeat = false, srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas)
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
  }
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function textTexture(text, {
  width = 1024,
  height = 256,
  color = '#ffffff',
  background = 'transparent',
  font = '700 120px "Bebas Neue", sans-serif',
  align = 'center',
  glow = '',
  letterSpacing = 0,
  padding = 22
} = {}) {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (background !== 'transparent') {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.font = font
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.letterSpacing = `${letterSpacing}px`
  if (glow) {
    ctx.shadowColor = glow
    ctx.shadowBlur = 26
  }
  ctx.fillStyle = color
  const x = align === 'left' ? padding : align === 'right' ? width - padding : width / 2
  ctx.fillText(text, x, height / 2)
  return canvasTexture(canvas)
}

export function roundedCanvasTexture(width, height, draw) {
  const canvas = makeCanvas(width, height)
  draw(canvas.getContext('2d'), width, height)
  return canvasTexture(canvas)
}

export function makeNameplate(text, color = '#ffffff', accent = '#54f2ff') {
  const canvas = makeCanvas(512, 128)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(5, 7, 20, 0.66)'
  ctx.beginPath()
  ctx.roundRect(18, 22, 476, 84, 18)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = accent
  ctx.fillRect(38, 48, 6, 32)
  ctx.font = '700 42px "Space Grotesk", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, 62, 66)
  const texture = canvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(3.4, 0.85, 1)
  return sprite
}

export function blobShadow(radius = 0.8, opacity = 0.5) {
  const canvas = makeCanvas(128, 128)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  gradient.addColorStop(0, `rgba(0,0,0,${opacity})`)
  gradient.addColorStop(0.55, `rgba(0,0,0,${opacity * 0.55})`)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  const material = new THREE.MeshBasicMaterial({
    map: canvasTexture(canvas, { srgb: false }),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.035
  mesh.renderOrder = 2
  return mesh
}
