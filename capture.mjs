import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)))
const playwrightRoot = join(process.env.HOME || '', '.local/share/omgithub-playwright')
const require = createRequire(join(playwrightRoot, 'package.json'))
const { chromium } = require('playwright')

const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
const views = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844]
]

function fail(message) {
  console.error(`[capture] ${message}`)
  process.exit(1)
}

if (!url) fail('Set CAPTURE_URL to the page that should be captured.')
if (!output) fail('Set CAPTURE_DIR to an output directory outside the project.')

try {
  const parsed = new URL(url)
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('unsupported protocol')
} catch {
  fail(`CAPTURE_URL is not a valid HTTP(S) URL: ${url}`)
}

const captureDir = resolve(output)
if (captureDir === projectDir || captureDir.startsWith(projectDir + sep)) {
  fail(`CAPTURE_DIR must be outside the project source: ${captureDir}`)
}

mkdirSync(captureDir, { recursive: true })

const configPath = join(playwrightRoot, process.platform === 'darwin' ? 'metal.json' : 'linux.json')
const config = JSON.parse(readFileSync(configPath, 'utf8'))

if (process.platform === 'linux') {
  try {
    process.env.DISPLAY ||= ':' + readFileSync(join(playwrightRoot, 'display'), 'utf8').trim()
  } catch {
    process.env.DISPLAY ||= ':0'
  }
}

const transient = (error) => {
  throw Object.assign(error, { exitCode: 75 })
}

async function timed(label, task) {
  const started = performance.now()
  try {
    return await task()
  } finally {
    const seconds = ((performance.now() - started) / 1000).toFixed(2)
    console.log(`[capture] ${label}: ${seconds}s`)
  }
}

async function enterAgeGate(page, view) {
  const gate = page.locator('[data-age-gate]')
  const gateVisible = await gate.isVisible().catch(() => false)
  if (!gateVisible) return

  const dob = page.locator('#dob')
  if (!(await dob.count())) {
    throw new Error(`${view}: age gate is visible but has no date-of-birth field`)
  }

  await dob.fill(process.env.CAPTURE_DOB || '1990-01-01')
  const confirm = page.locator('#confirm-age')
  if (await confirm.count()) await confirm.check()

  const enter = page.locator('#enter-site')
  if (!(await enter.count())) {
    throw new Error(`${view}: age gate is visible but has no enter control`)
  }

  await page.waitForFunction(() => {
    const control = document.querySelector('#enter-site')
    return Boolean(control) && !control.disabled
  }, { timeout: 10000 })
  await enter.click()
  await gate.waitFor({ state: 'hidden', timeout: 10000 })
  console.log(`[capture] ${view}: entered the 18+ gate`)
}

let browser
let exitCode = 0

try {
  browser = await timed('launch browser', () =>
    chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }).catch(transient)
  )

  for (const [name, width, height] of views) {
    const page = await timed(`open ${name} page`, () =>
      browser.newPage({ viewport: { width, height } }).catch(transient)
    )
    page.setDefaultTimeout(30000)
    page.on('pageerror', (error) => console.error(`[capture] ${name} page error: ${error.message}`))

    const response = await timed(`navigate ${name}`, () =>
      page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(transient)
    )
    if (!response?.ok()) {
      const status = response?.status()
      const temporary = !response || [408, 429, 500, 502, 503, 504].includes(status)
      throw Object.assign(new Error(`HTTP ${status} loading preview`), { exitCode: temporary ? 75 : 1 })
    }

    await timed(`render ${name}`, async () => {
      await page.waitForFunction(() => {
        const main = document.querySelector('main')
        const gate = document.querySelector('[data-age-gate]')
        const gateVisible = Boolean(gate) && !gate.hidden && getComputedStyle(gate).display !== 'none'
        const mainVisible = Boolean(main) && main.offsetParent !== null && getComputedStyle(main).visibility !== 'hidden'
        return gateVisible || mainVisible
      }, { timeout: 20000 })

      await enterAgeGate(page, name)
      await page.locator('main').waitFor({ state: 'visible', timeout: 20000 })
      await page.waitForFunction(() => document.fonts.status === 'loaded', { timeout: 15000 })
      await page.waitForTimeout(900)
    })

    await timed(`screenshot ${name}`, () =>
      page.screenshot({ path: join(captureDir, `final-${name}.png`), timeout: 30000 }).catch((error) => {
        if (error.name === 'TimeoutError' || !browser.isConnected()) transient(error)
        throw error
      })
    )
    await timed(`close ${name} page`, () => page.close())
  }
} catch (error) {
  console.error(error)
  exitCode = error.exitCode === 75 ? 75 : 1
} finally {
  if (browser) {
    await browser.close().catch((error) => {
      console.error(error)
      exitCode ||= 75
    })
  }
}

process.exitCode = exitCode
