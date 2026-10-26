/** 分级阈值告警使用真实 Reach HTTP 发送与共享数据库去重。 */
import type { Server } from 'node:http'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { audit } from '../src/index.js'

function tests() {
  let server: Server
  let fail = false
  let messages: string[] = []
  const alerts = {
    enabled: true,
    rules: [{ id: 'login-failures', actions: ['auth.login'], outcomes: ['failure' as const], threshold: 2, windowSeconds: 3600, severity: 'critical' as const, targets: [{ id: 'security-team', provider: 'notify', to: 'security@example.invalid' }] }],
  }
  beforeEach(async () => {
    for (const table of ['hai_audit_logs', 'hai_audit_policy', 'hai_audit_alert_claims', 'hai_schema_migrations', 'hai_iam_users'])
      expect((await reldb.ddl.dropTable(table, true)).success).toBe(true)
    expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } })).success).toBe(true)
    messages = []
    fail = false
    server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request)
        chunks.push(Buffer.from(chunk))
      messages.push(Buffer.concat(chunks).toString('utf8'))
      response.writeHead(fail ? 503 : 200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ success: !fail }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing owned alert fixture address')
    expect((await reach.init({ providers: [{ name: 'notify', type: 'api', url: `http://127.0.0.1:${address.port}`, idempotent: true }] })).success).toBe(true)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await audit.close()
    await reach.close()
    if (server) {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
  async function event(outcome: 'success' | 'failure' = 'failure') {
    expect((await audit.log({ action: 'auth.login', resource: 'auth', outcome, severity: 'warning', details: { password: 'private-password', phone: 'private-phone' } })).success).toBe(true)
  }

  it('默认关闭；启用时验证 Reach、规则和目标，调度可独立关闭', async () => {
    expect((await audit.init()).success).toBe(true)
    expect(await audit.checkAlerts()).toMatchObject({ success: false, error: { code: 'hai:audit:024' } })
    expect((await audit.init({ alerts })).success).toBe(false)
    expect((await audit.init({ reach, alerts: { ...alerts, rules: [] } })).success).toBe(false)
    expect((await audit.init({ reach, alerts })).success).toBe(true)
    expect(audit.schedulerPlan).toBeNull()
    expect((await audit.init({ reach, alerts: { ...alerts, schedule: { enabled: true, cron: '*/2 * * * *' } } })).success).toBe(true)
    expect(audit.schedulerPlan).toMatchObject({ tasks: [{ id: 'hai-audit-alerts', cron: '*/2 * * * *' }] })
  })

  it('只计匹配事件，达到阈值按配置等级/人员通知，正文不复制敏感事件字段', async () => {
    expect((await audit.init({ reach, alerts })).success).toBe(true)
    await event('success')
    await event()
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 0, failed: 0 } })
    await event()
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 1, failed: 0 } })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('critical')
    expect(messages[0]).toContain('security@example.invalid')
    expect(messages[0]).not.toContain('private-password')
    expect(messages[0]).not.toContain('private-phone')
    expect(await audit.list({ resource: 'audit.alert' })).toMatchObject({ success: true, data: { total: 2 } })
  })

  it('并发检查和模块重启复用持久领取，每个目标每个窗口只尝试一次', async () => {
    const config = { reach, alerts: { ...alerts, rules: [{ ...alerts.rules[0], threshold: 1, targets: [...alerts.rules[0].targets, { id: 'on-call', provider: 'notify', to: 'oncall@example.invalid' }] }] } }
    expect((await audit.init(config)).success).toBe(true)
    await event()
    const results = await Promise.all(Array.from({ length: 6 }, () => audit.checkAlerts()))
    expect(results.every(result => result.success)).toBe(true)
    expect(messages).toHaveLength(2)
    expect((await audit.init(config)).success).toBe(true)
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 0 } })
    expect(messages).toHaveLength(2)
  })

  it('外部通知失败保留不确定回执，不自动重发；失败可查询且关闭不关闭 Reach', async () => {
    expect((await audit.init({ reach, alerts })).success).toBe(true)
    await event()
    await event()
    fail = true
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 0, failed: 1 } })
    expect(messages).toHaveLength(1)
    fail = false
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 0 } })
    expect(messages).toHaveLength(1)
    expect(await audit.list({ resource: 'audit.alert', outcome: 'failure' })).toMatchObject({ success: true, data: { total: 1 } })
    expect((await audit.close()).success).toBe(true)
    expect(reach.isInitialized).toBe(true)
    expect(await audit.checkAlerts()).toMatchObject({ success: false, error: { code: 'hai:audit:010' } })
  })

  it('已回滚事件不触发通知；取消不领取或发送', async () => {
    expect((await audit.init({ reach, alerts })).success).toBe(true)
    const opened = await reldb.tx.begin()
    if (!opened.success)
      throw new Error(opened.error.message)
    try {
      for (let index = 0; index < 2; index++)
        expect((await audit.log({ action: 'auth.login', resource: 'auth', outcome: 'failure' }, opened.data)).success).toBe(true)
    }
    finally { await opened.data.rollback() }
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 0 } })
    await event()
    await event()
    const cancellation = new AbortController()
    cancellation.abort()
    expect((await audit.checkAlerts({ signal: cancellation.signal })).success).toBe(false)
    expect(messages).toHaveLength(0)
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 1 } })
  })

  it('资源/最低等级筛选和单轮上限有效，后续检查继续未领取的目标', async () => {
    const rule = { ...alerts.rules[0], resource: 'auth', minimumSeverity: 'error' as const, threshold: 1, targets: [...alerts.rules[0].targets, { id: 'second', provider: 'notify', to: 'second@example.invalid' }] }
    expect((await audit.init({ reach, alerts: { enabled: true, maxNotificationsPerCheck: 1, rules: [rule] } })).success).toBe(true)
    await event()
    expect((await audit.log({ action: 'auth.login', resource: 'other', outcome: 'failure', severity: 'critical' })).success).toBe(true)
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 0, more: false } })
    expect((await audit.log({ action: 'auth.login', resource: 'auth', outcome: 'failure', severity: 'error' })).success).toBe(true)
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 1, more: true } })
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 1, more: false } })
    expect(messages).toHaveLength(2)
  })

  it('上一窗口补检，数据库时钟不受节点 Date.now 偏差影响，更旧事件不补发', async () => {
    expect((await audit.init({ reach, alerts: { ...alerts, rules: [{ ...alerts.rules[0], threshold: 1, windowSeconds: 86400 }] } })).success).toBe(true)
    const written = await audit.log({ action: 'auth.login', resource: 'auth', outcome: 'failure' })
    if (!written.success)
      throw new Error(written.error.message)
    const day = 86400000
    const start = Math.floor(written.data.createdAt.getTime() / day) * day
    const date = (value: number) => reldb.config?.type === 'sqlite' ? value : new Date(value)
    expect((await reldb.sql.execute('UPDATE hai_audit_logs SET created_at=? WHERE id=?', [date(start - day / 2), written.data.id])).success).toBe(true)
    vi.spyOn(Date, 'now').mockReturnValue(start + day * 100)
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 1 } })
    vi.restoreAllMocks()
    expect((await reldb.sql.execute('UPDATE hai_audit_logs SET created_at=? WHERE id=?', [date(start - day * 3), written.data.id])).success).toBe(true)
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 0 } })
  })

  it('reach 免打扰延迟仅报告持久入队，并保留可核验的队列回执', async () => {
    const provider = reach.config?.providers[0]
    if (!provider)
      throw new Error('Missing fixture provider')
    const hour = new Date().getHours()
    const clock = (value: number) => `${String(value % 24).padStart(2, '0')}:00`
    expect((await reach.init({ providers: [provider], dnd: { enabled: true, strategy: 'delay', start: clock(hour + 23), end: clock(hour + 1) } })).success).toBe(true)
    expect((await audit.init({ reach, alerts })).success).toBe(true)
    await event()
    await event()
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 0, queued: 1, failed: 0 } })
    const claim = await reldb.sql.get<{ queue_id: string, status: string }>('SELECT queue_id, status FROM hai_audit_alert_claims')
    expect(claim).toMatchObject({ success: true, data: { status: 'queued', queue_id: expect.any(String) } })
    if (claim.success && claim.data)
      expect(await reach.queue.get(claim.data.queue_id)).toMatchObject({ success: true, data: { status: 'pending' } })
    expect(messages).toHaveLength(0)
  })
  it('节点系统时钟偏差不使新审计事件落入未来或漏报', async () => {
    expect((await audit.init({ reach, alerts: { ...alerts, rules: [{ ...alerts.rules[0], threshold: 1 }] } })).success).toBe(true)
    const actual = new Date()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(actual.getTime() + 3 * 3600000)
    try {
      await event()
      expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 1 } })
      const record = await audit.list({ action: 'auth.login' })
      expect(record.success && record.data.items[0].createdAt.getTime()).toBeLessThan(actual.getTime() + 60000)
    }
    finally { vi.useRealTimers() }
  })

  it('检查被挂起后不得领取已超出补检范围的旧窗口，避免已清理领取被重复发送', async () => {
    expect((await audit.init({ reach, alerts: { ...alerts, rules: [{ ...alerts.rules[0], threshold: 1, windowSeconds: 60 }] } })).success).toBe(true)
    const written = await audit.log({ action: 'auth.login', resource: 'auth', outcome: 'failure' })
    if (!written.success)
      throw new Error(written.error.message)
    const at = written.data.createdAt.getTime() - 180000
    expect((await reldb.sql.execute('UPDATE hai_audit_logs SET created_at=? WHERE id=?', [reldb.config?.type === 'sqlite' ? at : new Date(at), written.data.id])).success).toBe(true)
    const get = reldb.sql.get.bind(reldb.sql)
    // 注入过期的检查起点，后续计数、领取和领取时钟均执行真实 SQL。
    vi.spyOn(reldb.sql, 'get').mockImplementation((sql, params) => get(sql.endsWith(' AS now_ms') ? sql.replace(' AS now_ms', '-180000 AS now_ms') : sql, params))
    expect(await audit.checkAlerts()).toMatchObject({ success: true, data: { submitted: 0 } })
    expect(messages).toHaveLength(0)
  })
}

defineDbSuite('audit alerts SQLite', sqliteMemoryEnv, tests)
defineDbSuite('audit alerts PostgreSQL', postgresEnv, tests)
defineDbSuite('audit alerts MySQL', mysqlEnv, tests)
