import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { expect, it } from 'vitest'
import { publicRuntimeConfig } from '../vite-runtime-config.js'

const require = createRequire(new URL('../../apps/desktop-app/package.json', import.meta.url))
const { createServer, preview } = await import(pathToFileURL(require.resolve('vite')).href)

it.each(['dev', 'preview'])('真实Vite %s在显式挂载目录返回运行配置，保持无缓存与公开白名单', async (mode) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hai-runtime-base-'))
  let server
  try {
    for (const directory of ['public', 'dist']) {
      mkdirSync(path.join(root, directory))
      writeFileSync(path.join(root, directory, 'index.html'), '<!doctype html><h1>Prefix fixture</h1>')
      writeFileSync(path.join(root, directory, 'runtime-config.js'), 'globalThis.__HAI_PUBLIC_CONFIG__ = {}')
    }
    writeFileSync(path.join(root, 'index.html'), '<!doctype html><h1>Prefix fixture</h1>')
    const config = { root, configFile: false, base: '/yyy/', logLevel: 'silent', plugins: [publicRuntimeConfig({ apiBase: 'https://api.example.invalid/api/v1', privateKey: 'private-runtime-value' })], server: { host: '127.0.0.1', port: 0 }, preview: { host: '127.0.0.1', port: 0 } }
    if (mode === 'dev') {
      server = await createServer(config)
      await server.listen()
    }
    else {
      server = await preview(config)
    }
    const address = server.httpServer.address()
    expect(address && typeof address !== 'string').toBe(true)
    const response = await fetch(`http://127.0.0.1:${address.port}/yyy/runtime-config.js`, { signal: AbortSignal.timeout(5000) })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.text()
    expect(body).not.toContain('private-runtime-value')
    const context = vm.createContext({})
    vm.runInContext(body, context)
    expect(context.__HAI_PUBLIC_CONFIG__).toEqual({ apiBase: 'https://api.example.invalid/api/v1' })
  }
  finally {
    if (typeof server?.close === 'function') {
      await server.close()
    }
    else if (server?.httpServer) {
      server.httpServer.closeAllConnections()
      await new Promise(resolve => server.httpServer.close(resolve))
    }
    if (path.dirname(root) === path.resolve(tmpdir()) && path.basename(root).startsWith('hai-runtime-base-'))
      rmSync(root, { recursive: true, force: true })
  }
})
