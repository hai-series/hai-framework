/**
 * =============================================================================
 * @h-ai/kit - Handler 包装器测试
 * =============================================================================
 */

import { describe, expect, it, vi } from 'vitest'

import { handler } from '../src/kit-handler.js'

// mock @h-ai/core 的 logger 和 i18n
vi.mock('@h-ai/core', () => ({
  core: {
    logger: {
      error: vi.fn(),
    },
    i18n: {
      createMessageGetter: (messages: Record<string, Record<string, string>>) => {
        return (key: string) => messages['zh-CN']?.[key] ?? key
      },
    },
  },
}))

/**
 * 创建最小的模拟 RequestEvent
 */
function createMockEvent(path = '/api/test', method = 'GET') {
  const url = new URL(`http://localhost${path}`)
  return {
    request: new Request(url, { method }),
    url,
    params: {},
    route: { id: path },
    locals: {},
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    },
    getClientAddress: () => '127.0.0.1',
  } as any
}

describe('handler', () => {
  it('正常返回 Response', async () => {
    const h = handler(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })

    const event = createMockEvent()
    const response = await h(event)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
  })

  it('未处理异常时返回 500', async () => {
    const h = handler(async () => {
      throw new Error('Unexpected failure')
    })

    const event = createMockEvent()
    const response = await h(event)

    expect(response.status).toBe(500)
  })

  it('直接返回 throw 的 Response 对象', async () => {
    const thrownResponse = new Response('Forbidden', { status: 403 })

    const h = handler(async () => {
      throw thrownResponse
    })

    const event = createMockEvent()
    await expect(h(event)).resolves.toBe(thrownResponse)
  })

  it('re-throw SvelteKit redirect 控制流', async () => {
    // 模拟 SvelteKit redirect 对象
    const redirectObj = { status: 302, location: '/login' }

    const h = handler(async () => {
      throw redirectObj
    })

    const event = createMockEvent()
    await expect(h(event)).rejects.toBe(redirectObj)
  })

  it('re-throw SvelteKit error 控制流', async () => {
    // 模拟 SvelteKit error 对象
    const errorObj = { status: 404, body: { message: 'Not found' } }

    const h = handler(async () => {
      throw errorObj
    })

    const event = createMockEvent()
    await expect(h(event)).rejects.toBe(errorObj)
  })

  it('传递完整的 RequestEvent 给处理函数', async () => {
    const receivedEvent: any[] = []

    const h = handler(async (event) => {
      receivedEvent.push(event)
      return new Response('ok')
    })

    const event = createMockEvent('/api/users', 'POST')
    await h(event)

    expect(receivedEvent).toHaveLength(1)
    expect(receivedEvent[0]).toBe(event)
  })
})
