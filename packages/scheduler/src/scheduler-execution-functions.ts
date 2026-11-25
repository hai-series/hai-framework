import type { HaiResult } from '@h-ai/core'
import type { SchedulerExecutionRepository, SchedulerTaskRepository } from './repositories/index.js'
import type { SchedulerConfig } from './scheduler-config.js'
import type { SchedulerFunctions, TaskExecutionLog, TriggerTaskInput } from './scheduler-types.js'
import { core } from '@h-ai/core'
import { z } from 'zod'
import { executionEntry, executionId } from './repositories/index.js'
import { ExecutionResolutionSchema, TriggerTaskSchema } from './scheduler-config.js'
import { getTask, loadPersistedTasks } from './scheduler-functions.js'
import { schedulerM } from './scheduler-i18n.js'
import { repairExecutionLogs, replayTaskReceipt, runTask } from './scheduler-runner.js'
import { HaiSchedulerError } from './scheduler-types.js'

const executionIdSchema = z.string().regex(/^[a-f\d]{64}$/)
const executionListSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(1_000_000).default(0),
})

function normalizeTriggerInput(options?: TriggerTaskInput): { type: 'manual', source: string | null } {
  return {
    type: 'manual',
    source: options?.source ?? null,
  }
}

/**
 * 从当前运行期读取仓库，手动触发在异步阶段之后再次确认运行期未切换。
 * @example 模块内部上下文
 * ```ts
 * const inactive = core.module.createNotInitializedKit(HaiSchedulerError.NOT_INITIALIZED, () => schedulerM('scheduler_notInitialized'))
 * const operations = createExecutionOperations({ config: null, executionRepo: null, taskRepo: null, closing: false }, inactive.result)
 * const result = await operations.trigger('weekly-report')
 * if (!result.success) void result.error.code
 * ```
 */
export function createExecutionOperations(state: {
  readonly config: SchedulerConfig | null
  readonly executionRepo: SchedulerExecutionRepository | null
  readonly taskRepo: SchedulerTaskRepository | null
  readonly closing: boolean
}, inactive: <T>() => HaiResult<T>): Pick<SchedulerFunctions, 'execution' | 'trigger'> {
  return {
    execution: {
      async get(id) {
        if (!state.config || !state.executionRepo)
          return inactive()
        if (!executionIdSchema.safeParse(id).success)
          return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))
        const row = await state.executionRepo.byOccurrence(id)
        return row.success
          ? core.ok(row.data
              ? executionEntry(row.data)
              : null)
          : row
      },
      async listUnknown(options) {
        if (!state.config || !state.executionRepo)
          return inactive()
        const parsed = executionListSchema.safeParse(options ?? {})
        if (!parsed.success)
          return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))
        const rows = await state.executionRepo.unknown(parsed.data.limit, parsed.data.offset)
        return rows.success
          ? core.ok(rows.data.map(executionEntry))
          : rows
      },
      async listLogFailures(options) {
        if (!state.config || !state.executionRepo)
          return inactive()
        const parsed = executionListSchema.safeParse(options ?? {})
        if (!parsed.success)
          return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))
        const rows = await state.executionRepo.pendingLogs(parsed.data.limit, parsed.data.offset)
        return rows.success
          ? core.ok(rows.data.map(executionEntry))
          : rows
      },
      async repairLog(id) {
        if (!state.config || !state.executionRepo || state.closing)
          return inactive()
        if (!executionIdSchema.safeParse(id).success)
          return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))
        return repairExecutionLogs(id)
      },
      async resolveUnknown(id, resolution) {
        if (!state.config || !state.executionRepo)
          return inactive()
        const parsed = ExecutionResolutionSchema.safeParse(resolution)
        if (!executionIdSchema.safeParse(id).success || !parsed.success)
          return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))
        return state.executionRepo.resolve(id, parsed.data.status, parsed.data.expectedUpdatedAt)
      },
    },
    async trigger(taskId: string, options?: TriggerTaskInput): Promise<HaiResult<TaskExecutionLog>> {
      if (!state.config || !state.executionRepo)
        return inactive()
      const parsed = TriggerTaskSchema.safeParse(options ?? {})
      if (!parsed.success)
        return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))

      const config = state.config
      const execution = state.executionRepo
      const receipt = parsed.data.idempotencyKey
        ? executionId(taskId, 'manual', parsed.data.idempotencyKey)
        : undefined
      if (receipt) {
        const replay = await replayTaskReceipt(execution, receipt)
        if (state.config !== config)
          return inactive()
        if (!replay.success)
          return replay
        if (replay.data)
          return core.ok(replay.data)
      }
      const refreshed = await loadPersistedTasks(state.taskRepo)
      if (!refreshed.success)
        return refreshed
      if (state.config !== config)
        return inactive()

      const task = getTask(taskId)
      if (!task) {
        if (receipt) {
          const replay = await replayTaskReceipt(execution, receipt)
          if (state.config !== config)
            return inactive()
          if (!replay.success)
            return replay
          if (replay.data)
            return core.ok(replay.data)
        }
        return core.err(
          HaiSchedulerError.TASK_NOT_FOUND,
          schedulerM('scheduler_taskNotFound', {
            params: { taskId },
          }),
        )
      }

      const log = await runTask(task, undefined, normalizeTriggerInput(parsed.data), parsed.data)
      return core.ok(log)
    },
  }
}
