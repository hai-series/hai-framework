/**
 * @h-ai/audit — 审计便捷记录器
 *
 * 封装常见审计操作（登录、登出、注册、密码重置、CRUD），简化调用方代码。
 * @module audit-helper
 */

import type { HaiResult } from '@h-ai/core'
import type {
  AuditHelper,
  AuditLog,
  CreateAuditLogInput,
  CrudAuditInput,
} from './audit-types.js'

import { ok } from '@h-ai/core'

/**
 * 将 log 结果映射为 void 返回
 *
 * @param result - log 操作结果
 * @returns 成功返回 ok(undefined)；失败透传原始错误
 */
function toVoid(result: HaiResult<AuditLog>): HaiResult<void> {
  if (!result.success) {
    return result
  }
  return ok(undefined)
}

/**
 * 创建便捷记录器
 *
 * 封装常见审计操作（登录、登出、注册、密码重置、CRUD），
 * 简化调用方代码。每个方法内部调用 logFn 并将 AuditLog 结果映射为 void。
 *
 * @param logFn - 底层日志记录函数（通常为 currentRepo.log）
 * @returns 便捷记录器接口
 */
export function createHelper(logFn: (input: CreateAuditLogInput) => Promise<HaiResult<AuditLog>>): AuditHelper {
  return {
    async login(userId: string, ip?: string, ua?: string): Promise<HaiResult<void>> {
      const result = await logFn({ userId, action: 'login', resource: 'auth', ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },

    async logout(userId: string, ip?: string, ua?: string): Promise<HaiResult<void>> {
      const result = await logFn({ userId, action: 'logout', resource: 'auth', ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },

    async register(userId: string, ip?: string, ua?: string): Promise<HaiResult<void>> {
      const result = await logFn({ userId, action: 'register', resource: 'auth', resourceId: userId, ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },

    async passwordResetRequest(email: string, ip?: string, ua?: string): Promise<HaiResult<void>> {
      const result = await logFn({ action: 'password_reset_request', resource: 'auth', details: { email }, ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },

    async passwordResetComplete(userId: string | null, ip?: string, ua?: string): Promise<HaiResult<void>> {
      const result = await logFn({ userId, action: 'password_reset', resource: 'auth', ipAddress: ip, userAgent: ua })
      return toVoid(result)
    },

    async crud(
      input: CrudAuditInput,
    ): Promise<HaiResult<void>> {
      const result = await logFn({
        userId: input.userId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        details: input.details,
        ipAddress: input.ip,
        userAgent: input.ua,
      })
      return toVoid(result)
    },
  }
}
