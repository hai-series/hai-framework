/** Cookie 端点真实撤销：旧页面响应不能删除下一次登录建立的 Cookie。 */
import type { RequestEvent } from '@sveltejs/kit'
import { cache } from '@h-ai/cache'
import { core, HaiCommonError } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

beforeAll(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
  expect((await iam.init({
    seedDefaultData: false,
    rbac: { enabled: false },
  })).success).toBe(true)
})
afterAll(async () => {
  await iam.close()
  await cache.close()
  await reldb.close()
})

it('退出指纹匹配时撤销过期 access 的关联 refresh，并保留新会话', async () => {
  expect((await iam.user.createUser({ username: 'page-close-kit', password: 'ExampleOnly123!' })).success).toBe(true)
  const old = await iam.auth.login({ identifier: 'page-close-kit', password: 'ExampleOnly123!' })
  const next = await iam.auth.login({ identifier: 'page-close-kit', password: 'ExampleOnly123!' })
  if (!old.success || !next.success)
    throw new Error('Login fixture failed')
  const session = await iam.session.get(old.data.tokens.accessToken)
  if (!session.success || !session.data)
    throw new Error('Missing old session')
  expect((await iam.session.update(old.data.tokens.accessToken, {
    expiresAt: new Date(Date.now() - 1),
  }, session.data.version)).success).toBe(true)
  const sessionFingerprint = kit.auth.sessionFingerprint(old.data.tokens.accessToken)
  const nextSessionFingerprint = kit.auth.sessionFingerprint(next.data.tokens.accessToken)
  expect(sessionFingerprint).toMatch(/^[0-9a-f]{64}$/)
  expect(sessionFingerprint).not.toBe(nextSessionFingerprint)
  expect(sessionFingerprint).not.toContain(old.data.tokens.accessToken)
  const cookies = {
    get: vi.fn().mockReturnValue(old.data.tokens.accessToken),
    set: vi.fn(),
    delete: vi.fn(),
  }
  // 平台 RequestEvent 只提供 handler 所需字段；IAM 与持久化为真实实现。
  const close = (input: object, accessToken?: string) => {
    const headers = new Headers({ 'content-type': 'application/json' })
    if (accessToken)
      headers.set('Authorization', `Bearer ${accessToken}`)
    return kit.auth.createApi(iam).closeSession({
      request: new Request('https://app.test/api/auth/session/close', {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      }),
      cookies,
      locals: {},
    } as RequestEvent)
  }
  cookies.get.mockReturnValueOnce(next.data.tokens.accessToken)
  expect((await close({ sessionFingerprint })).ok).toBe(true)
  expect((await iam.auth.verifyToken(next.data.tokens.accessToken)).success).toBe(true)
  cookies.get.mockReturnValueOnce(next.data.tokens.accessToken)
  expect((await close({ sessionFingerprint }, next.data.tokens.accessToken)).ok).toBe(true)
  expect((await iam.auth.verifyToken(next.data.tokens.accessToken)).success).toBe(true)
  cookies.get.mockReturnValueOnce(next.data.tokens.accessToken)
  expect((await close({})).ok).toBe(true)
  expect((await iam.auth.verifyToken(next.data.tokens.accessToken)).success).toBe(true)

  const response = await close({ sessionFingerprint })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ success: true })
  expect(cookies.set).not.toHaveBeenCalled()
  expect(cookies.delete).not.toHaveBeenCalled()
  expect(response.headers.getSetCookie()).toEqual([])
  expect((await iam.session.refresh(old.data.tokens.refreshToken)).success).toBe(false)
  expect((await iam.auth.verifyToken(next.data.tokens.accessToken)).success).toBe(true)

  // 非 Cookie 客户端仍可使用所持凭据明确关闭指定会话。
  expect((await close({ accessToken: next.data.tokens.accessToken })).ok).toBe(true)
  expect((await iam.auth.verifyToken(next.data.tokens.accessToken)).success).toBe(false)
})

it('标准登录端点使用传入的 IAM，按当前请求配置写 Cookie', async () => {
  const username = 'request-bound-login'
  const password = 'ExampleOnly123!'
  expect((await iam.user.createUser({ username, password })).success).toBe(true)
  const configuredOperations = vi.fn(() => {
    throw new Error('Standard authentication should use its own IAM')
  })
  const handle = kit.createHandle({
    logging: false,
    auth: {
      cookieName: 'host_access',
      operations: configuredOperations,
      verifyToken: async () => core.err(HaiCommonError.UNAUTHORIZED),
    },
  })
  const url = new URL('https://app.test/api/auth/login')
  const cookies = {
    get: vi.fn(),
    set: vi.fn(),
  }
  // 平台 RequestEvent 只提供 Hook 和 handler 所需字段。
  const event = {
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: username, password }),
    }),
    url,
    cookies,
    route: { id: '/api/auth/login' },
    locals: {},
  } as RequestEvent

  const response = await handle({ event, resolve: kit.auth.createApi(iam).login })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    success: true,
    data: {
      user: { username },
    },
  })
  expect(configuredOperations).not.toHaveBeenCalled()
  expect(cookies.set).toHaveBeenCalledExactlyOnceWith('host_access', expect.any(String), expect.objectContaining({ httpOnly: true }))
})
