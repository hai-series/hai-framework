/**
 * @hai/iam — IAM 服务主入口
 *
 * 管理运行时状态、实现生命周期（init / close）、通过 get 访问器暴露子功能。
 */

import type { Result } from '@hai/core'

import type { PasswordStrategy } from './authn/password/iam-authn-password-strategy.js'
import type { IamConfig } from './iam-config.js'
import type {
  IamAuthnFunctions,
  IamAuthzFunctions,
  IamClientOperations,
  IamConfigInput,
  IamError,
  IamFunctions,
  IamSessionFunctions,
  IamUserFunctions,
} from './iam-types.js'

import { core, err, ok } from '@hai/core'

import { createIamAuthnFunctions } from './authn/iam-authn-functions.js'
import { createIamAuthzFunctions } from './authz/iam-authz-functions.js'
import { createIamClient } from './client/iam-client.js'
import { IamConfigSchema, IamErrorCode } from './iam-config.js'
import { iamM } from './iam-i18n.js'
import { createIamSessionFunctions } from './session/iam-session-functions.js'
import { createIamUserFunctions } from './user/iam-user-functions.js'

const logger = core.logger.child({ module: 'iam', scope: 'main' })

// ─── 内部状态 ───

let currentConfig: IamConfig | null = null
let currentAuth: IamAuthnFunctions | null = null
let currentUser: IamUserFunctions | null = null
let currentAuthz: IamAuthzFunctions | null = null
let currentSession: IamSessionFunctions | null = null

// ─── 未初始化占位 ───

const notInitialized = core.module.createNotInitializedKit<IamError>(
  IamErrorCode.NOT_INITIALIZED,
  () => iamM('iam_notInitialized'),
)

const notInitializedAuth = notInitialized.proxy<IamAuthnFunctions>()
const notInitializedUser = notInitialized.proxy<IamUserFunctions>()
const notInitializedAuthz = notInitialized.proxy<IamAuthzFunctions>()
const notInitializedSession = notInitialized.proxy<IamSessionFunctions>()

/** 客户端操作（无状态，无需初始化） */
const iamClientOperations: IamClientOperations = {
  create: createIamClient,
}

// ─── 服务对象 ───

export const iam: IamFunctions = {
  async init(config: IamConfigInput): Promise<Result<void, IamError>> {
    await iam.close()

    try {
      const { db, cache, ldapClientFactory, ldapSyncUser, ...settingsInput } = config

      logger.debug('Initializing IAM module')

      const parsed = IamConfigSchema.parse(settingsInput)

      // 创建子功能（按依赖顺序）
      const sessionResult = await createIamSessionFunctions({ config: parsed, cache })
      if (!sessionResult.success) {
        return sessionResult
      }
      currentSession = sessionResult.data

      const authzResult = await createIamAuthzFunctions({ config: parsed, db, cache })
      if (!authzResult.success) {
        return authzResult
      }
      currentAuthz = authzResult.data

      const authnResult = await createIamAuthnFunctions({
        config: parsed,
        db,
        sessionFunctions: currentSession,
        authzFunctions: currentAuthz,
        ldapClientFactory,
        ldapSyncUser,
      })
      if (!authnResult.success) {
        return authnResult
      }
      currentAuth = authnResult.data

      const userResult = await createIamUserFunctions({
        config: parsed,
        db,
        passwordStrategy: authnResult.data._passwordStrategy as PasswordStrategy,
        sessionFunctions: currentSession,
        authzFunctions: currentAuthz,
      })
      if (!userResult.success) {
        return userResult
      }
      currentUser = userResult.data

      // 种子数据
      if (parsed.seedDefaultData) {
        const seedResult = await seedIamData(currentAuthz)
        if (!seedResult.success) {
          return seedResult
        }
      }

      currentConfig = parsed
      logger.info('IAM module initialized')
      return ok(undefined)
    }
    catch (error) {
      logger.error('IAM module initialization failed', { error })
      return err({
        code: IamErrorCode.CONFIG_ERROR,
        message: iamM('iam_initFailed'),
        cause: error,
      })
    }
  },

  get auth(): IamAuthnFunctions { return currentAuth ?? notInitializedAuth },
  get user(): IamUserFunctions { return currentUser ?? notInitializedUser },
  get authz(): IamAuthzFunctions { return currentAuthz ?? notInitializedAuthz },
  get session(): IamSessionFunctions { return currentSession ?? notInitializedSession },
  get client(): IamClientOperations { return iamClientOperations },
  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },

  async close() {
    currentAuth = null
    currentUser = null
    currentAuthz = null
    currentSession = null
    currentConfig = null
    logger.info('IAM module closed')
  },
}

// ─── 种子数据 ───

/** 默认角色 */
const DEFAULT_ROLES = [
  { code: 'admin', name: '管理员', description: '系统管理员，拥有所有权限', isSystem: true },
  { code: 'user', name: '普通用户', description: '普通用户', isSystem: true },
  { code: 'guest', name: '访客', description: '访客，只读权限', isSystem: true },
] as const

/** 默认权限 */
const DEFAULT_PERMISSIONS = [
  { code: 'user:read', name: '查看用户', resource: 'user', action: 'read' },
  { code: 'user:create', name: '创建用户', resource: 'user', action: 'create' },
  { code: 'user:update', name: '更新用户', resource: 'user', action: 'update' },
  { code: 'user:delete', name: '删除用户', resource: 'user', action: 'delete' },
  { code: 'role:read', name: '查看角色', resource: 'role', action: 'read' },
  { code: 'role:create', name: '创建角色', resource: 'role', action: 'create' },
  { code: 'role:update', name: '更新角色', resource: 'role', action: 'update' },
  { code: 'role:delete', name: '删除角色', resource: 'role', action: 'delete' },
  { code: 'permission:read', name: '查看权限', resource: 'permission', action: 'read' },
  { code: 'permission:manage', name: '管理权限', resource: 'permission', action: 'manage' },
  { code: 'system:settings', name: '系统设置', resource: 'system', action: 'settings' },
  { code: 'system:logs', name: '查看日志', resource: 'system', action: 'logs' },
] as const

/**
 * 执行种子数据初始化
 *
 * 通过 authz 子功能 API 初始化默认角色、权限和角色-权限关联。
 */
async function seedIamData(
  authz: IamAuthzFunctions,
): Promise<Result<void, IamError>> {
  try {
    const roleMap = new Map<string, string>()
    for (const role of DEFAULT_ROLES) {
      const result = await authz.createRole({ code: role.code, name: role.name, description: role.description, isSystem: role.isSystem })
      if (result.success) {
        roleMap.set(role.code, result.data.id)
      }
      else if (result.error.code === IamErrorCode.ROLE_ALREADY_EXISTS) {
        const existing = await authz.getRole(`role_${role.code}`)
        if (existing.success && existing.data) {
          roleMap.set(role.code, existing.data.id)
        }
      }
      else {
        return result as Result<void, IamError>
      }
    }

    const permMap = new Map<string, string>()
    for (const perm of DEFAULT_PERMISSIONS) {
      const result = await authz.createPermission({ code: perm.code, name: perm.name, resource: perm.resource, action: perm.action })
      if (result.success) {
        permMap.set(perm.code, result.data.id)
      }
      else if (result.error.code === IamErrorCode.PERMISSION_ALREADY_EXISTS) {
        const existing = await authz.getPermission(`perm_${perm.code.replace(':', '_')}`)
        if (existing.success && existing.data) {
          permMap.set(perm.code, existing.data.id)
        }
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

    // 普通用户分配基本权限
    const userRoleId = roleMap.get('user')
    const userReadPermId = permMap.get('user:read')
    if (userRoleId && userReadPermId) {
      await authz.assignPermissionToRole(userRoleId, userReadPermId)
    }

    // 访客分配只读权限
    const guestRoleId = roleMap.get('guest')
    if (guestRoleId && userReadPermId) {
      await authz.assignPermissionToRole(guestRoleId, userReadPermId)
    }

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
