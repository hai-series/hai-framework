/**
 * =============================================================================
 * @h-ai/scheduler - 分布式锁集成测试
 * =============================================================================
 */

import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduler } from '../src/scheduler-main.js'
import { runTask } from '../src/scheduler-runner.js'

describe('distributed lock integration', () => {
  beforeEach(async () => {
    await reldb.init({ type: 'sqlite', database: ':memory:' })
    await cache.init({ type: 'memory' })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await scheduler.close()
    await cache.close()
    await reldb.close()
  })

  it('获锁成功应正常执行任务', async () => {
    await scheduler.init({ enableDb: true })

    await scheduler.register({
      id: 'lock-task-1',
      name: '锁测试任务',
      cron: '* * * * *',
      handler: {
        kind: 'js',
        code: '() => "done"',
      },
    })

    const task = scheduler.tasks.get('lock-task-1')
    expect(task).toBeDefined()

    const minuteTimestamp = Math.floor(Date.now() / 60000)
    const log = await runTask(task!, minuteTimestamp, { type: 'scheduled', source: null })
    expect(log.status).toBe('success')
    expect(log.triggerType).toBe('scheduled')
  })

  it('同一任务同一分钟第二次获锁应返回 interrupted', async () => {
    await scheduler.init({ enableDb: true })

    await scheduler.register({
      id: 'lock-task-2',
      name: '锁竞争测试',
      cron: '* * * * *',
      handler: {
        kind: 'js',
        code: '() => "done"',
      },
    })

    const task = scheduler.tasks.get('lock-task-2')!
    const minuteTimestamp = Math.floor(Date.now() / 60000)

    const firstLog = await runTask(task, minuteTimestamp, { type: 'scheduled', source: null })
    expect(firstLog.status).toBe('success')

    const secondLog = await runTask(task, minuteTimestamp, { type: 'scheduled', source: null })
    expect(secondLog.status).toBe('interrupted')
    expect(secondLog.error).toContain('lock-task-2')
  })

  it('手动触发应跳过分布式锁并保留手工来源', async () => {
    await scheduler.init({ enableDb: true })

    await scheduler.register({
      id: 'lock-task-3',
      name: '手工任务',
      cron: '* * * * *',
      handler: {
        kind: 'js',
        code: '(context) => ({ source: context.trigger.source })',
      },
    })

    const triggerResult = await scheduler.trigger('lock-task-3', { source: 'admin-console' })
    expect(triggerResult.success).toBe(true)
    if (triggerResult.success) {
      expect(triggerResult.data.status).toBe('success')
      expect(triggerResult.data.triggerType).toBe('manual')
      expect(triggerResult.data.triggerSource).toBe('admin-console')
    }
  })

  it('获锁抛错时应记录 failed 日志并持久化触发信息', async () => {
    await scheduler.init({ enableDb: true })

    await scheduler.register({
      id: 'lock-task-error',
      name: '锁异常任务',
      cron: '* * * * *',
      handler: {
        kind: 'js',
        code: '() => "done"',
      },
    })

    const acquireSpy = vi.spyOn(cache.lock, 'acquire').mockRejectedValueOnce(new Error('lock exploded'))
    const task = scheduler.tasks.get('lock-task-error')
    expect(task).toBeDefined()

    const minuteTimestamp = Math.floor(Date.now() / 60000)
    const log = await runTask(task!, minuteTimestamp, { type: 'scheduled', source: null })

    expect(acquireSpy).toHaveBeenCalledTimes(1)
    expect(log.status).toBe('failed')
    expect(log.taskType).toBe('js')
    expect(log.triggerType).toBe('scheduled')
    expect(log.triggerSource).toBeNull()

    const logsResult = await scheduler.getLogs({ taskId: 'lock-task-error', status: 'failed' })
    expect(logsResult.success).toBe(true)
    if (logsResult.success) {
      expect(logsResult.data.items).toHaveLength(1)
      expect(logsResult.data.items[0].triggerType).toBe('scheduled')
      expect(logsResult.data.items[0].triggerSource).toBeNull()
      expect(logsResult.data.items[0].error).toContain('lock-task-error')
    }
  })
})
