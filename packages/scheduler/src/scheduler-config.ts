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
  /** 是否启用数据库记录（默认 true，需要 @h-ai/reldb 已初始化） */
  enableDb: z.boolean().default(true),
  /** 调度检查间隔，单位毫秒（默认 1000，即每秒检查一次） */
  tickInterval: z.number().int().min(100).default(1000),
  /** 分布式锁过期时间，单位毫秒（默认 300000，即 5 分钟） */
  lockExpireMs: z.number().int().min(10000).default(300000),
  /** 节点标识（默认自动生成 UUID，多节点部署时建议设置固定标识以便审计） */
  nodeId: z.string().min(1).optional(),
})

/** 调度器配置类型 */
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>

/** 调度器配置输入类型 */
export type SchedulerConfigInput = z.input<typeof SchedulerConfigSchema>
