/**
 * @h-ai/api-client — fetch 层测试
 */

import { describe, expect, it, vi } from 'vitest'
import { createFetchClient } from '../src/api-client-fetch.js'

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
        expect(result.error.code).toBe(6005) // NOT_FOUND
        expect(result.error.status).toBe(404)
      }
    })

    it('500 返回 SERVER_ERROR', async () => {
      const fetch = mockFetch(500, { message: 'Internal error' })
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      const result = await client.get('/crash')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(6002) // SERVER_ERROR
      }
    })

    it('网络异常返回 NETWORK_ERROR', async () => {
      const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      const client = createFetchClient({ baseUrl: 'https://api.test.com', fetch })

      const result = await client.get('/offline')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(6000) // NETWORK_ERROR
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
  })
})
