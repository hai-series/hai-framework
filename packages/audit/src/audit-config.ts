/**
 * @h-ai/audit — 错误码与配置
 *
 * 定义审计模块的错误码常量与初始化配置类型。
 * @module audit-config
 */

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
export type AuditInitConfigInput = z.input<typeof AuditInitConfigSchema>
