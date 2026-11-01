import { apiContract } from '@h-ai/api-contract'
import { eventIterator } from '@orpc/contract'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiClient, HaiApiClientError } from '../src/index.js'

const contract = { check: apiContract.route({ method: 'GET', path: '/check' }).output(apiContract.haiResultSchema(z.object({ value: z.string() }))) }
const pair = (name: string) => ({ accessToken: name, refreshToken: `${name}-refresh`, expiresIn: 3600, tokenType: 'Bearer' as const })

it('a custom stream yields before EOF and caller cancellation releases its body', async () => {
  const client = apiClient.create({ events: apiContract.route({ method: 'GET', path: '/events' }).output(eventIterator(z.object({ value: z.string() }))) })
  const cancel = vi.fn()
  const controller = new AbortController()
  let detach = () => {}
  try {
    expect((await client.init({ baseUrl: 'https://api.test', timeout: 50, fetch: async (input) => {
      const request = input instanceof Request ? input : new Request(input)
      return new Response(new ReadableStream<Uint8Array>({ start(body) {
        body.enqueue(new TextEncoder().encode('event: message\ndata: {"value":"first"}\n\n'))
        const abort = () => body.error(new DOMException('Aborted', 'AbortError'))
        request.signal.addEventListener('abort', abort, { once: true })
        detach = () => request.signal.removeEventListener('abort', abort)
      }, cancel }), { headers: { 'content-type': 'text/event-stream' } })
    } })).success).toBe(true)
    const stream = await client.events(undefined, { signal: controller.signal })
    expect(Symbol.asyncIterator in stream).toBe(true)
    const iterator = stream[Symbol.asyncIterator]()
    expect(await iterator.next()).toMatchObject({ done: false, value: { value: 'first' } })
    controller.abort()
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledOnce()
  }
  finally {
    controller.abort()
    detach()
    await client.close()
  }
})

it.each([
  { name: 'default Cookie', auth: {}, credentials: 'include' },
  { name: 'explicit Cookie', auth: { storage: apiClient.tokenStorage.httpOnlyCookie() }, credentials: 'include' },
  { name: 'body token', auth: { storage: apiClient.tokenStorage.memory() }, credentials: 'same-origin' },
  { name: 'anonymous', auth: undefined, credentials: 'same-origin' },
] as const)('$name preserves its credential transport', async ({ auth, credentials }) => {
  const client = apiClient.create(contract)
  let observed: RequestCredentials | undefined
  try {
    expect((await client.init({ baseUrl: 'https://api.test', auth, fetch: async (input) => {
      observed = (input instanceof Request ? input : new Request(input)).credentials
      return Response.json({ success: true, data: { value: 'ok' } })
    } })).success).toBe(true)
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
    const request = input instanceof Request ? input : new Request(input)
    if (request.url.endsWith('/auth/refresh')) {
      entered()
      return delayed
    }
    return request.headers.get('authorization') === 'Bearer old'
      ? Response.json({ success: false, error: { code: 'hai:iam:103', message: 'Expired', httpStatus: 401 } }, { status: 401 })
      : Response.json({ success: true, data: { value: 'ok' } })
  }
  const config = { baseUrl: 'https://api.test/api/v1', auth: { storage }, fetch }
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
    release(Response.json({ success: true, data: { tokens: pair('late-old') } }))
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
    const request = input instanceof Request ? input : new Request(input)
    return new Response(new ReadableStream({ start(controller) {
      const abort = () => controller.error(new DOMException('Aborted', 'AbortError'))
      request.signal.addEventListener('abort', abort, { once: true })
      finish = () => {
        request.signal.removeEventListener('abort', abort)
      }
      timeout = setTimeout(() => {
        finish()
        if (!request.signal.aborted) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ success: true, data: { value: 'late' } })))
          controller.close()
        }
      }, 100)
    } }), { headers: { 'content-type': 'application/json' } })
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
