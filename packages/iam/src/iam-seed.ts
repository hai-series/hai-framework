/**
 * @h-ai/iam — 种子数据初始化
 *
 * 通过 authz 子功能 API 初始化默认角色、权限和角色-权限关联。
 * 重复执行时跳过已存在的数据，确保幂等性。
 * @module iam-seed
 */

import type { Result } from '@h-ai/core'

import type { IamAuthzFunctions, IamError } from './iam-types.js'

import { core, err, ok } from '@h-ai/core'

import { IamErrorCode } from './iam-config.js'
import { iamM } from './iam-i18n.js'

const logger = core.logger.child({ module: 'iam', scope: 'seed' })

// ─── 默认角色定义 ───

/** 默认角色（名称通过 i18n 获取） */
const DEFAULT_ROLES = [
  { code: 'admin', name: () => iamM('iam_seedRoleAdminName'), description: () => iamM('iam_seedRoleAdminDesc'), isSystem: true },
  { code: 'user', name: () => iamM('iam_seedRoleUserName'), description: () => iamM('iam_seedRoleUserDesc'), isSystem: true },
  { code: 'guest', name: () => iamM('iam_seedRoleGuestName'), description: () => iamM('iam_seedRoleGuestDesc'), isSystem: true },
]

/** 默认权限（名称通过 i18n 获取） */
const DEFAULT_PERMISSIONS = [
  { code: 'user:read', name: () => iamM('iam_seedPermUserRead'), resource: 'user', action: 'read' },
  { code: 'user:create', name: () => iamM('iam_seedPermUserCreate'), resource: 'user', action: 'create' },
  { code: 'user:update', name: () => iamM('iam_seedPermUserUpdate'), resource: 'user', action: 'update' },
  { code: 'user:delete', name: () => iamM('iam_seedPermUserDelete'), resource: 'user', action: 'delete' },
  { code: 'role:read', name: () => iamM('iam_seedPermRoleRead'), resource: 'role', action: 'read' },
  { code: 'role:create', name: () => iamM('iam_seedPermRoleCreate'), resource: 'role', action: 'create' },
  { code: 'role:update', name: () => iamM('iam_seedPermRoleUpdate'), resource: 'role', action: 'update' },
  { code: 'role:delete', name: () => iamM('iam_seedPermRoleDelete'), resource: 'role', action: 'delete' },
  { code: 'permission:read', name: () => iamM('iam_seedPermPermRead'), resource: 'permission', action: 'read' },
  { code: 'permission:manage', name: () => iamM('iam_seedPermPermManage'), resource: 'permission', action: 'manage' },
  { code: 'system:settings', name: () => iamM('iam_seedPermSystemSettings'), resource: 'system', action: 'settings' },
  { code: 'system:logs', name: () => iamM('iam_seedPermSystemLogs'), resource: 'system', action: 'logs' },
]

// ─── 种子函数 ───

/**
 * 执行种子数据初始化（幂等）
 *
 * 通过 authz 子功能 API 初始化默认角色、权限和角色-权限关联。
 * 重复执行时跳过已存在的数据，确保幂等性。
 *
 * @param authz - 已初始化的授权子功能实例
 * @returns 成功返回 ok(undefined)；失败返回 REPOSITORY_ERROR
 */
export async function seedIamData(
  authz: IamAuthzFunctions,
): Promise<Result<void, IamError>> {
  try {
    // 查询现有角色，避免重复创建
    const existingRoles = await authz.getAllRoles({ page: 1, pageSize: 1000 })
    const existingRoleMap = new Map<string, string>()
    if (existingRoles.success) {
      for (const role of existingRoles.data.items) {
        existingRoleMap.set(role.code, role.id)
      }
    }

    const roleMap = new Map<string, string>()
    for (const role of DEFAULT_ROLES) {
      const existingId = existingRoleMap.get(role.code)
      if (existingId) {
        roleMap.set(role.code, existingId)
        continue
      }
      const result = await authz.createRole({ code: role.code, name: role.name(), description: role.description(), isSystem: role.isSystem })
      if (result.success) {
        roleMap.set(role.code, result.data.id)
      }
      else {
        return result as Result<void, IamError>
      }
    }

    // 查询现有权限，避免重复创建
    const existingPerms = await authz.getAllPermissions({ page: 1, pageSize: 1000 })
    const existingPermMap = new Map<string, string>()
    if (existingPerms.success) {
      for (const perm of existingPerms.data.items) {
        existingPermMap.set(perm.code, perm.id)
      }
    }

    const permMap = new Map<string, string>()
    for (const perm of DEFAULT_PERMISSIONS) {
      const existingId = existingPermMap.get(perm.code)
      if (existingId) {
        permMap.set(perm.code, existingId)
        continue
      }
      const result = await authz.createPermission({ code: perm.code, name: perm.name(), resource: perm.resource, action: perm.action })
      if (result.success) {
        permMap.set(perm.code, result.data.id)
      }
      else {
        return result as Result<void, IamError>
      }
    }

    // 管理员分配所有权限
    const adminRoleId = roleMap.get('admin')
    if (adminRoleId) {
      for (const [, permId] of permMap) {
        await authz.assignPermissionToRole(adminRoleId, permId)
      }
    }

    // 普通用户（user）和访客（guest）不分配任何 IAM 管理权限。
    // 所有 user:*、role:*、permission:*、system:* 权限仅限 admin 角色。
    // 未来如需普通用户自助权限（如 profile:read），可在此处扩展。

    logger.info('IAM seed data initialized')
    return ok(undefined)
  }
  catch (error) {
    logger.error('Failed to seed IAM data', { error })
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM('iam_initSeedDataFailed'),
      cause: error,
    })
  }
}
