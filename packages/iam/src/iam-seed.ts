/**
 * @h-ai/iam — 种子数据初始化
 *
 * 通过 authz 子功能 API 初始化默认角色、权限和角色-权限关联。
 * 重复执行时跳过已存在的数据，确保幂等性。
 * @module iam-seed
 */

import type { Result } from '@h-ai/core'

import type { PermissionType } from './authz/iam-authz-types.js'

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

/** 默认权限（名称通过 i18n 获取），按类型分组 */
const DEFAULT_PERMISSIONS: Array<{
  code: string
  name: () => string
  type: PermissionType
  resource: string
  action: string
}> = [
  // ─── 菜单权限 ───
  { code: 'dashboard:view', name: () => iamM('iam_seedPermDashboardView'), type: 'menu', resource: 'dashboard', action: 'view' },
  { code: 'user:read', name: () => iamM('iam_seedPermUserRead'), type: 'menu', resource: 'user', action: 'read' },
  { code: 'role:read', name: () => iamM('iam_seedPermRoleRead'), type: 'menu', resource: 'role', action: 'read' },
  { code: 'permission:read', name: () => iamM('iam_seedPermPermRead'), type: 'menu', resource: 'permission', action: 'read' },
  { code: 'system:logs', name: () => iamM('iam_seedPermSystemLogs'), type: 'menu', resource: 'system', action: 'logs' },
  { code: 'system:settings', name: () => iamM('iam_seedPermSystemSettings'), type: 'menu', resource: 'system', action: 'settings' },
  { code: 'system:modules', name: () => iamM('iam_seedPermSystemModules'), type: 'menu', resource: 'system', action: 'modules' },
  { code: 'profile:read', name: () => iamM('iam_seedPermProfileRead'), type: 'menu', resource: 'profile', action: 'read' },

  // ─── API 权限 ───
  { code: 'user:list', name: () => iamM('iam_seedPermUserList'), type: 'api', resource: 'user', action: 'list' },
  { code: 'user:api:create', name: () => iamM('iam_seedPermUserApiCreate'), type: 'api', resource: 'user', action: 'api:create' },
  { code: 'user:api:update', name: () => iamM('iam_seedPermUserApiUpdate'), type: 'api', resource: 'user', action: 'api:update' },
  { code: 'user:api:delete', name: () => iamM('iam_seedPermUserApiDelete'), type: 'api', resource: 'user', action: 'api:delete' },
  { code: 'role:list', name: () => iamM('iam_seedPermRoleList'), type: 'api', resource: 'role', action: 'list' },
  { code: 'role:api:create', name: () => iamM('iam_seedPermRoleApiCreate'), type: 'api', resource: 'role', action: 'api:create' },
  { code: 'role:api:update', name: () => iamM('iam_seedPermRoleApiUpdate'), type: 'api', resource: 'role', action: 'api:update' },
  { code: 'role:api:delete', name: () => iamM('iam_seedPermRoleApiDelete'), type: 'api', resource: 'role', action: 'api:delete' },
  { code: 'permission:list', name: () => iamM('iam_seedPermPermList'), type: 'api', resource: 'permission', action: 'list' },
  { code: 'permission:manage', name: () => iamM('iam_seedPermPermManage'), type: 'api', resource: 'permission', action: 'manage' },
  { code: 'permission:api:create', name: () => iamM('iam_seedPermPermApiCreate'), type: 'api', resource: 'permission', action: 'api:create' },
  { code: 'permission:api:delete', name: () => iamM('iam_seedPermPermApiDelete'), type: 'api', resource: 'permission', action: 'api:delete' },
  { code: 'audit:read', name: () => iamM('iam_seedPermAuditRead'), type: 'api', resource: 'audit', action: 'read' },

  // ─── 按钮权限 ───
  { code: 'user:create', name: () => iamM('iam_seedPermUserCreate'), type: 'button', resource: 'user', action: 'create' },
  { code: 'user:update', name: () => iamM('iam_seedPermUserUpdate'), type: 'button', resource: 'user', action: 'update' },
  { code: 'user:delete', name: () => iamM('iam_seedPermUserDelete'), type: 'button', resource: 'user', action: 'delete' },
  { code: 'role:create', name: () => iamM('iam_seedPermRoleCreate'), type: 'button', resource: 'role', action: 'create' },
  { code: 'role:update', name: () => iamM('iam_seedPermRoleUpdate'), type: 'button', resource: 'role', action: 'update' },
  { code: 'role:delete', name: () => iamM('iam_seedPermRoleDelete'), type: 'button', resource: 'role', action: 'delete' },
  { code: 'permission:create', name: () => iamM('iam_seedPermPermCreate'), type: 'button', resource: 'permission', action: 'create' },
  { code: 'permission:delete', name: () => iamM('iam_seedPermPermDelete'), type: 'button', resource: 'permission', action: 'delete' },
]

/** 普通用户（user）角色默认权限代码列表 */
const USER_ROLE_PERMISSIONS = ['dashboard:view', 'profile:read']

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
      const result = await authz.createPermission({ code: perm.code, name: perm.name(), type: perm.type, resource: perm.resource, action: perm.action })
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

    // 普通用户（user）分配基础权限（仪表盘 + 个人中心）
    const userRoleId = roleMap.get('user')
    if (userRoleId) {
      for (const permCode of USER_ROLE_PERMISSIONS) {
        const permId = permMap.get(permCode)
        if (permId) {
          await authz.assignPermissionToRole(userRoleId, permId)
        }
      }
    }

    // 访客（guest）不分配任何权限

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
