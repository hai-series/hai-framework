/**
 * =============================================================================
 * @h-ai/scheduler - 调度器主模块测试
 * =============================================================================
 */

import { reldb } from '@h-ai/reldb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SchedulerTaskRepository } from '../src/repositories/index.js'
import { SchedulerErrorCode } from '../src/scheduler-config.js'
import { scheduler } from '../src/scheduler-main.js'

describe('scheduler', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await scheduler.close()
    await reldb.close()
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
      await reldb.init({ type: 'sqlite', database: ':memory:' })
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
      expect(scheduler.config?.tickInterval).toBe(1000)
    })

    it('自定义 tickInterval 应生效', async () => {
      const result = await scheduler.init({ enableDb: false, tickInterval: 500 })
      expect(result.success).toBe(true)
      expect(scheduler.config?.tickInterval).toBe(500)
    })

    it('并发调用 init 应拒绝后续调用', async () => {
      const [r1, r2] = await Promise.all([
        scheduler.init({ enableDb: false }),
        scheduler.init({ enableDb: false }),
      ])

      // 恰好一个成功，一个失败（INIT_FAILED）
      const results = [r1, r2]
      expect(results.filter(r => r.success).length).toBe(1)
      expect(results.filter(r => !r.success).length).toBe(1)

      const failed = results.find(r => !r.success)!
      if (!failed.success) {
        expect(failed.error.code).toBe(SchedulerErrorCode.INIT_FAILED)
      }
    })
  })

  describe('register / unregister', () => {
    it('应成功注册 JS 任务', async () => {
      await scheduler.init({ enableDb: false })

      const result = await scheduler.register({
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

      const result = await scheduler.register({
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
      await scheduler.register({
        id: 'dup',
        name: '任务1',
        cron: '* * * * *',
        type: 'js',
        handler: () => {},
      })

      const result = await scheduler.register({
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

      const result = await scheduler.register({
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
      await scheduler.register({
        id: 'rm-task',
        name: '待删除',
        cron: '* * * * *',
        type: 'js',
        handler: () => {},
      })

      const result = await scheduler.unregister('rm-task')
      expect(result.success).toBe(true)
      expect(scheduler.tasks.size).toBe(0)
    })

    it('注销不存在的任务应返回 TASK_NOT_FOUND', async () => {
      await scheduler.init({ enableDb: false })

      const result = await scheduler.unregister('nonexistent')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.TASK_NOT_FOUND)
      }
    })

    it('未初始化时注册应返回 NOT_INITIALIZED', async () => {
      const result = await scheduler.register({
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

    it('未初始化时注销应返回 NOT_INITIALIZED', async () => {
      const result = await scheduler.unregister('any-task')
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

    it('未初始化时停止应返回 NOT_INITIALIZED', () => {
      const result = scheduler.stop()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.NOT_INITIALIZED)
      }
    })
  })

  describe('trigger', () => {
    it('应手动触发 JS 任务并返回执行日志', async () => {
      await scheduler.init({ enableDb: false })
      await scheduler.register({
        id: 'manual-js',
        name: '手动 JS',
        cron: '0 0 1 1 *',
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

    it('触发失败的 JS 任务应记录错误信息', async () => {
      await scheduler.init({ enableDb: false })
      await scheduler.register({
        id: 'fail-js',
        name: '失败任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => { throw new Error('handler error') },
      })

      const result = await scheduler.trigger('fail-js')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('failed')
        expect(result.data.error).toContain('handler error')
        expect(result.data.result).toBeNull()
        expect(result.data.duration).toBeGreaterThanOrEqual(0)
      }
    })

    it('未初始化时触发应返回 NOT_INITIALIZED', async () => {
      const result = await scheduler.trigger('any-task')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.NOT_INITIALIZED)
      }
    })
  })

  describe('数据库集成', () => {
    it('应保存执行日志到数据库', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'db-task',
        name: 'DB 任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => 'saved',
      })

      await scheduler.trigger('db-task')

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
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'ok-task',
        name: '成功任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => 'ok',
      })
      await scheduler.register({
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

    it('应按 taskId 和 status 组合过滤日志', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'mixed-task',
        name: '混合任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => 'ok',
      })
      await scheduler.register({
        id: 'other-task',
        name: '其他任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => 'ok',
      })

      await scheduler.trigger('mixed-task')
      await scheduler.trigger('other-task')

      const logsResult = await scheduler.getLogs({ taskId: 'mixed-task', status: 'success' })
      expect(logsResult.success).toBe(true)
      if (logsResult.success) {
        expect(logsResult.data).toHaveLength(1)
        expect(logsResult.data[0].taskId).toBe('mixed-task')
      }
    })

    it('多次触发应创建多条日志', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'multi-task',
        name: '多次触发',
        cron: '* * * * *',
        type: 'js',
        handler: () => 'run',
      })

      await scheduler.trigger('multi-task')
      await scheduler.trigger('multi-task')
      await scheduler.trigger('multi-task')

      const logsResult = await scheduler.getLogs({ taskId: 'multi-task' })
      expect(logsResult.success).toBe(true)
      if (logsResult.success) {
        expect(logsResult.data).toHaveLength(3)
        expect(logsResult.data[0].id).toBeGreaterThan(logsResult.data[2].id)
      }
    })

    it('应支持分页查询（limit/offset）', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'page-task',
        name: '分页任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => 'data',
      })

      for (let i = 0; i < 5; i++) {
        await scheduler.trigger('page-task')
      }

      const page1 = await scheduler.getLogs({ taskId: 'page-task', limit: 2 })
      expect(page1.success).toBe(true)
      if (page1.success) {
        expect(page1.data).toHaveLength(2)
      }

      const page2 = await scheduler.getLogs({ taskId: 'page-task', limit: 2, offset: 2 })
      expect(page2.success).toBe(true)
      if (page2.success) {
        expect(page2.data).toHaveLength(2)
      }

      const page3 = await scheduler.getLogs({ taskId: 'page-task', limit: 2, offset: 4 })
      expect(page3.success).toBe(true)
      if (page3.success) {
        expect(page3.data).toHaveLength(1)
      }
    })

    it('数据库未初始化时 getLogs 应返回错误', async () => {
      await scheduler.init({ enableDb: false })

      const result = await scheduler.getLogs()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.DB_SAVE_FAILED)
      }
    })

    it('未初始化时 getLogs 应返回 NOT_INITIALIZED', async () => {
      const result = await scheduler.getLogs()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.NOT_INITIALIZED)
      }
    })
  })

  describe('任务持久化', () => {
    it('API 任务持久化失败时应返回错误且不写入内存', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      vi.spyOn(SchedulerTaskRepository.prototype, 'saveTask').mockResolvedValue({
        success: false,
        error: {
          code: SchedulerErrorCode.DB_SAVE_FAILED,
          message: 'mock save failure',
        },
      })

      const result = await scheduler.register({
        id: 'persist-fail-register',
        name: '持久化失败注册',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://example.com/register' },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.DB_SAVE_FAILED)
      }
      expect(scheduler.tasks.has('persist-fail-register')).toBe(false)
    })

    it('API 任务删除持久化失败时应返回错误且保留内存任务', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      const registerResult = await scheduler.register({
        id: 'persist-fail-unregister',
        name: '持久化失败删除',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://example.com/unregister' },
      })
      expect(registerResult.success).toBe(true)
      expect(scheduler.tasks.has('persist-fail-unregister')).toBe(true)

      vi.spyOn(SchedulerTaskRepository.prototype, 'deleteTask').mockResolvedValue({
        success: false,
        error: {
          code: SchedulerErrorCode.DB_SAVE_FAILED,
          message: 'mock delete failure',
        },
      })

      const unregisterResult = await scheduler.unregister('persist-fail-unregister')
      expect(unregisterResult.success).toBe(false)
      if (!unregisterResult.success) {
        expect(unregisterResult.error.code).toBe(SchedulerErrorCode.DB_SAVE_FAILED)
      }
      expect(scheduler.tasks.has('persist-fail-unregister')).toBe(true)
    })

    it('API 任务更新持久化失败时应返回错误且不修改内存任务', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      const registerResult = await scheduler.register({
        id: 'persist-fail-update',
        name: '原始任务',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://example.com/original' },
      })
      expect(registerResult.success).toBe(true)

      vi.spyOn(SchedulerTaskRepository.prototype, 'updateTask').mockResolvedValue({
        success: false,
        error: {
          code: SchedulerErrorCode.DB_SAVE_FAILED,
          message: 'mock update failure',
        },
      })

      const updateResult = await scheduler.updateTask('persist-fail-update', {
        name: '更新后的任务',
        cron: '*/15 * * * *',
      })
      expect(updateResult.success).toBe(false)
      if (!updateResult.success) {
        expect(updateResult.error.code).toBe(SchedulerErrorCode.DB_SAVE_FAILED)
      }

      const task = scheduler.tasks.get('persist-fail-update')
      expect(task?.name).toBe('原始任务')
      expect(task?.cron).toBe('0 * * * *')
    })

    it('启用 DB 时注销 JS 任务不应依赖持久化仓库', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'js-unregister-no-db-delete',
        name: 'JS 注销任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => 'done',
      })

      const deleteTaskSpy = vi.spyOn(SchedulerTaskRepository.prototype, 'deleteTask')
      const unregisterResult = await scheduler.unregister('js-unregister-no-db-delete')

      expect(unregisterResult.success).toBe(true)
      expect(deleteTaskSpy).not.toHaveBeenCalled()
      expect(scheduler.tasks.has('js-unregister-no-db-delete')).toBe(false)
    })

    it('api 任务应持久化到数据库，重新初始化后自动加载', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'persisted-api',
        name: '持久化 API 任务',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://example.com/health', method: 'GET' },
      })

      expect(scheduler.tasks.size).toBe(1)

      await scheduler.close()
      await scheduler.init({ enableDb: true })

      expect(scheduler.tasks.size).toBe(1)
      expect(scheduler.tasks.has('persisted-api')).toBe(true)
      const task = scheduler.tasks.get('persisted-api')!
      expect(task.name).toBe('持久化 API 任务')
      expect(task.cron).toBe('0 * * * *')
      expect(task.type).toBe('api')
    })

    it('js 任务不应持久化，重新初始化后不加载', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'js-task',
        name: 'JS 任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => 'done',
      })

      expect(scheduler.tasks.size).toBe(1)

      await scheduler.close()
      await scheduler.init({ enableDb: true })

      expect(scheduler.tasks.size).toBe(0)
    })

    it('注销 API 任务应同时删除持久化数据', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'to-remove',
        name: '待删除',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://example.com' },
      })

      expect(scheduler.tasks.size).toBe(1)

      await scheduler.unregister('to-remove')
      expect(scheduler.tasks.size).toBe(0)

      await scheduler.close()
      await scheduler.init({ enableDb: true })
      expect(scheduler.tasks.size).toBe(0)
    })

    it('updateTask 应更新内存和持久化数据', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'update-task',
        name: '原始名称',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://example.com/old' },
      })

      const updateResult = await scheduler.updateTask('update-task', {
        name: '更新后名称',
        cron: '*/10 * * * *',
        api: { url: 'https://example.com/new', method: 'POST' },
      })
      expect(updateResult.success).toBe(true)

      const task = scheduler.tasks.get('update-task')!
      expect(task.name).toBe('更新后名称')
      expect(task.cron).toBe('*/10 * * * *')
      if (task.type === 'api') {
        expect(task.api.url).toBe('https://example.com/new')
        expect(task.api.method).toBe('POST')
      }

      await scheduler.close()
      await scheduler.init({ enableDb: true })
      expect(scheduler.tasks.size).toBe(1)
      const reloaded = scheduler.tasks.get('update-task')!
      expect(reloaded.name).toBe('更新后名称')
      expect(reloaded.cron).toBe('*/10 * * * *')
    })

    it('updateTask 不存在的任务应返回 TASK_NOT_FOUND', async () => {
      await scheduler.init({ enableDb: false })

      const result = await scheduler.updateTask('nonexistent', { name: 'new' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.TASK_NOT_FOUND)
      }
    })

    it('updateTask 使用无效 cron 应返回 INVALID_CRON', async () => {
      await scheduler.init({ enableDb: false })
      await scheduler.register({
        id: 'cron-update',
        name: '测试',
        cron: '* * * * *',
        type: 'js',
        handler: () => {},
      })

      const result = await scheduler.updateTask('cron-update', { cron: 'invalid' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.INVALID_CRON)
      }
    })

    it('updateTask 可更新 enabled 状态', async () => {
      await scheduler.init({ enableDb: false })
      await scheduler.register({
        id: 'toggle-task',
        name: '开关任务',
        cron: '* * * * *',
        type: 'js',
        handler: () => {},
      })

      const result = await scheduler.updateTask('toggle-task', { enabled: false })
      expect(result.success).toBe(true)

      const task = scheduler.tasks.get('toggle-task')!
      expect(task.enabled).toBe(false)
    })

    it('未初始化时 updateTask 应返回 NOT_INITIALIZED', async () => {
      const result = await scheduler.updateTask('any', { name: 'x' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(SchedulerErrorCode.NOT_INITIALIZED)
      }
    })

    it('禁用 DB 时 API 任务不应持久化', async () => {
      await scheduler.init({ enableDb: false })

      await scheduler.register({
        id: 'no-persist',
        name: '不持久化',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://example.com' },
      })

      expect(scheduler.tasks.size).toBe(1)

      await scheduler.close()
      await scheduler.init({ enableDb: false })
      expect(scheduler.tasks.size).toBe(0)
    })

    it('多个 API 任务应全部持久化并在重新初始化后加载', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'api-1',
        name: 'API 任务 1',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://example.com/1' },
      })
      await scheduler.register({
        id: 'api-2',
        name: 'API 任务 2',
        cron: '*/10 * * * *',
        type: 'api',
        api: { url: 'https://example.com/2', method: 'POST', body: { key: 'value' } },
      })

      expect(scheduler.tasks.size).toBe(2)

      await scheduler.close()
      await scheduler.init({ enableDb: true })

      expect(scheduler.tasks.size).toBe(2)
      expect(scheduler.tasks.has('api-1')).toBe(true)
      expect(scheduler.tasks.has('api-2')).toBe(true)

      const task2 = scheduler.tasks.get('api-2')!
      expect(task2.type).toBe('api')
      if (task2.type === 'api') {
        expect(task2.api.method).toBe('POST')
      }
    })

    it('updateTask enabled 状态应同步到 DB 并在重新加载后保持', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'toggle-api',
        name: '开关 API 任务',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://example.com' },
      })

      await scheduler.updateTask('toggle-api', { enabled: false })
      expect(scheduler.tasks.get('toggle-api')!.enabled).toBe(false)

      await scheduler.close()
      await scheduler.init({ enableDb: true })

      const reloaded = scheduler.tasks.get('toggle-api')!
      expect(reloaded.enabled).toBe(false)
    })
  })

  describe('配置任务加载', () => {
    it('init 时通过 tasks 配置加载预定义任务', async () => {
      await scheduler.init({
        enableDb: false,
        tasks: [
          { id: 'config-js', name: '配置 JS 任务', cron: '* * * * *', type: 'js', handler: () => 'config' },
          { id: 'config-api', name: '配置 API 任务', cron: '0 * * * *', type: 'api', api: { url: 'https://example.com' } },
        ],
      })

      expect(scheduler.tasks.size).toBe(2)
      expect(scheduler.tasks.has('config-js')).toBe(true)
      expect(scheduler.tasks.has('config-api')).toBe(true)
      expect(scheduler.tasks.get('config-js')!.name).toBe('配置 JS 任务')
    })

    it('不传 tasks 时任务列表为空', async () => {
      await scheduler.init({ enableDb: false })
      expect(scheduler.tasks.size).toBe(0)
    })

    it('空 tasks 数组不影响初始化', async () => {
      const result = await scheduler.init({ enableDb: false, tasks: [] })
      expect(result.success).toBe(true)
      expect(scheduler.tasks.size).toBe(0)
    })

    it('配置任务的 cron 无效时应跳过该任务', async () => {
      await scheduler.init({
        enableDb: false,
        tasks: [
          { id: 'valid', name: '有效', cron: '* * * * *', type: 'js', handler: () => {} },
          { id: 'invalid-cron', name: '无效 cron', cron: 'bad', type: 'js', handler: () => {} },
        ],
      })

      expect(scheduler.tasks.size).toBe(1)
      expect(scheduler.tasks.has('valid')).toBe(true)
      expect(scheduler.tasks.has('invalid-cron')).toBe(false)
    })

    it('dB 已有同 ID 任务时，配置任务应被跳过（DB 优先）', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({ enableDb: true })

      await scheduler.register({
        id: 'dup-id',
        name: 'DB 版本',
        cron: '0 * * * *',
        type: 'api',
        api: { url: 'https://db.example.com' },
      })

      await scheduler.close()

      await scheduler.init({
        enableDb: true,
        tasks: [
          { id: 'dup-id', name: '配置版本', cron: '*/5 * * * *', type: 'api', api: { url: 'https://config.example.com' } },
        ],
      })

      expect(scheduler.tasks.size).toBe(1)
      const task = scheduler.tasks.get('dup-id')!
      expect(task.name).toBe('DB 版本')
      if (task.type === 'api') {
        expect(task.api.url).toBe('https://db.example.com')
      }
    })

    it('dB 无同 ID 任务时配置任务应正常注册', async () => {
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await scheduler.init({
        enableDb: true,
        tasks: [
          { id: 'config-only', name: '仅配置', cron: '0 * * * *', type: 'api', api: { url: 'https://config.example.com' } },
        ],
      })

      expect(scheduler.tasks.size).toBe(1)
      expect(scheduler.tasks.get('config-only')!.name).toBe('仅配置')
    })

    it('配置任务可被手动触发', async () => {
      await scheduler.init({
        enableDb: false,
        tasks: [
          { id: 'trigger-me', name: '可触发', cron: '0 0 1 1 *', type: 'js', handler: () => 'from-config' },
        ],
      })

      const result = await scheduler.trigger('trigger-me')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.taskId).toBe('trigger-me')
        expect(result.data.status).toBe('success')
        expect(result.data.result).toBe('"from-config"')
      }
    })

    it('关闭后配置任务不保留（无 DB）', async () => {
      await scheduler.init({
        enableDb: false,
        tasks: [
          { id: 'temp-task', name: '临时', cron: '* * * * *', type: 'js', handler: () => {} },
        ],
      })
      expect(scheduler.tasks.size).toBe(1)

      await scheduler.close()
      await scheduler.init({ enableDb: false })
      expect(scheduler.tasks.size).toBe(0)
    })
  })

  describe('close', () => {
    it('close 后应恢复到未初始化状态', async () => {
      await scheduler.init({ enableDb: false })
      await scheduler.register({
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

    it('运行中 close 应同时停止定时器', async () => {
      await scheduler.init({ enableDb: false })
      scheduler.start()
      expect(scheduler.isRunning).toBe(true)

      await scheduler.close()
      expect(scheduler.isRunning).toBe(false)
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
      await scheduler.register({
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
    })
  })
})
