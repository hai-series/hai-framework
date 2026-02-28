/**
 * =============================================================================
 * @h-ai/scheduler - 任务执行器测试
 * =============================================================================
 */

import { describe, expect, it, vi } from 'vitest'
import { executeApiTask, executeJsTask, executeTask } from '../src/scheduler-executor.js'

describe('executeJsTask', () => {
  it('应成功执行同步函数', async () => {
    const handler = () => ({ count: 42 })
    const result = await executeJsTask('test-task', handler)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('{"count":42}')
    }
  })

  it('应成功执行异步函数', async () => {
    const handler = async () => 'async-result'
    const result = await executeJsTask('test-task', handler)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('"async-result"')
    }
  })

  it('函数返回 undefined 时 result 应为 null', async () => {
    const handler = () => undefined
    const result = await executeJsTask('test-task', handler)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeNull()
    }
  })

  it('函数返回 void 时 result 应为 null', async () => {
    const handler = () => {}
    const result = await executeJsTask('test-task', handler)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeNull()
    }
  })

  it('函数抛出异常时应返回 JS_EXECUTION_FAILED', async () => {
    const handler = () => {
      throw new Error('test error')
    }
    const result = await executeJsTask('test-task', handler)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(10006)
      expect(result.error.message).toContain('test error')
    }
  })

  it('异步函数 reject 时应返回 JS_EXECUTION_FAILED', async () => {
    const handler = async () => {
      throw new Error('async error')
    }
    const result = await executeJsTask('test-task', handler)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(10006)
    }
  })

  it('应将 taskId 传递给 handler', async () => {
    const handler = vi.fn((id: string) => id)
    await executeJsTask('my-task', handler)
    expect(handler).toHaveBeenCalledWith('my-task')
  })
})

describe('executeApiTask', () => {
  it('成功的 GET 请求应返回响应体', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"status":"ok"}'),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await executeApiTask('api-task', {
      url: 'https://example.com/api',
      method: 'GET',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('{"status":"ok"}')
    }

    vi.unstubAllGlobals()
  })

  it('发送 POST 请求应携带请求体', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('created'),
    })
    vi.stubGlobal('fetch', mockFetch)

    await executeApiTask('api-task', {
      url: 'https://example.com/api',
      method: 'POST',
      body: { name: 'test' },
      headers: { 'X-Custom': 'value' },
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"test"}',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Custom': 'value',
        }),
      }),
    )

    vi.unstubAllGlobals()
  })

  it('非 2xx 响应应返回 API_EXECUTION_FAILED', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await executeApiTask('api-task', {
      url: 'https://example.com/api',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(10007)
      expect(result.error.message).toContain('500')
    }

    vi.unstubAllGlobals()
  })

  it('网络错误应返回 API_EXECUTION_FAILED', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const result = await executeApiTask('api-task', {
      url: 'https://example.com/api',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(10007)
      expect(result.error.message).toContain('Network error')
    }

    vi.unstubAllGlobals()
  })
})

describe('executeTask', () => {
  it('执行 JS 任务应生成正确的执行日志', async () => {
    const log = await executeTask({
      id: 'test',
      name: '测试任务',
      type: 'js',
      handler: () => 'done',
    })

    expect(log.taskId).toBe('test')
    expect(log.taskName).toBe('测试任务')
    expect(log.taskType).toBe('js')
    expect(log.status).toBe('success')
    expect(log.result).toBe('"done"')
    expect(log.error).toBeNull()
    expect(log.startedAt).toBeLessThanOrEqual(log.finishedAt)
    expect(log.duration).toBeGreaterThanOrEqual(0)
  })

  it('失败的 JS 任务应记录错误', async () => {
    const log = await executeTask({
      id: 'fail-test',
      name: '失败任务',
      type: 'js',
      handler: () => { throw new Error('boom') },
    })

    expect(log.status).toBe('failed')
    expect(log.result).toBeNull()
    expect(log.error).toContain('boom')
  })

  it('无效任务配置应标记为失败', async () => {
    const log = await executeTask({
      id: 'invalid',
      name: '无效任务',
      type: 'api',
      // 缺少 api 配置
    })

    expect(log.status).toBe('failed')
  })
})
