/**
 * =============================================================================
 * @hai/iam - 数据库初始化与种子数据
 * =============================================================================
 *
 * 提供 IAM 模块的数据库表初始化和种子数据功能。
 * 各 repository 在创建时会自动创建表，本模块提供种子数据初始化。
 *
 * @module iam-database
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { IamError } from './iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from './iam-config.js'
import { iamM } from './iam-i18n.js'

/**
 * 默认角色
 */
export const DEFAULT_ROLES = [
  { code: 'admin', name: '管理员', description: '系统管理员，拥有所有权限', isSystem: true },
  { code: 'user', name: '普通用户', description: '普通用户', isSystem: true },
  { code: 'guest', name: '访客', description: '访客，只读权限', isSystem: true },
] as const

/**
 * 默认权限
 */
export const DEFAULT_PERMISSIONS = [
  // 用户管理
  { code: 'user:read', name: '查看用户', resource: 'user', action: 'read' },
  { code: 'user:create', name: '创建用户', resource: 'user', action: 'create' },
  { code: 'user:update', name: '更新用户', resource: 'user', action: 'update' },
  { code: 'user:delete', name: '删除用户', resource: 'user', action: 'delete' },
  // 角色管理
  { code: 'role:read', name: '查看角色', resource: 'role', action: 'read' },
  { code: 'role:create', name: '创建角色', resource: 'role', action: 'create' },
  { code: 'role:update', name: '更新角色', resource: 'role', action: 'update' },
  { code: 'role:delete', name: '删除角色', resource: 'role', action: 'delete' },
  // 权限管理
  { code: 'permission:read', name: '查看权限', resource: 'permission', action: 'read' },
  { code: 'permission:manage', name: '管理权限', resource: 'permission', action: 'manage' },
  // 系统管理
  { code: 'system:settings', name: '系统设置', resource: 'system', action: 'settings' },
  { code: 'system:logs', name: '查看日志', resource: 'system', action: 'logs' },
] as const

/**
 * 角色-权限映射
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'], // 管理员拥有所有权限
  user: ['user:read'],
  guest: ['user:read'],
}

/**
 * 种子数据选项
 */
export interface SeedOptions {
  /** 是否初始化角色 */
  roles?: boolean
  /** 是否初始化权限 */
  permissions?: boolean
  /** 是否分配角色权限 */
  rolePermissions?: boolean
}

/**
 * 执行种子数据初始化
 *
 * 注意：此函数应在 iam.init() 之后调用，需要传入已初始化的 authzManager
 */
export async function seedIamData(
  db: DbService,
  options: SeedOptions = { roles: true, permissions: true, rolePermissions: true },
): Promise<Result<void, IamError>> {
  try {
    const now = Date.now()

    // 1. 初始化角色
    if (options.roles) {
      for (const role of DEFAULT_ROLES) {
        const id = `role_${role.code}`
        await db.sql.execute(
          `INSERT OR IGNORE INTO iam_roles (id, code, name, description, is_system, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, role.code, role.name, role.description, role.isSystem ? 1 : 0, now, now],
        )
      }
    }

    // 2. 初始化权限
    if (options.permissions) {
      for (const perm of DEFAULT_PERMISSIONS) {
        const id = `perm_${perm.code.replace(':', '_')}`
        await db.sql.execute(
          `INSERT OR IGNORE INTO iam_permissions (id, code, name, resource, action, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, perm.code, perm.name, perm.resource, perm.action, now, now],
        )
      }
    }

    // 3. 分配角色权限
    if (options.rolePermissions) {
      // 为管理员分配所有权限
      const adminRoleId = 'role_admin'
      const allPermsResult = await db.sql.query<{ id: string }>(`SELECT id FROM iam_permissions`)
      if (allPermsResult.success) {
        for (const perm of allPermsResult.data) {
          await db.sql.execute(
            `INSERT OR IGNORE INTO iam_role_permissions (role_id, permission_id) VALUES (?, ?)`,
            [adminRoleId, perm.id],
          )
        }
      }

      // 为普通用户分配基本权限
      const userRoleId = 'role_user'
      const userPermIds = ['perm_user_read']
      for (const permId of userPermIds) {
        await db.sql.execute(
          `INSERT OR IGNORE INTO iam_role_permissions (role_id, permission_id) VALUES (?, ?)`,
          [userRoleId, permId],
        )
      }

      // 为访客分配只读权限
      const guestRoleId = 'role_guest'
      const guestPermIds = ['perm_user_read']
      for (const permId of guestPermIds) {
        await db.sql.execute(
          `INSERT OR IGNORE INTO iam_role_permissions (role_id, permission_id) VALUES (?, ?)`,
          [guestRoleId, permId],
        )
      }
    }

    return ok(undefined)
  }
  catch (error) {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM('iam_initSeedDataFailed'),
      cause: error,
    })
  }
}
