import type { ServContext } from '../src/serv-context.js'
import { core, err, ok } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
import { mapHaiError, requireAuth, requirePermission } from '../src/serv-pipeline.js'

const logger = core.logger.child({ module: 'serv-test' })

function makeContext(overrides: Partial<ServContext> = {}): ServContext {
  return {
    requestId: 'req-1',
    locale: 'zh-CN',
    request: new Request('https://test.local'),
    logger,
    ...overrides,
  }
}

describe('pipeline.orpc', () => {
  it('mapHaiError converts thrown errors into HaiResult', async () => {
    const handler = mapHaiError<unknown, never>(async () => {
      throw new Error('boom')
    })

    const result = await handler({ input: undefined, context: makeContext() })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toContain('common')
      expect(result.error.message).toBe('服务器内部错误')
    }
  })

  it('requireAuth rejects requests without session', async () => {
    const handler = requireAuth<unknown, string>(async () => ok('ok'))

    const result = await handler({ input: undefined, context: makeContext() })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.message).toBe('未登录或登录已失效')
  })

  it('requireAuth rejects requests with token but no session (invalid / unverified token)', async () => {
    const handler = requireAuth<unknown, string>(async () => ok('ok'))

    // accessToken 存在但 session 未注入（模拟 createContext 验证失败的情况）
    const result = await handler({ input: undefined, context: makeContext({ accessToken: 'fake-token-xyz' }) })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.message).toBe('未登录或登录已失效')
  })

  it('requireAuth passes through when session is present', async () => {
    const handler = requireAuth<unknown, string>(async () => ok('ok'))

    const result = await handler({
      input: undefined,
      context: makeContext({
        accessToken: 'valid-token',
        session: { userId: 'u1', roles: [], permissions: [] },
      }),
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('ok')
    }
  })

  it('requirePermission denies missing permissions', async () => {
    const handler = requirePermission<unknown, string>(
      'iam.users.read',
      async () => ok('ok'),
    )

    const context = makeContext({
      accessToken: 'abc',
      session: { userId: 'u1', roles: [], permissions: [] },
    })
    const result = await handler({ input: undefined, context })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.message).toBe('无权执行该操作')
  })

  it('requirePermission grants wildcard permission', async () => {
    const handler = requirePermission<unknown, string>(
      'iam.users.read',
      async () => ok('ok'),
    )

    const context = makeContext({
      accessToken: 'abc',
      session: { userId: 'u1', roles: [], permissions: ['*'] },
    })
    const result = await handler({ input: undefined, context })
    expect(result.success).toBe(true)
  })

  it('requirePermission propagates handler errors via HaiResult', async () => {
    const handler = requirePermission<unknown, never>('iam.users.read', async () =>
      err({ code: 'iam:custom', httpStatus: 418, system: 'iam', module: 'test' }, 'custom error'))

    const context = makeContext({
      accessToken: 'abc',
      session: { userId: 'u1', roles: [], permissions: ['iam.users.read'] },
    })
    const result = await handler({ input: undefined, context })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('iam:custom')
    }
  })
})
