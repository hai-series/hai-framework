/** 实际生成客户端 + 真实 HTTP/SM2/SQLite registry，区分加密失败与显式明文模式。 */
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { runInNewContext } from 'node:vm'
import { apiClient } from '@h-ai/api-client'
import { authenticateTransportRequest, createReldbTransportKeyStore, crypto, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { reldb } from '@h-ai/reldb'
import Handlebars from 'handlebars'
import ts from 'typescript'
import { afterEach, expect, it } from 'vitest'
import { buildTemplateContext } from '../src/commands/cli-template-engine.js'

interface MobileClient {
  initApi: () => Promise<void>
  closeApi: () => Promise<void>
}

afterEach(async () => {
  try {
    await apiClient.close()
  }
  finally {
    try {
      expect((await reldb.close()).success).toBe(true)
    }
    finally {
      await crypto.close()
    }
  }
})

function generatedClient(baseUrl: string, encrypted: boolean): MobileClient {
  const source = Handlebars.compile(readFileSync(new URL('../templates/apps/mobile-app/src/lib/api.ts.hbs', import.meta.url), 'utf8'))(
    buildTemplateContext({ name: 'mobile-http', appType: 'mobile-app', features: encrypted ? ['iam'] : ['api-client', 'capacitor'], packageManager: 'pnpm' }),
  )
  const exported: Partial<MobileClient> = {}
  runInNewContext(ts.transpileModule(source.replaceAll('import.meta.env', 'runtimeEnv'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: exported,
    runtimeEnv: {},
    __HAI_PUBLIC_CONFIG__: { apiBase: baseUrl, apiKeyExchangePath: '/custom/key-exchange' },
    require(name: string) {
      if (name === '@h-ai/api-client')
        return { apiClient }
      if (name === '@h-ai/crypto')
        return { crypto }
      if (name === '@h-ai/capacitor')
        return { createCapacitorTokenStorage: () => apiClient.tokenStorage.memory() }
      if (name === '@capacitor/core')
        return { Capacitor: { isNativePlatform: () => false } }
      throw new Error(`Unexpected generated mobile import: ${name}`)
    },
  })
  if (!exported.initApi || !exported.closeApi)
    throw new Error('Generated mobile lifecycle missing')
  return exported as MobileClient
}

it.each(['encrypted', 'rejected-handshake', 'explicit-plaintext'] as const)('真实移动客户端 HTTP 模式 %s', async (mode) => {
  const initialized = await crypto.init()
  expect(initialized.success).toBe(true)
  const database = await reldb.init({ type: 'sqlite', database: ':memory:' })
  expect(database.success).toBe(true)
  const pair = crypto.asymmetric.generateKeyPair()
  if (!pair.success)
    throw new Error(pair.error.message)
  const manager = crypto.transport.createServer({
    serverKeyRing: { activeKeyId: 'fixture-v1', keys: { 'fixture-v1': pair.data } },
    keyStore: createReldbTransportKeyStore({ reldb, ttlSeconds: 60 }),
  })
  if (!manager.success)
    throw new Error(manager.error.message)
  const observed = { handshakes: 0, authenticated: 0, plaintext: 0, login: '' }
  let base = ''
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const chunk of incoming) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > 2 * 1024 * 1024)
          throw new Error('Fixture request too large')
        chunks.push(buffer)
      }
      const wire = Buffer.concat(chunks).toString('utf8')
      const headers = new Headers()
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value))
          value.forEach(item => headers.append(key, item))
        else if (value !== undefined)
          headers.set(key, value)
      }
      outgoing.setHeader('content-type', 'application/json')
      if (incoming.url === '/api/v1/custom/key-exchange') {
        observed.handshakes++
        if (mode === 'rejected-handshake') {
          outgoing.writeHead(503).end(JSON.stringify({ message: 'Fixture registry unavailable' }))
          return
        }
        const body = JSON.parse(wire) as { clientPublicKey: string }
        const clientId = await manager.data.registerClientKey(body.clientPublicKey)
        outgoing.end(JSON.stringify({ serverPublicKey: manager.data.getServerPublicKey(), serverKeyId: manager.data.getServerKeyId(), clientId }))
        return
      }
      const payload = { success: false, error: { code: 'hai:iam:301', message: 'Fixture rejected credentials' } }
      if (mode === 'explicit-plaintext') {
        observed.plaintext++
        observed.login = wire
        outgoing.end(JSON.stringify(payload))
        return
      }
      if (!headers.has(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)) {
        observed.plaintext++
        outgoing.writeHead(400).end(JSON.stringify({ message: 'Authenticated transport required' }))
        return
      }
      expect(wire).not.toContain('fixture-customer')
      expect(wire).not.toContain('Fixture-only-Password1!')
      const request = new Request(`${base}${incoming.url}`, { method: incoming.method, headers, ...(wire ? { body: wire } : {}) })
      const verified = await authenticateTransportRequest(manager.data, request)
      if (!verified.success)
        throw new Error(verified.error.message)
      observed.authenticated++
      observed.login = verified.data.plaintext
      const encrypted = await manager.data.encryptResponse(verified.data.context, JSON.stringify(payload), 200)
      if (!encrypted.success)
        throw new Error(encrypted.error.message)
      outgoing.setHeader(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
      outgoing.end(JSON.stringify(encrypted.data))
    }
    catch {
      // 夹具错误只给固定诊断，不打印原请求、私钥或密码。
      outgoing.writeHead(500).end(JSON.stringify({ message: 'Fixture request failed' }))
    }
  })
  let application: MobileClient | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('HTTP fixture has no port')
    base = `http://127.0.0.1:${address.port}`
    application = generatedClient(`${base}/api/v1`, mode !== 'explicit-plaintext')
    await application.initApi()
    const result = await apiClient.iam.auth.login({ identifier: 'fixture-customer', password: 'Fixture-only-Password1!' })
    expect(result.success).toBe(false)
    if (result.success)
      throw new Error('Fixture login must fail with a typed error')
    if (mode === 'rejected-handshake') {
      expect(observed.handshakes).toBeGreaterThan(0)
      expect(observed.authenticated).toBe(0)
      expect(observed.plaintext).toBe(0)
    }
    else {
      expect(result.error.code).toBe('hai:iam:301')
      expect(observed.login).toContain('fixture-customer')
      if (mode === 'encrypted')
        expect(observed).toMatchObject({ handshakes: 1, authenticated: 1, plaintext: 0 })
      else expect(observed).toMatchObject({ handshakes: 0, authenticated: 0, plaintext: 1 })
    }
  }
  finally {
    try {
      await application?.closeApi()
    }
    finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }
})
