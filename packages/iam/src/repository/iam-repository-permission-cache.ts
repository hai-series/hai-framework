/**
 * =============================================================================
 * @hai/iam - 权限缓存实现
 * =============================================================================
 *
 * 基于 @hai/cache 的权限缓存实现，用于 RBAC 授权管理器。
 *
 * @module iam-repository-permission-cache
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { Result } from '@hai/core'
import type { PermissionCache } from '../authz/iam-authz-rbac.js'
import type { IamError, Permission } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'

/**
 * 缓存键前缀
 */
const CACHE_PREFIX = 'iam:permissions:'

/**
 * 创建基于 Cache 的权限缓存
 *
 * @param cache - Cache 服务实例
 * @param keyPrefix - 键前缀（可选，默认 'iam:permissions:'）
 */
export function createCachePermissionCache(
  cache: CacheService,
  keyPrefix = CACHE_PREFIX,
): PermissionCache {
  /**
   * 构建缓存键
   */
  function buildKey(userId: string): string {
    return `${keyPrefix}${userId}`
  }

  return {
    async getUserPermissions(userId): Promise<Result<Permission[] | null, IamError>> {
      const key = buildKey(userId)

      const result = await cache.get<Permission[]>(key)

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询权限缓存失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (!result.data) {
        return ok(null)
      }

      // 恢复 Date 对象
      const permissions = result.data.map((permission: Permission) => ({
        ...permission,
        createdAt: new Date(permission.createdAt),
        updatedAt: new Date(permission.updatedAt),
      }))

      return ok(permissions)
    },

    async setUserPermissions(userId, permissions, ttl): Promise<Result<void, IamError>> {
      const key = buildKey(userId)

      const result = await cache.set(key, permissions, { ex: ttl })

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `设置权限缓存失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async clearUserPermissions(userId): Promise<Result<void, IamError>> {
      const key = buildKey(userId)

      const result = await cache.del(key)

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `清除权限缓存失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },
  }
}
