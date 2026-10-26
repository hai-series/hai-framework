/** 三种真实数据库验证最小业务配置、服务端职责和审计事务边界。 */
import type { RequestEvent } from '@sveltejs/kit'
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../../packages/reldb/tests/helpers/reldb-test-suite.js'
import { initBusinessSettings, readBusinessSettings, saveBusinessSettings } from '../src/lib/server/business-settings.js'
import { ADMIN_DUTIES } from '../src/lib/server/security-roles.js'
import { GET, PUT } from '../src/routes/api/business/settings/+server.js'

function tests() {
  beforeEach(async () => {
    expect((await reldb.ddl.dropTable('app_business_settings', true)).success).toBe(true)
    expect((await initBusinessSettings()).success).toBe(true)
    expect((await reldb.ddl.createTable('app_settings_actors', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } })).success).toBe(true)
    expect((await audit.init({ userTable: 'app_settings_actors' })).success).toBe(true)
  })
  afterEach(async () => {
    await audit.close()
  })

  it('配置员可保存公开公告，其余三类职责的直接API请求均被拒绝', async () => {
    for (const code of ['admin', 'audit_admin', 'config_admin', 'user'] as const) {
      const url = new URL('https://app.test/api/business/settings')
      const event = {
        url,
        request: new Request(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notice: '业务公告：安全配置已更新。' }) }),
        locals: { session: { userId: code, roles: [code], permissions: [...ADMIN_DUTIES[code]] } },
        cookies: { get: () => undefined },
      } as RequestEvent
      const response = await PUT(event)
      expect(response.status).toBe(code === 'config_admin' ? 200 : 403)
      const read = await GET(event)
      expect(read.status).toBe(code === 'config_admin' ? 200 : 403)
    }
    expect(await readBusinessSettings()).toMatchObject({ success: true, data: { notice: '业务公告：安全配置已更新。' } })
  })

  it('更新和业务审计同事务提交，审计关闭时不能产生无审计的配置修改', async () => {
    const requestId = `settings-${crypto.randomUUID()}`
    await audit.withContext({ requestId, actor: { id: 'config-actor', roles: ['config_admin'] } }, async () => {
      expect(await saveBusinessSettings({ notice: '公开内容，不能作为审计明细复制' })).toMatchObject({ success: true })
    })
    const records = await audit.list({ requestId, category: 'business', action: 'business.configuration.update' })
    expect(records).toMatchObject({ success: true, data: { total: 1, items: [{ actorSnapshot: { id: 'config-actor', roles: ['config_admin'] } }] } })
    if (records.success)
      expect(records.data.items[0]?.details).not.toContain('公开内容')
    await audit.close()
    expect((await saveBusinessSettings({ notice: '未提交的新内容' })).success).toBe(false)
    expect(await readBusinessSettings()).toMatchObject({ success: true, data: { notice: '公开内容，不能作为审计明细复制' } })
    expect((await saveBusinessSettings({ notice: 'x'.repeat(201) })).success).toBe(false)
  })
}

for (const [name, setup] of [['sqlite', sqliteMemoryEnv], ['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const)
  defineDbSuite(`business settings ${name}`, setup, tests, { database: reldb, resetConnection: true })
