/**
 * @h-ai/scheduler — 配置 Schema
 *
 * 本文件定义定时任务模块的配置结构，使用 Zod 进行运行时校验。
 * @module scheduler-config
 */

import { z } from 'zod'

// ─── 配置 Schema ───

/**
 * 调度器配置 Zod Schema
 *
 * 所有字段均可选，提供合理默认值。
 *
 * @example
 * ```ts
 * import { SchedulerConfigSchema } from '@h-ai/scheduler'
 *
 * const parsed = SchedulerConfigSchema.safeParse({ enableDb: true, tickInterval: 1000, leaseMs: 300000 })
 * if (parsed.success) {
 *   const renewalPeriod = Math.floor(parsed.data.leaseMs / 3)
 * }
 * ```
 */
export const SchedulerConfigSchema = z.object({
  /** 必须使用共享数据库保存执行状态；false 不再允许，需要先初始化 @h-ai/reldb。 */
  enableDb: z.literal(true).default(true),
  /** 调度检查间隔，单位毫秒（默认 1000，即每秒检查一次） */
  tickInterval: z.number().int().min(100).default(1000),
  /** 执行租约毫秒数（默认 300000，范围 1000–86400000），在途每三分之一周期续期。 */
  leaseMs: z.number().int().min(1000).max(86_400_000).default(300000),
  /** 节点标识（默认自动生成 UUID，多节点部署时建议设置固定标识以便审计） */
  nodeId: z.string().min(1).optional(),
  /** 执行日志最大保留条数（启用 DB 时生效） */
  maxLogs: z.number().int().min(1).optional(),
  /** 执行日志保留天数（启用 DB 时生效） */
  retentionDays: z.number().int().min(1).optional(),
})

/**
 * 手动触发边界，重复使用同一幂等键会命中同一个执行记录。
 *
 * @example
 * ```ts
 * import { TriggerTaskSchema } from '@h-ai/scheduler'
 *
 * const parsed = TriggerTaskSchema.safeParse({ source: 'billing-console', idempotencyKey: 'billing-2026-10' })
 * if (parsed.success) {
 *   const sameOccurrenceKey = parsed.data.idempotencyKey
 * }
 * ```
 */
export const TriggerTaskSchema = z.object({
  source: z.string().max(255).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
})

/**
 * 可信服务端人工核对结果；必须先停止旧 runner，不能将未知执行直接重排。
 *
 * @example
 * ```ts
 * import { ExecutionResolutionSchema, scheduler } from '@h-ai/scheduler'
 *
 * // 可信运维流程已停止旧 runner 并核对实际外部结果。
 * const pending = await scheduler.execution.listUnknown({ limit: 10 })
 * if (!pending.success) throw new Error(pending.error.message)
 * const entry = pending.data[0]
 * if (entry) {
 *   const resolution = ExecutionResolutionSchema.parse({ status: 'discarded', expectedUpdatedAt: entry.updatedAt })
 *   const resolved = await scheduler.execution.resolveUnknown(entry.occurrenceId, resolution)
 *   if (!resolved.success) throw new Error(resolved.error.message)
 * }
 * ```
 */
export const ExecutionResolutionSchema = z.object({
  status: z.enum(['success', 'discarded']),
  expectedUpdatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
})

/**
 * 调度器配置类型
 *
 * @example
 * ```ts
 * import type { SchedulerConfig } from '@h-ai/scheduler'
 * import { SchedulerConfigSchema } from '@h-ai/scheduler'
 *
 * const config: SchedulerConfig = SchedulerConfigSchema.parse({ leaseMs: 60000 })
 * const renewalInterval = config.leaseMs / 3
 * ```
 */
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>

/**
 * 调度器配置输入类型
 *
 * @example
 * ```ts
 * import type { SchedulerConfigInput } from '@h-ai/scheduler'
 * import { scheduler } from '@h-ai/scheduler'
 *
 * // 宿主已成功初始化共享 reldb。
 * const config: SchedulerConfigInput = { leaseMs: 60000, retentionDays: 30 }
 * const initialized = await scheduler.init(config)
 * if (!initialized.success) throw new Error(initialized.error.message)
 * ```
 */
export type SchedulerConfigInput = z.input<typeof SchedulerConfigSchema>
