/** 平台事件仅提供宿主字段，策略、加密与处理链使用实际实现。 */
import type { RequestEvent } from '@sveltejs/kit'
import type { Handle } from '@sveltejs/kit/hooks'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { cache } from '@h-ai/cache'
import { core, HaiCommonError } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { redirect as svelteKitRedirect } from '@sveltejs/kit'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { kit } from '../src/kit-main.js'

function event(request: Request, peer = '127.0.0.1'): RequestEvent {
  // SvelteKit 的平台事件由框架创建；这里只构造 Handle 使用的字段，不仿造业务服务。
  return {
    request,
    url: new URL(request.url),
    locals: {},
    params: {},
    route: { id: '/api/external' },
    getClientAddress: () => peer,
    cookies: {
      get: () => undefined,
    },
    fetch,
    platform: undefined,
    setHeaders: () => {},
    depends: () => {},
    isDataRequest: false,
    isSubRequest: false,
  } as RequestEvent
}

function dispatch(handle: Handle, request: Request, peer = '127.0.0.1', resolve: (event: RequestEvent) => Response | Promise<Response> = () => new Response('resolved')) {
  return handle({
    event: event(request, peer),
    resolve,
  })
}

afterEach(() => vi.restoreAllMocks())

it('策略按实际带前缀路径和每次请求的时间判断，窗口结束后不放过已有会话', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-26T09:59:59Z').getTime())
  const verifyToken = vi.fn().mockResolvedValue(core.ok({
    userId: 'member',
    roles: ['user'],
    permissions: [],
  }))
  const handle = kit.createHandle({
    logging: false,
    auth: { verifyToken },
    http: {
      access: {
        rules: [
          {
            id: 'office',
            paths: ['/yyy/api/external/**'],
            windows: [
              {
                days: [1],
                start: '09:00',
                end: '10:00',
              },
            ],
          },
        ],
      },
    },
  })
  const request = () => new Request('https://example.test/yyy/api/external/sync', {
    headers: { authorization: 'Bearer fixture' },
  })
  expect((await dispatch(handle, request())).status).toBe(200)
  expect(verifyToken).toHaveBeenCalledOnce()
  clock.mockReturnValue(new Date('2026-10-26T10:00:00Z').getTime())
  const denied = await dispatch(handle, request())
  expect(denied.status).toBe(403)
  expect(await denied.json()).toMatchObject({
    error: {
      code: 'hai:common:104',
      traceId: expect.any(String),
    },
  })
  expect(verifyToken).toHaveBeenCalledOnce()
  expect((await dispatch(handle, new Request('https://example.test/health'))).status).toBe(200)
})

it('页面数据请求同时遵守实际数据端点和页面的访问策略', async () => {
  const handle = kit.createHandle({
    logging: false,
    http: {
      access: {
        rules: [
          {
            id: 'reports',
            paths: ['/console/reports'],
            allowIps: ['192.0.2.0/24'],
          },
          {
            id: 'report-data',
            paths: ['/console/reports/__data.json'],
            allowIps: ['192.0.2.10', '198.51.100.10'],
          },
        ],
      },
    },
  })
  const resolve = vi.fn(() => Response.json({ ready: true }))
  const loadReportData = (ip: string) => handle({
    event: {
      ...event(new Request('https://example.test/console/reports/__data.json'), ip),
      url: new URL('https://example.test/console/reports'),
      isDataRequest: true,
    },
    resolve,
  })

  const allowed = await loadReportData('192.0.2.10')
  expect(allowed.status).toBe(200)
  expect(await allowed.json()).toEqual({ ready: true })
  expect((await loadReportData('192.0.2.20')).status).toBe(403)
  expect((await loadReportData('198.51.100.10')).status).toBe(403)
  expect(resolve).toHaveBeenCalledOnce()
})

it('可信代理解析后，业务 getClientAddress 与策略使用相同地址；伪造和无效链被拒绝', async () => {
  const handle = kit.createHandle({
    logging: false,
    http: {
      trustedProxies: ['192.0.2.1'],
      access: {
        global: {
          allowIps: ['198.51.100.10'],
        },
      },
    },
  })
  const request = (forwarded = '198.51.100.10') => new Request('https://example.test/api/external', {
    headers: { 'x-forwarded-for': forwarded },
  })
  const response = await dispatch(handle, request(), '192.0.2.1', event => Response.json({
    ip: event.getClientAddress(),
  }))
  expect(await response.json()).toEqual({ ip: '198.51.100.10' })
  expect((await dispatch(handle, request(), '203.0.113.20')).status).toBe(403)
  expect((await dispatch(handle, request('invalid'), '192.0.2.1')).status).toBe(403)
})

it('保留宿主只读事件，通过事件视图向后续处理传递可信地址', async () => {
  const request = new Request('https://example.test/api/external', {
    headers: { 'x-forwarded-for': '198.51.100.10' },
  })
  const original = event(request, '192.0.2.1')
  Object.defineProperty(original, 'getClientAddress', {
    get: () => () => '192.0.2.1',
    configurable: false,
  })
  Object.freeze(original)
  const handle = kit.createHandle({
    logging: false,
    http: {
      trustedProxies: ['192.0.2.1'],
    },
  })
  const response = await handle({
    event: original,
    resolve: async (resolved) => {
      expect(resolved.locals).toBe(original.locals)
      expect(resolved.request).toBe(request)
      return Response.json({
        ip: resolved.getClientAddress(),
      })
    },
  })
  expect(await response.json()).toEqual({ ip: '198.51.100.10' })
  expect(original.getClientAddress()).toBe('192.0.2.1')
})

it('文件只在创建 Handle 时读取，文件无效时不产生可处理业务的 Handle', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hai-kit-access-'))
  const file = path.join(directory, 'access.yaml')
  try {
    expect(() => kit.createHandle({
      http: {
        access: { file },
      },
    })).toThrow(/policy file could not be read/)
    await writeFile(file, 'global: {allowIps: [192.0.2.10]}\n')
    const handle = kit.createHandle({
      logging: false,
      http: {
        access: { file },
      },
    })
    expect((await dispatch(handle, new Request('https://example.test/api/external'))).status).toBe(403)
    await writeFile(file, 'rules: []\n')
    expect((await dispatch(handle, new Request('https://example.test/api/external'))).status).toBe(403)
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('路径可选择明文或强制加密，IP/时间继续生效，明确规则优先于默认范围和排除列表', async () => {
  expect(() => kit.createHandle({
    http: {
      access: {
        rules: [
          {
            id: 'required',
            paths: ['/api/private'],
            encryption: 'required',
          },
        ],
      },
    },
  })).toThrow(/transport is not configured/)
  expect((await crypto.init()).success).toBe(true)
  const pair = crypto.asymmetric.generateKeyPair()
  if (!pair.success)
    throw new Error(pair.error.message)
  const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-26T09:59:59Z').getTime())
  const handle = kit.createHandle({
    logging: false,
    http: {
      access: {
        rules: [
          {
            id: 'partner',
            paths: ['/api/partner/**'],
            encryption: 'disabled',
            allowIps: ['198.51.100.10'],
            windows: [
              {
                days: [1],
                start: '09:00',
                end: '10:00',
              },
            ],
          },
          {
            id: 'custom-json',
            paths: ['/custom-json'],
            encryption: 'required',
          },
        ],
      },
    },
    transport: {
      crypto,
      serverKeyRing: {
        activeKeyId: 'v1',
        keys: { v1: pair.data },
      },
      keyStore: crypto.transport.createKeyStore({ cache }),
      excludePaths: ['/custom-json'],
    },
  })
  const resolve = (event: RequestEvent) => Response.json({
    ip: event.getClientAddress(),
    message: 'private data',
  })
  let encrypted = false
  const client = crypto.transport.createClient({
    keyExchangeUrl: 'https://example.test/api/v1/_hai/key-exchange',
    fetch: async (input, init) => {
      const response = await dispatch(handle, new Request(input, init), '198.51.100.10', resolve)
      if (new URL(String(input)).pathname === '/custom-json')
        encrypted = response.headers.get('x-encrypted') === 'true'
      return response
    },
  })
  const request = (ip = '198.51.100.10', headers?: HeadersInit) => dispatch(handle, new Request('https://example.test/api/partner/sync', { headers }), ip, resolve)
  try {
    const plain = await request()
    expect(plain.status).toBe(200)
    expect(plain.headers.has('x-encrypted')).toBe(false)
    expect(await plain.json()).toMatchObject({ ip: '198.51.100.10' })
    const denied = await request('203.0.113.10', { 'x-request-id': 'kit-plain-denied' })
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({
      error: { code: 'hai:common:104', traceId: 'kit-plain-denied' },
    })
    const mismatch = await request(undefined, { 'x-hai-transport': '{}', 'x-request-id': 'kit-plain-mismatch' })
    expect(mismatch.status).toBe(400)
    expect(await mismatch.json()).toMatchObject({
      error: { code: HaiCommonError.VALIDATION_ERROR.code, traceId: 'kit-plain-mismatch' },
    })
    expect((await dispatch(handle, new Request('https://example.test/custom-json'))).status).toBe(400)
    const protectedResponse = await client.encryptedFetch('https://example.test/custom-json')
    expect(protectedResponse.status).toBe(200)
    expect(encrypted).toBe(true)
    expect(await protectedResponse.json()).toMatchObject({ message: 'private data' })
    expect((await dispatch(handle, new Request('https://example.test/api/ordinary'))).status).toBe(400)
    clock.mockReturnValue(new Date('2026-10-26T10:00:00Z').getTime())
    expect((await request()).status).toBe(403)
  }
  finally {
    client.destroy()
    await crypto.close()
  }
})

it('明文端点不绕过身份守卫，未启用宿主加密时也拒绝传输信封', async () => {
  const handle = kit.createHandle({
    logging: false,
    http: {
      access: {
        rules: [
          {
            id: 'plain',
            paths: ['/api/private'],
            encryption: 'disabled',
          },
        ],
      },
    },
    auth: {
      verifyToken: async () => core.err(HaiCommonError.UNAUTHORIZED),
      protectedPaths: ['/api/private'],
    },
  })
  expect((await dispatch(handle, new Request('https://example.test/api/private'))).status).toBe(401)
  const mismatch = await dispatch(handle, new Request('https://example.test/api/private', {
    headers: { 'x-encrypted': 'true' },
  }))
  expect(mismatch.status).toBe(400)
  expect(await mismatch.json()).toMatchObject({
    success: false,
    error: { code: HaiCommonError.VALIDATION_ERROR.code },
  })
})

it('真实加密请求的策略拒绝仍可解密，密钥交换与预检也执行策略', async () => {
  expect((await crypto.init()).success).toBe(true)
  const pair = crypto.asymmetric.generateKeyPair()
  if (!pair.success)
    throw new Error(pair.error.message)
  const transport = {
    serverKeyRing: {
      activeKeyId: 'v1',
      keys: { v1: pair.data },
    },
    keyStore: crypto.transport.createKeyStore({ cache }),
  }
  const handle = kit.createHandle({
    logging: false,
    cors: {
      origin: 'https://console.test',
      paths: ['/api/external'],
    },
    http: {
      access: {
        rules: [
          {
            id: 'external',
            paths: ['/api/external'],
            allowIps: ['192.0.2.10'],
          },
        ],
      },
    },
    transport: { crypto, ...transport },
  })
  let encrypted = false
  const client = crypto.transport.createClient({
    keyExchangeUrl: 'https://example.test/api/v1/_hai/key-exchange',
    fetch: async (input, init) => {
      const response = await dispatch(handle, new Request(input, init))
      if (response.status === 403) {
        encrypted = response.headers.get('x-encrypted') === 'true'
        expect(await response.clone().text()).not.toContain('hai:common:104')
      }
      return response
    },
  })
  try {
    const response = await client.encryptedFetch('https://example.test/api/external', {
      headers: { 'x-request-id': 'policy-kit-1' },
    })
    expect(response.status).toBe(403)
    expect(encrypted).toBe(true)
    expect(await response.json()).toMatchObject({
      error: { code: 'hai:common:104', traceId: 'policy-kit-1' },
    })
    expect((await dispatch(handle, new Request('https://example.test/api/external', {
      method: 'OPTIONS',
      headers: { 'origin': 'https://console.test', 'access-control-request-method': 'GET' },
    }))).status).toBe(403)
    const global = kit.createHandle({
      logging: false,
      http: {
        access: {
          global: {
            allowIps: ['192.0.2.10'],
          },
        },
      },
      transport: { crypto, ...transport },
    })
    const handshake = await dispatch(global, new Request('https://example.test/api/v1/_hai/key-exchange', { method: 'POST', body: '{}' }))
    expect(handshake.status).toBe(403)
    expect(await handshake.json()).toMatchObject({
      error: { code: 'hai:common:104' },
    })
  }
  finally {
    client.destroy()
    await crypto.close()
  }
})

it.each(['Kit 守卫', 'SvelteKit 控制流', '附带 Cookie 的响应'])('页面数据的登录跳转使用认证响应，普通页面保留跳转行为（%s）', async (source) => {
  expect((await crypto.init()).success).toBe(true)
  const pair = crypto.asymmetric.generateKeyPair()
  if (!pair.success)
    throw new Error(pair.error.message)
  const verifyToken = vi.fn(async () => source === 'Kit 守卫'
    ? core.err(HaiCommonError.UNAUTHORIZED)
    : core.ok({ userId: 'member', roles: [], permissions: [] }))
  const handle = kit.createHandle({
    logging: false,
    auth: {
      verifyToken,
      protectedPaths: ['/reports'],
      loginUrl: '/auth/login',
    },
    http: {
      rateLimit: {
        maxRequests: 2,
        store: core.access.createMemoryRateLimitStore(),
      },
    },
    transport: {
      crypto,
      serverKeyRing: {
        activeKeyId: 'v1',
        keys: { v1: pair.data },
      },
      keyStore: crypto.transport.createKeyStore({ cache }),
    },
  })
  const pageUrl = 'https://example.test/reports?quarter=2'
  const dataUrl = 'https://example.test/reports/__data.json?quarter=2'
  const loginUrl = `/auth/login?returnUrl=${encodeURIComponent('/reports?quarter=2')}`
  const cookies = ['notice=delivered; Path=/; HttpOnly', 'view=compact; Path=/']
  const resolve = vi.fn(() => {
    if (source === 'SvelteKit 控制流')
      svelteKitRedirect(302, loginUrl)
    const headers = new Headers({ Location: loginUrl })
    for (const cookie of cookies)
      headers.append('Set-Cookie', cookie)
    return new Response(null, { status: 302, headers })
  })
  const client = crypto.transport.createClient({
    keyExchangeUrl: 'https://example.test/api/v1/_hai/key-exchange',
    fetch: async (input, init) => {
      const request = new Request(input, init)
      if (request.url !== dataUrl)
        return dispatch(handle, request)
      const response = await handle({
        event: {
          ...event(request),
          url: new URL(pageUrl),
          isDataRequest: true,
          route: { id: '/reports' },
        },
        resolve,
      })
      expect(response.headers.get('x-encrypted')).toBe('true')
      expect(response.headers.get('location')).toBeNull()
      return response
    },
  })
  try {
    const auth = {
      headers: { authorization: 'Bearer fixture' },
    }
    const redirect = await client.encryptedFetch(dataUrl, auth)
    expect(redirect.status).toBe(200)
    expect(redirect.headers.get('cache-control')).toBe('private, no-store')
    expect(redirect.headers.get('x-request-id')).toMatch(/^req_/)
    expect(redirect.headers.getSetCookie()).toEqual(source === '附带 Cookie 的响应'
      ? cookies
      : [])
    expect(await redirect.json()).toEqual({ type: 'redirect', status: 302, location: loginUrl })

    const limited = await client.encryptedFetch(dataUrl, auth)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toMatch(/^[1-9]\d*$/)
    expect(await limited.json()).toMatchObject({
      error: { code: HaiCommonError.RATE_LIMIT_EXCEEDED.code },
    })
    expect(verifyToken).toHaveBeenCalledOnce()
    expect(resolve).toHaveBeenCalledTimes(source === 'Kit 守卫'
      ? 0
      : 1)

    const document = await handle({
      event: {
        ...event(new Request(pageUrl), '127.0.0.2'),
        route: { id: '/reports' },
      },
      resolve,
    })
    expect(document.status).toBe(302)
    expect(document.headers.get('location')).toBe(loginUrl)

    if (source === 'SvelteKit 控制流') {
      await expect(handle({
        event: event(new Request(pageUrl, auth), '127.0.0.3'),
        resolve,
      })).rejects.toMatchObject({ status: 302, location: loginUrl })
    }
  }
  finally {
    client.destroy()
    await crypto.close()
  }
})

// 每个用例借用独立的 cache.memory 状态，模拟进程内测试环境。
beforeEach(async () => {
  const cacheTransportReady = await cache.init({ type: 'memory' })
  expect(cacheTransportReady.success).toBe(true)
})
afterEach(async () => {
  await cache.close()
})

it('运行时拒绝旧 Handle 配置，避免未迁移的策略被忽略', () => {
  const oldHttp = {
    logging: false,
    access: { file: './config/policy.yml' },
  }
  expect(() => kit.createHandle(oldHttp)).toThrow('Use http.trustedProxies and http.access')

  const oldTransport = {
    logging: false,
    crypto: { crypto, transport: false },
  }
  expect(() => kit.createHandle(oldTransport)).toThrow('Use top-level transport')
})
