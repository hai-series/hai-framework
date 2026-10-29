/** 使用实际 Serv 路由、可信连接上下文和加密协议验证请求策略。 */
import type { ServContext } from '../src/serv-context.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { apiContract } from '@h-ai/api-contract'
import { HaiCommonError, ok } from '@h-ai/core'
import { createInMemoryKeyStore, crypto } from '@h-ai/crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { serv } from '../src/serv-main.js'

const contract = { external: apiContract.route({ method: 'GET', path: '/external' }).output(apiContract.haiResultSchema(z.object({ ip: z.string().optional() }))) }
const procedures = serv.implement(contract).context<ServContext>().route('external').handle(({ context }) => ok({ ip: context.ip })).build()

afterEach(() => vi.restoreAllMocks())

it('只限制命中的路径，每次请求重新判断时间，不依赖重新登录', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-26T09:59:59Z').getTime())
  const app = serv.createApp({ contract, procedures, http: { access: { rules: [{ id: 'office', paths: ['/api/v1/external'], timezone: 'UTC', windows: [{ days: [1], start: '09:00', end: '10:00' }] }] } } })
  expect((await app.request('/api/v1/external')).status).toBe(200)
  clock.mockReturnValue(new Date('2026-10-26T10:00:00Z').getTime())
  const denied = await app.request('/api/v1/external')
  expect(denied.status).toBe(403)
  expect(await denied.json()).toMatchObject({ success: false, error: { code: 'hai:common:104', traceId: expect.any(String) } })
  expect((await app.request('/health')).status).toBe(200)
  clock.mockReturnValue(new Date('2026-11-02T09:00:00Z').getTime())
  expect((await app.request('/api/v1/external')).status).toBe(200)
})

it('可信代理为策略和业务提供同一个 IP，直连伪造转发头不能绕过', async () => {
  const app = serv.createApp({ contract, procedures, http: { trustedProxies: ['192.0.2.1'], access: { rules: [{ id: 'external', paths: ['/api/v1/**'], allowIps: ['198.51.100.10'] }] } } })
  const request = () => new Request('https://example.test/api/v1/external', { headers: { 'x-forwarded-for': '198.51.100.10' } })
  const allowed = await app.fetch(request(), { remoteAddress: '192.0.2.1' })
  expect(allowed.status).toBe(200)
  expect(await allowed.json()).toMatchObject({ data: { ip: '198.51.100.10' } })
  expect((await app.fetch(request(), { remoteAddress: '203.0.113.20' })).status).toBe(403)
  expect((await app.fetch(request())).status).toBe(403)
})

it('自定义路由和 CORS 预检同样受策略约束，拒绝响应保留跨域头', async () => {
  const app = serv.createApp({ contract, procedures, http: { access: { global: { allowIps: ['192.0.2.10'] } } }, middlewares: [
    { middleware: serv.cors({ origin: 'https://client.test' }) },
    { path: '/early', middleware: c => c.text('private response') },
  ] })
  for (const method of ['GET', 'OPTIONS']) {
    const response = await app.fetch(new Request('https://example.test/early', { method, headers: { origin: 'https://client.test' } }), { remoteAddress: '198.51.100.10' })
    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://client.test')
    expect(await response.json()).toMatchObject({ error: { code: 'hai:common:104' } })
  }
  const allowed = await app.fetch(new Request('https://example.test/early'), { remoteAddress: '192.0.2.10' })
  expect(await allowed.text()).toBe('private response')
})

it('独立 YAML 在创建 app 时读取，缺失策略拒绝装配', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hai-serv-access-'))
  const file = path.join(directory, 'access.yml')
  try {
    expect(() => serv.createApp({ contract, procedures, http: { access: { file } } })).toThrow(/policy file could not be read/)
    await writeFile(file, 'rules:\n  - id: external\n    paths: [/api/v1/external]\n    allowIps: [192.0.2.10]\n')
    const app = serv.createApp({ contract, procedures, http: { access: { file } } })
    expect((await app.request('/api/v1/external')).status).toBe(403)
    expect((await app.request('/health')).status).toBe(200)
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('路径可关闭或强制加密，明文仍受 IP/时间约束，配置冲突和未装配加密在启动失败', async () => {
  expect(() => serv.createApp({ contract, procedures, http: { access: { rules: [{ id: 'required', paths: ['/health'], encryption: 'required' }] } } })).toThrow(/transport is not configured/)
  expect((await crypto.init()).success).toBe(true)
  const pair = crypto.asymmetric.generateKeyPair()
  if (!pair.success)
    throw new Error(pair.error.message)
  const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-26T09:59:59Z').getTime())
  const app = serv.createApp({
    contract,
    procedures,
    http: { access: { rules: [
      { id: 'partner', paths: ['/api/v1/external'], encryption: 'disabled', allowIps: ['198.51.100.10'], windows: [{ days: [1], start: '09:00', end: '10:00' }] },
      { id: 'health-protected', paths: ['/health'], encryption: 'required' },
    ] } },
    transport: { crypto, serverKeyRing: { activeKeyId: 'v1', keys: { v1: pair.data } }, keyStore: createInMemoryKeyStore(), excludePaths: ['/health'] },
  })
  const request = (ip = '198.51.100.10', headers?: HeadersInit) => app.fetch(new Request('https://example.test/api/v1/external', { headers }), { remoteAddress: ip })
  const client = crypto.transport.createClient({ keyExchangeUrl: 'https://example.test/api/v1/_hai/key-exchange', fetch: (input, init) => app.fetch(new Request(input, init), { remoteAddress: '198.51.100.10' }) })
  try {
    const allowed = await request()
    expect(allowed.status).toBe(200)
    expect(allowed.headers.has('x-encrypted')).toBe(false)
    expect(await allowed.json()).toMatchObject({ success: true, data: { ip: '198.51.100.10' } })
    const denied = await request('203.0.113.10', { 'x-request-id': 'plain-denied' })
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ error: { code: 'hai:common:104', traceId: 'plain-denied' } })
    const mismatch = await request(undefined, { 'x-encrypted': 'true', 'x-request-id': 'plain-mismatch' })
    expect(mismatch.status).toBe(400)
    expect(await mismatch.json()).toMatchObject({ error: { code: HaiCommonError.VALIDATION_ERROR.code, traceId: 'plain-mismatch' } })
    expect((await app.request('/health')).status).toBe(400)
    const protectedResponse = await client.encryptedFetch('https://example.test/health')
    expect(protectedResponse.status).toBe(200)
    expect(await protectedResponse.json()).toMatchObject({ status: 'ok' })
    expect((await app.request('/ready')).status).toBe(400)
    clock.mockReturnValue(new Date('2026-10-26T10:00:00Z').getTime())
    expect((await request()).status).toBe(403)
  }
  finally {
    client.destroy()
    await crypto.close()
  }
})

it('关闭加密的路径仍执行认证，宿主未启用加密时也拒绝伪装成密文的请求', async () => {
  const readPrivate = vi.fn(() => ok({ ip: 'private' }))
  const guarded = serv.implement(contract).context<ServContext>().route('external').auth().handle(readPrivate).build()
  const app = serv.createApp({ contract, procedures: guarded, http: { access: { rules: [{ id: 'partner', paths: ['/api/v1/external'], encryption: 'disabled' }] } } })
  const denied = await app.request('/api/v1/external')
  // 普通 procedure 沿用 HTTP 200 / HaiResult 契约，必须断言鉴别失败和处理器未执行。
  expect(denied.status).toBe(200)
  expect(await denied.json()).toMatchObject({ success: false, error: { code: HaiCommonError.UNAUTHORIZED.code, httpStatus: 401 } })
  expect(readPrivate).not.toHaveBeenCalled()
  expect((await app.request('/api/v1/external', { headers: { 'x-encrypted': 'true' } })).status).toBe(400)
})

it('策略拒绝保持真正的加密响应，客户端可读取原因和追踪编号', async () => {
  expect((await crypto.init()).success).toBe(true)
  const pair = crypto.asymmetric.generateKeyPair()
  if (!pair.success)
    throw new Error(pair.error.message)
  let encryptedDenial = false
  const app = serv.createApp({ contract, procedures, http: { access: { rules: [{ id: 'external', paths: ['/api/v1/external'], allowIps: ['192.0.2.10'] }] } }, transport: { crypto, serverKeyRing: { activeKeyId: 'v1', keys: { v1: pair.data } }, keyStore: createInMemoryKeyStore() }, middlewares: [{ middleware: serv.cors({ origin: 'https://client.test' }) }] })
  const client = crypto.transport.createClient({ keyExchangeUrl: 'https://example.test/api/v1/_hai/key-exchange', fetch: async (input, init) => {
    const response = await app.fetch(new Request(input, init), { remoteAddress: '198.51.100.10' })
    if (response.status === 403) {
      encryptedDenial = response.headers.get('x-encrypted') === 'true'
      expect(await response.clone().text()).not.toContain('hai:common:104')
      expect(response.headers.get('access-control-allow-origin')).toBe('https://client.test')
    }
    return response
  } })
  try {
    const response = await client.encryptedFetch('https://example.test/api/v1/external', { headers: { 'origin': 'https://client.test', 'x-request-id': 'access-request-1' } })
    expect(response.status).toBe(403)
    expect(encryptedDenial).toBe(true)
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'hai:common:104', traceId: 'access-request-1' } })
  }
  finally {
    client.destroy()
    await crypto.close()
  }
})
