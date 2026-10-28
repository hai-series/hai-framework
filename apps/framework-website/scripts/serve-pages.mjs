import { readFile, stat } from 'node:fs/promises'
/** 仅用于验证纯静态目录，故意不提供SPA回退，确保深链有真实HTML。 */
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve('build')
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' }
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  if (!pathname.startsWith('/hai-framework/')) {
    response.writeHead(404).end()
    return
  }
  let file = path.resolve(root, `.${pathname.slice('/hai-framework'.length)}`)
  if (!file.startsWith(`${root}${path.sep}`) && file !== root) {
    response.writeHead(403).end()
    return
  }
  try {
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) {
        response.writeHead(308, { Location: `${pathname}/` }).end()
        return
      }
      file = path.join(file, 'index.html')
    }
    const body = await readFile(file)
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] ?? 'application/octet-stream' }).end(body)
  }
  catch {
    response.writeHead(404).end()
  }
})
server.listen(4297, '127.0.0.1')
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close())
