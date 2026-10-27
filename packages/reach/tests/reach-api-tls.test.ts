import type { RequestListener } from 'node:http'
import type { Server } from 'node:https'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { getCACertificates, setDefaultCACertificates } from 'node:tls'
import { reldb } from '@h-ai/reldb'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { reach } from '../src/index.js'

let directory: string
let key: string
let cert: string
let originalCertificates: string[]
const servers: Array<Server | ReturnType<typeof createHttpServer>> = []

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'hai-reach-tls-'))
  const binary = process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe') ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl'
  execFileSync(binary, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-addext', 'basicConstraints=critical,CA:TRUE'], { windowsHide: true, stdio: 'ignore' })
  key = readFileSync(join(directory, 'key.pem'), 'utf8')
  cert = readFileSync(join(directory, 'cert.pem'), 'utf8')
  originalCertificates = getCACertificates()
  setDefaultCACertificates([...originalCertificates, cert])
})
afterEach(async () => {
  await reach.close()
  await reldb.close()
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>(done => server.close(() => done()))
  }
})
afterAll(() => {
  if (originalCertificates)
    setDefaultCACertificates(originalCertificates)
  if (directory) {
    expect(dirname(resolve(directory))).toBe(resolve(tmpdir()))
    expect(directory).toContain('hai-reach-tls-')
    rmSync(directory, { recursive: true, force: true })
  }
})

it.each(['same-origin', 'https', 'http'] as const)('可信 TLS 接收端可受理，重定向到 %s 的敏感正文不被转发', async (destination) => {
  let forwarded = 0
  let location = ''
  const handler: RequestListener = (request, response) => {
    request.resume()
    request.on('end', () => {
      if (request.url === '/redirect') {
        response.writeHead(307, { location }).end()
      }
      else {
        forwarded++
        response.writeHead(204).end()
      }
    })
  }
  const source = createServer({ key, cert }, handler)
  servers.push(source)
  source.listen(0, '127.0.0.1')
  await once(source, 'listening')
  const address = source.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing TLS receiver')
  const origin = `https://127.0.0.1:${address.port}`
  location = `${origin}/received`
  if (destination !== 'same-origin') {
    const target = destination === 'https' ? createServer({ key, cert }, handler) : createHttpServer(handler)
    servers.push(target)
    target.listen(0, '127.0.0.1')
    await once(target, 'listening')
    const targetAddress = target.address()
    if (!targetAddress || typeof targetAddress === 'string')
      throw new Error('Missing redirect receiver')
    location = `${destination}://127.0.0.1:${targetAddress.port}/received`
  }
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await reach.init({ providers: [{ name: 'secure', type: 'api', url: `${origin}/received`, requireHttps: true }], dnd: { enabled: false } })).success).toBe(true)
  expect((await reach.send({ provider: 'secure', to: 'fixture', body: 'synthetic' })).success).toBe(true)
  expect(forwarded).toBe(1)
  await reach.close()
  expect((await reach.init({ providers: [{ name: 'secure', type: 'api', url: `${origin}/redirect`, requireHttps: true, headers: { 'X-Private-Fixture': 'synthetic' } }], dnd: { enabled: false } })).success).toBe(true)
  expect((await reach.send({ provider: 'secure', to: 'fixture', body: 'synthetic', sensitive: true, idempotencyKey: destination, expiresAt: Date.now() + 60000 })).success).toBe(false)
  expect(forwarded).toBe(1)
})
