/**
 * @h-ai/api-client — 单例生命周期测试
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api-client-main.js'
import { HaiApiClientError } from '../src/api-client-types.js'

describe('api singleton lifecycle', () => {
  afterEach(async () => {
    await api.close()
  })

  it('初始状态为未初始化', () => {
    expect(api.isInitialized).toBe(false)
    expect(api.config).toBeNull()
  })

  it('init 成功后 isInitialized 为 true', async () => {
    const fetch = vi.fn()
    const result = await api.init({ baseUrl: 'https://api.test.com', fetch })

    expect(result.success).toBe(true)
    expect(api.isInitialized).toBe(true)
    expect(api.config).toEqual({ baseUrl: 'https://api.test.com', fetch })
  })

  it('close 后回到未初始化状态', async () => {
    const fetch = vi.fn()
    await api.init({ baseUrl: 'https://api.test.com', fetch })

    await api.close()

    expect(api.isInitialized).toBe(false)
    expect(api.config).toBeNull()
  })

  it('重复 close 不报错', async () => {
    await api.close()
    await api.close()
    expect(api.isInitialized).toBe(false)
  })

  it('重复 init 会先 close 再重新初始化', async () => {
    const fetch1 = vi.fn()
    const fetch2 = vi.fn()
    await api.init({ baseUrl: 'https://api1.test.com', fetch: fetch1 })
    await api.init({ baseUrl: 'https://api2.test.com', fetch: fetch2 })

    expect(api.isInitialized).toBe(true)
    expect(api.config?.baseUrl).toBe('https://api2.test.com')
  })

  describe('未初始化时操作返回 NOT_INITIALIZED', () => {
    it('get 返回 NOT_INITIALIZED', async () => {
      const result = await api.get('/test')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiApiClientError.NOT_INITIALIZED.code)
      }
    })

    it('post 返回 NOT_INITIALIZED', async () => {
      const result = await api.post('/test', { data: 1 })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiApiClientError.NOT_INITIALIZED.code)
      }
    })

    it('call 返回 NOT_INITIALIZED', async () => {
      const { z } = await import('zod')
      const { defineEndpoint } = await import('../src/api-client-types.js')
      const endpoint = defineEndpoint({
        method: 'GET',
        path: '/test',
        input: z.object({}),
        output: z.object({}),
      })

      const result = await api.call(endpoint, {})

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiApiClientError.NOT_INITIALIZED.code)
      }
    })

    it('stream 未初始化时迭代抛出异常', async () => {
      await expect(async () => {
        for await (const _chunk of api.stream('/chat')) {
          // 不应到达
        }
      }).rejects.toThrow()
    })
  })
})
