/**
 * =============================================================================
 * @h-ai/kit - Handler 包装器测试
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'
import { core } from '@h-ai/core'
import { error as httpError, redirect } from '@sveltejs/kit'
import { describe, expect, it, vi } from 'vitest'

import { handler } from '../src/kit-handler.js'

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
  } as unknown as RequestEvent
}

describe('handler', () => {
  it('完整驱动异常仅写一次关联日志，响应不携带诊断内容', async () => {
    const logged = vi.spyOn(core.logger, 'error').mockImplementation(() => {})
    try {
      const cause = new AggregateError([
        Object.assign(new Error('private driver detail'), { code: 'DB_DOWN' }),
      ], 'private aggregate failure')
      const handle = handler(() => {
        throw cause
      })
      const response = await handle(createMockEvent())
      expect(logged).toHaveBeenCalledOnce()
      expect(logged).toHaveBeenCalledWith('API operation failed', expect.objectContaining({
        error: expect.objectContaining({ cause }),
      }))
      const body = await response.text()
      expect(body).not.toContain('private')
      expect(body).not.toContain('DB_DOWN')
    }
    finally { logged.mockRestore() }
  })
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
    const h = handler(async () => {
      redirect(302, '/login')
    })

    const event = createMockEvent()
    await expect(h(event)).rejects.toMatchObject({ status: 302, location: '/login' })
  })

  it('re-throw SvelteKit error 控制流', async () => {
    const h = handler(async () => {
      httpError(404, 'Not found')
    })

    const event = createMockEvent()
    await expect(h(event)).rejects.toMatchObject({ status: 404 })
  })

  it('带 status 的外部 SDK 异常仍转换为安全 500', async () => {
    const h = handler(async () => {
      throw Object.assign(new Error('private upstream credentials'), { status: 401 })
    })
    const response = await h(createMockEvent())
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private upstream')
  })

  it('传递完整的 RequestEvent 给处理函数', async () => {
    const receivedEvent: RequestEvent[] = []

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
