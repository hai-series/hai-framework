import type { ServContext } from '../src/context/context-types.js'
import { core, err, ok } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
import { mapHaiError, requireAuth, requirePermission } from '../src/pipeline/orpc.js'

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
    }
  })

  it('requireAuth rejects requests without accessToken', async () => {
    const handler = requireAuth<unknown, string>(async () => ok('ok'))

    const result = await handler({ input: undefined, context: makeContext() })
    expect(result.success).toBe(false)
  })

  it('requireAuth passes through when accessToken is present', async () => {
    const handler = requireAuth<unknown, string>(async () => ok('ok'))

    const result = await handler({ input: undefined, context: makeContext({ accessToken: 'abc' }) })
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
