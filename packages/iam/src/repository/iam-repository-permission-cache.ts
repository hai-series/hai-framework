/**
 * =============================================================================
 * @hai/iam - 权限缓存实现
 * =============================================================================
 *
 * 基于 @hai/cache 的权限缓存实现。
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
import { iamM } from '../iam-i18n.js'

const DEFAULT_PREFIX = 'iam:permission:'

export interface PermissionCacheOptions {
  /** 缓存键前缀 */
  keyPrefix?: string
}

interface CachedPermission extends Omit<Permission, 'createdAt' | 'updatedAt'> {
  createdAt: string | Date
  updatedAt: string | Date
}

/**
 * 构建用户权限缓存键
 */
function buildUserKey(prefix: string, userId: string): string {
  return `${prefix}u:${userId}`
}

/**
 * 恢复权限 Date 字段
 */
function restorePermission(permission: CachedPermission): Permission {
  return {
    ...permission,
    createdAt: new Date(permission.createdAt),
    updatedAt: new Date(permission.updatedAt),
  }
}

/**
 * 恢复权限列表
 */
function restorePermissions(permissions: CachedPermission[]): Permission[] {
  return permissions.map(restorePermission)
}

/**
 * 创建基于 Cache 的权限缓存
 */
export function createCachePermissionCache(
  cache: CacheService,
  options: PermissionCacheOptions = {},
): PermissionCache {
  const keyPrefix = options.keyPrefix ?? DEFAULT_PREFIX

  return {
    async getUserPermissions(userId): Promise<Result<Permission[] | null, IamError>> {
      const key = buildUserKey(keyPrefix, userId)
      const result = await cache.get<CachedPermission[]>(key)
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryPermissionCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (!result.data) {
        return ok(null)
      }

      return ok(restorePermissions(result.data))
    },

    async setUserPermissions(userId, permissions, ttl): Promise<Result<void, IamError>> {
      const key = buildUserKey(keyPrefix, userId)
      const payload: CachedPermission[] = permissions.map(permission => ({
        ...permission,
        createdAt: permission.createdAt,
        updatedAt: permission.updatedAt,
      }))

      const result = await cache.set(key, payload, { ex: ttl })
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_setPermissionCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async clearUserPermissions(userId): Promise<Result<void, IamError>> {
      const key = buildUserKey(keyPrefix, userId)
      const result = await cache.del(key)
      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_clearPermissionCacheFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }
      return ok(undefined)
    },
  }
}
