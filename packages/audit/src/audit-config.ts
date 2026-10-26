/**
 * @h-ai/audit — 错误码与配置
 *
 * 定义审计模块的错误码常量与初始化配置类型。
 * @module audit-config
 */

import type { ReachFunctions } from '@h-ai/reach'
import type { StorageFunctions } from '@h-ai/storage'
import { z } from 'zod'

// ─── 初始化配置 ───

/**
 * 审计模块初始化配置 Schema（Zod）
 *
 * 所有字段均有默认值，可直接调用 `audit.init()` 无需传参。
 * @example
 * ```ts
 * import { AuditInitConfigSchema } from '@h-ai/audit'
 * const config = AuditInitConfigSchema.parse({ userTable: 'app_users' })
 * // 这里只校验字段映射；实际初始化前必须已有可用的 RelDB。
 * ```
 */
export const AuditInitConfigSchema = z.object({
  /** 以固定时间窗口统计已提交事件；目标和事件由应用配置，不内置业务角色。 */
  alerts: z.object({
    enabled: z.boolean().default(false),
    maxNotificationsPerCheck: z.number().int().min(1).max(1000).default(100),
    rules: z.array(z.object({
      id: z.string().regex(/^[\w-]{1,64}$/),
      actions: z.array(z.string().trim().min(1).max(128)).min(1).max(50),
      resource: z.string().trim().min(1).max(256).optional(),
      outcomes: z.array(z.enum(['success', 'failure', 'denied'])).max(3).default(['failure', 'denied']),
      minimumSeverity: z.enum(['info', 'warning', 'error', 'critical']).default('info'),
      severity: z.enum(['warning', 'error', 'critical']).default('warning'),
      threshold: z.number().int().min(1).max(1000000000).default(1),
      windowSeconds: z.number().int().min(60).max(86400).default(300),
      targets: z.array(z.object({
        id: z.string().regex(/^[\w-]{1,64}$/),
        provider: z.string().trim().min(1).max(128),
        to: z.string().trim().min(1).max(1000),
      })).min(1).max(20).refine(targets => new Set(targets.map(target => target.id)).size === targets.length),
    })).max(20).default([]).refine(rules => new Set(rules.map(rule => rule.id)).size === rules.length),
    schedule: z.object({
      enabled: z.boolean().default(false),
      cron: z.string().trim().min(1).max(128).default('* * * * *'),
      timezone: z.string().trim().min(1).max(128).default('UTC'),
    }).default({ enabled: false, cron: '* * * * *', timezone: 'UTC' }),
  }).default({ enabled: false, maxNotificationsPerCheck: 100, rules: [], schedule: { enabled: false, cron: '* * * * *', timezone: 'UTC' } }).refine(alerts => !alerts.enabled || alerts.rules.length > 0),
  /** 可选的流式归档；自动执行由宿主现有 Scheduler 装配。 */
  backup: z.object({
    enabled: z.boolean().default(false),
    batchSize: z.number().int().min(1).max(1000).default(200),
    maxRecordBytes: z.number().int().min(1024).max(64 * 1024 * 1024).default(1024 * 1024),
    schedule: z.object({
      enabled: z.boolean().default(false),
      cron: z.string().trim().min(1).max(128).default('0 2 * * *'),
      timezone: z.string().trim().min(1).max(128).default('UTC'),
    }).default({ enabled: false, cron: '0 2 * * *', timezone: 'UTC' }),
  }).default({ enabled: false, batchSize: 200, maxRecordBytes: 1024 * 1024, schedule: { enabled: false, cron: '0 2 * * *', timezone: 'UTC' } }),
  /** 框架入口自动采集；显式 audit.log 不受此开关影响。 */
  capture: z.object({
    enabled: z.boolean().default(true),
    includeReads: z.boolean().default(false),
  }).default({ enabled: true, includeReads: false }),
  /** 未传时沿用数据库保留设置；显式关闭才解除保护。 */
  retention: z.object({
    enabled: z.boolean().default(false),
    minDays: z.number().int().min(1).max(36500).default(90),
  }).optional(),
  /** 凭据始终脱敏；此开关仅控制业务隐私字段。 */
  privacy: z.object({
    enabled: z.boolean().default(true),
    fields: z.array(z.string().trim().min(1).max(256)).max(1000).default([]),
  }).default({ enabled: true, fields: [] }),
  /** 用户表名，用于 list 查询时 LEFT JOIN 获取用户名 */
  userTable: z.string().default('hai_iam_users'),
  /** 用户表主键列名，用于 JOIN 条件 */
  userIdColumn: z.string().default('id'),
  /** 用户表用户名列名，用于 SELECT 输出 */
  userNameColumn: z.string().default('username'),
})

/**
 * 审计模块初始化配置（解析后）
 * @example
 * ```ts
 * import { AuditInitConfigSchema, type AuditInitConfig } from '@h-ai/audit'
 * const config: AuditInitConfig = AuditInitConfigSchema.parse({ userTable: 'app_users' })
 * ```
 */
export type AuditInitConfig = z.output<typeof AuditInitConfigSchema>

/**
 * 审计模块初始化配置（传入参数）
 * @example
 * ```ts
 * import type { AuditInitConfigInput } from '@h-ai/audit'
 * const record: AuditInitConfigInput = { userTable: 'app_users', userIdColumn: 'id', userNameColumn: 'username' }
 * ```
 */
export type AuditInitConfigInput = z.input<typeof AuditInitConfigSchema> & {
  /** 开启备份时注入已初始化且私有访问的存储；audit 不拥有它的生命周期。 */
  storage?: StorageFunctions
  /** 开启告警时注入已初始化的 Reach；通知人员/目标仍由应用配置。 */
  reach?: ReachFunctions
}
