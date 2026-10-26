import { once } from 'node:events'
/** 真实 Scheduler 执行备份，使用共享执行编号并保持反序关闭。 */
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { audit, AUDIT_BACKUP_PREFIX } from '@h-ai/audit'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { startAuditJobs } from '../src/lib/server/audit-jobs.js'

let directory = ''
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'hai-audit-jobs-'))
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } })).success).toBe(true)
  expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
})
afterEach(async () => {
  await scheduler.close()
  await audit.close()
  await reach.close()
  await storage.close()
  await reldb.close()
  const actual = await realpath(directory)
  if (!actual.startsWith(path.join(await realpath(tmpdir()), 'hai-audit-jobs-')))
    throw new Error('Unexpected audit jobs fixture path')
  await rm(actual, { recursive: true, force: true })
})

it('未配置自动计划时不启动调度器，手动备份仍然可用', async () => {
  expect((await audit.init({ storage, backup: { enabled: true } })).success).toBe(true)
  expect((await startAuditJobs()).success).toBe(true)
  expect(scheduler.isInitialized).toBe(false)
  expect((await audit.backup.run()).success).toBe(true)
})

it('真实任务执行并持久化归档，同一触发键复用同一个执行', async () => {
  expect((await audit.init({ storage, backup: { enabled: true, schedule: { enabled: true, cron: '0 0 1 1 *', timezone: 'Asia/Shanghai' } } })).success).toBe(true)
  expect((await audit.log({ action: 'job-fixture', resource: 'orders' })).success).toBe(true)
  expect((await startAuditJobs()).success).toBe(true)
  expect(scheduler.isRunning).toBe(true)
  expect(scheduler.tasks.get('hai-audit-backup')).toMatchObject({ cron: '0 0 1 1 *', timezone: 'Asia/Shanghai' })
  const first = await scheduler.trigger('hai-audit-backup', { idempotencyKey: 'one-backup', source: 'test' })
  expect(first).toMatchObject({ success: true, data: { status: 'success' } })
  const repeated = await scheduler.trigger('hai-audit-backup', { idempotencyKey: 'one-backup', source: 'test' })
  expect(repeated).toEqual(first)
  const files = await storage.dir.list({ prefix: AUDIT_BACKUP_PREFIX })
  expect(files).toMatchObject({ success: true, data: { files: [expect.objectContaining({ key: expect.stringContaining(AUDIT_BACKUP_PREFIX) })] } })
  if (files.success)
    expect((await audit.backup.verify(files.data.files[0]!.key)).success).toBe(true)
})

it('重启后应用新的时区和计划，框架回调拒绝不匹配的任务身份', async () => {
  expect((await audit.init({ storage, backup: { enabled: true, schedule: { enabled: true, cron: '0 0 1 1 *', timezone: 'UTC' } } })).success).toBe(true)
  expect((await startAuditJobs()).success).toBe(true)
  await scheduler.close()
  expect((await audit.init({ storage, backup: { enabled: true, schedule: { enabled: true, cron: '15 3 1 1 *', timezone: 'Asia/Shanghai' } } })).success).toBe(true)
  expect((await startAuditJobs()).success).toBe(true)
  expect(scheduler.tasks.get('hai-audit-backup')).toMatchObject({ cron: '15 3 1 1 *', timezone: 'Asia/Shanghai' })
  const execute = audit.schedulerPlan?.hooks.onTaskExecute
  if (!execute)
    throw new Error('Audit schedule callback is required')
  await expect(execute({
    task: { id: 'unrelated-task', name: 'Unrelated task', cron: '* * * * *' },
    context: { taskId: 'unrelated-task', task: { id: 'unrelated-task', name: 'Unrelated task', cron: '* * * * *' }, params: {}, occurrenceId: 'wrong-task', trigger: { type: 'manual', source: null } },
    signal: new AbortController().signal,
    trigger: { type: 'manual', source: null },
    startedAt: Date.now(),
  })).rejects.toMatchObject({ code: 'hai:audit:012' })
})

it('备份和告警任务可以并存，真实通知失败使调度任务失败', async () => {
  let fail = false
  const server = createServer((request, response) => {
    request.resume()
    request.on('end', () => response.writeHead(fail ? 503 : 200, { 'content-type': 'application/json' }).end('{}'))
  })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing owned scheduler notification fixture')
    expect((await reach.init({ providers: [{ name: 'notify', type: 'api', url: `http://127.0.0.1:${address.port}` }] })).success).toBe(true)
    const config = {
      storage,
      reach,
      backup: { enabled: true, schedule: { enabled: true, cron: '0 0 1 1 *' } },
      alerts: { enabled: true, rules: [{ id: 'notify', actions: ['alert-fixture'], threshold: 1, targets: [{ id: 'security', provider: 'notify', to: 'security@example.invalid' }] }], schedule: { enabled: true, cron: '0 0 1 1 *' } },
    }
    expect((await audit.init(config)).success).toBe(true)
    expect((await audit.log({ action: 'alert-fixture', resource: 'auth', outcome: 'failure' })).success).toBe(true)
    expect((await startAuditJobs()).success).toBe(true)
    expect(scheduler.tasks.get('hai-audit-backup')).toBeDefined()
    expect(scheduler.tasks.get('hai-audit-alerts')).toBeDefined()
    expect(await scheduler.trigger('hai-audit-alerts')).toMatchObject({ success: true, data: { status: 'success' } })
    await scheduler.close()
    config.alerts.rules[0].id = 'notification-failure'
    fail = true
    expect((await audit.init(config)).success).toBe(true)
    expect((await startAuditJobs()).success).toBe(true)
    expect(await scheduler.trigger('hai-audit-alerts')).toMatchObject({ success: true, data: { status: 'failed' } })
  }
  finally {
    await scheduler.close()
    await audit.close()
    await reach.close()
    server.closeAllConnections()
    if (server.listening)
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
