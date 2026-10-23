import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('./dist/', import.meta.url)))
const port = Number.parseInt(process.env.PORT || '3000', 10)

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Invalid PORT: ${process.env.PORT}`)
  process.exit(1)
}

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(body)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')

    if (url.pathname === '/healthz') {
      send(res, 200, '{"ok":true}\n', 'application/json; charset=utf-8')
      return
    }

    let pathname
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      send(res, 400, 'Bad request\n')
      return
    }

    if (pathname.includes('\0')) {
      send(res, 400, 'Bad request\n')
      return
    }

    let file = resolve(root, '.' + pathname)
    if (file !== root && !file.startsWith(root + sep)) {
      send(res, 403, 'Forbidden\n')
      return
    }

    const info = await stat(file)
    if (info.isDirectory()) file = join(file, 'index.html')

    const content = await readFile(file)
    const type = mime[extname(file).toLowerCase()] || 'application/octet-stream'

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': content.length,
      'Cache-Control': extname(file).toLowerCase() === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"
    })

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    res.end(content)
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      send(res, 404, 'Not found\n')
      return
    }
    console.error(error)
    send(res, 500, 'Internal server error\n')
  }
})

server.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.listen(port, '0.0.0.0', () => {
  console.log(`Playground listening on http://0.0.0.0:${port}`)
  console.log(`Serving static files from ${root}`)
})
