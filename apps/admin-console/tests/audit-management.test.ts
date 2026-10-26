/** 审计查询与手动归档的真实持久化、权限和重复请求边界。 */
import type { RequestEvent } from '@sveltejs/kit'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { ADMIN_DUTIES } from '../src/lib/server/security-roles.js'
import { load } from '../src/routes/admin/logs/+page.server.js'
import { POST } from '../src/routes/api/audit/backup/+server.js'

let directory = ''
beforeAll(async () => {
  const created = await mkdtemp(path.join(tmpdir(), 'hai-audit-management-'))
  const actual = await realpath(created)
  if (!actual.startsWith(path.join(await realpath(tmpdir()), 'hai-audit-management-')))
    throw new Error('Unexpected audit management fixture path')
  directory = actual
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
  expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
  expect((await audit.init({ storage, backup: { enabled: true } })).success).toBe(true)
  expect((await iam.init({})).success).toBe(true)
  const configFile = path.join(directory, 'audit.yml')
  await writeFile(configFile, 'backup:\n  enabled: true\n')
  expect(core.config.load('audit', configFile).success).toBe(true)
})
afterAll(async () => {
  try {
    core.config.clear('audit')
    await iam.close()
    await audit.close()
    await storage.close()
    await cache.close()
    await reldb.close()
  }
  finally {
    if (directory)
      await rm(directory, { recursive: true, force: true })
  }
})

function session(code: keyof typeof ADMIN_DUTIES) {
  return { userId: code, roles: [code], permissions: [...ADMIN_DUTIES[code]] }
}

function backupRequest(code: keyof typeof ADMIN_DUTIES, id: string): RequestEvent {
  // 仅模拟框架事件的可信会话字段，其余写入/读取和归档均执行真实服务。
  return {
    request: new Request('https://app.test/api/audit/backup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }),
    locals: { session: session(code) },
    cookies: { get: () => undefined },
  } as RequestEvent
}

it('只有审计职责可备份，相同编号的重复请求核对并复用原归档', async () => {
  const id = crypto.randomUUID()
  for (const code of ['admin', 'config_admin', 'business_operator', 'user'] as const)
    expect((await POST(backupRequest(code, id))).status).toBe(403)
  const first = await POST(backupRequest('audit_admin', id))
  expect(first.status).toBe(200)
  const result: unknown = await first.json()
  expect(result).toMatchObject({ success: true, data: { id, key: expect.stringContaining('hai-private/audit-backups/'), recordCount: expect.any(Number), sha256: expect.stringMatching(/^[a-f\d]{64}$/) } })
  const second = await POST(backupRequest('audit_admin', id))
  expect(second.status).toBe(200)
  expect(await second.json()).toEqual(result)
})

it('分类查询、排序和统计使用服务端白名单，无审计权限不能直接加载页面', async () => {
  for (const category of ['system', 'business'] as const)
    expect((await audit.log({ category, action: 'management-filter', resource: 'fixture', outcome: category === 'system' ? 'denied' : 'success', severity: category === 'system' ? 'warning' : 'info' })).success).toBe(true)
  const response = await load({ url: new URL('https://app.test/admin/logs?category=system&outcome=denied&severity=warning&resource=fixture&sortBy=action&sortDirection=asc'), locals: { session: session('audit_admin') } } as Parameters<typeof load>[0])
  expect(response).toMatchObject({ logs: [{ action: 'management-filter', category: 'system', outcome: 'denied', severity: 'warning' }], stats: [{ action: 'management-filter', count: 1 }], backupEnabled: true })
  await expect(load({ url: new URL('https://app.test/admin/logs'), locals: { session: session('admin') } } as Parameters<typeof load>[0])).rejects.toMatchObject({ status: 403 })
  await expect(load({ url: new URL('https://app.test/admin/logs?sortBy=DROP_TABLE'), locals: { session: session('audit_admin') } } as Parameters<typeof load>[0])).rejects.toMatchObject({ status: 400 })
})

it('关闭备份时已授权的手动入口仍返回失败', async () => {
  expect((await audit.init({ storage, backup: { enabled: false } })).success).toBe(true)
  const response = await POST(backupRequest('audit_admin', crypto.randomUUID()))
  expect(response.status).toBeGreaterThanOrEqual(400)
  expect(await response.json()).toMatchObject({ success: false })
})
