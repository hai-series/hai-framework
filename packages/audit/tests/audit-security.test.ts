/** 三种真实数据库中的身份快照、分类、隐私与最低保留保护。 */
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { audit, migrateAudit } from '../src/index.js'

function tests() {
  beforeEach(async () => {
    for (const table of ['hai_audit_logs', 'hai_audit_policy', 'hai_audit_alert_claims', 'hai_schema_migrations', 'audit_security_users'])
      expect((await reldb.ddl.dropTable(table, true)).success).toBe(true)
    expect((await reldb.ddl.createTable('audit_security_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } })).success).toBe(true)
    expect((await reldb.sql.execute('INSERT INTO audit_security_users (id, username) VALUES (?, ?)', ['actor-1', 'Original name'])).success).toBe(true)
    expect((await audit.init({ userTable: 'audit_security_users' })).success).toBe(true)
  })
  afterEach(async () => {
    await audit.close()
  })

  it('记录事件时身份而非读取时身份，分类与请求字段随记录保留', async () => {
    const written = await audit.log({ userId: 'actor-1', category: 'system', outcome: 'denied', severity: 'warning', action: 'permission.check', resource: 'users', requestId: 'request-1', traceId: 'trace-1', scopeId: 'tenant-1' })
    expect(written).toMatchObject({ success: true, data: { category: 'system', outcome: 'denied', severity: 'warning', requestId: 'request-1', traceId: 'trace-1', scopeId: 'tenant-1', actorSnapshot: { id: 'actor-1', username: 'Original name' } } })
    expect((await reldb.sql.execute('UPDATE audit_security_users SET username = ? WHERE id = ?', ['Renamed user', 'actor-1'])).success).toBe(true)
    const listed = await audit.list({ category: 'system', outcome: 'denied' })
    expect(listed).toMatchObject({ success: true, data: { total: 1, items: [{ username: 'Original name', actorSnapshot: { username: 'Original name' } }] } })
  })

  it('并发异步请求上下文相互隔离，角色快照不随调用者后续修改', async () => {
    const roles = ['auditor']
    await Promise.all(['a', 'b'].map(id => audit.withContext({ requestId: id, actor: { id, username: `actor-${id}`, roles }, ipAddress: '192.0.2.8', userAgent: 'test-agent' }, async () => {
      await Promise.resolve()
      const result = await audit.log({ action: `context.${id}`, resource: 'reports' })
      expect(result).toMatchObject({ success: true, data: { userId: id, requestId: id, actorSnapshot: { id, roles: ['auditor'] }, ipAddress: '192.0.2.8' } })
    })))
    roles.push('later-role')
    const logs = await audit.list()
    expect(logs.success && logs.data.items.every(item => item.actorSnapshot?.roles?.length === 1)).toBe(true)
    expect((await audit.log({ action: 'outside-context', resource: 'reports' }))).toMatchObject({ success: true, data: { userId: null, requestId: null } })
  })

  it('凭据永远脱敏，业务隐私及自定义字段可以配置开关', async () => {
    expect((await audit.init({ userTable: 'audit_security_users', privacy: { enabled: true, fields: ['customerMemo'] } })).success).toBe(true)
    const details = { captcha: 'private-captcha-proof', password: 'private-password', accessToken: 'private-token', email: 'alice@example.com', nested: { phone: '13900000000', customerMemo: 'private-business-value' } }
    const result = await audit.log({ action: 'privacy', resource: 'orders', details })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.details).not.toContain('private-')
      expect(result.data.details).not.toContain('alice@example.com')
      expect(result.data.details).not.toContain('13900000000')
    }
    expect(details.password).toBe('private-password')
    expect((await audit.init({ userTable: 'audit_security_users', privacy: { enabled: false } })).success).toBe(true)
    const disabled = await audit.log({ action: 'privacy-disabled', resource: 'orders', details })
    expect(disabled.success).toBe(true)
    if (disabled.success) {
      expect(disabled.data.details).toContain('alice@example.com')
      expect(disabled.data.details).not.toContain('private-password')
      expect(disabled.data.details).not.toContain('private-token')
      expect(disabled.data.details).not.toContain('private-captcha-proof')
    }
  })

  it('敏感字段值为对象或数组时整体遮盖，关闭业务隐私仍遮盖凭据对象', async () => {
    expect((await audit.init({ userTable: 'audit_security_users', privacy: { enabled: true, fields: ['customerMemo'] } })).success).toBe(true)
    const details = { customerMemo: { content: 'nested-private-memo' }, password: { value: 'nested-secret-password' }, shippingAddress: ['private-address'] }
    const protectedLog = await audit.log({ action: 'object-privacy', resource: 'orders', details })
    expect(protectedLog.success).toBe(true)
    if (protectedLog.success) {
      expect(protectedLog.data.details).not.toContain('nested-private-memo')
      expect(protectedLog.data.details).not.toContain('nested-secret-password')
      expect(protectedLog.data.details).not.toContain('private-address')
    }
    expect((await audit.init({ userTable: 'audit_security_users', privacy: { enabled: false } })).success).toBe(true)
    const disabled = await audit.log({ action: 'object-privacy-off', resource: 'orders', details })
    expect(disabled.success).toBe(true)
    if (disabled.success) {
      expect(disabled.data.details).toContain('nested-private-memo')
      expect(disabled.data.details).not.toContain('nested-secret-password')
    }
  })

  it('类实例及自定义 JSON 序列化生成的字段同样脱敏', async () => {
    class CredentialDto {
      password = 'private-class-password'
      email = 'class@example.com'
      status = 'paid'
    }
    class JsonDto {
      toJSON() {
        return { accessToken: 'private-json-token', phone: '13900000001', status: 'ready' }
      }
    }
    const details = { dto: new CredentialDto(), serialized: new JsonDto() }
    const result = await audit.log({ action: 'serialized-privacy', resource: 'orders', details })
    expect(result.success).toBe(true)
    if (result.success) {
      const stored = result.data.details!
      for (const secret of ['private-class-password', 'class@example.com', 'private-json-token', '13900000001'])
        expect(stored).not.toContain(secret)
      expect(stored).toContain('paid')
      expect(stored).toContain('ready')
    }
    expect(details.dto.password).toBe('private-class-password')
    expect((await audit.init({ userTable: 'audit_security_users', privacy: { enabled: false } })).success).toBe(true)
    const privacyOff = await audit.log({ action: 'serialized-privacy-off', resource: 'orders', details })
    expect(privacyOff.success).toBe(true)
    if (privacyOff.success) {
      expect(privacyOff.data.details).not.toContain('private-class-password')
      expect(privacyOff.data.details).not.toContain('private-json-token')
      expect(privacyOff.data.details).toContain('class@example.com')
    }
  })

  it('分类查询、受控排序和分类统计保留真实数量', async () => {
    for (const [action, category] of [['z-event', 'business'], ['a-event', 'system'], ['b-event', 'system']] as const)
      expect((await audit.log({ action, resource: 'orders', category })).success).toBe(true)
    const list = await audit.list({ category: 'system', sortBy: 'action', sortDirection: 'asc' })
    expect(list).toMatchObject({ success: true, data: { total: 2, items: [{ action: 'a-event' }, { action: 'b-event' }] } })
    const statistics = await audit.getStats(7, { category: 'system' })
    expect(statistics.success && statistics.data.reduce((total, item) => total + item.count, 0)).toBe(2)
    expect(await audit.list({ sortBy: 'created_at; DROP TABLE hai_audit_logs' as 'createdAt' })).toMatchObject({ success: false })
  })

  it('自定义中文隐私字段只屏蔽指定键，不误屏蔽其他中文业务字段', async () => {
    expect((await audit.init({ userTable: 'audit_security_users', privacy: { fields: ['客户备注'] } })).success).toBe(true)
    const result = await audit.log({ action: 'localized-privacy', resource: 'orders', details: { 客户备注: 'private memo', 订单状态: 'paid' } })
    expect(result).toMatchObject({ success: true })
    if (result.success)
      expect(JSON.parse(result.data.details!)).toEqual({ 客户备注: '[REDACTED]', 订单状态: 'paid' })
  })

  it('启用最低保留时 cleanup(0) 与数据库直接改删均不能绕过，显式关闭后可清理', async () => {
    const ids: string[] = []
    for (const days of [91, 1]) {
      const result = await audit.log({ action: 'retained', resource: 'audit' })
      if (!result.success)
        throw new Error(result.error.message)
      ids.push(result.data.id)
      const date = new Date(Date.now() - days * 86400_000)
      expect((await reldb.sql.execute('UPDATE hai_audit_logs SET created_at = ? WHERE id = ?', [reldb.config?.type === 'sqlite' ? date.getTime() : date, result.data.id])).success).toBe(true)
    }
    expect((await audit.init({ userTable: 'audit_security_users', retention: { enabled: true, minDays: 90 } })).success).toBe(true)
    expect(await audit.cleanup(0)).toEqual({ success: true, data: 1 })
    expect((await reldb.sql.execute('UPDATE hai_audit_logs SET action = ? WHERE id = ?', ['tampered', ids[1]])).success).toBe(false)
    expect((await reldb.sql.execute('DELETE FROM hai_audit_logs WHERE id = ?', [ids[1]])).success).toBe(false)
    const overwrite = reldb.config?.type === 'sqlite' ? 'INSERT OR REPLACE' : reldb.config?.type === 'mysql' ? 'REPLACE' : 'INSERT'
    const conflict = reldb.config?.type === 'postgresql' ? ' ON CONFLICT(id) DO UPDATE SET action=EXCLUDED.action' : ''
    const now = new Date()
    expect((await reldb.sql.execute(`${overwrite} INTO hai_audit_logs (id, action, resource, created_at) VALUES (?, ?, ?, ?)${conflict}`, [ids[1], 'overwritten', 'audit', reldb.config?.type === 'sqlite' ? now.getTime() : now])).success).toBe(false)
    // 未传保留设置的重初始化不静默清除数据库中已经启用的保护。
    expect((await audit.init({ userTable: 'audit_security_users' })).success).toBe(true)
    expect(await audit.cleanup(0)).toEqual({ success: true, data: 0 })
    expect((await audit.init({ userTable: 'audit_security_users', retention: { enabled: false } })).success).toBe(true)
    expect(await audit.cleanup(0)).toEqual({ success: true, data: 1 })
  })

  it('旧表升级保留原始事件，不补造历史身份或结果，预检只读且迁移可重入', async () => {
    await audit.close()
    for (const table of ['hai_audit_logs', 'hai_audit_policy', 'hai_audit_alert_claims', 'hai_schema_migrations'])
      expect((await reldb.ddl.dropTable(table, true)).success).toBe(true)
    expect((await reldb.ddl.createTable('hai_audit_logs', {
      id: { type: 'TEXT', primaryKey: true },
      user_id: { type: 'TEXT' },
      action: { type: 'TEXT' },
      resource: { type: 'TEXT' },
      resource_id: { type: 'TEXT' },
      details: { type: 'JSON' },
      ip_address: { type: 'TEXT' },
      user_agent: { type: 'TEXT' },
      created_at: { type: 'TIMESTAMP' },
    })).success).toBe(true)
    const date = new Date()
    expect((await reldb.sql.execute('INSERT INTO hai_audit_logs (id, user_id, action, resource, created_at) VALUES (?, ?, ?, ?, ?)', ['legacy', 'actor-1', 'legacy-event', 'orders', reldb.config?.type === 'sqlite' ? date.getTime() : date])).success).toBe(true)
    expect(await migrateAudit({ dryRun: true })).toMatchObject({ success: true, data: { currentVersion: 0, changes: ['event-context-and-identity', 'persistent-retention-policy', 'retention-write-guards', ...(reldb.config?.type === 'mysql' ? ['millisecond-event-time'] : []), 'alert-notification-claims', 'event-time-index'] } })
    expect((await audit.init({ userTable: 'audit_security_users' })).success).toBe(true)
    expect(await audit.list()).toMatchObject({ success: true, data: { total: 1, items: [{ id: 'legacy', action: 'legacy-event', category: null, outcome: null, actorSnapshot: null }] } })
    expect(await migrateAudit({ dryRun: true })).toMatchObject({ success: true, data: { changes: [] } })
  })

  it('真实数据库不可用时返回写失败，并提供可观察的事件及请求诊断', async () => {
    const records: unknown[] = []
    const stop = core.logger.observe((record) => {
      records.push(record)
    })
    try {
      await reldb.close()
      const result = await audit.withContext({ requestId: 'failed-audit-write' }, () => audit.log({ action: 'important.failed-write', resource: 'orders' }))
      expect(result.success).toBe(false)
    }
    finally { stop() }
    expect(JSON.stringify(records)).toContain('important.failed-write')
    expect(JSON.stringify(records)).toContain('failed-audit-write')
  })
}

for (const [name, setup] of [['sqlite', sqliteMemoryEnv], ['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const)
  defineDbSuite(`audit security ${name}`, setup, tests, { database: reldb, resetConnection: true })
