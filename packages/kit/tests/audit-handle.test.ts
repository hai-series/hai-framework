/** 请求入口绑定真实审计持久化，验证拒绝、异常及业务事件的关联上下文。 */
import type { RequestEvent } from '@sveltejs/kit'
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createHandle } from '../src/hooks/index.js'

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } })).success).toBe(true)
  expect((await audit.init()).success).toBe(true)
})
afterEach(async () => {
  await audit.close()
  await reldb.close()
})

function event(path: string, method = 'POST'): RequestEvent {
  const url = new URL(path, 'https://example.test')
  // 夹具只模拟平台提供的 RequestEvent；数据库写入和 hook 流程使用真实实现。
  return {
    request: new Request(url, { method, headers: { 'authorization': 'Bearer example-token', 'x-forwarded-for': '192.0.2.9', 'x-request-id': 'kit-audit-request', 'user-agent': 'audit-test' } }),
    url,
    locals: {},
    cookies: { get: () => undefined },
    getClientAddress: () => '127.0.0.1',
    route: { id: path },
  } as RequestEvent
}

const actor = { userId: 'actor-kit', username: 'Kit actor', roles: ['operator'], permissions: ['orders.write'] }

it('业务显式事件和入口事件共享身份快照及可信地址，读取默认跳过', async () => {
  const handle = createHandle({ logging: false, auth: { verifyToken: async () => actor } })
  const response = await handle({ event: event('/api/orders'), resolve: async () => {
    expect((await audit.log({ action: 'order.confirm', resource: 'orders', resourceId: 'order-1' })).success).toBe(true)
    return new Response('OK')
  } })
  expect(response.status).toBe(200)
  expect(await audit.list({ requestId: 'kit-audit-request' })).toMatchObject({ success: true, data: { total: 2, items: expect.arrayContaining([
    expect.objectContaining({ action: 'order.confirm', userId: 'actor-kit', actorSnapshot: { id: 'actor-kit', username: 'Kit actor', roles: ['operator'] }, ipAddress: '127.0.0.1', userAgent: 'audit-test', category: 'business' }),
    expect.objectContaining({ action: 'request.execute', outcome: 'success' }),
  ]) } })
  await handle({ event: event('/api/orders', 'GET'), resolve: async () => new Response('OK') })
  expect(await audit.list()).toMatchObject({ success: true, data: { total: 2 } })
})

it('守卫跳转也记录拒绝，异常只记录状态不复制错误内容', async () => {
  const guarded = createHandle({ logging: false, guards: [{ guard: () => ({ allowed: false, redirect: '/auth/login' }) }] })
  expect((await guarded({ event: event('/admin/iam/users', 'GET'), resolve: async () => new Response('unreachable') })).status).toBe(302)
  expect(await audit.list({ outcome: 'denied' })).toMatchObject({ success: true, data: { total: 1, items: [{ category: 'system', severity: 'warning', actorSnapshot: null }] } })
  const handle = createHandle({ logging: false, auth: { verifyToken: async () => actor } })
  expect((await handle({ event: event('/api/orders'), resolve: async () => {
    throw new Error('Private database connection string')
  } })).status).toBe(500)
  const failures = await audit.list({ outcome: 'failure' })
  expect(failures).toMatchObject({ success: true, data: { total: 1, items: [{ userId: 'actor-kit', severity: 'error' }] } })
  if (failures.success)
    expect(failures.data.items[0]!.details).not.toContain('Private database')
})
