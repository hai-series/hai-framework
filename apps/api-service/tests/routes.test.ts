/**
 * api-service — 端到端 API 测试
 *
 * 启动两个真实的 Node HTTP 服务器（随机端口）：一个启用 transport 加密，一个明文。
 * 测试以“真实客户端”形态访问，不跨进程边界注入 server 对象。
 *
 * 设计要点：
 * - 业务 API（iam/storage/ai/app）一律走 @h-ai/api-client，走本机回环网络：保证调用形态与生产一致。
 * - 基础设施端点（health/ready/openapi/docs/key-exchange）使用原生 `fetch`：
 *   这些不在 oRPC contract 中，但同样需验证可达性。
 */

import type { ServConfig, ServNodeServer } from '@h-ai/serv'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ai } from '@h-ai/ai'
import { apiClient } from '@h-ai/api-client'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { serv } from '@h-ai/serv'
import { storage } from '@h-ai/storage'
import { vecdb } from '@h-ai/vecdb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiServiceContract, createApiServiceApp } from '../src/app.js'

// ─── 测试全局状态 ────────────────────────────────────────────────────────────

let vecdbDir: string
let storageDir: string
let encryptedApp: ReturnType<typeof createApiServiceApp>
let plainApp: ReturnType<typeof createApiServiceApp>
let encryptedServer: ServNodeServer
let plainServer: ServNodeServer
let encryptedBase: string
let plainBase: string
let encryptedClient: ReturnType<typeof apiClient.create<typeof apiServiceContract>>
let plainClient: ReturnType<typeof apiClient.create<typeof apiServiceContract>>

let healthPath = '/health'
let readyPath = '/ready'
let openapiPath = '/openapi.json'
let docsPath = '/docs'
let apiPrefix = '/api/v1'
let apiBaseUrl = ''
let keyExchangePath = '/api/v1/_hai/key-exchange'
let transportKeyExchangePath = '/_hai/key-exchange'

function apiPath(path: `/${string}`): `/${string}` {
  return `${apiPrefix}${path}` as `/${string}`
}

function uniqueUser(prefix = 'e2e') {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(-8)
  return {
    username: `${prefix}_${suffix}`,
    password: 'TestPass123',
    email: `${prefix}_${suffix}@test.local`,
  }
}

// ─── 初始化 / 清理 ───────────────────────────────────────────────────────────

beforeAll(async () => {
  vecdbDir = mkdtempSync(join(tmpdir(), 'api-svc-test-vecdb-'))
  storageDir = mkdtempSync(join(tmpdir(), 'api-svc-test-storage-'))

  core.init({
    configDir: './config',
    logging: { level: 'warn' },
  })

  const servConfig = core.config.getOrThrow<ServConfig>('serv')
  apiPrefix = servConfig.http.apiPrefix

  if (servConfig.http.health === false || servConfig.http.openapi === false || servConfig.http.docs === false) {
    throw new Error('api-service route tests require health/openapi/docs endpoints to stay enabled')
  }
  if (servConfig.transport === false) {
    throw new Error('api-service route tests require transport encryption to stay enabled')
  }

  healthPath = servConfig.http.health.path
  readyPath = servConfig.http.health.readyPath ?? servConfig.http.health.path
  openapiPath = servConfig.http.openapi.path
  docsPath = servConfig.http.docs.path
  transportKeyExchangePath = servConfig.transport.keyExchangePath
  keyExchangePath = apiPath(transportKeyExchangePath as `/${string}`)

  const cryptoResult = await crypto.init()
  if (!cryptoResult.success)
    throw new Error(`crypto: ${cryptoResult.error.message}`)

  const dbResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
  if (!dbResult.success)
    throw new Error(`reldb: ${dbResult.error.message}`)

  const cacheResult = await cache.init({ type: 'memory' })
  if (!cacheResult.success)
    throw new Error(`cache: ${cacheResult.error.message}`)

  const vecdbResult = await vecdb.init({ type: 'lancedb', path: vecdbDir })
  if (!vecdbResult.success)
    throw new Error(`vecdb: ${vecdbResult.error.message}`)

  const iamResult = await iam.init({})
  if (!iamResult.success)
    throw new Error(`iam: ${iamResult.error.message}`)

  const storageResult = await storage.init({ type: 'local', root: storageDir })
  if (!storageResult.success)
    throw new Error(`storage: ${storageResult.error.message}`)

  // AI 使用占位 key；测试不发起真实 LLM 调用
  const aiResult = await ai.init({})
  if (!aiResult.success)
    throw new Error(`ai: ${aiResult.error.message}`)

  encryptedApp = createApiServiceApp()
  plainApp = createApiServiceApp({ transport: 'disabled' })

  // 启动两个真实 HTTP 服务器（host=127.0.0.1, port=0 随机取可用端口）。
  // 通过 onListening 回调获取实际绑定的端口。
  const encListening = new Promise<AddressInfo>((resolve) => {
    encryptedServer = serv.listen(encryptedApp, { host: '127.0.0.1', port: 0, onListening: resolve })
  })
  const plainListening = new Promise<AddressInfo>((resolve) => {
    plainServer = serv.listen(plainApp, { host: '127.0.0.1', port: 0, onListening: resolve })
  })
  const [encAddr, plainAddr] = await Promise.all([encListening, plainListening])
  encryptedBase = `http://127.0.0.1:${encAddr.port}`
  plainBase = `http://127.0.0.1:${plainAddr.port}`
  apiBaseUrl = `${encryptedBase}${apiPrefix}`

  // 通过 api-client（默认 transport 配置）访问加密链路——走真实本机回环网络
  encryptedClient = apiClient.create(apiServiceContract)
  const encInit = await encryptedClient.init({
    baseUrl: apiBaseUrl,
    transport: { crypto, keyExchangePath: transportKeyExchangePath },
    auth: { storage: apiClient.tokenStorage.memory() },
  })
  if (!encInit.success)
    throw new Error(`encryptedClient.init: ${encInit.error.message}`)

  // 通过 api-client（无 transport）访问明文链路
  plainClient = apiClient.create(apiServiceContract)
  const plainInit = await plainClient.init({
    baseUrl: `${plainBase}${apiPrefix}`,
    auth: { storage: apiClient.tokenStorage.memory() },
  })
  if (!plainInit.success)
    throw new Error(`plainClient.init: ${plainInit.error.message}`)
}, 30_000)

afterAll(async () => {
  await encryptedClient?.close()
  await plainClient?.close()
  await encryptedServer?.close()
  await plainServer?.close()
  await ai.close()
  await storage.close()
  await iam.close()
  await vecdb.close()
  await cache.close()
  await reldb.close()
  await crypto.close()
  try {
    rmSync(vecdbDir, { recursive: true, force: true })
  }
  catch { /* 忽略清理失败 */ }
  try {
    rmSync(storageDir, { recursive: true, force: true })
  }
  catch { /* 忽略清理失败 */ }
})

// ─── 基础设施端点（不在 oRPC contract 中，走原生 fetch） ─────────────────

describe('api-service 基础设施端点', () => {
  it('gET /health 返回 200 { status: ok }', async () => {
    const res = await fetch(`${encryptedBase}${healthPath}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('gET /ready 返回 200 { status: ready }', async () => {
    const res = await fetch(`${encryptedBase}${readyPath}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ready' })
  })

  it('gET /openapi.json 返回合规 OpenAPI 3.1 JSON', async () => {
    const res = await fetch(`${encryptedBase}${openapiPath}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')

    const spec = await res.json() as Record<string, unknown>
    expect(spec.openapi).toMatch(/^3\./)
    expect(spec.info).toBeDefined()
    const paths = spec.paths as Record<string, unknown>
    // 框架内建端点
    expect(paths['/auth/login']).toBeDefined()
    expect(paths['/auth/logout']).toBeDefined()
    expect(paths['/auth/refresh']).toBeDefined()
    // 本服务自有端点
    expect(paths['/app/info']).toBeDefined()
    expect(paths['/app/echo']).toBeDefined()
  })

  it('gET /docs 返回 200 HTML 文档页', async () => {
    const res = await fetch(`${encryptedBase}${docsPath}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html.toLowerCase()).toContain('<!doctype html>')
  })

  it('响应头包含基础安全字段', async () => {
    const res = await fetch(`${encryptedBase}${healthPath}`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })

  it('pOST /api/v1/_hai/key-exchange 返回 200 并下发 clientId', async () => {
    const keyPair = crypto.asymmetric.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const res = await fetch(`${encryptedBase}${keyExchangePath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: keyPair.data.publicKey }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { clientId: string, serverPublicKey: string }
    expect(body.clientId).toBeTruthy()
    expect(body.serverPublicKey).toBeTruthy()
  })

  it('开启 transport 时，明文 POST /auth/login 被拒绝', async () => {
    const res = await fetch(`${encryptedBase}${apiPath('/auth/login')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'someone', password: 'secret' }),
    })
    expect(res.status).toBe(400)
  })
})

// ─── 加密链路：通过 api-client 完成认证流 ──────────────────────────────────

describe('api-service 加密链路（api-client + transport）', () => {
  it('register → 返回 success:true 与 tokens', async () => {
    const user = uniqueUser('enc_reg')
    const result = await encryptedClient.iam.auth.register({
      username: user.username,
      password: user.password,
      email: user.email,
    })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.tokens.accessToken).toBeTruthy()
  })

  it('login 缺少必填字段时由 schema 校验失败', async () => {
    // @ts-expect-error 故意传入不完整 payload 触发 schema 校验
    const result = await encryptedClient.iam.auth.login({ identifier: '' })
    expect(result.success).toBe(false)
  })

  it('login 正确凭据返回 tokens；错误密码返回 success:false', async () => {
    const user = uniqueUser('enc_login')
    const reg = await encryptedClient.iam.auth.register({
      username: user.username,
      password: user.password,
      email: user.email,
    })
    expect(reg.success).toBe(true)

    const ok = await encryptedClient.iam.auth.login({
      identifier: user.username,
      password: user.password,
    })
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.data.tokens.accessToken).toBeTruthy()
      expect(ok.data.tokens.refreshToken).toBeTruthy()
    }

    const bad = await encryptedClient.iam.auth.login({
      identifier: user.username,
      password: 'WrongPassword!',
    })
    expect(bad.success).toBe(false)
  })

  it('logout 无 token 返回 success:false；有 token 返回 success:true', async () => {
    // 无 token：clear 后调用
    await encryptedClient.auth.clear()
    const noToken = await encryptedClient.iam.auth.logout({})
    expect(noToken.success).toBe(false)

    // 走完整登录流再登出
    const user = uniqueUser('enc_logout')
    const reg = await encryptedClient.iam.auth.register({
      username: user.username,
      password: user.password,
      email: user.email,
    })
    expect(reg.success).toBe(true)
    if (!reg.success)
      return
    await encryptedClient.auth.setTokens(reg.data.tokens)

    const okRes = await encryptedClient.iam.auth.logout({})
    expect(okRes.success).toBe(true)

    await encryptedClient.auth.clear()
  })
})

// ─── 明文链路：通过 api-client 完成认证流 ──────────────────────────────────

describe('api-service 明文链路（api-client + transport 关闭）', () => {
  it('register 可正常工作（无 X-Encrypted 标记）', async () => {
    const user = uniqueUser('plain_reg')
    const result = await plainClient.iam.auth.register({
      username: user.username,
      password: user.password,
      email: user.email,
    })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.tokens.accessToken).toBeTruthy()
  })

  it('login 正确凭据返回 tokens', async () => {
    const user = uniqueUser('plain_login')
    const reg = await plainClient.iam.auth.register({
      username: user.username,
      password: user.password,
      email: user.email,
    })
    expect(reg.success).toBe(true)

    const result = await plainClient.iam.auth.login({
      identifier: user.username,
      password: user.password,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tokens.accessToken).toBeTruthy()
      expect(result.data.tokens.refreshToken).toBeTruthy()
    }
  })
})

// ─── 受保护资源：storage.presignedUrls.createUpload ──────────────────────────

describe('api-service 受保护资源（认证守卫）', () => {
  it('未登录调用 storage.presignedUrls.createUpload 返回 success:false', async () => {
    await encryptedClient.auth.clear()
    const result = await encryptedClient.storage.presignedUrls.createUpload({
      key: 'uploads/test.png',
      contentType: 'image/png',
    })
    expect(result.success).toBe(false)
  })

  it('伪造 token 返回 success:false', async () => {
    await encryptedClient.auth.setTokens({
      accessToken: 'totally-fake-token-xyz',
      refreshToken: 'totally-fake-refresh-xyz',
    })
    const result = await encryptedClient.storage.presignedUrls.createUpload({
      key: 'uploads/test.png',
      contentType: 'image/png',
    })
    expect(result.success).toBe(false)
    await encryptedClient.auth.clear()
  })

  it('登录后调用 storage.presignedUrls.createUpload 返回 success:true', async () => {
    const user = uniqueUser('storage')
    const reg = await encryptedClient.iam.auth.register({
      username: user.username,
      password: user.password,
      email: user.email,
    })
    expect(reg.success).toBe(true)
    if (!reg.success)
      return
    await encryptedClient.auth.setTokens(reg.data.tokens)

    const result = await encryptedClient.storage.presignedUrls.createUpload({
      key: 'uploads/test.png',
      contentType: 'image/png',
    })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.url).toBeTruthy()

    await encryptedClient.auth.clear()
  })
})

// ─── 服务自有 API：app.info / app.echo ─────────────────────────────────────

describe('api-service 自有 API（app contract）', () => {
  it('app.info 公开访问（无需登录），返回服务元数据', async () => {
    await encryptedClient.auth.clear()
    const result = await encryptedClient.app.info()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('api-service')
      expect(typeof result.data.version).toBe('string')
      expect(result.data.transportEnabled).toBe(true)
      expect(result.data.uptimeMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('app.info 在明文链路下 transportEnabled=false', async () => {
    const result = await plainClient.app.info()
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.transportEnabled).toBe(false)
  })

  it('app.echo 未登录返回 success:false（认证守卫生效）', async () => {
    await encryptedClient.auth.clear()
    const result = await encryptedClient.app.echo({ message: 'hello' })
    expect(result.success).toBe(false)
  })

  it('app.echo 登录后返回原 message、userId、requestId、timestamp', async () => {
    const user = uniqueUser('echo')
    const reg = await encryptedClient.iam.auth.register({
      username: user.username,
      password: user.password,
      email: user.email,
    })
    expect(reg.success).toBe(true)
    if (!reg.success)
      return
    await encryptedClient.auth.setTokens(reg.data.tokens)

    const result = await encryptedClient.app.echo({ message: 'hello world' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message).toBe('hello world')
      expect(result.data.userId).toBe(reg.data.user.id)
      expect(result.data.requestId).toBeTruthy()
      expect(result.data.timestamp).toBeTruthy()
    }

    await encryptedClient.auth.clear()
  })
})
