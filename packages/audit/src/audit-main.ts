/**
 * =============================================================================
 * @h-ai/audit - 审计日志服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `audit` 对象，聚合所有审计日志操作功能。
 *
 * 使用方式：
 * 1. 调用 `audit.init({ db })` 初始化审计模块
 * 2. 通过 `audit.log()` 记录审计日志
 * 3. 通过 `audit.list()` 查询审计日志
 * 4. 通过 `audit.helper` 快速记录常见操作
 * 5. 调用 `audit.close()` 关闭模块
 *
 * @example
 * ```ts
 * import { audit } from '@h-ai/audit'
 * import { db } from '@h-ai/db'
 *
 * // 初始化
 * await db.init({ type: 'sqlite', database: ':memory:' })
 * await audit.init({ db })
 *
 * // 记录日志
 * await audit.log({ action: 'login', resource: 'auth', userId: 'user_1' })
 *
 * // 便捷记录
 * await audit.helper.login('user_1', '127.0.0.1')
 *
 * // 查询
 * const logs = await audit.list({ pageSize: 20 })
 *
 * // 关闭
 * await audit.close()
 * ```
 *
 * @module audit-main
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { AuditInitConfig } from './audit-config.js'
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

import { AuditErrorCode } from './audit-config.js'
import { auditM } from './audit-i18n.js'
import { AuditLogRepository } from './audit-repository.js'

const logger = core.logger.child({ module: 'audit', scope: 'main' })

// =============================================================================
// 内部状态
// =============================================================================

/** 当前审计日志仓库实例 */
let currentRepo: AuditLogRepository | null = null

// =============================================================================
// 未初始化时的占位操作
// =============================================================================

const notInitialized = core.module.createNotInitializedKit<AuditError>(
  AuditErrorCode.NOT_INITIALIZED,
  () => auditM('audit_notInitialized'),
)

// =============================================================================
// 便捷记录器
// =============================================================================

/**
 * 创建便捷记录器
 *
 * 封装常见审计操作（登录、登出、注册、密码重置、CRUD），
 * 简化调用方代码。
 */
function createHelper(logFn: (input: CreateAuditLogInput) => Promise<Result<AuditLog, AuditError>>): AuditHelper {
  return {
    async login(userId: string, ip?: string, ua?: string): Promise<Result<void, AuditError>> {
      const result = await logFn({ userId, action: 'login', resource: 'auth', ipAddress: ip, userAgent: ua })
      if (!result.success) {
        return result
      }
      return ok(undefined)
    },

    async logout(userId: string, ip?: string, ua?: string): Promise<Result<void, AuditError>> {
      const result = await logFn({ userId, action: 'logout', resource: 'auth', ipAddress: ip, userAgent: ua })
      if (!result.success) {
        return result
      }
      return ok(undefined)
    },

    async register(userId: string, ip?: string, ua?: string): Promise<Result<void, AuditError>> {
      const result = await logFn({ userId, action: 'register', resource: 'auth', resourceId: userId, ipAddress: ip, userAgent: ua })
      if (!result.success) {
        return result
      }
      return ok(undefined)
    },

    async passwordResetRequest(email: string, ip?: string, ua?: string): Promise<Result<void, AuditError>> {
      const result = await logFn({ action: 'password_reset_request', resource: 'auth', details: { email }, ipAddress: ip, userAgent: ua })
      if (!result.success) {
        return result
      }
      return ok(undefined)
    },

    async passwordResetComplete(userId: string, ip?: string, ua?: string): Promise<Result<void, AuditError>> {
      const result = await logFn({ userId, action: 'password_reset', resource: 'auth', ipAddress: ip, userAgent: ua })
      if (!result.success) {
        return result
      }
      return ok(undefined)
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
      if (!result.success) {
        return result
      }
      return ok(undefined)
    },
  }
}

/** 未初始化时的便捷记录器 */
const notInitializedHelper = notInitialized.proxy<AuditHelper>()

// =============================================================================
// 统一审计服务对象
// =============================================================================

/**
 * 审计日志服务对象
 *
 * 统一的审计日志访问入口，提供以下功能：
 * - `audit.init()` - 初始化审计模块
 * - `audit.close()` - 关闭模块
 * - `audit.log()` - 记录审计日志
 * - `audit.list()` - 查询审计日志列表
 * - `audit.getUserRecent()` - 获取用户最近活动
 * - `audit.cleanup()` - 清理旧日志
 * - `audit.getStats()` - 获取统计数据
 * - `audit.helper` - 便捷记录器
 * - `audit.isInitialized` - 初始化状态
 */
export const audit: AuditFunctions = {
  /**
   * 初始化审计模块
   *
   * @param config - 初始化配置（需包含已初始化的 db 实例）
   * @returns 初始化结果，失败时包含错误信息
   */
  async init(config: AuditInitConfig): Promise<Result<void, AuditError>> {
    if (currentRepo) {
      logger.warn('Audit module is already initialized, reinitializing')
      await audit.close()
    }

    logger.info('Initializing audit module')

    try {
      const tableName = config.tableName ?? 'audit_logs'
      const userTable = config.userTable ?? 'users'
      const userIdColumn = config.userIdColumn ?? 'id'
      const userNameColumn = config.userNameColumn ?? 'username'

      currentRepo = new AuditLogRepository(config.db, {
        tableName,
        userTable,
        userIdColumn,
        userNameColumn,
      })

      logger.info('Audit module initialized', { tableName })
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

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return currentRepo !== null
  },

  /**
   * 记录审计日志
   */
  log(input: CreateAuditLogInput): Promise<Result<AuditLog, AuditError>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    return currentRepo.log(input)
  },

  /**
   * 查询审计日志列表（含用户名 JOIN）
   */
  list(options?: ListAuditLogsOptions): Promise<Result<{ items: AuditLogWithUser[], total: number }, AuditError>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    return currentRepo.listWithUser(options)
  },

  /**
   * 获取用户最近活动
   */
  getUserRecent(userId: string, limit?: number): Promise<Result<AuditLog[], AuditError>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    return currentRepo.getUserRecent(userId, limit)
  },

  /**
   * 清理旧日志
   */
  cleanup(olderThanDays?: number): Promise<Result<number, AuditError>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    return currentRepo.cleanupOld(olderThanDays)
  },

  /**
   * 获取统计数据
   */
  getStats(days?: number): Promise<Result<AuditStatItem[], AuditError>> {
    if (!currentRepo) {
      return Promise.resolve(notInitialized.result())
    }
    return currentRepo.getStats(days)
  },

  /** 便捷记录器 */
  get helper(): AuditHelper {
    if (!currentRepo) {
      return notInitializedHelper
    }
    return createHelper(input => currentRepo!.log(input))
  },

  /**
   * 关闭审计模块
   */
  async close(): Promise<void> {
    currentRepo = null
    logger.info('Audit module closed')
  },
}
