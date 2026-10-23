import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const errors = []
const required = [
  'index.html',
  'public/manifest.json',
  'public/sw.js',
  'public/icons/icon.svg',
  'public/icons/icon-180.png',
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/fonts/bebas-neue.woff2',
  'public/fonts/space-grotesk.woff2',
  'src/main.js',
  'src/style.css',
  'src/game/game.js',
  'src/game/world.js',
  'src/game/player.js',
  'src/game/character.js',
  'src/game/vehicle.js',
  'src/game/traffic.js',
  'src/game/pedestrians.js',
  'src/game/input.js',
  'src/game/hud.js',
  'src/game/missions.js',
  'src/game/network.js',
  'src/game/effects.js',
  'src/game/audio.js',
  'src/game/utils.js',
  'dist/index.html'
]

for (const file of required) {
  if (!existsSync(join(root, file))) errors.push(`Missing ${file}`)
}

function pngSize(file) {
  const data = readFileSync(join(root, file))
  if (data.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`)
  return [data.readUInt32BE(16), data.readUInt32BE(20)]
}

if (existsSync(join(root, 'public/manifest.json'))) {
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'))
  if (manifest.name !== 'MIRAGE CITY ONLINE') errors.push('Unexpected manifest name')
  if (manifest.display !== 'standalone') errors.push('Manifest must use standalone display')
  if (!manifest.icons?.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')) {
    errors.push('Manifest is missing a 512x512 maskable icon')
  }
  for (const icon of manifest.icons ?? []) {
    if (icon.src.endsWith('.png') && existsSync(join(root, 'public', icon.src))) {
      const [width, height] = pngSize(join('public', icon.src))
      if (icon.sizes !== `${width}x${height}`) errors.push(`Icon size mismatch for ${icon.src}`)
    }
  }
}

for (const file of ['icon-180.png', 'icon-192.png', 'icon-512.png']) {
  const path = `public/icons/${file}`
  if (!existsSync(join(root, path))) continue
  const [width, height] = pngSize(path)
  const expected = Number(file.match(/\d+/)[0])
  if (width !== expected || height !== expected) errors.push(`${file} should be ${expected}x${expected}`)
}

if (existsSync(join(root, 'index.html'))) {
  const html = readFileSync(join(root, 'index.html'), 'utf8')
  for (const needle of ['id="game"', 'id="play-button"', 'aria-label="Play"', '/src/main.js', '/manifest.json']) {
    if (!html.includes(needle)) errors.push(`index.html is missing ${needle}`)
  }
}

const modules = [
  'game.js',
  'world.js',
  'player.js',
  'character.js',
  'vehicle.js',
  'traffic.js',
  'pedestrians.js',
  'input.js',
  'hud.js',
  'missions.js',
  'network.js',
  'effects.js',
  'audio.js',
  'utils.js'
]

for (const module of modules) {
  try {
    await import(pathToFileURL(join(root, 'src/game', module)).href)
  } catch (error) {
    errors.push(`Failed to import ${module}: ${error.message}`)
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'))
  process.exit(1)
}

console.log(`Verified ${required.length} files and ${modules.length} game modules.`)
