import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
/** 仅用于验证纯静态目录，故意不提供SPA回退，确保深链有真实HTML。 */
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve('build')
const directory = await lstat(root).catch(() => null)
const entry = await lstat(path.join(root, 'index.html')).catch(() => null)
if (!directory?.isDirectory() || directory.isSymbolicLink() || !entry?.isFile() || entry.isSymbolicLink())
  throw new Error('Static site build is missing. Run "pnpm build" in this application before starting the preview.')

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}
/** 静态预览只服务已构建的目录项，不沿链接进入工程之外的路径。 */
async function checked(file) {
  let current = root
  let metadata = directory
  for (const part of path.relative(root, file).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    metadata = await lstat(current, { bigint: true })
    if (metadata.isSymbolicLink())
      throw new Error('Linked static asset')
  }
  return metadata
}
const server = createServer(async (request, response) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  }
  catch {
    response.writeHead(400).end()
    return
  }
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
    let metadata = await checked(file)
    if (metadata.isDirectory()) {
      if (!pathname.endsWith('/')) {
        response.writeHead(308, { Location: `${pathname}/` }).end()
        return
      }
      file = path.join(file, 'index.html')
      metadata = await checked(file)
    }
    if (!metadata.isFile() || metadata.nlink !== 1n)
      throw new Error('Invalid static asset')
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    let body
    try {
      const opened = await handle.stat({ bigint: true })
      if (!opened.isFile() || opened.nlink !== 1n || opened.dev !== metadata.dev || opened.ino !== metadata.ino)
        throw new Error('Static asset changed while opening')
      body = await handle.readFile()
      const after = await handle.stat({ bigint: true })
      if (after.nlink !== 1n || opened.size !== after.size || opened.mtimeNs !== after.mtimeNs || opened.ctimeNs !== after.ctimeNs)
        throw new Error('Static asset changed while reading')
    }
    finally {
      await handle.close()
    }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] ?? 'application/octet-stream' }).end(body)
  }
  catch {
    response.writeHead(404).end()
  }
})
server.listen(4297, '127.0.0.1')
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close())
