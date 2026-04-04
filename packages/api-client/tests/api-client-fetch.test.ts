/**
 * @h-ai/api-client — fetch 层测试
 */

import { describe, expect, it, vi } from 'vitest'
import { createFetchClient } from '../src/api-client-fetch.js'
import { HaiApiClientError } from '../src/api-client-types.js'

/**
 * 创建 mock fetch
 */
function mockFetch(status: number, body: unknown, headers?: Record<string, string>) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    }),
  )
}

describe('createFetchClient', () => {
  describe('get', () => {
    it('发起 GET 请求并解析 JSON 响应', async () => {
      const fetch = mockFetch(200, { data: { id: 1, name: 'Alice' } })
      const client = createFetchClient({ baseUrl: 'https://api.test.com/v1', fetch })

      const result = await client.get<{ id: number, name: string }>('/users/1')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ id: 1, name: 'Alice' })
      }
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/users/1',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('附加查询参数', async () => {
      const fetch = mockFetch(200, { data: [] })
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      await client.get('/users', { page: 1, pageSize: 20 })

      const url = (fetch.mock.calls[0] as string[])[0]
      expect(url).toContain('page=1')
      expect(url).toContain('pageSize=20')
    })
  })

  describe('post', () => {
    it('发起 POST 请求，JSON body', async () => {
      const fetch = mockFetch(200, { data: { id: 2 } })
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      const result = await client.post<{ id: number }>('/users', { name: 'Bob' })

      expect(result.success).toBe(true)
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Bob' }),
        }),
      )
    })
  })

  describe('error handling', () => {
    it('404 返回 NOT_FOUND 错误', async () => {
      const fetch = mockFetch(404, { message: 'Not found' })
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      const result = await client.get('/users/999')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiApiClientError.NOT_FOUND.code)
        expect(result.error.httpStatus).toBe(404)
      }
    })

    it('500 返回 SERVER_ERROR', async () => {
      const fetch = mockFetch(500, { message: 'Internal error' })
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      const result = await client.get('/crash')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiApiClientError.SERVER_ERROR.code)
      }
    })

    it('网络异常返回 NETWORK_ERROR', async () => {
      const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      const result = await client.get('/offline')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiApiClientError.NETWORK_ERROR.code)
      }
    })
  })

  describe('interceptors', () => {
    it('请求拦截器可以追加 header', async () => {
      const fetch = mockFetch(200, { data: 'ok' })
      const client = createFetchClient({
        baseUrl: 'https://api.test.com',
        fetch,
        interceptors: {
          request: [
            (config) => {
              config.headers['X-Custom'] = 'test'
              return config
            },
          ],
        },
      })

      await client.get('/test')

      const headers = (fetch.mock.calls[0] as { headers: Record<string, string> }[])[1]?.headers
      expect(headers).toHaveProperty('X-Custom', 'test')
    })

    it('响应拦截器可以修改响应', async () => {
      const originalBody = { data: { id: 1 } }
      const fetch = mockFetch(200, originalBody)
      const client = createFetchClient({
        baseUrl: 'https://api.test.com',
        fetch,
        interceptors: {
          response: [
            (response) => {
              // 透传响应（验证拦截器被调用）
              return response
            },
          ],
        },
      })

      const result = await client.get<{ id: number }>('/test')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ id: 1 })
      }
    })
  })

  describe('timeout', () => {
    it('超时返回 TIMEOUT 错误', async () => {
      const fetch = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'))
          })
        })
      })
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch, timeout: 50 })

      const result = await client.get('/slow')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiApiClientError.TIMEOUT.code)
      }
    })
  })

  describe('401 auto refresh', () => {
    it('401 时自动刷新 Token 并重试', async () => {
      let callCount = 0
      const fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/auth/refresh')) {
          return Promise.resolve(new Response(
            JSON.stringify({ data: { accessToken: 'new-at', refreshToken: 'new-rt', expiresIn: 3600, tokenType: 'Bearer' } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ))
        }
        callCount++
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }))
        }
        return Promise.resolve(new Response(JSON.stringify({ data: { id: 1 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }))
      })

      const { createMemoryTokenStorage } = await import('../src/api-client-auth.js')
      const { createTokenManager } = await import('../src/api-client-token-manager.js')
      const storage = createMemoryTokenStorage()
      await storage.setAccessToken('old-token')
      await storage.setRefreshToken('old-refresh')
      const tokenManager = createTokenManager(storage, 'https://api.test.com/auth/refresh', fetch)

      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch }, tokenManager)
      const result = await client.get<{ id: number }>('/protected')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ id: 1 })
      }
      // 原始请求 + 刷新请求 + 重试请求 = 3 次 fetch
      expect(fetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('delete', () => {
    it('dELETE 请求支持 query 参数', async () => {
      const fetch = mockFetch(200, { data: null })
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      await client.delete('/items', { id: '123' })

      const url = (fetch.mock.calls[0] as string[])[0]
      expect(url).toContain('id=123')
    })
  })

  describe('stream', () => {
    it('请求失败时 throw 错误', async () => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Server Error' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      )
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      const chunks: string[] = []
      await expect(async () => {
        for await (const chunk of client.stream('/chat')) {
          chunks.push(chunk)
        }
      }).rejects.toThrow()
      expect(chunks).toHaveLength(0)
    })

    it('解析 SSE data: 行', async () => {
      const sseData = 'data: hello\ndata: world\ndata: [DONE]\n'
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData))
          controller.close()
        },
      })

      const fetch = vi.fn().mockResolvedValue(new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }))
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      const chunks: string[] = []
      for await (const chunk of client.stream('/chat', { message: 'hi' })) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['hello', 'world'])
    })

    it('跨 chunk SSE 行缓冲', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          // 第一个 chunk 在 "data: hel" 处断开
          controller.enqueue(encoder.encode('data: hel'))
          // 第二个 chunk 包含剩余部分
          controller.enqueue(encoder.encode('lo\ndata: world\n'))
          controller.close()
        },
      })

      const fetch = vi.fn().mockResolvedValue(new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }))
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      const chunks: string[] = []
      for await (const chunk of client.stream('/chat')) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['hello', 'world'])
    })

    it('超时抛出错误', async () => {
      const fetch = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'))
          })
        })
      })
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch, timeout: 50 })

      await expect(async () => {
        for await (const _chunk of client.stream('/chat')) {
          // 不应到达
        }
      }).rejects.toThrow()
    })

    it('支持外部 AbortSignal 主动取消', async () => {
      const fetch = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          if (init.signal.aborted) {
            reject(new DOMException('The operation was aborted', 'AbortError'))
            return
          }
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'))
          })
        })
      })
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch, timeout: 5_000 })
      const controller = new AbortController()

      controller.abort()

      await expect(async () => {
        for await (const _chunk of client.stream('/chat', undefined, { signal: controller.signal })) {
          // 不应到达
        }
      }).rejects.toThrow('aborted')
    })

    it('在流式读取阶段超时会抛出超时错误', async () => {
      const encoder = new TextEncoder()
      const fetch = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: first\n'))
            init.signal.addEventListener('abort', () => {
              controller.error(new DOMException('The operation was aborted', 'AbortError'))
            })
          },
        })

        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }))
      })

      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch, timeout: 30 })

      await expect(async () => {
        for await (const _chunk of client.stream('/chat')) {
          // 第一个 chunk 后会阻塞，随后触发超时
        }
      }).rejects.toThrow()
    })

    it('401 时自动刷新 Token 并重试', async () => {
      const encoder = new TextEncoder()
      let callCount = 0
      const fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/auth/refresh')) {
          return Promise.resolve(new Response(
            JSON.stringify({ data: { accessToken: 'new-at', refreshToken: 'new-rt', expiresIn: 3600, tokenType: 'Bearer' } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ))
        }
        callCount++
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }))
        }
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: ok\n'))
            controller.close()
          },
        })
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }))
      })

      const { createMemoryTokenStorage } = await import('../src/api-client-auth.js')
      const { createTokenManager } = await import('../src/api-client-token-manager.js')
      const storage = createMemoryTokenStorage()
      await storage.setAccessToken('old-token')
      await storage.setRefreshToken('old-refresh')
      const tokenManager = createTokenManager(storage, 'https://api.test.com/auth/refresh', fetch)

      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch }, tokenManager)

      const chunks: string[] = []
      for await (const chunk of client.stream('/chat')) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['ok'])
      // 原始请求 + 刷新请求 + 重试请求 = 3 次 fetch
      expect(fetch).toHaveBeenCalledTimes(3)
    })
  })
})
