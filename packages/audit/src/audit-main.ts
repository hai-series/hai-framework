/**
 * @h-ai/audit — 审计日志服务主入口
 *
 * 本文件提供统一的 `audit` 对象，聚合所有审计日志操作功能。
 * @module audit-main
 */

import type { Result } from '@h-ai/core'
import type { AuditInitConfigInput } from './audit-config.js'
import type {
  AuditError,
  AuditFunctions,
  AuditHelper,
  AuditLog,
  AuditLogWithUser,
  AuditStatItem,
  CreateAuditLogInput,
  ListAuditLogsOptions,
} from './audit-types.js'

import { core, err, ok } from '@h-ai/core'

import { AuditErrorCode, AuditInitConfigSchema } from './audit-config.js'
import { auditM } from './audit-i18n.js'
import { AuditLogRepository } from './audit-repository.js'

const logger = core.logger.child({ module: 'audit', scope: 'main' })

// ─── 内部状态 ───

/** 当前审计日志仓库实例；init 后赋值，close 后置 null */
let currentRepo: AuditLogRepository | null = null

// ─── 未初始化占位 ───

/**
 * 未初始化时的错误工具集
 *
 * 调用 audit.log / audit.list 等方法时，
 * 若模块未初始化则返回 { success: false, error: { code: NOT_INITIALIZED } }
 */
const notInitialized = core.module.createNotInitializedKit<AuditError>(
  AuditErrorCode.NOT_INITIALIZED,
  () => auditM('audit_notInitialized'),
)

// ─── 便捷记录器 ───

/**
 * 创建便捷记录器
 *
 * 封装常见审计操作（登录、登出、注册、密码重置、CRUD），
 * 简化调用方代码。每个方法内部调用 logFn 并将 AuditLog 结果映射为 void。
 *
 * @param logFn - 底层日志记录函数（通常为 currentRepo.log）
 * @returns 便捷记录器接口
 */
function createHelper(logFn: (input: CreateAuditLogInput) => Promise<Result<AuditLog, AuditError>>): AuditHelper {
  /**
   * 将 log 结果映射为 void 返回
   *
   * @param result - log 操作结果
   * @returns 成功返回 ok(undefined)；失败透传原始错误
   */
  function toVoid(result: Result<AuditLog, AuditError>): Result<void, AuditError> {
    if (!result.success) {
      return result
    }
    return ok(undefined)
  }

  return {
    async login(userId: string, ip?: string, ua?: string): Promise<Result<void, AuditError>> {
      const result = await logFn({ userId, action: 'login', resource: 'auth', ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },

    async logout(userId: string, ip?: string, ua?: string): Promise<Result<void, AuditError>> {
      const result = await logFn({ userId, action: 'logout', resource: 'auth', ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },

    async register(userId: string, ip?: string, ua?: string): Promise<Result<void, AuditError>> {
      const result = await logFn({ userId, action: 'register', resource: 'auth', resourceId: userId, ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },

    async passwordResetRequest(email: string, ip?: string, ua?: string): Promise<Result<void, AuditError>> {
      const result = await logFn({ action: 'password_reset_request', resource: 'auth', details: { email }, ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },

    async passwordResetComplete(userId: string | null, ip?: string, ua?: string): Promise<Result<void, AuditError>> {
      const result = await logFn({ userId, action: 'password_reset', resource: 'auth', ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },

    async crud(
      userId: string | null,
      action: 'create' | 'read' | 'update' | 'delete',
      resource: string,
      resourceId?: string,
      details?: Record<string, unknown>,
      ip?: string,
      ua?: string,
    ): Promise<Result<void, AuditError>> {
      const result = await logFn({ userId, action, resource, resourceId, details, ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },
  }
}

/** 未初始化时的便捷记录器占位 */
const notInitializedHelper = notInitialized.proxy<AuditHelper>()

// ─── 审计服务对象 ───

/**
 * 审计日志服务对象
 *
 * 统一的审计日志访问入口，提供以下功能：
 * - `audit.init()` — 初始化审计模块
 * - `audit.close()` — 关闭模块
 * - `audit.log()` — 记录审计日志
 * - `audit.list()` — 查询审计日志列表
 * - `audit.getUserRecent()` — 获取用户最近活动
 * - `audit.cleanup()` — 清理旧日志
 * - `audit.getStats()` — 获取统计数据
 * - `audit.helper` — 便捷记录器
 * - `audit.isInitialized` — 初始化状态
 *
 * @example
 * ```ts
 * import { audit } from '@h-ai/audit'
 * import { db } from '@h-ai/db'
 *
 * await db.init({ type: 'sqlite', database: ':memory:' })
 * const result = await audit.init({ db })
 * if (!result.success) {
 *   // 处理初始化错误
 * }
 *
 * await audit.helper.login('user_1', '127.0.0.1')
 * const logs = await audit.list({ pageSize: 10 })
 * await audit.close()
 * ```
 */
export const audit: AuditFunctions = {
  /**
   * 初始化审计模块
   *
   * 会先关闭已有实例（如已初始化），再用新配置重新初始化。
   * 内部创建 AuditLogRepository 实例（BaseCrudRepository 自动建表）。
   *
   * @param config - 初始化配置（需包含已初始化的 db 实例）
   * @returns 成功时返回 ok(undefined)；失败时返回 CONFIG_ERROR
   *
   * @example
   * ```ts
   * const result = await audit.init({ db })
   * if (!result.success) {
   *   logger.error('Audit init failed', { error: result.error.message })
   * }
   * ```
   */
  async init(config: AuditInitConfigInput): Promise<Result<void, AuditError>> {
    if (currentRepo) {
      logger.warn('Audit module is already initialized, reinitializing')
      await audit.close()
    }

    logger.debug('Initializing audit module')

    const parseResult = AuditInitConfigSchema.safeParse(config)
    if (!parseResult.success) {
      logger.error('Audit config validation failed', { error: parseResult.error.message })
      return err({
        code: AuditErrorCode.CONFIG_ERROR,
        message: auditM('audit_configError', { params: { error: parseResult.error.message } }),
        cause: parseResult.error,
      })
    }
    const parsed = parseResult.data

    try {
      currentRepo = new AuditLogRepository(parsed.db, {
        tableName: parsed.tableName,
        userTable: parsed.userTable,
        userIdColumn: parsed.userIdColumn,
        userNameColumn: parsed.userNameColumn,
      })

      logger.info('Audit module initialized', { tableName: parsed.tableName })
      return ok(undefined)
    }
    catch (error) {
      logger.error('Audit module initialization failed', { error })
      return err({
        code: AuditErrorCode.CONFIG_ERROR,
        message: auditM('audit_initFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  },

  /** 当前是否已初始化 */
  get isInitialized(): boolean {
    return currentRepo !== null
  },

  /**
   * 记录一条审计日志
   *
   * @param input - 日志内容（action 和 resource 为必填）
   * @returns 成功时返回创建的 AuditLog；未初始化时返回 NOT_INITIALIZED
   */
  log(input: CreateAuditLogInput): Promise<Result<AuditLog, AuditError>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    return currentRepo.log(input)
  },

  /**
   * 分页查询审计日志列表（含用户名 LEFT JOIN）
   *
   * @param options - 过滤条件与分页参数
   * @returns 成功时返回 { items, total }；未初始化时返回 NOT_INITIALIZED
   */
  list(options?: ListAuditLogsOptions): Promise<Result<{ items: AuditLogWithUser[], total: number }, AuditError>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    return currentRepo.listWithUser(options)
  },

  /**
   * 获取指定用户的最近活动记录
   *
   * @param userId - 用户 ID
   * @param limit - 最大返回条数，默认 10
   * @returns 成功时返回 AuditLog 数组；未初始化时返回 NOT_INITIALIZED
   */
  getUserRecent(userId: string, limit?: number): Promise<Result<AuditLog[], AuditError>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    return currentRepo.getUserRecent(userId, limit)
  },

  /**
   * 清理指定天数之前的旧日志
   *
   * @param olderThanDays - 保留天数，默认 90
   * @returns 成功时返回删除的记录数；未初始化时返回 NOT_INITIALIZED
   */
  cleanup(olderThanDays?: number): Promise<Result<number, AuditError>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    return currentRepo.cleanupOld(olderThanDays)
  },

  /**
   * 获取指定天数内的操作统计（按 action 分组计数）
   *
   * @param days - 统计天数，默认 7
   * @returns 成功时返回 AuditStatItem 数组；未初始化时返回 NOT_INITIALIZED
   */
  getStats(days?: number): Promise<Result<AuditStatItem[], AuditError>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    return currentRepo.getStats(days)
  },

  /**
   * 便捷记录器
   *
   * 未初始化时调用任意方法均返回 NOT_INITIALIZED 错误。
   */
  get helper(): AuditHelper {
    if (!currentRepo) {
      return notInitializedHelper
    }
    return createHelper(input => currentRepo!.log(input))
  },

  /**
   * 关闭审计模块，释放内部状态
   */
  async close(): Promise<void> {
    if (!currentRepo) {
      logger.info('Audit module already closed, skipping')
      return
    }

    logger.info('Closing audit module')
    currentRepo = null
    logger.info('Audit module closed')
  },
}
