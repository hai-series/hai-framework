/** 审计读取契约在三种真实数据库中的一致性。 */
import type { ReldbConfigInput } from '@h-ai/reldb'
import type { StartedTestContainer } from 'testcontainers'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { audit, HaiAuditError } from '../src/index.js'

describe.each(['sqlite', 'postgresql', 'mysql'] as const)('audit 跨库读取契约：%s', { concurrent: false }, (backend) => {
  let container: StartedTestContainer | undefined
  let sharedConnection: ReldbConfigInput | undefined
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
      const port = backend === 'postgresql'
        ? 5432
        : 3306
      const candidate = backend === 'postgresql'
        ? new GenericContainer('docker.io/library/postgres:16.15-alpine')
            .withEnvironment({ POSTGRES_DB: database, POSTGRES_USER: 'db_user', POSTGRES_PASSWORD: password })
            .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
        : new GenericContainer('docker.io/library/mysql:8.4.11')
            .withEnvironment({ MYSQL_DATABASE: database, MYSQL_ROOT_PASSWORD: password })
            .withWaitStrategy(Wait.forLogMessage(/ready for connections\..*port: 3306/))
      container = await candidate.withExposedPorts(port).withStartupTimeout(120_000).start()
      const connection = {
        host: container.getHost(),
        port: container.getMappedPort(port),
        database,
        password,
      }
      sharedConnection = backend === 'postgresql'
        ? { type: 'postgresql', ...connection, user: 'db_user' }
        : { type: 'mysql', ...connection, user: 'root' }
      const initialized = await reldb.init(sharedConnection)
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
    const written = await audit.log({
      userId: 'actor_1',
      action: 'delete',
      resource: 'users',
      resourceId: 'target_1',
      details: { label: 'Example' },
    })
    expect(written.success).toBe(true)
    expect((await audit.log({ action: 'startup', resource: 'system' })).success).toBe(true)
    const endDate = new Date(Date.now() + 2000)

    const listed = await audit.list({ resource: 'users' })
    expect(listed.success, listed.success ? undefined : listed.error.message).toBe(true)
    if (!listed.success)
      return
    expect(listed.data.total).toBe(1)
    const entry = listed.data.items[0]!
    expect(entry).toMatchObject({
      userId: 'actor_1',
      username: 'Operator',
      action: 'delete',
      resource: 'users',
      resourceId: 'target_1',
      ipAddress: null,
      userAgent: null,
    })

    const recent = await audit.getUserRecent('actor_1')
    expect(recent.success).toBe(true)
    if (!recent.success)
      return
    expect(recent.data).toHaveLength(1)
    for (const record of [entry, recent.data[0]!]) {
      expect(record).toMatchObject({
        userId: 'actor_1',
        resourceId: 'target_1',
        ipAddress: null,
        userAgent: null,
      })
      expect(record.createdAt).toBeInstanceOf(Date)
      expect(record.createdAt.getTime()).toBeGreaterThanOrEqual(startDate.getTime())
      expect(record.createdAt.getTime()).toBeLessThanOrEqual(endDate.getTime())
      expect(typeof record.details).toBe('string')
      expect(JSON.parse(record.details!)).toEqual({ label: 'Example' })
    }

    const filtered = await audit.list({ resource: 'users', startDate, endDate })
    expect(filtered).toMatchObject({
      success: true,
      data: { total: 1 },
    })
    const system = await audit.list({ resource: 'system' })
    expect(system).toMatchObject({
      success: true,
      data: {
        items: [
          {
            userId: null,
            username: null,
            resourceId: null,
            details: null,
            ipAddress: null,
            userAgent: null,
          },
        ],
      },
    })
    const statistics = await audit.getStats()
    expect(statistics.success).toBe(true)
    if (statistics.success) {
      expect(statistics.data).toHaveLength(2)
      expect(statistics.data.every(item => typeof item.count === 'number' && Number.isSafeInteger(item.count) && item.count === 1)).toBe(true)
    }
  })

  it('查询标识精确区分大小写、重音及末尾空格', async () => {
    for (const userId of [
      'Scope-A',
      'scope-A',
      'Scópe-A',
      'Scope-A ',
    ]) {
      const written = await audit.log({
        userId,
        actorSnapshot: { id: userId },
        scopeId: userId,
        requestId: userId,
        traceId: userId,
        action: userId.trim(),
        resource: 'scope-test',
      })
      expect(written.success).toBe(true)
    }
    for (const condition of [
      { scopeId: 'Scope-A' },
      { requestId: 'Scope-A' },
      { traceId: 'Scope-A' },
      { userId: 'Scope-A' },
    ]) {
      expect(await audit.list({ ...condition, resource: 'scope-test' })).toMatchObject({
        success: true,
        data: {
          total: 1,
          items: [
            { userId: 'Scope-A' },
          ],
        },
      })
      expect(await audit.countByOutcome({ ...condition, resource: 'scope-test' })).toMatchObject({
        success: true,
        data: { total: 1, success: 1 },
      })
    }
    expect(await audit.getUserRecent('Scope-A')).toMatchObject({
      success: true,
      data: [
        { userId: 'Scope-A' },
      ],
    })
    expect(await audit.getStats(7, { scopeId: 'Scope-A', resource: 'scope-test' })).toMatchObject({
      success: true,
      data: [
        { action: 'Scope-A', count: 1 },
      ],
    })
  })

  it('读取异常身份快照时保留真实主体和其余事件字段', async () => {
    const written = await audit.log({
      actorSnapshot: { id: 'historical-actor', username: 'Valid name' },
      action: 'historical-snapshot',
      resource: 'identity',
    })
    expect(written.success).toBe(true)
    if (!written.success)
      return
    const damaged = await reldb.sql.execute('UPDATE hai_audit_logs SET actor_snapshot=? WHERE id=?', [
      JSON.stringify({
        id: 'historical-actor',
        username: 'x'.repeat(257),
      }),
      written.data.id,
    ])
    expect(damaged.success).toBe(true)
    expect(await audit.list({ resource: 'identity' })).toMatchObject({
      success: true,
      data: {
        total: 1,
        items: [
          {
            userId: 'historical-actor',
            actorSnapshot: { id: 'historical-actor' },
            username: null,
          },
        ],
      },
    })
    expect(await audit.getUserRecent('historical-actor')).toMatchObject({
      success: true,
      data: [
        {
          action: 'historical-snapshot',
          userId: 'historical-actor',
          actorSnapshot: { id: 'historical-actor' },
        },
      ],
    })
  })

  if (backend !== 'sqlite') {
    it('独立时区进程读取同一事件时间并按毫秒窗口命中它', async () => {
      const fixture = fileURLToPath(new URL('./fixtures/audit-read-clock.mjs', import.meta.url))
      const call = (timezone: string, ...args: string[]) => promisify(execFile)(process.execPath, [fixture, ...args], {
        env: {
          ...process.env,
          TZ: timezone,
          AUDIT_DB_INPUT: JSON.stringify(sharedConnection),
        },
        timeout: 20_000,
      })
      const written = await call('Asia/Shanghai')
      const epoch: unknown = JSON.parse(written.stdout)
      expect(typeof epoch).toBe('number')
      const read = await call('UTC', String(epoch))
      expect(JSON.parse(read.stdout)).toEqual({ epoch, count: 1 })
    }, 45_000)
  }

  if (backend === 'mysql') {
    it('保存并读取输入 schema 允许的 MySQL 文本字段上限', async () => {
      const text = '界'.repeat(256)
      const userAgent = '长'.repeat(4096)
      const fields = {
        action: text,
        resource: text,
        resourceId: text,
        userId: text,
        actorSnapshot: { id: text },
        ipAddress: text,
        requestId: text,
        traceId: text,
        scopeId: text,
        userAgent,
      }
      expect(await audit.log(fields)).toMatchObject({ success: true, data: fields })
      expect(await audit.list({ requestId: text })).toMatchObject({
        success: true,
        data: {
          total: 1,
          items: [fields],
        },
      })
    })
  }

  if (backend === 'postgresql') {
    it('可选用户映射缺失时，事务仍可继续使用并提交审计记录', async () => {
      expect((await audit.init({ userTable: 'audit_lookup_absent' })).success).toBe(true)
      try {
        const opened = await reldb.tx.begin()
        expect(opened.success).toBe(true)
        if (!opened.success)
          return
        try {
          const logged = await audit.log({ userId: 'actor_1', action: 'fallback', resource: 'transaction' }, opened.data)
          expect(logged).toMatchObject({
            success: true,
            data: {
              actorSnapshot: { id: 'actor_1' },
            },
          })
          expect(await opened.data.get('SELECT 1 AS healthy')).toMatchObject({
            success: true,
            data: { healthy: 1 },
          })
          expect((await opened.data.commit()).success).toBe(true)
        }
        finally {
          await opened.data.rollback()
        }
        expect(await audit.list({ resource: 'transaction' })).toMatchObject({
          success: true,
          data: {
            total: 1,
            items: [
              {
                actorSnapshot: { id: 'actor_1' },
                username: null,
              },
            ],
          },
        })
      }
      finally {
        expect((await audit.init({ userTable: 'hai_audit_contract_users' })).success).toBe(true)
      }
    })

    it('投影用户名超出快照契约时只保存主体 ID', async () => {
      const userId = 'actor_with_long_name'
      expect((await reldb.sql.execute('INSERT INTO hai_audit_contract_users (id, username) VALUES (?, ?)', [
        userId,
        '长'.repeat(257),
      ])).success).toBe(true)
      expect(await audit.log({ userId, action: 'long-name', resource: 'identity-lookup' })).toMatchObject({
        success: true,
        data: {
          actorSnapshot: { id: userId },
        },
      })
      expect(await audit.list({ userId })).toMatchObject({
        success: true,
        data: {
          items: [
            {
              actorSnapshot: { id: userId },
              username: null,
            },
          ],
        },
      })
    })
  }

  if (backend === 'sqlite') {
    it('拒绝驱动返回的超出安全整数范围的统计值', async () => {
      const query = vi.spyOn(reldb.sql, 'query').mockResolvedValueOnce(core.ok([
        { action: 'delete', count: '9007199254740993' },
      ]))
      try {
        expect(await audit.getStats()).toMatchObject({
          success: false,
          error: { code: HaiAuditError.STATS_FAILED.code },
        })
      }
      finally {
        query.mockRestore()
      }
    })
  }
})
