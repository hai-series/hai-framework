/** 真实归档文件、幂等创建、校验、取消与读写失败。 */
import { createHash } from 'node:crypto'
import { mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { err } from '@h-ai/core'
import { HaiReldbError, reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { audit } from '../src/index.js'

function tests() {
  let directory = ''
  beforeEach(async () => {
    for (const table of ['hai_audit_logs', 'hai_audit_policy', 'hai_schema_migrations', 'hai_iam_users'])
      expect((await reldb.ddl.dropTable(table, true)).success).toBe(true)
    expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } })).success).toBe(true)
    directory = await mkdtemp(path.join(tmpdir(), 'hai-audit-backup-'))
    expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
    expect((await audit.init({ storage, backup: { enabled: true, batchSize: 1 } })).success).toBe(true)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await audit.close()
    await storage.close()
    if (directory) {
      const actual = await realpath(directory)
      if (!actual.startsWith(path.join(await realpath(tmpdir()), 'hai-audit-backup-')))
        throw new Error('Unexpected backup fixture cleanup path')
      await rm(actual, { recursive: true, force: true })
      directory = ''
    }
  })

  it('流式导出带原始身份快照的 JSONL，同一 ID 重试复用已有完整归档', async () => {
    for (let index = 0; index < 3; index++)
      expect((await audit.log({ action: 'backup.fixture', resource: 'orders', resourceId: String(index), actorSnapshot: { id: 'original-actor', username: 'Original name', roles: ['operator'] }, details: { password: 'private-credential', value: index } })).success).toBe(true)
    const result = await audit.backup.run({ id: 'manual-archive' })
    expect(result).toMatchObject({ success: true, data: { id: 'manual-archive', recordCount: 3, key: 'hai-private/audit-backups/manual-archive.jsonl' } })
    if (!result.success)
      return
    const archived = await storage.file.get(result.data.key)
    if (!archived.success)
      throw new Error(archived.error.message)
    expect(archived.data.toString()).not.toContain('private-credential')
    const lines = archived.data.toString('utf8').trimEnd().split('\n')
    const rows: unknown[] = lines.map(line => JSON.parse(line))
    expect(rows.slice(1, -1)).toHaveLength(3)
    expect(rows[1]).toMatchObject({ record: { actorSnapshot: { id: 'original-actor', username: 'Original name', roles: ['operator'] } } })
    const digest = createHash('sha256').update(`${lines.slice(0, -1).join('\n')}\n`).digest('hex')
    expect(rows.at(-1)).toMatchObject({ type: 'footer', recordCount: 3, sha256: digest })
    expect(result.data.sha256).toBe(digest)
    expect(await audit.backup.verify(result.data.key)).toEqual(result)
    expect((await audit.log({ action: 'after-backup', resource: 'orders' })).success).toBe(true)
    expect(await audit.backup.run({ id: 'manual-archive' })).toEqual(result)
    expect(await storage.file.get(result.data.key)).toEqual(archived)
  })

  it('损坏、截断、路径逃逸及重复 ID 不同导出条件均明确失败', async () => {
    const result = await audit.backup.run({ id: 'integrity-check' })
    if (!result.success)
      throw new Error(result.error.message)
    const file = await storage.file.get(result.data.key)
    if (!file.success)
      throw new Error(file.error.message)
    expect((await audit.backup.run({ id: 'integrity-check', from: new Date(0) })).success).toBe(false)
    expect((await audit.backup.verify('../outside.jsonl')).success).toBe(false)
    expect((await audit.backup.run({ id: '../outside' })).success).toBe(false)
    expect((await storage.file.put(result.data.key, file.data.subarray(0, file.data.length - 12))).success).toBe(true)
    expect((await audit.backup.verify(result.data.key)).success).toBe(false)
  })

  it('关闭策略或缺少存储时拒绝生成，时间计划可独立关闭', async () => {
    expect((await audit.init()).success).toBe(true)
    expect((await audit.backup.run()).success).toBe(false)
    expect(audit.schedulerPlan).toBeNull()
    expect((await audit.init({ backup: { enabled: true } })).success).toBe(false)
    expect((await audit.init({ storage, backup: { enabled: true, schedule: { enabled: true, cron: '15 3 * * *', timezone: 'Asia/Shanghai' } } })).success).toBe(true)
    expect(audit.schedulerPlan).toMatchObject({ tasks: [{ id: 'hai-audit-backup', cron: '15 3 * * *', timezone: 'Asia/Shanghai' }], hooks: { onTaskExecute: expect.any(Function) } })
  })

  it('取消和真实文件写失败不返回备份成功，修复后可用相同 ID 重试', async () => {
    const aborted = new AbortController()
    aborted.abort()
    expect((await audit.backup.run({ id: 'cancelled', signal: aborted.signal })).success).toBe(false)
    expect(await storage.file.exists('hai-private/audit-backups/cancelled.jsonl')).toEqual({ success: true, data: false })
    const blocker = path.join(directory, 'hai-private')
    await writeFile(blocker, 'Owned fixture blocker')
    try {
      expect((await audit.backup.run({ id: 'retry-after-write-failure' })).success).toBe(false)
    }
    finally {
      await unlink(blocker)
    }
    expect((await audit.backup.run({ id: 'retry-after-write-failure' })).success).toBe(true)
  })

  it('并发同一执行编号只生成一个完整文件，UTF-8 分片与大小限制不丢证据', async () => {
    expect((await audit.log({ action: 'large-unicode', resource: 'orders', details: { notes: '多'.repeat(40000) } })).success).toBe(true)
    const results = await Promise.all([audit.backup.run({ id: 'unicode-shared' }), audit.backup.run({ id: 'unicode-shared' })])
    expect(results[0].success).toBe(true)
    expect(results[1]).toEqual(results[0])
    if (!results[0].success)
      return
    const file = await storage.file.get(results[0].data.key)
    expect(file.success && file.data.byteLength).toBeGreaterThan(64 * 1024)
    expect(await audit.backup.verify(results[0].data.key)).toEqual(results[0])
    expect((await audit.init({ storage, backup: { enabled: true, maxRecordBytes: 1024 } })).success).toBe(true)
    expect((await audit.backup.run({ id: 'size-limited' })).success).toBe(false)
    expect(await storage.file.exists('hai-private/audit-backups/size-limited.jsonl')).toEqual({ success: true, data: false })
    expect((await audit.init({ storage, backup: { enabled: true } })).success).toBe(true)
    expect((await audit.backup.run({ id: 'size-limited' })).success).toBe(true)
  })

  it('扫描 SQL 失败会清理半成品，恢复后同一编号可以完成', async () => {
    const query = reldb.sql.query.bind(reldb.sql)
    const spy = vi.spyOn(reldb.sql, 'query').mockImplementation((sql, params) => sql.startsWith('SELECT id AS')
      ? Promise.resolve(err(HaiReldbError.QUERY_FAILED, 'Injected archive scan failure'))
      : query(sql, params))
    try {
      expect((await audit.backup.run({ id: 'failed-scan' })).success).toBe(false)
      expect(await storage.file.exists('hai-private/audit-backups/failed-scan.jsonl')).toEqual({ success: true, data: false })
    }
    finally {
      spy.mockRestore()
    }
    expect((await audit.backup.run({ id: 'failed-scan' })).success).toBe(true)
  })

  it('毫秒接近下一秒时保留真实事件时间，立即归档不能遗漏刚写入记录', async () => {
    const timestamp = new Date('2026-10-26T10:15:30.800Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(timestamp)
    const get = reldb.sql.get.bind(reldb.sql)
    // 数据库时钟精确落在 .800；验证存储精度及立即归档，不依赖测试机时钟。
    vi.spyOn(reldb.sql, 'get').mockImplementation((sql, params) => get(sql.endsWith(' AS now_ms') ? `SELECT ${timestamp.getTime()} AS now_ms` : sql, params))
    try {
      expect((await audit.log({ action: 'millisecond-boundary', resource: 'orders' })).success).toBe(true)
      expect(await audit.list({ action: 'millisecond-boundary' })).toMatchObject({ success: true, data: { items: [{ createdAt: timestamp }] } })
      expect(await audit.backup.run({ id: 'millisecond-boundary' })).toMatchObject({ success: true, data: { recordCount: 1 } })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('关闭会取消并等待备份，不关闭宿主存储或复活旧操作对象', async () => {
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const put = storage.file.put.bind(storage.file)
    const parent = new AbortController()
    const spy = vi.spyOn(storage.file, 'put').mockImplementation(async (key, data, options) => {
      entered()
      const signal = options?.signal
      if (!signal)
        throw new Error('Backup upload must receive cancellation')
      if (!signal.aborted)
        await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      return put(key, data, options)
    })
    const old = audit.backup
    const pending = old.run({ id: 'closing-backup', signal: parent.signal })
    let closing: ReturnType<typeof audit.close> | undefined
    try {
      await started
      let finished = false
      closing = audit.close().then((result) => {
        finished = true
        return result
      })
      await vi.waitFor(() => expect(finished).toBe(true))
      expect((await pending).success).toBe(false)
      expect(storage.isInitialized).toBe(true)
      expect((await old.run()).success).toBe(false)
    }
    finally {
      parent.abort()
      await pending
      await closing
      spy.mockRestore()
    }
  })
}

defineDbSuite('audit backup SQLite', sqliteMemoryEnv, tests)
defineDbSuite('audit backup PostgreSQL', postgresEnv, tests)
defineDbSuite('audit backup MySQL', mysqlEnv, tests)
