/** 审计读取契约在三种真实数据库中的一致性。 */
import type { StartedTestContainer } from 'testcontainers'
import { randomBytes } from 'node:crypto'
import process from 'node:process'
import { ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { audit, HaiAuditError } from '../src/index.js'

describe.sequential.each(['sqlite', 'postgresql', 'mysql'] as const)('audit 跨库读取契约：%s', (backend) => {
  let container: StartedTestContainer | undefined
  const originalTimezone = process.env.TZ

  beforeAll(async () => {
    // 非 UTC 时区可检验原生 Date 写入与筛选参数的一致性。
    process.env.TZ = 'Asia/Shanghai'
    if (backend === 'sqlite') {
      expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    }
    else {
      const password = randomBytes(20).toString('hex')
      const database = 'audit_contract'
      const port = backend === 'postgresql' ? 5432 : 3306
      const candidate = backend === 'postgresql'
        ? new GenericContainer('docker.io/library/postgres:16.15-alpine')
            .withEnvironment({ POSTGRES_DB: database, POSTGRES_USER: 'db_user', POSTGRES_PASSWORD: password })
            .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
        : new GenericContainer('docker.io/library/mysql:8.4.11')
            .withEnvironment({ MYSQL_DATABASE: database, MYSQL_ROOT_PASSWORD: password })
            .withWaitStrategy(Wait.forLogMessage(/ready for connections\..*port: 3306/))
      container = await candidate.withExposedPorts(port).withStartupTimeout(120_000).start()
      const connection = { host: container.getHost(), port: container.getMappedPort(port), database, password }
      const initialized = backend === 'postgresql'
        ? await reldb.init({ type: 'postgresql', ...connection, user: 'db_user' })
        : await reldb.init({ type: 'mysql', ...connection, user: 'root' })
      expect(initialized.success, initialized.success ? undefined : initialized.error.message).toBe(true)
    }
    expect((await reldb.ddl.createTable('hai_audit_contract_users', {
      id: { type: 'TEXT', primaryKey: true },
      username: { type: 'TEXT', notNull: true },
    }, true)).success).toBe(true)
    expect((await reldb.sql.execute('INSERT INTO hai_audit_contract_users (id, username) VALUES (?, ?)', ['actor_1', 'Operator'])).success).toBe(true)
    expect((await audit.init({ userTable: 'hai_audit_contract_users' })).success).toBe(true)
  }, 180_000)

  afterAll(async () => {
    try {
      await audit.close()
      await reldb.close()
    }
    finally {
      try {
        await container?.stop({ timeout: 10_000, remove: true, removeVolumes: true })
      }
      finally {
        if (originalTimezone === undefined)
          delete process.env.TZ
        else
          process.env.TZ = originalTimezone
      }
    }
  }, 60_000)

  it('列表、最近活动和日期筛选返回完整字段、Date、JSON 字符串及显式空值', async () => {
    const startDate = new Date(Date.now() - 2000)
    const written = await audit.log({ userId: 'actor_1', action: 'delete', resource: 'users', resourceId: 'target_1', details: { label: 'Example' } })
    expect(written.success).toBe(true)
    expect((await audit.log({ action: 'startup', resource: 'system' })).success).toBe(true)
    const endDate = new Date(Date.now() + 2000)

    const listed = await audit.list({ resource: 'users' })
    expect(listed.success, listed.success ? undefined : listed.error.message).toBe(true)
    if (!listed.success)
      return
    expect(listed.data.total).toBe(1)
    const entry = listed.data.items[0]!
    expect(entry).toMatchObject({ userId: 'actor_1', username: 'Operator', action: 'delete', resource: 'users', resourceId: 'target_1', ipAddress: null, userAgent: null })

    const recent = await audit.getUserRecent('actor_1')
    expect(recent.success).toBe(true)
    if (!recent.success)
      return
    expect(recent.data).toHaveLength(1)
    for (const record of [entry, recent.data[0]!]) {
      expect(record).toMatchObject({ userId: 'actor_1', resourceId: 'target_1', ipAddress: null, userAgent: null })
      expect(record.createdAt).toBeInstanceOf(Date)
      expect(record.createdAt.getTime()).toBeGreaterThanOrEqual(startDate.getTime())
      expect(record.createdAt.getTime()).toBeLessThanOrEqual(endDate.getTime())
      expect(typeof record.details).toBe('string')
      expect(JSON.parse(record.details!)).toEqual({ label: 'Example' })
    }

    const filtered = await audit.list({ resource: 'users', startDate, endDate })
    expect(filtered).toMatchObject({ success: true, data: { total: 1 } })
    const system = await audit.list({ resource: 'system' })
    expect(system).toMatchObject({ success: true, data: { items: [{ userId: null, username: null, resourceId: null, details: null, ipAddress: null, userAgent: null }] } })
    const statistics = await audit.getStats()
    expect(statistics.success).toBe(true)
    if (statistics.success) {
      expect(statistics.data).toHaveLength(2)
      expect(statistics.data.every(item => typeof item.count === 'number' && Number.isSafeInteger(item.count) && item.count === 1)).toBe(true)
    }
  })

  if (backend === 'sqlite') {
    it('拒绝驱动返回的超出安全整数范围的统计值', async () => {
      const query = vi.spyOn(reldb.sql, 'query').mockResolvedValueOnce(ok([{ action: 'delete', count: '9007199254740993' }]))
      try {
        expect(await audit.getStats()).toMatchObject({ success: false, error: { code: HaiAuditError.STATS_FAILED.code } })
      }
      finally {
        query.mockRestore()
      }
    })
  }
})
