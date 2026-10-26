/** Cookie 端点真实撤销：旧页面响应不能删除下一次登录建立的 Cookie。 */
import type { RequestEvent } from '@sveltejs/kit'
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { kit } from '../src/kit-main.js'

beforeAll(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
  expect((await iam.init({ seedDefaultData: false, rbac: { enabled: false } })).success).toBe(true)
})
afterAll(async () => {
  await iam.close()
  await cache.close()
  await reldb.close()
})

it('使用旧Cookie撤销过期access关联的refresh；不发送清理Cookie命令', async () => {
  expect((await iam.user.createUser({ username: 'page-close-kit', password: 'ExampleOnly123!' })).success).toBe(true)
  const old = await iam.auth.login({ identifier: 'page-close-kit', password: 'ExampleOnly123!' })
  const next = await iam.auth.login({ identifier: 'page-close-kit', password: 'ExampleOnly123!' })
  if (!old.success || !next.success)
    throw new Error('Login fixture failed')
  const session = await iam.session.get(old.data.tokens.accessToken)
  if (!session.success || !session.data)
    throw new Error('Missing old session')
  expect((await iam.session.update(old.data.tokens.accessToken, { expiresAt: new Date(Date.now() - 1) }, session.data.version)).success).toBe(true)
  const cookies = { get: () => old.data.tokens.accessToken, set: vi.fn(), delete: vi.fn() }
  // 平台 RequestEvent 只提供本 handler 使用的字段；IAM 与持久化为真实实现。
  const event = {
    request: new Request('https://app.test/api/auth/session/close', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    cookies,
    locals: {},
  } as RequestEvent
  const response = await kit.auth.createApi(iam).closeSession(event)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ success: true })
  expect(cookies.set).not.toHaveBeenCalled()
  expect(cookies.delete).not.toHaveBeenCalled()
  expect(response.headers.getSetCookie()).toEqual([])
  expect((await iam.session.refresh(old.data.tokens.refreshToken)).success).toBe(false)
  expect((await iam.auth.verifyToken(next.data.tokens.accessToken)).success).toBe(true)
})
