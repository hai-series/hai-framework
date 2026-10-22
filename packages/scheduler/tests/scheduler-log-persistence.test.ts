/** 日志失败与业务结果独立，补写只消费已发布 journal，不重新调用业务。 */
import type { SchedulerTaskExecuteEvent } from '../src/index.js'
import { reldb } from '@h-ai/reldb'
import { afterEach, expect, it, vi } from 'vitest'
import { scheduler } from '../src/index.js'
import { SchedulerLogRepository } from '../src/repositories/index.js'
import './helpers/sqlite-lifecycle.js'

afterEach(() => vi.restoreAllMocks())

const task = { id: 'log-persistence', name: 'Log persistence', cron: '* * * * *' }
const logInsert = /INSERT INTO ["`]?hai_scheduler_logs["`]?\s/i
const logRead = /FROM ["`]?hai_scheduler_logs["`]?\s/i
const failure = { success: false as const, error: { code: 'hai:reldb:002', message: 'private driver connection secret' } }

it('日志失败可查询，重启后并发补写只写一条且不重执行业务', async () => {
  const effect = vi.fn(() => '业务结果'.repeat(1000))
  expect((await scheduler.init({ hooks: { onTaskExecute: effect } })).success).toBe(true)
  expect((await scheduler.register(task)).success).toBe(true)
  const execute = reldb.sql.execute.bind(reldb.sql)
  const fault = vi.spyOn(reldb.sql, 'execute').mockImplementation((sql, params) => logInsert.test(sql) ? Promise.resolve(failure) : execute(sql, params))
  const first = await scheduler.trigger(task.id, { idempotencyKey: 'stable-business' })
  expect(first).toMatchObject({ success: true, data: { status: 'success', persistence: { status: 'pending', error: { code: 'hai:scheduler:032' } } } })
  expect(JSON.stringify(first)).not.toContain('private driver')
  if (!first.success || !first.data.occurrenceId)
    throw new Error('Receipt missing')
  const receipt = first.data.occurrenceId
  expect(await scheduler.execution.get(receipt)).toMatchObject({ success: true, data: { status: 'success', logPersistence: 'pending' } })
  expect(await scheduler.execution.listLogFailures()).toMatchObject({ success: true, data: [expect.objectContaining({ occurrenceId: receipt })] })
  fault.mockRestore()
  await scheduler.close()
  expect((await scheduler.init({ hooks: { onTaskExecute: effect } })).success).toBe(true)
  expect(await Promise.all([scheduler.execution.repairLog(receipt), scheduler.execution.repairLog(receipt)])).toEqual([{ success: true, data: undefined }, { success: true, data: undefined }])
  const observed = await scheduler.getLogs()
  expect(observed).toMatchObject({ success: true, data: { total: 1, items: [expect.objectContaining({ id: first.data.id, persistence: { status: 'persisted' }, result: first.data.result })] } })
  expect(await scheduler.execution.listLogFailures()).toMatchObject({ success: true, data: [] })
  expect(await scheduler.trigger(task.id, { idempotencyKey: 'stable-business' })).toMatchObject({ success: true, data: { id: first.data.id, status: 'success', persistence: { status: 'persisted' } } })
  expect(effect).toHaveBeenCalledTimes(1)
})

it('日志已提交但驱动回执和当次确认读取丢失，补写保留原 UUID 和完整载荷', async () => {
  const effect = vi.fn(() => '"原始字符串"'.repeat(1000))
  expect((await scheduler.init({ hooks: { onTaskExecute: effect } })).success).toBe(true)
  expect((await scheduler.register(task)).success).toBe(true)
  const execute = reldb.sql.execute.bind(reldb.sql)
  const get = reldb.sql.get.bind(reldb.sql)
  const writeFault = vi.spyOn(reldb.sql, 'execute').mockImplementation(async (sql, params) => {
    const result = await execute(sql, params)
    return logInsert.test(sql) ? failure : result
  })
  const readFault = vi.spyOn(reldb.sql, 'get').mockImplementation((sql, params) => logRead.test(sql) ? Promise.resolve(failure) : get(sql, params))
  const result = await scheduler.trigger(task.id, { idempotencyKey: 'lost-ack' })
  expect(result).toMatchObject({ success: true, data: { status: 'success', persistence: { status: 'pending' } } })
  if (!result.success || !result.data.occurrenceId)
    throw new Error('Receipt missing')
  writeFault.mockRestore()
  readFault.mockRestore()
  expect((await scheduler.execution.repairLog(result.data.occurrenceId)).success).toBe(true)
  const observed = await scheduler.getLogs()
  expect(observed).toMatchObject({ success: true, data: { total: 1, items: [expect.objectContaining({ id: result.data.id, result: result.data.result })] } })
  expect(effect).toHaveBeenCalledTimes(1)
})

it('相同 UUID 的不同内容不能作为幂等保存成功', async () => {
  expect((await scheduler.init({ hooks: { onTaskExecute: () => 'original' } })).success).toBe(true)
  expect((await scheduler.register(task)).success).toBe(true)
  const result = await scheduler.trigger(task.id)
  if (!result.success)
    throw new Error('Execution failed')
  const repository = new SchedulerLogRepository(reldb)
  expect((await repository.saveLog({ ...result.data, result: 'different' })).success).toBe(false)
  expect(await scheduler.getLogs()).toMatchObject({ success: true, data: { total: 1, items: [expect.objectContaining({ result: result.data.result })] } })
})

it('真实共享租约过期后本地业务返回成功，也不能投影成功日志或调用补写绕过 fence', async () => {
  let receipt = ''
  const effect = vi.fn(async (event: SchedulerTaskExecuteEvent) => {
    receipt = event.context.occurrenceId!
    expect((await reldb.sql.execute('UPDATE hai_scheduler_executions SET leased_until = 0 WHERE occurrence_id = ?', [receipt])).success).toBe(true)
    return 'locally completed'
  })
  expect((await scheduler.init({ hooks: { onTaskExecute: effect } })).success).toBe(true)
  expect((await scheduler.register(task)).success).toBe(true)
  expect(await scheduler.trigger(task.id)).toMatchObject({ success: true, data: { status: 'unknown', persistence: { status: 'unconfirmed' } } })
  expect(await scheduler.execution.repairLog(receipt)).toMatchObject({ success: false, error: { code: 'hai:scheduler:032' } })
  expect(await scheduler.getLogs()).toMatchObject({ success: true, data: { total: 0 } })
  expect(effect).toHaveBeenCalledTimes(1)
})

it('保留全部失败重试日志与最终大结果，补写不使用日志状态决定业务重试', async () => {
  let attempts = 0
  expect((await scheduler.init({ hooks: { onTaskExecute: () => {
    if (++attempts < 3)
      throw new Error('Retry business failure')
    return '完整结果'.repeat(2000)
  } } })).success).toBe(true)
  expect((await scheduler.register({ ...task, idempotent: true, retry: { maxAttempts: 3 } })).success).toBe(true)
  const execute = reldb.sql.execute.bind(reldb.sql)
  let inserted = 0
  const fault = vi.spyOn(reldb.sql, 'execute').mockImplementation((sql, params) => logInsert.test(sql) && ++inserted > 1 ? Promise.resolve(failure) : execute(sql, params))
  const result = await scheduler.trigger(task.id)
  expect(result).toMatchObject({ success: true, data: { status: 'success', persistence: { status: 'pending' } } })
  fault.mockRestore()
  if (!result.success || !result.data.occurrenceId)
    throw new Error('Receipt missing')
  expect((await scheduler.execution.repairLog(result.data.occurrenceId)).success).toBe(true)
  const observed = await scheduler.getLogs()
  expect(observed.success).toBe(true)
  if (observed.success) {
    expect(observed.data.total).toBe(3)
    expect(observed.data.items.map(log => log.status).sort()).toEqual(['failed', 'failed', 'success'])
    expect(new Set(observed.data.items.map(log => log.id)).size).toBe(3)
  }
  expect(attempts).toBe(3)
})

it('保留策略失败不会撤销已持久日志或重新执行业务，运维输入有界', async () => {
  const effect = vi.fn(() => 'ok')
  expect((await scheduler.init({ maxLogs: 10, hooks: { onTaskExecute: effect } })).success).toBe(true)
  expect((await scheduler.register(task)).success).toBe(true)
  const execute = reldb.sql.execute.bind(reldb.sql)
  vi.spyOn(reldb.sql, 'execute').mockImplementation((sql, params) => /^DELETE FROM hai_scheduler_logs/i.test(sql) ? Promise.resolve(failure) : execute(sql, params))
  expect(await scheduler.trigger(task.id)).toMatchObject({ success: true, data: { status: 'success', persistence: { status: 'persisted' } } })
  expect((await scheduler.execution.repairLog('invalid')).success).toBe(false)
  expect((await scheduler.execution.listLogFailures({ limit: 101 })).success).toBe(false)
  expect((await scheduler.execution.listLogFailures({ offset: -1 })).success).toBe(false)
  expect(effect).toHaveBeenCalledTimes(1)
})

it('重试前定义停用产生 unknown 时，先发布最终内容，不提前写入同 UUID 的 interrupted 投影', async () => {
  let attempts = 0
  expect((await scheduler.init({ hooks: { onTaskExecute: async () => {
    attempts += 1
    expect((await scheduler.updateTask(task.id, { enabled: false })).success).toBe(true)
    throw new Error('Business failed before next retry')
  } } })).success).toBe(true)
  expect((await scheduler.register({ ...task, idempotent: true, retry: { maxAttempts: 2 } })).success).toBe(true)
  expect(await scheduler.trigger(task.id)).toMatchObject({ success: true, data: { status: 'unknown', persistence: { status: 'persisted' } } })
  const observed = await scheduler.getLogs()
  expect(observed.success).toBe(true)
  if (observed.success)
    expect(observed.data.items.map(log => log.status).sort()).toEqual(['failed', 'unknown'])
  expect(attempts).toBe(1)
})

it('close 等待在途补写并拒绝新补写，避免依赖先关闭或跨实例写入', async () => {
  expect((await scheduler.init({ hooks: { onTaskExecute: () => 'done' } })).success).toBe(true)
  expect((await scheduler.register(task)).success).toBe(true)
  const execute = reldb.sql.execute.bind(reldb.sql)
  const fault = vi.spyOn(reldb.sql, 'execute').mockImplementation((sql, params) => logInsert.test(sql) ? Promise.resolve(failure) : execute(sql, params))
  const result = await scheduler.trigger(task.id)
  fault.mockRestore()
  if (!result.success || !result.data.occurrenceId)
    throw new Error('Receipt missing')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const save = SchedulerLogRepository.prototype.saveLog
  const saving = vi.spyOn(SchedulerLogRepository.prototype, 'saveLog').mockImplementation(async function (this: SchedulerLogRepository, log) {
    await gate
    return save.call(this, log)
  })
  const repair = scheduler.execution.repairLog(result.data.occurrenceId)
  let closing: Promise<void> | undefined
  try {
    await vi.waitFor(() => expect(saving).toHaveBeenCalledTimes(1))
    let closed = false
    closing = scheduler.close().then(() => {
      closed = true
    })
    expect((await scheduler.execution.repairLog(result.data.occurrenceId)).success).toBe(false)
    expect(closed).toBe(false)
    release()
    expect((await repair).success).toBe(true)
  }
  finally {
    release()
    await repair
    await closing
  }
  expect(reldb.isInitialized).toBe(true)
})

it('关闭把最后尝试改为 unknown 时沿用单个 UUID，不能留下同 ID 的冲突投影', async () => {
  let entered!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  expect((await scheduler.init({ hooks: { onTaskExecute: async (event) => {
    entered()
    await new Promise<void>((resolve) => {
      event.signal.addEventListener('abort', () => resolve(), { once: true })
    })
    return 'cancelled locally'
  } } })).success).toBe(true)
  expect((await scheduler.register({ ...task, idempotent: true })).success).toBe(true)
  const running = scheduler.trigger(task.id)
  try {
    await started
  }
  finally {
    await scheduler.close()
  }
  expect(await running).toMatchObject({ success: true, data: { status: 'unknown', persistence: { status: 'persisted' } } })
  expect((await scheduler.init()).success).toBe(true)
  expect(await scheduler.getLogs()).toMatchObject({ success: true, data: { total: 1, items: [expect.objectContaining({ status: 'unknown' })] } })
})
