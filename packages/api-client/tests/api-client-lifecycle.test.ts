import { apiContract } from '@h-ai/api-contract'
import { eventIterator } from '@orpc/contract'
import { expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { apiClient, HaiApiClientError } from '../src/index.js'

const contract = {
  check: apiContract.route({ method: 'GET', path: '/check' }).output(apiContract.haiResultSchema(z.object({
    value: z.string(),
  }))),
}
function pair(name: string) {
  return {
    accessToken: name,
    refreshToken: `${name}-refresh`,
    expiresIn: 3600,
    tokenType: 'Bearer' as const,
  }
}

it('inspects an authenticated JSON response only once and preserves its body for decoding', async () => {
  const client = apiClient.create(contract)
  const clone = vi.spyOn(Response.prototype, 'clone')
  try {
    expect((await client.init({
      baseUrl: 'https://api.test',
      auth: {},
      fetch: async () => Response.json({
        success: true,
        data: { value: 'ok' },
      }),
    })).success).toBe(true)
    expect(await client.check()).toEqual({
      success: true,
      data: { value: 'ok' },
    })
    expect(clone).toHaveBeenCalledTimes(1)
  }
  finally {
    clone.mockRestore()
    await client.close()
  }
})

it('resolves a browser API path once for requests, refresh and retry', async () => {
  vi.stubGlobal('location', new URL('https://web.test/portal/settings'))
  const client = apiClient.create(contract)
  const requests: string[] = []
  try {
    expect((await client.init({
      baseUrl: '/portal/api/v1/',
      auth: {
        storage: apiClient.tokenStorage.memory(),
      },
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request.url)
        if (request.url.endsWith('/auth/refresh')) {
          return Response.json({
            success: true,
            data: {
              tokens: pair('new'),
            },
          })
        }
        return request.headers.get('authorization') === 'Bearer new'
          ? Response.json({
              success: true,
              data: { value: 'ok' },
            })
          : new Response(null, { status: 401 })
      },
    })).success).toBe(true)
    await client.auth.setTokens(pair('old'))
    expect(await client.check()).toEqual({
      success: true,
      data: { value: 'ok' },
    })
    expect(requests).toEqual([
      'https://web.test/portal/api/v1/check',
      'https://web.test/portal/api/v1/auth/refresh',
      'https://web.test/portal/api/v1/check',
    ])
  }
  finally {
    await client.close()
    vi.unstubAllGlobals()
  }
})

it.each([
  '/api/v1',
  '',
  'invalid.example/api',
  'ftp://api.test',
  'https://api.test/?x=1',
  'https://user:pass@api.test',
])('rejects an invalid Node base URL %s before use', async (baseUrl) => {
  const client = apiClient.create(contract)
  try {
    expect(await client.init({ baseUrl })).toMatchObject({
      success: false,
      error: { code: HaiApiClientError.CONFIG_ERROR.code },
    })
    expect(client.isInitialized).toBe(false)
  }
  finally {
    await client.close()
  }
})

it('a custom stream yields before EOF and caller cancellation releases its body', async () => {
  const client = apiClient.create({
    events: apiContract.route({ method: 'GET', path: '/events' }).output(eventIterator(z.object({
      value: z.string(),
    }))),
  })
  const cancel = vi.fn()
  const controller = new AbortController()
  let upstreamSignal: AbortSignal | undefined
  let detach = () => {}
  try {
    expect((await client.init({
      baseUrl: 'https://api.test',
      timeout: 50,
      fetch: async (input) => {
        const request = input instanceof Request
          ? input
          : new Request(input)
        upstreamSignal = request.signal
        return new Response(new ReadableStream<Uint8Array>({
          start(body) {
            body.enqueue(new TextEncoder().encode('event: message\ndata: {"value":"first"}\n\n'))
            const abort = () => body.error(new DOMException('Aborted', 'AbortError'))
            request.signal.addEventListener('abort', abort, { once: true })
            detach = () => request.signal.removeEventListener('abort', abort)
          },
          cancel,
        }), {
          headers: { 'content-type': 'text/event-stream' },
        })
      },
    })).success).toBe(true)
    const stream = await client.events(undefined, { signal: controller.signal })
    if (!(Symbol.asyncIterator in stream))
      throw new Error(stream.error.message)
    const iterator = stream[Symbol.asyncIterator]()
    expect(await iterator.next()).toMatchObject({
      done: false,
      value: { value: 'first' },
    })
    controller.abort()
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(upstreamSignal?.aborted).toBe(true)
  }
  finally {
    controller.abort()
    detach()
    await client.close()
  }
})

it.each(['return', 'close'] as const)('a custom stream releases its response and request signal on %s', async (action) => {
  const client = apiClient.create({
    events: apiContract.route({ method: 'GET', path: '/events' }).output(eventIterator(z.string())),
  })
  const cancel = vi.fn()
  let upstreamSignal: AbortSignal | undefined
  vi.useFakeTimers()
  try {
    expect((await client.init({
      baseUrl: 'https://api.test',
      timeout: 50,
      fetch: async (input) => {
        upstreamSignal = input instanceof Request
          ? input.signal
          : new Request(input).signal
        return new Response(new ReadableStream<Uint8Array>({
          start(body) {
            body.enqueue(new TextEncoder().encode('event: message\ndata: "first"\n\n'))
          },
          cancel,
        }), {
          headers: { 'content-type': 'text/event-stream' },
        })
      },
    })).success).toBe(true)
    const stream = await client.events()
    if (!(Symbol.asyncIterator in stream))
      throw new Error(stream.error.message)
    const iterator = stream[Symbol.asyncIterator]()
    expect(await iterator.next()).toMatchObject({ done: false, value: 'first' })
    await vi.advanceTimersByTimeAsync(100)
    expect(upstreamSignal?.aborted).toBe(false)
    if (action === 'return') {
      await iterator.return?.()
    }
    else {
      await client.close()
      await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' })
    }
    expect(upstreamSignal?.aborted).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
  }
  finally {
    vi.useRealTimers()
    await client.close()
  }
})

it('从异步工厂返回客户端和路由组时不触发伪请求', async () => {
  const client = apiClient.create({ catalog: contract })
  const fetch = vi.fn(async () => Response.json({
    success: true,
    data: { value: 'ok' },
  }))
  expect((await client.init({ baseUrl: 'https://api.test', fetch })).success).toBe(true)
  try {
    const create = async () => client
    const returned = await create()
    const group = await Promise.resolve(returned.catalog)
    expect(returned).toBe(client)
    expect(fetch).not.toHaveBeenCalled()
    expect(await group.check()).toEqual({
      success: true,
      data: { value: 'ok' },
    })
    expect(fetch).toHaveBeenCalledOnce()
  }
  finally { await client.close() }
})

it.each([true, false])('动态领域启用=%s 时客户端属性与契约一致', async (enabled) => {
  const combined = apiContract.create({
    catalog: enabled ? contract : false,
  })
  const client = apiClient.create(combined)
  expectTypeOf<Extract<typeof client.catalog, undefined>>().toEqualTypeOf<undefined>()
  const fetch = vi.fn(async () => Response.json({
    success: true,
    data: { value: 'ok' },
  }))
  expect((await client.init({ baseUrl: 'https://api.test', fetch })).success).toBe(true)
  try {
    const result = await client.catalog?.check()
    expect(result).toEqual(enabled
      ? {
          success: true,
          data: { value: 'ok' },
        }
      : undefined)
    expect(fetch).toHaveBeenCalledTimes(enabled ? 1 : 0)
  }
  finally { await client.close() }
})

it('自定义流在建立前返回可识别的客户端失败', async () => {
  const client = apiClient.create({
    events: apiContract.route({ method: 'GET', path: '/events' }).output(eventIterator(z.string())),
  })
  try {
    expect(await client.events()).toMatchObject({
      success: false,
      error: { code: HaiApiClientError.NOT_INITIALIZED.code },
    })
    expect((await client.init({
      baseUrl: 'https://api.test',
      fetch: async () => { throw new TypeError('Test connection closed') },
    })).success).toBe(true)
    expect(await client.events()).toMatchObject({
      success: false,
      error: { code: HaiApiClientError.NETWORK_ERROR.code },
    })
  }
  finally { await client.close() }
})

it('校验业务包络和裸响应，保留线上 ISO 时间字符串', async () => {
  const client = apiClient.create({
    ...contract,
    record: apiContract.route({ method: 'GET', path: '/record' }).output(z.object({
      sentAt: z.date(),
    })),
  })
  const sentAt = '2026-05-20T10:00:00.000Z'
  expect((await client.init({
    baseUrl: 'https://api.test',
    fetch: async (input) => {
      const request = new Request(input)
      return new URL(request.url).pathname === '/record'
        ? Response.json({ sentAt })
        : Response.json({
            success: true,
            data: { value: 42 },
          })
    },
  })).success).toBe(true)
  try {
    expect(await client.record()).toEqual({ sentAt })
    expect(await client.check()).toMatchObject({
      success: false,
      error: { code: HaiApiClientError.VALIDATION_FAILED.code },
    })
  }
  finally { await client.close() }
})

it('jSON 接口拒绝非契约页面，文件接口仍返回原始文件', async () => {
  const client = apiClient.create({
    ...contract,
    report: apiContract.route({ method: 'GET', path: '/report' }).output(z.file()),
  })
  expect((await client.init({
    baseUrl: 'https://api.test',
    fetch: async (input) => {
      const request = new Request(input)
      if (new URL(request.url).pathname === '/report') {
        return new Response('example report', {
          headers: { 'content-type': 'application/octet-stream' },
        })
      }
      return new Response('<html><title>Gateway</title></html>', {
        headers: { 'content-type': 'text/html' },
      })
    },
  })).success).toBe(true)
  try {
    expect(await client.check()).toMatchObject({
      success: false,
      error: { code: HaiApiClientError.VALIDATION_FAILED.code },
    })
    const report = await client.report()
    if (!(report instanceof File))
      throw new TypeError(report.error.message)
    expect(await report.text()).toBe('example report')
  }
  finally { await client.close() }
})

it.each([
  { name: 'default Cookie', auth: {}, credentials: 'include' },
  {
    name: 'explicit Cookie',
    auth: {
      storage: apiClient.tokenStorage.httpOnlyCookie(),
    },
    credentials: 'include',
  },
  {
    name: 'body token',
    auth: {
      storage: apiClient.tokenStorage.memory(),
    },
    credentials: 'same-origin',
  },
  { name: 'anonymous', auth: undefined, credentials: 'same-origin' },
] as const)('$name preserves its credential transport', async ({ auth, credentials }) => {
  const client = apiClient.create(contract)
  let observed: RequestCredentials | undefined
  try {
    expect((await client.init({
      baseUrl: 'https://api.test',
      auth,
      fetch: async (input) => {
        observed = (input instanceof Request
          ? input
          : new Request(input)).credentials
        return Response.json({
          success: true,
          data: { value: 'ok' },
        })
      },
    })).success).toBe(true)
    expect((await client.check()).success).toBe(true)
    expect(observed).toBe(credentials)
  }
  finally {
    await client.close()
  }
})

it('close and reinitialize invalidate a retired refresh without clearing the shared token storage', async () => {
  const client = apiClient.create(contract)
  const storage = apiClient.tokenStorage.memory()
  let entered!: () => void
  let release!: (response: Response) => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const delayed = new Promise<Response>((resolve) => {
    release = resolve
  })
  const fetch: typeof globalThis.fetch = async (input) => {
    const request = input instanceof Request
      ? input
      : new Request(input)
    if (request.url.endsWith('/auth/refresh')) {
      entered()
      return delayed
    }
    return request.headers.get('authorization') === 'Bearer old'
      ? Response.json({
          success: false,
          error: { code: 'hai:iam:103', message: 'Expired', httpStatus: 401 },
        }, { status: 401 })
      : Response.json({
          success: true,
          data: { value: 'ok' },
        })
  }
  const config = {
    baseUrl: 'https://api.test/api/v1',
    auth: { storage },
    fetch,
  }
  let pending: Promise<unknown> | undefined
  try {
    expect((await client.init(config)).success).toBe(true)
    await client.auth.setTokens(pair('old'))
    pending = client.check()
    await started
    await client.close()
    expect(await storage.getAccessToken()).toBe('old')
    expect((await client.init(config)).success).toBe(true)
    await client.auth.setTokens(pair('new'))
    release(Response.json({
      success: true,
      data: {
        tokens: pair('late-old'),
      },
    }))
    await pending
    expect(await storage.getAccessToken()).toBe('new')
    expect(await storage.getRefreshToken()).toBe('new-refresh')
  }
  finally {
    release?.(new Response(null, { status: 503 }))
    await pending
    await client.auth.clear()
    await client.close()
  }
})

it('request timeout also bounds a JSON body received after the headers', async () => {
  const client = apiClient.create(contract)
  let finish!: () => void
  let timeout: ReturnType<typeof setTimeout> | undefined
  const fetch: typeof globalThis.fetch = async (input) => {
    const request = input instanceof Request
      ? input
      : new Request(input)
    return new Response(new ReadableStream({
      start(controller) {
        const abort = () => controller.error(new DOMException('Aborted', 'AbortError'))
        request.signal.addEventListener('abort', abort, { once: true })
        finish = () => {
          request.signal.removeEventListener('abort', abort)
        }
        timeout = setTimeout(() => {
          finish()
          if (!request.signal.aborted) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({
              success: true,
              data: { value: 'late' },
            })))
            controller.close()
          }
        }, 100)
      },
    }), {
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    expect((await client.init({ baseUrl: 'https://api.test', fetch, timeout: 20 })).success).toBe(true)
    const result = await client.check()
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiApiClientError.TIMEOUT.code)
  }
  finally {
    clearTimeout(timeout)
    finish?.()
    await client.close()
  }
})
