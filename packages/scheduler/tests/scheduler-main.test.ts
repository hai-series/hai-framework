/**
 * =============================================================================
 * @h-ai/scheduler - 调度器主模块测试
 * =============================================================================
 */

import { db } from '@h-ai/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SchedulerErrorCode } from '../src/scheduler-config.js'
import { scheduler } from '../src/scheduler-main.js'

describe('scheduler', () => {
  afterEach(async () => {
    await scheduler.close()
    await db.close()
  })

  describe('init', () => {
    it('应成功初始化（禁用 DB）', async () => {
      const result = await scheduler.init({ enableDb: false })
      expect(result.success).toBe(true)
      expect(scheduler.isInitialized).toBe(true)
      expect(scheduler.config).toBeDefined()
      expect(scheduler.config?.enableDb).toBe(false)
    })

    it('应成功初始化（启用 DB）', async () => {
      await db.init({ type: 'sqlite', database: ':memory:' })
      const result = await scheduler.init({ enableDb: true })
      expect(result.success).toBe(true)
      expect(scheduler.config?.enableDb).toBe(true)
    })

    it('当数据库未初始化时应自动禁用 DB 记录', async () => {
      const result = await scheduler.init({ enableDb: true })
      expect(result.success).toBe(true)
      expect(scheduler.config?.enableDb).toBe(false)
    })

    it('重复初始化应关闭前一次', async () => {
      await scheduler.init({ enableDb: false })
      expect(scheduler.isInitialized).toBe(true)

      await scheduler.init({ enableDb: false })
      expect(scheduler.isInitialized).toBe(true)
    })

    it('使用默认配置初始化', async () => {
      const result = await scheduler.init({ enableDb: false })
      expect(result.success).toBe(true)
      expect(scheduler.config?.tableName).toBe('scheduler_logs')
      expect(scheduler.config?.tickInterval).toBe(1000)
    })
  })

  describe('register / unregister', () => {
    it('应成功注册 JS 任务', async () => {
      await scheduler.init({ enableDb: false })

      const result = scheduler.register({
        id: 'task-1',
        name: '测试任务',
        cron: '*/5 * * * *',
        type: 'js',
        handler: () => 'done',
      })

      expect(result.success).toBe(true)
      expect(scheduler.tasks.size).toBe(1)
      expect(scheduler.tasks.has('task-1')).toBe(true)
    })

    it('应成功注册 API 任务', async () => {
      await scheduler.init({ enableDb: false })

      const result = scheduler.register({
        id: 'api-task',
        name: 'API 任务',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://example.com' },
      })

      expect(result.success).toBe(true)
      expect(scheduler.tasks.size).toBe(1)
    })

    it('重复注册同一 ID 应返回 TASK_ALREADY_EXISTS', async () => {
      await scheduler.init({ enableDb: false })
      scheduler.register({
        id: 'dup',
        name: '任务1',
        cron: '* * * * *',
        type: 'js',
        handler: () => {},
      })

      const result = scheduler.register({
        id: 'dup',
        name: '任务2',
        cron: '* * * * *',
        type: 'js',
        handler: () => {},
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.TASK_ALREADY_EXISTS)
      }
    })

    it('无效 cron 表达式应返回 INVALID_CRON', async () => {
      await scheduler.init({ enableDb: false })

      const result = scheduler.register({
        id: 'bad-cron',
        name: '无效 cron',
        cron: 'invalid',
        type: 'js',
        handler: () => {},
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.INVALID_CRON)
      }
    })

    it('应成功注销任务', async () => {
      await scheduler.init({ enableDb: false })
      scheduler.register({
        id: 'rm-task',
        name: '待删除',
        cron: '* * * * *',
        type: 'js',
        handler: () => {},
      })

      const result = scheduler.unregister('rm-task')
      expect(result.success).toBe(true)
      expect(scheduler.tasks.size).toBe(0)
    })

    it('注销不存在的任务应返回 TASK_NOT_FOUND', async () => {
      await scheduler.init({ enableDb: false })

      const result = scheduler.unregister('nonexistent')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.TASK_NOT_FOUND)
      }
    })

    it('未初始化时注册应返回 NOT_INITIALIZED', () => {
      const result = scheduler.register({
        id: 'x',
        name: 'x',
        cron: '* * * * *',
        type: 'js',
        handler: () => {},
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.NOT_INITIALIZED)
      }
    })
  })

  describe('start / stop', () => {
    it('应成功启动和停止调度器', async () => {
      await scheduler.init({ enableDb: false })

      const startResult = scheduler.start()
      expect(startResult.success).toBe(true)
      expect(scheduler.isRunning).toBe(true)

      const stopResult = scheduler.stop()
      expect(stopResult.success).toBe(true)
      expect(scheduler.isRunning).toBe(false)
    })

    it('重复启动应返回 ALREADY_RUNNING', async () => {
      await scheduler.init({ enableDb: false })
      scheduler.start()

      const result = scheduler.start()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.ALREADY_RUNNING)
      }
    })

    it('未启动时停止应返回 NOT_RUNNING', async () => {
      await scheduler.init({ enableDb: false })

      const result = scheduler.stop()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.NOT_RUNNING)
      }
    })

    it('未初始化时启动应返回 NOT_INITIALIZED', () => {
      const result = scheduler.start()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.NOT_INITIALIZED)
      }
    })
  })

  describe('trigger', () => {
    it('应手动触发 JS 任务并返回执行日志', async () => {
      await scheduler.init({ enableDb: false })
      scheduler.register({
        id: 'manual-js',
        name: '手动 JS',
        cron: '0 0 1 1 *', // 不会自动触发
        type: 'js',
        handler: () => ({ result: 'manual' }),
      })

      const result = await scheduler.trigger('manual-js')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.taskId).toBe('manual-js')
        expect(result.data.status).toBe('success')
        expect(result.data.result).toBe('{"result":"manual"}')
      }
    })

    it('触发不存在的任务应返回 TASK_NOT_FOUND', async () => {
      await scheduler.init({ enableDb: false })

      const result = await scheduler.trigger('nonexistent')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.TASK_NOT_FOUND)
      }
    })
  })

  describe('数据库集成', () => {
    it('应保存执行日志到数据库', async () => {
      await db.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      scheduler.register({
        id: 'db-task',
        name: 'DB 任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => 'saved',
      })

      // 手动触发
      await scheduler.trigger('db-task')

      // 查询日志
      const logsResult = await scheduler.getLogs({ taskId: 'db-task' })
      expect(logsResult.success).toBe(true)
      if (logsResult.success) {
        expect(logsResult.data).toHaveLength(1)
        expect(logsResult.data[0].taskId).toBe('db-task')
        expect(logsResult.data[0].status).toBe('success')
        expect(logsResult.data[0].result).toBe('"saved"')
      }
    })

    it('应按状态过滤执行日志', async () => {
      await db.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      scheduler.register({
        id: 'ok-task',
        name: '成功任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => 'ok',
      })
      scheduler.register({
        id: 'fail-task',
        name: '失败任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => { throw new Error('fail') },
      })

      await scheduler.trigger('ok-task')
      await scheduler.trigger('fail-task')

      const successLogs = await scheduler.getLogs({ status: 'success' })
      expect(successLogs.success).toBe(true)
      if (successLogs.success) {
        expect(successLogs.data).toHaveLength(1)
        expect(successLogs.data[0].taskId).toBe('ok-task')
      }

      const failedLogs = await scheduler.getLogs({ status: 'failed' })
      expect(failedLogs.success).toBe(true)
      if (failedLogs.success) {
        expect(failedLogs.data).toHaveLength(1)
        expect(failedLogs.data[0].taskId).toBe('fail-task')
      }
    })

    it('数据库未初始化时 getLogs 应返回错误', async () => {
      await scheduler.init({ enableDb: false })

      const result = await scheduler.getLogs()
      expect(result.success).toBe(false)
    })
  })

  describe('close', () => {
    it('close 后应恢复到未初始化状态', async () => {
      await scheduler.init({ enableDb: false })
      scheduler.register({
        id: 'task',
        name: '任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => {},
      })
      scheduler.start()

      await scheduler.close()

      expect(scheduler.isInitialized).toBe(false)
      expect(scheduler.isRunning).toBe(false)
      expect(scheduler.tasks.size).toBe(0)
      expect(scheduler.config).toBeNull()
    })

    it('多次 close 应安全', async () => {
      await scheduler.close()
      await scheduler.close()
      expect(scheduler.isInitialized).toBe(false)
    })
  })

  describe('接口任务触发', () => {
    it('应成功触发 API 任务', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"status":"healthy"}'),
      })
      vi.stubGlobal('fetch', mockFetch)

      await scheduler.init({ enableDb: false })
      scheduler.register({
        id: 'api-check',
        name: '健康检查',
        cron: '* * * * *',
        type: 'api',
        api: { url: 'https://example.com/health', method: 'GET' },
      })

      const result = await scheduler.trigger('api-check')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('success')
        expect(result.data.result).toBe('{"status":"healthy"}')
      }

      vi.unstubAllGlobals()
    })
  })
})
