/** 自动审计按请求时的模块就绪状态装配；未选 Audit 不制造错误，已选模块真故障仍可定位。 */
import type { RequestEvent } from '@sveltejs/kit'
import { audit } from '@h-ai/audit'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, expect, it, vi } from 'vitest'
import { kit } from '../src/index.js'

afterEach(async () => {
  await audit.close()
  await reldb.close()
  vi.restoreAllMocks()
})

function event(): RequestEvent {
  const url = new URL('https://example.test/api/orders')
  // 平台事件仅提供本入口需要的字段；审计与数据库均使用实际实现。
  return { url, request: new Request(url, { method: 'POST', headers: { 'x-request-id': 'optional-audit-request' } }), cookies: { get: () => undefined }, locals: {}, route: { id: '/api/orders' }, getClientAddress: () => '127.0.0.1' } as RequestEvent
}

async function initializeAudit(): Promise<void> {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } })).success).toBe(true)
  expect((await audit.init()).success).toBe(true)
}

it('未启用 Audit 的默认 handle 不调用自动审计，也不产生未初始化错误', async () => {
  expect(audit.isInitialized).toBe(false)
  const capture = vi.spyOn(audit, 'capture')
  const error = vi.spyOn(core.logger, 'error').mockImplementation(() => {})
  const response = await kit.createHandle()({ event: event(), resolve: async () => new Response('OK') })
  expect(response.status).toBe(200)
  expect(capture).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
  // 业务显式调用的依赖合同保持不变，缺少初始化仍返回可定位错误。
  expect(await audit.capture({ action: 'order.confirm', resource: 'orders' })).toMatchObject({ success: false, error: { code: 'hai:audit:010' } })
})

it('handle 创建后才初始化 Audit，后续请求仍写入真实审计', async () => {
  const handle = kit.createHandle({ logging: false })
  await initializeAudit()
  expect((await handle({ event: event(), resolve: async () => new Response('Created', { status: 201 }) })).status).toBe(201)
  expect(await audit.list({ requestId: 'optional-audit-request' })).toMatchObject({ success: true, data: { total: 1, items: [{ action: 'request.execute', resource: '/api/orders', outcome: 'success' }] } })
})

it('已初始化的 Audit 遇到真实数据库关闭仍记录失败，不把持久化故障当作未选模块', async () => {
  await initializeAudit()
  await reldb.close()
  expect(audit.isInitialized).toBe(true)
  const error = vi.spyOn(core.logger, 'error').mockImplementation(() => {})
  const response = await kit.createHandle({ logging: false })({ event: event(), resolve: async () => new Response('Created', { status: 201 }) })
  expect(response.status).toBe(201)
  expect(error).toHaveBeenCalledWith('Request audit failed', expect.objectContaining({ requestId: 'optional-audit-request', resource: '/api/orders', error: expect.objectContaining({ code: expect.any(String) }) }))
})
