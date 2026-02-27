/**
 * @h-ai/iam — IAM 服务主入口
 *
 * 管理运行时状态、实现生命周期（init / close）、通过 get 访问器暴露子功能。
 */

import type { Result } from '@h-ai/core'

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

import { core, err, ok } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'

import { createIamAuthnFunctions } from './authn/iam-authn-functions.js'
import { resetOtpRepoSingleton } from './authn/otp/iam-authn-otp-repository-otp.js'
import { createIamAuthzFunctions } from './authz/iam-authz-functions.js'
import { resetPermissionRepoSingleton } from './authz/iam-authz-repository-permission.js'
import { resetRoleRepoSingleton } from './authz/iam-authz-repository-role.js'
import { createIamClient } from './client/iam-client.js'
import { IamConfigSchema, IamErrorCode } from './iam-config.js'
import { iamM } from './iam-i18n.js'
import { createIamSessionFunctions } from './session/iam-session-functions.js'
import { createIamUserFunctions } from './user/iam-user-functions.js'
import { resetResetTokenRepoSingleton } from './user/iam-user-repository-reset-token.js'
import { resetUserRepoSingleton } from './user/iam-user-repository-user.js'

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
const notInitializedAuthz = notInitialized.proxy<IamAuthzFunctions>()
const notInitializedSession = notInitialized.proxy<IamSessionFunctions>()

/**
 * 用户子功能的未初始化代理
 *
 * 需要特殊处理 validatePassword：该方法是同步的，
 * 其余方法为异步，因此不能统一使用 proxy('async') 或 proxy('sync')。
 */
const syncUserProxy = notInitialized.proxy<IamUserFunctions>('sync')
const asyncUserProxy = notInitialized.proxy<IamUserFunctions>()
const notInitializedUser: IamUserFunctions = new Proxy({} as IamUserFunctions, {
  get(_, prop, receiver) {
    return prop === 'validatePassword'
      ? Reflect.get(syncUserProxy as object, prop, receiver)
      : Reflect.get(asyncUserProxy as object, prop, receiver)
  },
})

/** 客户端操作（无状态，无需初始化） */
const iamClientOperations: IamClientOperations = {
  create: createIamClient,
}

// ─── 服务对象 ───

export const iam: IamFunctions = {
  async init(config: IamConfigInput): Promise<Result<void, IamError>> {
    // 幂等：已初始化时直接返回
    if (currentConfig !== null) {
      logger.warn('IAM module is already initialized, skipping')
      return ok(undefined)
    }

    try {
      const { db, cache, ldapClientFactory, ldapSyncUser, onPasswordResetRequest, ...settingsInput } = config

      logger.info('Initializing IAM module')

      // 确保 crypto 已初始化（密码哈希依赖）
      if (!crypto.isInitialized) {
        const cryptoResult = await crypto.init()
        if (!cryptoResult.success) {
          return err({
            code: IamErrorCode.CONFIG_ERROR,
            message: iamM('iam_initFailed'),
            cause: cryptoResult.error,
          })
        }
      }

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
      currentAuth = authnResult.data.authn

      const userResult = await createIamUserFunctions({
        config: parsed,
        db,
        passwordStrategy: authnResult.data.passwordStrategy,
        sessionFunctions: currentSession,
        authzFunctions: currentAuthz,
        onPasswordResetRequest,
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
    if (currentConfig === null && currentAuth === null && currentUser === null && currentAuthz === null && currentSession === null) {
      logger.info('IAM module already closed, skipping')
      return
    }

    logger.info('Closing IAM module')

    currentAuth = null
    currentUser = null
    currentAuthz = null
    currentSession = null
    currentConfig = null

    // 重置所有仓库单例，释放对旧 db 实例的引用
    resetOtpRepoSingleton()
    resetUserRepoSingleton()
    resetResetTokenRepoSingleton()
    resetRoleRepoSingleton()
    resetPermissionRepoSingleton()

    logger.info('IAM module closed')
  },
}

// ─── 种子数据 ───

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

/**
 * 执行种子数据初始化（幂等）
 *
 * 通过 authz 子功能 API 初始化默认角色、权限和角色-权限关联。
 * 重复执行时跳过已存在的数据，确保幂等性。
 */
async function seedIamData(
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
