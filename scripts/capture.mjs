import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const [url, output] = process.argv.slice(2)
if (!url || !output) {
  console.error('Usage: capture.mjs <url> <output-directory>')
  process.exit(1)
}
try {
  new URL(url)
} catch {
  console.error(`CAPTURE_URL is not an absolute URL: ${url}`)
  process.exit(1)
}
mkdirSync(output, { recursive: true })
const project = process.env.PROJECT_DIR ? resolve(process.env.PROJECT_DIR) : ''
const outputRoot = resolve(output)
if (project && (outputRoot === project || outputRoot.startsWith(project + sep))) {
  console.error('CAPTURE_DIR must be outside the project source directory.')
  process.exit(1)
}

const runtime = join(process.env.HOME, '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')
const config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
if (process.platform === 'linux' && !process.env.DISPLAY) {
  process.env.DISPLAY = ':' + readFileSync(join(runtime, 'display'), 'utf8').trim()
}

const step = async (label, action) => {
  const start = performance.now()
  try {
    return await action()
  } finally {
    console.log(`[capture] ${label}: ${(performance.now() - start).toFixed(0)}ms`)
  }
}
const transient = error => {
  error.exitCode = 75
  return error
}
const verifyPng = async (name, expectedWidth, expectedHeight) => {
  const path = join(output, name)
  const bytes = readFileSync(path)
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw Object.assign(new Error(`${name} is not a valid PNG`), { exitCode: 1 })
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width !== expectedWidth || height !== expectedHeight) {
    throw Object.assign(new Error(`${name} has unexpected dimensions ${width}x${height}`), { exitCode: 1 })
  }
  console.log(`[capture] verified ${name}: ${width}x${height}, ${statSync(path).size} bytes`)
}

let browser
try {
  browser = await step('launch browser', () => chromium.launch({ ...config.browser.launchOptions, timeout: 30000 })).catch(error => {
    throw transient(error)
  })

  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const page = await step(`open ${name} page`, () => browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })).catch(error => {
      throw transient(error)
    })
    page.setDefaultTimeout(30000)
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))

    let response
    try {
      response = await step(`navigate ${name}`, () => page.goto(url, { waitUntil: 'load', timeout: 45000 }))
    } catch (error) {
      throw transient(error)
    }
    if (!response?.ok()) {
      const status = response?.status()
      const error = new Error(`HTTP ${status ?? 'unknown'} loading ${url}`)
      error.exitCode = !response || [408, 429, 500, 502, 503, 504].includes(status) ? 75 : 1
      throw error
    }

    try {
      await step(`wait for page shell ${name}`, () => page.locator('main').first().waitFor({ state: 'visible' }))
      await step(`wait for generated scene ${name}`, () => page.waitForFunction(() => {
        const scene = document.querySelector('#scene-output')
        return Boolean(scene && scene.textContent && scene.textContent.trim().length > 80)
      }, null, { timeout: 20000 }))
      await step(`wait for fonts ${name}`, () => page.evaluate(() => document.fonts.ready.then(() => document.fonts.status)))
      await step(`settle layout ${name}`, () => page.waitForTimeout(900))
      const sceneText = await step(`read rendered scene ${name}`, () => page.locator('#scene-output').innerText())
      if (sceneText.trim().length < 80) throw new Error('Generated scene content was empty.')
      if (pageErrors.length) throw new Error(`Page error: ${pageErrors[0]}`)
    } catch (error) {
      throw Object.assign(error, { exitCode: error.exitCode || 1 })
    }

    try {
      await step(`screenshot ${name}`, () => page.screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 }))
    } catch (error) {
      throw error.name === 'TimeoutError' || !browser.isConnected() ? transient(error) : Object.assign(error, { exitCode: 1 })
    }
    await step(`verify ${name} screenshot`, () => verifyPng(`final-${name}.png`, width, height)).catch(error => {
      throw Object.assign(error, { exitCode: error.exitCode || 1 })
    })
    await step(`close ${name} page`, () => page.close()).catch(() => {})
  }
} catch (error) {
  console.error(`[capture] ${error.stack || error.message || error}`)
  process.exitCode = error.exitCode || 1
} finally {
  if (browser) {
    await step('close browser', () => browser.close()).catch(error => {
      console.error(`[capture] close browser failed: ${error.message}`)
      process.exitCode ||= 75
    })
  }
}
