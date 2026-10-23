/** 已发布 Fetch adapter 对照标准 Request 与真实 HTTP 的参数/取消回归。 */
import type { ServContext, ServNodeServer } from '@h-ai/serv'
import { once } from 'node:events'
import { apiContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const contract = apiContract.create({})
const procedures = serv.implement(contract).context<ServContext>().build()
let entered = 0
const app = serv.createApp({ contract, procedures, middlewares: [{
  path: '/echo',
  middleware: async c => c.json({ method: c.req.method, header: c.req.header('X-Mode') ?? null, body: await c.req.text(), aborted: c.req.raw.signal.aborted }),
}, {
  path: '/observed',
  middleware: async (c) => {
    entered++
    return c.text('entered')
  },
}] })
const adapter = serv.toFetch(app)
let server: ServNodeServer
let baseUrl: string

beforeAll(async () => {
  server = serv.listen(app, { host: '127.0.0.1', port: 0 })
  if (!server.server.listening)
    await once(server.server, 'listening')
  const address = server.server.address()
  if (!address || typeof address === 'string')
    throw new Error('HTTP test listener unavailable')
  baseUrl = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  await server?.close()
})

async function payload(response: Response): Promise<unknown> {
  return response.json()
}

describe('published toFetch RequestInit', () => {
  it('applies method, replacement headers and replacement body just like standard Request and native HTTP fetch', async () => {
    const request = new Request(`${baseUrl}/echo`, { method: 'POST', headers: { 'X-Mode': 'original' }, body: 'original' })
    const init = { method: 'PUT', headers: { 'X-Mode': 'overridden' }, body: 'replacement' }
    const standard = new Request(request, init)
    expect(standard.method).toBe('PUT')
    const actual = await payload(await adapter(request, init))
    const native = await payload(await fetch(request, init))
    expect(actual).toEqual(native)
    expect(actual).toEqual({ method: 'PUT', header: 'overridden', body: 'replacement', aborted: false })
    expect(request.method).toBe('POST')
    expect(request.headers.get('X-Mode')).toBe('original')
    expect(request.bodyUsed).toBe(false)
  })

  it('reuses bodyless Request without mutating method or headers, and still accepts URL/string inputs', async () => {
    const request = new Request(`${baseUrl}/echo`, { headers: { 'X-Mode': 'original' } })
    for (const header of ['first', 'second']) {
      const init = { method: 'POST', headers: { 'X-Mode': header }, body: header }
      expect(await payload(await adapter(request, init))).toEqual(await payload(await fetch(request, init)))
    }
    expect(request.method).toBe('GET')
    expect(request.headers.get('X-Mode')).toBe('original')
    for (const input of [new URL(`${baseUrl}/echo`), `${baseUrl}/echo`])
      expect(await payload(await adapter(input))).toEqual(await payload(await fetch(input)))
  })

  it.each(['GET', 'HEAD'])('rejects a %s body override before dispatch just like standard Request', async (method) => {
    const request = new Request(`${baseUrl}/observed`)
    const before = entered
    expect(() => new Request(request, { method, body: 'invalid' })).toThrow(TypeError)
    await expect(adapter(request, { method, body: 'invalid' })).rejects.toBeInstanceOf(TypeError)
    await expect(fetch(request, { method, body: 'invalid' })).rejects.toBeInstanceOf(TypeError)
    expect(entered).toBe(before)
  })

  it('rejects already consumed body before dispatch, instead of resolving an application 500', async () => {
    const request = new Request(`${baseUrl}/echo`, { method: 'POST', body: 'consumed' })
    await request.text()
    expect(() => new Request(request)).toThrow(TypeError)
    await expect(adapter(request)).rejects.toBeInstanceOf(TypeError)
    await expect(fetch(request)).rejects.toBeInstanceOf(TypeError)
  })

  it('rejects locked bodies just like Request and releases the test reader', async () => {
    const request = new Request(`${baseUrl}/echo`, { method: 'POST', body: 'locked' })
    const reader = request.body!.getReader()
    try {
      expect(() => new Request(request)).toThrow(TypeError)
      await expect(adapter(request)).rejects.toBeInstanceOf(TypeError)
      await expect(fetch(request)).rejects.toBeInstanceOf(TypeError)
    }
    finally {
      await reader.cancel()
      reader.releaseLock()
    }
  })

  it('rejects pre-cancelled Request and init signal without dispatch', async () => {
    for (const useInit of [false, true]) {
      const controller = new AbortController()
      const reason = new DOMException('Cancelled before dispatch', 'AbortError')
      controller.abort(reason)
      const request = new Request(`${baseUrl}/observed`, useInit ? {} : { signal: controller.signal })
      const init = useInit ? { signal: controller.signal } : undefined
      const before = entered
      await expect(adapter(request, init)).rejects.toBe(reason)
      await expect(fetch(request, init)).rejects.toBe(reason)
      expect(entered).toBe(before)
    }
  })

  it('lets init.signal override an aborted input signal, matching standard Request/native HTTP', async () => {
    const original = new AbortController()
    original.abort()
    const replacement = new AbortController()
    const request = new Request(`${baseUrl}/echo`, { signal: original.signal })
    const init = { signal: replacement.signal }
    const standard = new Request(request, init)
    expect(standard.signal.aborted).toBe(false)
    expect(await payload(await adapter(request, init))).toEqual(await payload(await fetch(request, init)))
    expect(request.signal.aborted).toBe(true)
  })

  it('does not dispatch when cancelled between invocation and the queued application call', async () => {
    const controller = new AbortController()
    const before = entered
    const waiting = adapter(`${baseUrl}/observed`, { signal: controller.signal })
    const reason = new DOMException('Cancelled before application microtask', 'AbortError')
    controller.abort(reason)
    await expect(waiting).rejects.toBe(reason)
    expect(entered).toBe(before)
  })

  it('uses native HTTP fetch as an in-flight cancellation oracle without assuming effects roll back', async () => {
    const gate = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    let effects = 0
    const pending = serv.createApp({ contract, procedures, middlewares: [{ path: '/pending', middleware: async (c) => {
      effects++
      started.resolve()
      await gate.promise
      return c.text('already started')
    } }] })
    const listener = serv.listen(pending, { host: '127.0.0.1', port: 0 })
    try {
      if (!listener.server.listening)
        await once(listener.server, 'listening')
      const address = listener.server.address()
      if (!address || typeof address === 'string')
        throw new Error('Native cancellation listener unavailable')
      const controller = new AbortController()
      const reason = new DOMException('Native fetch cancelled', 'AbortError')
      const waiting = fetch(`http://127.0.0.1:${address.port}/pending`, { signal: controller.signal })
      await started.promise
      controller.abort(reason)
      await expect(waiting).rejects.toBe(reason)
      expect(effects).toBe(1)
    }
    finally {
      gate.resolve()
      await listener.close()
    }
  })

  it.each([false, true])('rejects a pending handler on cancellation and forwards the effective signal, override=%s', async (useInit) => {
    const gate = Promise.withResolvers<void>()
    const started = Promise.withResolvers<AbortSignal>()
    let effects = 0
    const pendingApp = serv.createApp({ contract, procedures, middlewares: [{
      path: '/pending',
      middleware: async (c) => {
        effects++
        started.resolve(c.req.raw.signal)
        await gate.promise
        return c.text('effect already started')
      },
    }] })
    const controller = new AbortController()
    const request = new Request('http://in-process.test/pending', useInit ? {} : { signal: controller.signal })
    const waiting = serv.toFetch(pendingApp)(request, useInit ? { signal: controller.signal } : undefined)
    const signal = await started.promise
    const remove = vi.spyOn(signal, 'removeEventListener')
    const reason = new DOMException('Cancelled while pending', 'AbortError')
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      controller.abort(reason)
      const bounded = Promise.race([waiting, new Promise<Response>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Adapter ignored cancellation')), 500)
      })])
      await expect(bounded).rejects.toBe(reason)
      expect(signal.aborted).toBe(true)
      expect(signal.reason).toBe(reason)
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(effects).toBe(1) // 取消等待不撤回已开始的 handler 外部效果。
    }
    finally {
      clearTimeout(timeout)
      gate.resolve()
      await waiting.catch(() => undefined)
      remove.mockRestore()
    }
  })

  it('preserves response/error behavior and removes its cancellation listener after completion', async () => {
    const remove = vi.spyOn(AbortSignal.prototype, 'removeEventListener')
    let observed: AbortSignal | undefined
    const completed = serv.createApp({ contract, procedures, middlewares: [{ path: '/done', middleware: async (c) => {
      observed = c.req.raw.signal
      return c.text('done')
    } }] })
    try {
      const response = await serv.toFetch(completed)('http://in-process.test/done')
      expect(await response.text()).toBe('done')
      expect(observed?.aborted).toBe(false)
      expect(remove.mock.contexts).toContain(observed)
      const failure = new Error('Adapter-level failure')
      const throwing = serv.toFetch({ request: app.request, fetch: () => {
        throw failure
      } })
      await expect(throwing('http://in-process.test/fail')).rejects.toBe(failure)
    }
    finally {
      remove.mockRestore()
    }
  })

  it.each([false, true])('cancels a discarded late response body without replacing the original cancellation, cancelThrows=%s', async (cancelThrows) => {
    const gate = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const cancelled = Promise.withResolvers<unknown>()
    let lateResponse: Response | undefined
    const pending = serv.createApp({ contract, procedures, middlewares: [{ path: '/late', middleware: async () => {
      started.resolve()
      await gate.promise
      lateResponse = new Response(new ReadableStream<Uint8Array>({ cancel: (reason) => {
        cancelled.resolve(reason)
        if (cancelThrows)
          throw new Error('Producer cancellation failed')
      } }))
      return lateResponse
    } }] })
    const controller = new AbortController()
    const reason = new DOMException('Late response discarded', 'AbortError')
    const waiting = serv.toFetch(pending)('http://in-process.test/late', { signal: controller.signal })
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await started.promise
      controller.abort(reason)
      await expect(waiting).rejects.toBe(reason)
      gate.resolve()
      expect(await Promise.race([cancelled.promise, new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Late response body was not cancelled')), 500)
      })])).toBe(reason)
    }
    finally {
      clearTimeout(timeout)
      gate.resolve()
      await lateResponse?.body?.cancel().catch(() => undefined)
    }
  })
})
