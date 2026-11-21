import type { HandleServerError } from '@sveltejs/kit/hooks'
import { core } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$app/paths', () => ({
  resolve: (path: string) => path,
}))
vi.mock('#lib/paraglide/server.js', () => ({
  paraglideMiddleware: vi.fn(),
}))
vi.mock('#lib/server/init.js', () => ({
  initApp: vi.fn(),
}))
vi.mock('#lib/server/kit-config.js', () => ({
  getAdminKitConfig: vi.fn(),
}))

type ErrorInput = Parameters<HandleServerError>[0]

function requestEvent(requestId?: string): ErrorInput['event'] {
  // 错误钩子仅使用这些请求字段；框架其余事件能力不会在本用例调用。
  return {
    request: new Request('http://localhost/private?token=PRIVATE_QUERY_TOKEN'),
    route: { id: '/' },
    locals: { requestId, locale: 'zh-CN' },
  } as ErrorInput['event']
}

describe('admin-console server error hook', () => {
  it.each([undefined, 'request-startup-test', 'PRIVATE_TRACE_TOKEN invalid'])('启动错误保留结构化 cause，公开安全消息和关联编号（%s）', async (requestId) => {
    const hooks = await import('../src/hooks.server.js')
    expect(hooks).toHaveProperty('handleError')
    if (!('handleError' in hooks) || typeof hooks.handleError !== 'function')
      throw new Error('Expected server error hook')
    const records: unknown[] = []
    const stop = core.logger.observe(record => records.push(record))
    try {
      const cause = {
        code: 'hai:iam:901',
        message: 'PRIVATE_BACKEND_ERROR',
        ext: {
          fields: ['ldap.url'],
        },
        token: 'PRIVATE_ERROR_TOKEN',
      }
      const error = new Error('PRIVATE_STARTUP_ERROR', { cause })
      const result = await hooks.handleError({
        kind: 'unknown',
        error,
        event: requestEvent(requestId),
      })
      expect(result).toMatchObject({
        message: expect.stringContaining('traceId: '),
      })
      expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|ldap\.url/)
      expect(records).toContainEqual(expect.objectContaining({
        level: 'error',
        context: expect.objectContaining({
          traceId: requestId === 'request-startup-test'
            ? requestId
            : expect.any(String),
          error: expect.objectContaining({
            name: 'Error',
            cause: expect.objectContaining({
              code: 'hai:iam:901',
              ext: {
                fields: ['ldap.url'],
              },
              token: '[REDACTED]',
            }),
          }),
        }),
      }))
      expect(JSON.stringify(records)).not.toMatch(/PRIVATE_ERROR_TOKEN|PRIVATE_QUERY_TOKEN|PRIVATE_TRACE_TOKEN|\[object Object\]/)
      expect(error.cause).toBe(cause)
      expect(cause.token).toBe('PRIVATE_ERROR_TOKEN')
    }
    finally {
      stop()
    }
  })

  it('预期的 HTTP 和校验错误保留框架默认处理', async () => {
    const hooks = await import('../src/hooks.server.js')
    expect(hooks).toHaveProperty('handleError')
    if (!('handleError' in hooks) || typeof hooks.handleError !== 'function')
      throw new Error('Expected server error hook')
    const records: unknown[] = []
    const stop = core.logger.observe(record => records.push(record))
    try {
      for (const input of [
        {
          kind: 'app',
          error: { status: 403, message: 'Denied' },
        },
        {
          kind: 'framework',
          error: { status: 404, message: 'Not Found' },
        },
        {
          kind: 'validation',
          error: { status: 400, message: 'Bad Request' },
          issues: [],
        },
      ] satisfies Omit<ErrorInput, 'event'>[]) {
        expect(await hooks.handleError({
          ...input,
          event: requestEvent(),
        })).toBeUndefined()
      }
      expect(records).toEqual([])
    }
    finally {
      stop()
    }
  })
})
