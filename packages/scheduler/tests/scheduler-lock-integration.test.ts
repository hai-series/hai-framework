/**
 * =============================================================================
 * @h-ai/scheduler - 分布式锁集成测试
 *
 * 测试 scheduler + cache 集成场景下的分布式锁行为：
 * - 启用 cache 时自动配置分布式锁
 * - runTask 获锁后执行，同一分钟内不重复执行
 * - 模拟多节点竞争，验证仅一个节点执行
 * =============================================================================
 */

import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchedulerErrorCode } from '../src/scheduler-config.js'
import { schedulerM } from '../src/scheduler-i18n.js'
import { scheduler } from '../src/scheduler-main.js'
import { runTask } from '../src/scheduler-runner.js'

describe('distributed lock integration', () => {
  beforeEach(async () => {
    await reldb.init({ type: 'sqlite', database: ':memory:' })
    await cache.init({ type: 'memory' })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await scheduler.close()
    await cache.close()
    await reldb.close()
  })

  describe('scheduler init with lock', () => {
    it('启用 DB 且 cache 已初始化时应自动配置分布式锁', async () => {
      const result = await scheduler.init({ enableDb: true })
      expect(result.success).toBe(true)
    })

    it('应支持自定义锁过期时间', async () => {
      const result = await scheduler.init({ enableDb: true, lockExpireMs: 60000 })
      expect(result.success).toBe(true)
      expect(scheduler.config?.lockExpireMs).toBe(60000)
    })

    it('应支持自定义 nodeId', async () => {
      const result = await scheduler.init({ enableDb: true, nodeId: 'my-node-1' })
      expect(result.success).toBe(true)
      expect(scheduler.config?.nodeId).toBe('my-node-1')
    })

    it('禁用 DB 时不创建锁', async () => {
      const result = await scheduler.init({ enableDb: false })
      expect(result.success).toBe(true)
      // 禁用 DB 时分布式锁不可用，但不影响运行
    })

    it('lockExpireMs 低于最小值应被拒绝', async () => {
      const result = await scheduler.init({ enableDb: true, lockExpireMs: 100 })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.CONFIG_ERROR)
      }
    })
  })

  describe('runTask with distributed lock', () => {
    it('获锁成功应正常执行任务', async () => {
      await scheduler.init({ enableDb: true })

      const handler = vi.fn().mockResolvedValue('done')
      await scheduler.register({
        id: 'lock-task-1',
        name: '锁测试任务',
        cron: '* * * * *',
        type: 'js',
        handler,
      })

      const task = scheduler.tasks.get('lock-task-1')!
      const minuteTimestamp = Math.floor(Date.now() / 60000)

      const log = await runTask(task, minuteTimestamp)
      expect(log.status).toBe('success')
      expect(handler).toHaveBeenCalled()
    })

    it('同一任务同一分钟第二次获锁应跳过', async () => {
      await scheduler.init({ enableDb: true })

      const handler = vi.fn().mockResolvedValue('done')
      await scheduler.register({
        id: 'lock-task-2',
        name: '锁竞争测试',
        cron: '* * * * *',
        type: 'js',
        handler,
      })

      const task = scheduler.tasks.get('lock-task-2')!
      const minuteTimestamp = Math.floor(Date.now() / 60000)

      // 第一次获锁执行
      const log1 = await runTask(task, minuteTimestamp)
      expect(log1.status).toBe('success')

      // 同一分钟再次执行（模拟另一个节点）：应跳过
      const log2 = await runTask(task, minuteTimestamp)
      expect(log2.status).toBe('failed')
      expect(log2.error).toContain('another node holds the distributed lock')
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('不同分钟应各自获锁执行', async () => {
      await scheduler.init({ enableDb: true })

      const handler = vi.fn().mockResolvedValue('done')
      await scheduler.register({
        id: 'lock-task-3',
        name: '跨分钟测试',
        cron: '* * * * *',
        type: 'js',
        handler,
      })

      const task = scheduler.tasks.get('lock-task-3')!
      const minute1 = Math.floor(Date.now() / 60000)
      const minute2 = minute1 + 1

      const log1 = await runTask(task, minute1)
      expect(log1.status).toBe('success')

      const log2 = await runTask(task, minute2)
      expect(log2.status).toBe('success')

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('手动触发（无 minuteTimestamp）应跳过分布式锁', async () => {
      await scheduler.init({ enableDb: true })

      const handler = vi.fn().mockResolvedValue('done')
      await scheduler.register({
        id: 'lock-task-4',
        name: '手动触发测试',
        cron: '* * * * *',
        type: 'js',
        handler,
      })

      // trigger 内部调用 runTask(task) 不传 minuteTimestamp
      const result = await scheduler.trigger('lock-task-4')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('success')
      }
      expect(handler).toHaveBeenCalled()
    })

    it('锁获取返回失败时应 fail-closed 且不执行任务', async () => {
      await scheduler.init({ enableDb: true })

      const handler = vi.fn().mockResolvedValue('done')
      await scheduler.register({
        id: 'lock-task-fail-closed',
        name: '锁失败关闭测试',
        cron: '* * * * *',
        type: 'js',
        handler,
      })

      vi.spyOn(cache.lock, 'acquire').mockResolvedValue({
        success: false,
        error: {
          code: 9999,
          message: 'mock lock failure',
        },
      })

      const task = scheduler.tasks.get('lock-task-fail-closed')!
      const minuteTimestamp = Math.floor(Date.now() / 60000)
      const log = await runTask(task, minuteTimestamp)

      expect(log.status).toBe('failed')
      expect(log.error).toBe(
        schedulerM('scheduler_lockAcquireFailed', {
          params: { taskId: 'lock-task-fail-closed' },
        }),
      )
      expect(handler).not.toHaveBeenCalled()

      const logsResult = await scheduler.getLogs({ taskId: 'lock-task-fail-closed' })
      expect(logsResult.success).toBe(true)
      if (logsResult.success) {
        expect(logsResult.data).toHaveLength(1)
        expect(logsResult.data[0].status).toBe('failed')
        expect(logsResult.data[0].error).toBe(log.error)
      }
    })

    it('锁获取抛异常时应 fail-closed、记录日志且不执行任务', async () => {
      await scheduler.init({ enableDb: true })

      const handler = vi.fn().mockResolvedValue('done')
      await scheduler.register({
        id: 'lock-task-throw-fail-closed',
        name: '锁异常关闭测试',
        cron: '* * * * *',
        type: 'js',
        handler,
      })

      vi.spyOn(cache.lock, 'acquire').mockRejectedValue(new Error('mock thrown lock failure'))

      const task = scheduler.tasks.get('lock-task-throw-fail-closed')!
      const minuteTimestamp = Math.floor(Date.now() / 60000)
      const log = await runTask(task, minuteTimestamp)

      expect(log.status).toBe('failed')
      expect(log.error).toBe(
        schedulerM('scheduler_lockAcquireFailed', {
          params: { taskId: 'lock-task-throw-fail-closed' },
        }),
      )
      expect(handler).not.toHaveBeenCalled()

      const logsResult = await scheduler.getLogs({ taskId: 'lock-task-throw-fail-closed' })
      expect(logsResult.success).toBe(true)
      if (logsResult.success) {
        expect(logsResult.data).toHaveLength(1)
        expect(logsResult.data[0].status).toBe('failed')
        expect(logsResult.data[0].error).toBe(log.error)
      }
    })
  })

  describe('simulate multi-node competition', () => {
    it('同一锁键竞争，只有一个成功', async () => {
      await scheduler.init({ enableDb: true })

      const handler = vi.fn().mockResolvedValue('done')
      await scheduler.register({
        id: 'compete-task',
        name: '竞争测试',
        cron: '* * * * *',
        type: 'js',
        handler,
      })

      const task = scheduler.tasks.get('compete-task')!
      const minuteTs = Math.floor(Date.now() / 60000)

      // 第一次获锁执行
      const log1 = await runTask(task, minuteTs)
      expect(log1.status).toBe('success')

      // 第二次（模拟另一节点）应失败
      const log2 = await runTask(task, minuteTs)
      expect(log2.status).toBe('failed')
      expect(log2.error).toContain('another node holds the distributed lock')
    })
  })
})
