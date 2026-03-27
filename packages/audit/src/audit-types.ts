/**
 * @h-ai/audit — 公共类型定义
 *
 * 审计模块对外类型：错误接口、实体类型、操作接口、函数接口。
 * @module audit-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { AuditInitConfigInput } from './audit-config.js'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

const AuditErrorInfo = {
  LOG_FAILED: '001:500',
  QUERY_FAILED: '002:500',
  CLEANUP_FAILED: '003:500',
  STATS_FAILED: '004:500',
  INIT_IN_PROGRESS: '005:409',
  NOT_INITIALIZED: '010:500',
  CONFIG_ERROR: '012:500',
} as const satisfies ErrorInfo

export const HaiAuditError = core.error.buildHaiErrorsDef('audit', AuditErrorInfo)

// ─── 实体类型 ───

/**
 * 审计日志记录
 *
 * 表示一条已持久化的审计日志条目。
 */
export interface AuditLog {
  /** 审计日志 ID，格式为 `audit_` 前缀 + 随机串 */
  id: string
  /** 操作用户 ID；系统操作时为 null */
  userId: string | null
  /** 操作类型（如 login / logout / create / update / delete） */
  action: string
  /** 资源类型（如 auth / users / roles） */
  resource: string
  /** 资源 ID；不涉及特定资源时为 null */
  resourceId: string | null
  /** 操作详情（JSON 字符串）；无详情时为 null */
  details: string | null
  /** 客户端 IP 地址；未知时为 null */
  ipAddress: string | null
  /** 客户端 User-Agent；未知时为 null */
  userAgent: string | null
  /** 创建时间 */
  createdAt: Date
}

/**
 * 审计日志记录（含用户名）
 *
 * 通过 LEFT JOIN 用户表获取 username 字段，用于列表展示。
 */
export interface AuditLogWithUser extends AuditLog {
  /** 操作用户的用户名；用户不存在或系统操作时为 null */
  username: string | null
}

/**
 * 创建审计日志输入
 *
 * 调用 {@link AuditFunctions.log} 时传入的参数。
 * 仅 `action` 和 `resource` 为必填。
 */
export interface CreateAuditLogInput {
  /** 操作用户 ID；系统操作可省略 */
  userId?: string | null
  /** 操作类型（如 login / create / update / delete） */
  action: string
  /** 资源类型（如 auth / users / roles） */
  resource: string
  /** 资源 ID；不涉及特定资源时可省略 */
  resourceId?: string | null
  /** 操作详情对象，会被 JSON 序列化存储 */
  details?: Record<string, unknown> | null
  /** 客户端 IP 地址 */
  ipAddress?: string | null
  /** 客户端 User-Agent */
  userAgent?: string | null
}

/**
 * 审计日志列表查询选项
 *
 * 所有字段均为可选，不传则不过滤。
 */
export interface ListAuditLogsOptions {
  /** 按用户 ID 过滤 */
  userId?: string
  /** 按操作类型过滤（精确匹配） */
  action?: string
  /** 按资源类型过滤（精确匹配） */
  resource?: string
  /** 起始时间（含），只返回此时间之后的日志 */
  startDate?: Date
  /** 结束时间（含），只返回此时间之前的日志 */
  endDate?: Date
  /** 页码，从 1 开始 */
  page?: number
  /**
   * 每页条数
   *
   * @default 20
   */
  pageSize?: number
}

/**
 * 审计统计结果项
 *
 * 按操作类型（action）分组的统计条目。
 */
export interface AuditStatItem {
  /** 操作类型 */
  action: string
  /** 该操作在统计时间范围内的次数 */
  count: number
}

/**
 * CRUD 审计操作输入
 *
 * 调用 {@link AuditHelper.crud} 时传入的参数。
 */
export interface CrudAuditInput {
  /** 操作用户 ID（系统操作传 null） */
  userId?: string | null
  /** 操作类型 */
  action: 'create' | 'read' | 'update' | 'delete'
  /** 资源类型（如 users / roles） */
  resource: string
  /** 资源 ID（可选） */
  resourceId?: string
  /** 操作详情对象（可选） */
  details?: Record<string, unknown>
  /** 客户端 IP（可选） */
  ip?: string
  /** 客户端 User-Agent（可选） */
  ua?: string
}

// ─── 便捷操作接口 ───

/**
 * 审计便捷记录器
 *
 * 封装常见审计场景（认证、CRUD），简化调用方代码。
 * 通过 {@link AuditFunctions.helper} 访问。
 *
 * @example
 * ```ts
 * await audit.helper.login('user_1', '127.0.0.1', 'Mozilla/5.0')
 * await audit.helper.crud({ userId: 'user_1', action: 'create', resource: 'users', resourceId: 'user_2' })
 * ```
 */
export interface AuditHelper {
  /**
   * 记录用户登录
   *
   * @param userId - 登录用户 ID
   * @param ip - 客户端 IP（可选）
   * @param ua - 客户端 User-Agent（可选）
   */
  login: (userId: string, ip?: string, ua?: string) => Promise<HaiResult<void>>
  /**
   * 记录用户登出
   *
   * @param userId - 登出用户 ID
   * @param ip - 客户端 IP（可选）
   * @param ua - 客户端 User-Agent（可选）
   */
  logout: (userId: string, ip?: string, ua?: string) => Promise<HaiResult<void>>
  /**
   * 记录用户注册
   *
   * @param userId - 注册用户 ID
   * @param ip - 客户端 IP（可选）
   * @param ua - 客户端 User-Agent（可选）
   */
  register: (userId: string, ip?: string, ua?: string) => Promise<HaiResult<void>>
  /**
   * 记录密码重置请求
   *
   * @param email - 请求重置的邮箱地址
   * @param ip - 客户端 IP（可选）
   * @param ua - 客户端 User-Agent（可选）
   */
  passwordResetRequest: (email: string, ip?: string, ua?: string) => Promise<HaiResult<void>>
  /**
   * 记录密码重置完成
   *
   * @param userId - 重置密码的用户 ID（匿名重置场景传 null）
   * @param ip - 客户端 IP（可选）
   * @param ua - 客户端 User-Agent（可选）
   */
  passwordResetComplete: (userId: string | null, ip?: string, ua?: string) => Promise<HaiResult<void>>
  /**
   * 记录 CRUD 操作
   *
   * @param input - CRUD 审计输入（action 和 resource 为必填）
   *
   * @example
   * ```ts
   * await audit.helper.crud({ userId: 'user_1', action: 'create', resource: 'users', resourceId: 'user_2' })
   * ```
   */
  crud: (input: CrudAuditInput) => Promise<HaiResult<void>>
}

// ─── 函数接口 ───

/**
 * 审计模块函数接口
 *
 * 统一的审计日志访问入口。
 *
 * @example
 * ```ts
 * import { audit } from '@h-ai/audit'
 * import { reldb } from '@h-ai/reldb'
 *
 * await reldb.init({ type: 'sqlite', database: './data.db' })
 * await audit.init()
 *
 * await audit.log({ userId: 'user_1', action: 'login', resource: 'auth' })
 * const logs = await audit.list({ pageSize: 10 })
 * await audit.close()
 * ```
 */
export interface AuditFunctions {
  /**
   * 初始化审计模块
   *
   * @param config - 初始化配置（可选，所有字段均有默认值）
   * @returns 成功时返回 ok(undefined)；失败时返回 CONFIG_ERROR
   */
  init: (config?: AuditInitConfigInput) => Promise<HaiResult<void>>
  /**
   * 关闭审计模块，释放内部状态
   */
  close: () => Promise<void>
  /** 当前是否已初始化 */
  readonly isInitialized: boolean
  /**
   * 记录一条审计日志
   *
   * @param input - 日志内容（action 和 resource 为必填）
   * @returns 成功时返回创建的 AuditLog；失败时返回 LOG_FAILED
   */
  log: (input: CreateAuditLogInput) => Promise<HaiResult<AuditLog>>
  /**
   * 分页查询审计日志列表（含用户名 LEFT JOIN）
   *
   * @param options - 查询过滤与分页选项
   * @returns 成功时返回 { items, total }；失败时返回 QUERY_FAILED
   */
  list: (options?: ListAuditLogsOptions) => Promise<HaiResult<{ items: AuditLogWithUser[], total: number }>>
  /**
   * 获取指定用户的最近活动记录
   *
   * @param userId - 用户 ID
   * @param limit - 最大返回条数，默认 10
   * @returns 成功时返回 AuditLog 数组；失败时返回 QUERY_FAILED
   */
  getUserRecent: (userId: string, limit?: number) => Promise<HaiResult<AuditLog[]>>
  /**
   * 清理指定天数之前的旧日志
   *
   * @param olderThanDays - 保留天数，默认 90；清理此天数之前的日志
   * @returns 成功时返回删除的记录数；失败时返回 CLEANUP_FAILED
   */
  cleanup: (olderThanDays?: number) => Promise<HaiResult<number>>
  /**
   * 获取指定天数内的操作统计（按 action 分组计数）
   *
   * @param days - 统计天数，默认 7
   * @returns 成功时返回 AuditStatItem 数组；失败时返回 STATS_FAILED
   */
  getStats: (days?: number) => Promise<HaiResult<AuditStatItem[]>>
  /**
   * 便捷记录器，封装常见审计场景
   *
   * 未初始化时调用任意方法均返回 NOT_INITIALIZED 错误。
   */
  readonly helper: AuditHelper
}
