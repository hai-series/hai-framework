/**
 * =============================================================================
 * @h-ai/scheduler - 任务执行器测试
 * =============================================================================
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeApiTask, executeJsTask, executeTask, interruptTask, saveInterruptedTaskLog, setLogRepository } from '../src/scheduler-executor.js'

describe('scheduler-executor', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setLogRepository(null)
  })

  it('应成功执行 JS 字符串任务', async () => {
    const task = {
      id: 'js-task',
      name: 'JS 任务',
      cron: '* * * * *',
      params: { channel: 'admin' },
      handler: {
        kind: 'js' as const,
        code: '(context) => ({ taskId: context.taskId, channel: context.params.channel })',
      },
    }

    const result = await executeJsTask(
      task,
      {
        task,
        taskId: task.id,
        params: task.params ?? {},
        trigger: { type: 'manual', source: 'admin-console' },
      },
    )

    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toContain('admin')
  })

  it('应成功执行 API 任务', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"ok":true}'),
    })
    vi.stubGlobal('fetch', mockFetch)

    const task = {
      id: 'api-task',
      name: 'API 任务',
      cron: '* * * * *',
      handler: {
        kind: 'api' as const,
        url: 'https://example.com/api',
        method: 'GET' as const,
      },
    }

    const result = await executeApiTask(
      task,
      {
        task,
        taskId: task.id,
        params: {},
        trigger: { type: 'manual', source: 'api' },
      },
    )

    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toBe('{"ok":true}')
  })

  it('无 handler 但有全局 execute hook 时应成功执行', async () => {
    const task = {
      id: 'hook-task',
      name: 'Hook 任务',
      cron: '* * * * *',
    }

    const log = await executeTask(task, { type: 'manual', source: 'cli' }, {
      onTaskExecute: event => ({ source: event.context.trigger.source, kind: 'hook' }),
    })

    expect(log.taskType).toBe('hook')
    expect(log.status).toBe('success')
    expect(log.result).toContain('cli')
  })

  it('无 handler 且无全局 execute hook 时应返回 interrupted 日志', async () => {
    const onTaskInterrupted = vi.fn()
    const onTaskFinish = vi.fn()
    const task = {
      id: 'missing-handler',
      name: '缺少处理器',
      cron: '* * * * *',
    }

    const log = await executeTask(task, { type: 'manual', source: 'cli' }, {
      onTaskInterrupted,
      onTaskFinish,
    })

    expect(log.status).toBe('interrupted')
    expect(log.error).toContain('missing-handler')
    expect(onTaskInterrupted).toHaveBeenCalledTimes(1)
    expect(onTaskFinish).toHaveBeenCalledTimes(0)
  })

  it('应构造并保存 interrupted 日志并保留触发来源', async () => {
    const task = {
      id: 'interrupt-task',
      name: '中断任务',
      cron: '* * * * *',
    }

    const log = await saveInterruptedTaskLog(
      task,
      { type: 'manual', source: 'admin-console' },
      'manual interruption',
      'hook',
      100,
      120,
    )

    expect(log.status).toBe('interrupted')
    expect(log.triggerType).toBe('manual')
    expect(log.triggerSource).toBe('admin-console')
    expect(log.error).toBe('manual interruption')
    expect(log.taskType).toBe('hook')
    expect(log.startedAt).toBe(100)
    expect(log.finishedAt).toBe(120)
    expect(log.duration).toBe(20)
  })

  it('应在中断任务时触发 hooks 并返回 interrupted 日志', async () => {
    const onTaskStart = vi.fn()
    const onTaskInterrupted = vi.fn()
    const onTaskFinish = vi.fn()
    const task = {
      id: 'interrupt-task-lifecycle',
      name: '中断任务生命周期',
      cron: '* * * * *',
    }

    const log = await interruptTask(
      task,
      { type: 'manual', source: 'admin-console' },
      'manual interruption',
      { onTaskStart, onTaskInterrupted, onTaskFinish },
    )

    expect(log.status).toBe('interrupted')
    expect(log.error).toBe('manual interruption')
    expect(onTaskStart).toHaveBeenCalledTimes(1)
    expect(onTaskInterrupted).toHaveBeenCalledTimes(1)
    expect(onTaskFinish).toHaveBeenCalledTimes(0)
  })
})
