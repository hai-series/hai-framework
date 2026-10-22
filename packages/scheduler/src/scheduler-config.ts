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
 * const config = SchedulerConfigSchema.parse({
 *   enableDb: true,
 *   tickInterval: 1000,
 * })
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

/** 手动触发边界，重复使用同一幂等键会命中同一个执行记录。@example TriggerTaskSchema.parse({ idempotencyKey: 'billing-2026-10' }) */
export const TriggerTaskSchema = z.object({
  source: z.string().max(255).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
})

/** 可信服务端人工核对结果；必须先停止旧 runner，不能将未知执行直接重排。@example ExecutionResolutionSchema.parse({ status: 'discarded', expectedUpdatedAt: Date.now() }) */
export const ExecutionResolutionSchema = z.object({
  status: z.enum(['success', 'discarded']),
  expectedUpdatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
})

/** 调度器配置类型 */
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>

/** 调度器配置输入类型 */
export type SchedulerConfigInput = z.input<typeof SchedulerConfigSchema>
