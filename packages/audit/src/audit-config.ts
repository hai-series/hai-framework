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
 *
 * @example
 * ```ts
 * import { audit } from '@h-ai/audit'
 * import { reldb } from '@h-ai/reldb'
 *
 * await audit.init()
 *
 * // 自定义用户表映射
 * await audit.init({
 *   userTable: 'sys_users',
 *   userIdColumn: 'user_id',
 *   userNameColumn: 'name',
 * })
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

/** 审计模块初始化配置（解析后） */
export type AuditInitConfig = z.output<typeof AuditInitConfigSchema>

/** 审计模块初始化配置（传入参数） */
export type AuditInitConfigInput = z.input<typeof AuditInitConfigSchema>
