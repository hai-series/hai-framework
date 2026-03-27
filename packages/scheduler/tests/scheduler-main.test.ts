/**
 * =============================================================================
 * @h-ai/scheduler - 调度器主模块测试
 * =============================================================================
 */

import { reldb } from '@h-ai/reldb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduler } from '../src/scheduler-main.js'
import { HaiSchedulerError } from '../src/scheduler-types.js'

describe('scheduler', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await scheduler.close()
    await reldb.close()
  })

  describe('init', () => {
    it('应成功初始化并挂载全局 hooks', async () => {
      const onTaskStart = vi.fn()
      const result = await scheduler.init({
        enableDb: false,
        hooks: { onTaskStart },
      })

      expect(result.success).toBe(true)
      expect(scheduler.isInitialized).toBe(true)
      expect(scheduler.hooks.onTaskStart).toBe(onTaskStart)
    })

    it('并发调用 init 应拒绝后续调用', async () => {
      const [r1, r2] = await Promise.all([
        scheduler.init({ enableDb: false }),
        scheduler.init({ enableDb: false }),
      ])

      const results = [r1, r2]
      expect(results.filter(r => r.success).length).toBe(1)
      expect(results.filter(r => !r.success).length).toBe(1)

      const failed = results.find(r => !r.success)
      expect(failed?.success).toBe(false)
      if (failed && !failed.success)
        expect(failed.error.code).toBe(HaiSchedulerError.INIT_FAILED.code)
    })
  })

  describe('register / trigger', () => {
    it('应成功注册并手动触发 JS 字符串任务，记录触发来源', async () => {
      await scheduler.init({ enableDb: false })

      const registerResult = await scheduler.register({
        id: 'manual-js',
        name: '手动 JS',
        cron: '0 0 1 1 *',
        params: { channel: 'admin-console' },
        handler: {
          kind: 'js',
          code: '(context) => ({ taskId: context.taskId, source: context.trigger.source, params: context.params })',
        },
      })

      expect(registerResult.success).toBe(true)

      const triggerResult = await scheduler.trigger('manual-js', { source: 'admin-console' })
      expect(triggerResult.success).toBe(true)
      if (triggerResult.success) {
        expect(triggerResult.data.taskId).toBe('manual-js')
        expect(triggerResult.data.taskType).toBe('js')
        expect(triggerResult.data.triggerType).toBe('manual')
        expect(triggerResult.data.triggerSource).toBe('admin-console')
        expect(triggerResult.data.status).toBe('success')
        expect(triggerResult.data.result).toContain('admin-console')
      }
    })

    it('应成功触发 API 任务', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"status":"ok"}'),
      })
      vi.stubGlobal('fetch', mockFetch)

      await scheduler.init({ enableDb: false })
      const registerResult = await scheduler.register({
        id: 'api-task',
        name: 'API 任务',
        cron: '0 * * * *',
        handler: {
          kind: 'api',
          url: 'https://example.com/api',
          method: 'GET',
        },
      })

      expect(registerResult.success).toBe(true)

      const triggerResult = await scheduler.trigger('api-task', { source: 'api' })
      expect(triggerResult.success).toBe(true)
      if (triggerResult.success) {
        expect(triggerResult.data.taskType).toBe('api')
        expect(triggerResult.data.status).toBe('success')
        expect(triggerResult.data.result).toBe('{"status":"ok"}')
      }
    })

    it('handler 为空时可通过全局 execute hook 统一执行', async () => {
      const onTaskExecute = vi.fn(event => ({
        via: 'hook',
        source: event.context.trigger.source,
      }))

      await scheduler.init({
        enableDb: false,
        hooks: { onTaskExecute },
      })

      const registerResult = await scheduler.register({
        id: 'hook-task',
        name: 'Hook 任务',
        cron: '* * * * *',
      })
      expect(registerResult.success).toBe(true)

      const triggerResult = await scheduler.trigger('hook-task', { source: 'openapi' })
      expect(triggerResult.success).toBe(true)
      if (triggerResult.success) {
        expect(triggerResult.data.taskType).toBe('hook')
        expect(triggerResult.data.status).toBe('success')
        expect(triggerResult.data.result).toContain('openapi')
      }
      expect(onTaskExecute).toHaveBeenCalledTimes(1)
    })

    it('handler 为空且无 execute hook 时应记录为 interrupted', async () => {
      const onTaskInterrupted = vi.fn()
      await scheduler.init({
        enableDb: false,
        hooks: { onTaskInterrupted },
      })

      await scheduler.register({
        id: 'no-handler',
        name: '空处理器任务',
        cron: '* * * * *',
      })

      const triggerResult = await scheduler.trigger('no-handler', { source: 'cli' })
      expect(triggerResult.success).toBe(true)
      if (triggerResult.success) {
        expect(triggerResult.data.status).toBe('interrupted')
        expect(triggerResult.data.error).toContain('no-handler')
      }
      expect(onTaskInterrupted).toHaveBeenCalledTimes(1)
    })

    it('deleteAfterRun=true 时任务执行后应自动删除', async () => {
      await scheduler.init({ enableDb: false })

      const registerResult = await scheduler.register({
        id: 'one-time-task',
        name: '一次性任务',
        description: '执行一次后自动删除',
        cron: '* * * * *',
        deleteAfterRun: true,
        handler: {
          kind: 'js',
          code: '() => ({ ok: true })',
        },
      })
      expect(registerResult.success).toBe(true)
      expect(scheduler.tasks.has('one-time-task')).toBe(true)

      const triggerResult = await scheduler.trigger('one-time-task', { source: 'admin-console' })
      expect(triggerResult.success).toBe(true)
      expect(scheduler.tasks.has('one-time-task')).toBe(false)
    })

    it('失败时应按 retry.maxAttempts 重试并最终成功', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('server error') })
        .mockResolvedValueOnce({ ok: false, status: 502, text: () => Promise.resolve('bad gateway') })
        .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{"ok":true}') })
      vi.stubGlobal('fetch', mockFetch)

      await scheduler.init({ enableDb: false })

      const registerResult = await scheduler.register({
        id: 'retry-task',
        name: '重试任务',
        cron: '* * * * *',
        retry: { maxAttempts: 3, backoffMs: [1, 1] },
        handler: {
          kind: 'api',
          url: 'https://example.com/retry',
          method: 'GET',
        },
      })
      expect(registerResult.success).toBe(true)

      const triggerResult = await scheduler.trigger('retry-task', { source: 'api' })
      expect(triggerResult.success).toBe(true)
      if (triggerResult.success)
        expect(triggerResult.data.status).toBe('success')

      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('database integration', () => {
    it('应持久化 JS 字符串任务并在重新初始化后自动加载', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      const registerResult = await scheduler.register({
        id: 'persisted-js',
        name: '持久化 JS 任务',
        cron: '*/10 * * * *',
        params: { channel: 'nightly' },
        handler: {
          kind: 'js',
          code: '(context) => ({ id: context.task.id, channel: context.params.channel })',
        },
      })
      expect(registerResult.success).toBe(true)
      expect(scheduler.tasks.has('persisted-js')).toBe(true)

      await scheduler.close()
      const reinitResult = await scheduler.init({ enableDb: true })
      expect(reinitResult.success).toBe(true)
      expect(scheduler.tasks.has('persisted-js')).toBe(true)

      const reloadedTask = scheduler.tasks.get('persisted-js')
      expect(reloadedTask?.handler?.kind).toBe('js')
      expect(reloadedTask?.params?.channel).toBe('nightly')
    })

    it('应按 triggerType 与 triggerSource 查询执行日志', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'log-task',
        name: '日志任务',
        cron: '* * * * *',
        handler: {
          kind: 'js',
          code: '() => ({ ok: true })',
        },
      })

      await scheduler.trigger('log-task', { source: 'admin-console' })
      await scheduler.trigger('log-task', { source: 'cli' })

      const adminLogs = await scheduler.getLogs({ triggerType: 'manual', triggerSource: 'admin-console' })
      expect(adminLogs.success).toBe(true)
      if (adminLogs.success) {
        expect(adminLogs.data.items).toHaveLength(1)
        expect(adminLogs.data.items[0].triggerSource).toBe('admin-console')
      }

      const cliLogs = await scheduler.getLogs({ triggerType: 'manual', triggerSource: 'cli' })
      expect(cliLogs.success).toBe(true)
      if (cliLogs.success) {
        expect(cliLogs.data.items).toHaveLength(1)
        expect(cliLogs.data.items[0].triggerSource).toBe('cli')
      }
    })

    it('应支持 startedAfter / startedBefore 时间范围过滤', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'time-range-task',
        name: '时间范围日志任务',
        cron: '* * * * *',
        handler: {
          kind: 'js',
          code: '() => ({ ok: true })',
        },
      })

      const firstRun = await scheduler.trigger('time-range-task', { source: 'admin-console' })
      expect(firstRun.success).toBe(true)
      if (!firstRun.success)
        return

      await new Promise(resolve => setTimeout(resolve, 5))

      const secondRun = await scheduler.trigger('time-range-task', { source: 'cli' })
      expect(secondRun.success).toBe(true)
      if (!secondRun.success)
        return

      const logsAfterFirst = await scheduler.getLogs({ startedAfter: firstRun.data.startedAt + 1 })
      expect(logsAfterFirst.success).toBe(true)
      if (logsAfterFirst.success) {
        expect(logsAfterFirst.data.items.length).toBe(1)
        expect(logsAfterFirst.data.items[0].triggerSource).toBe('cli')
      }

      const logsBeforeSecond = await scheduler.getLogs({ startedBefore: secondRun.data.startedAt - 1 })
      expect(logsBeforeSecond.success).toBe(true)
      if (logsBeforeSecond.success) {
        expect(logsBeforeSecond.data.items.length).toBe(1)
        expect(logsBeforeSecond.data.items[0].triggerSource).toBe('admin-console')
      }
    })

    it('配置 maxLogs 后应自动清理旧日志', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true, maxLogs: 1 })

      await scheduler.register({
        id: 'cleanup-logs-task',
        name: '日志清理任务',
        cron: '* * * * *',
        handler: {
          kind: 'js',
          code: '() => ({ ok: true })',
        },
      })

      await scheduler.trigger('cleanup-logs-task', { source: 'admin-console' })
      await scheduler.trigger('cleanup-logs-task', { source: 'cli' })

      const logs = await scheduler.getLogs({ taskId: 'cleanup-logs-task' })
      expect(logs.success).toBe(true)
      if (logs.success)
        expect(logs.data.items.length).toBeLessThanOrEqual(1)
    })
  })

  describe('update / hooks / close', () => {
    it('updateTask 应支持更新 params 与 handler', async () => {
      await scheduler.init({ enableDb: false })
      await scheduler.register({
        id: 'update-task',
        name: '更新任务',
        cron: '* * * * *',
        handler: {
          kind: 'js',
          code: '() => ({ phase: 1 })',
        },
      })

      const updateResult = await scheduler.updateTask('update-task', {
        params: { version: 'v2' },
        handler: {
          kind: 'js',
          code: '(context) => ({ phase: 2, version: context.params.version })',
        },
      })
      expect(updateResult.success).toBe(true)

      const triggerResult = await scheduler.trigger('update-task', { source: 'api' })
      expect(triggerResult.success).toBe(true)
      if (triggerResult.success)
        expect(triggerResult.data.result).toContain('v2')
    })

    it('setHooks / clearHooks 应生效', async () => {
      await scheduler.init({ enableDb: false })

      const onTaskExecute = vi.fn(() => 'from-set-hooks')
      const setResult = scheduler.setHooks({ onTaskExecute })
      expect(setResult.success).toBe(true)
      expect(scheduler.hooks.onTaskExecute).toBe(onTaskExecute)

      await scheduler.register({ id: 'set-hooks-task', name: '设置 hooks', cron: '* * * * *' })
      const triggerResult = await scheduler.trigger('set-hooks-task', { source: 'api' })
      expect(triggerResult.success).toBe(true)
      if (triggerResult.success)
        expect(triggerResult.data.result).toBe('"from-set-hooks"')

      const clearResult = scheduler.clearHooks()
      expect(clearResult.success).toBe(true)
      expect(scheduler.hooks.onTaskExecute).toBeUndefined()
    })

    it('close 后应恢复到未初始化状态', async () => {
      await scheduler.init({ enableDb: false })
      await scheduler.register({
        id: 'temp-task',
        name: '临时任务',
        cron: '* * * * *',
        handler: {
          kind: 'js',
          code: '() => "ok"',
        },
      })
      scheduler.start()

      await scheduler.close()

      expect(scheduler.isInitialized).toBe(false)
      expect(scheduler.isRunning).toBe(false)
      expect(scheduler.tasks.size).toBe(0)
      expect(scheduler.config).toBeNull()
    })
  })
})
