/**
 * =============================================================================
 * @hai/iam - 初始化器与种子数据
 * =============================================================================
 *
 * 负责初始化 IAM 所需的各模块组件与数据库表，并提供种子数据功能。
 *
 * @module iam-initializer
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { AuthStrategy } from './authn/iam-authn-types.js'
import type { LdapClientFactory } from './authn/ldap/iam-authn-ldap-strategy.js'
import type { OtpStrategy } from './authn/otp/iam-authn-otp-strategy.js'
import type { PasswordStrategy } from './authn/password/iam-authn-password-strategy.js'
import type { PermissionRepository } from './authz/rbac/iam-authz-rbac-repository-permission.js'
import type { RolePermissionRepository, UserRoleRepository } from './authz/rbac/iam-authz-rbac-repository-relation.js'
import type { RoleRepository } from './authz/rbac/iam-authz-rbac-repository-role.js'
import type { AuthzManager } from './authz/rbac/iam-authz-rbac-types.js'
import type { IamConfig } from './iam-config.js'
import type { IamError } from './iam-core-types.js'
import type { SessionMappingRepository } from './session/iam-session-repository-cache.js'
import type { SessionManager } from './session/iam-session-types.js'
import type { UserRepository } from './user/iam-user-repository-user.js'
import { core, err, ok } from '@hai/core'
import { crypto as haiCrypto } from '@hai/crypto'

import { createLdapStrategy } from './authn/ldap/iam-authn-ldap-strategy.js'
import { createDbOtpRepository } from './authn/otp/iam-authn-otp-repository-otp.js'
import { createOtpStrategy } from './authn/otp/iam-authn-otp-strategy.js'
import { createPasswordStrategy } from './authn/password/iam-authn-password-strategy.js'
import { createDbPermissionRepository } from './authz/rbac/iam-authz-rbac-repository-permission.js'
import { createDbRolePermissionRepository, createDbUserRoleRepository } from './authz/rbac/iam-authz-rbac-repository-relation.js'
import { createDbRoleRepository } from './authz/rbac/iam-authz-rbac-repository-role.js'
import { createRbacManager } from './authz/rbac/iam-authz-rbac-service.js'
import {
  IamErrorCode,
  LoginConfigSchema,
  OtpConfigSchema,
  SecurityConfigSchema,
  SessionConfigSchema,
} from './iam-config.js'
import { iamM } from './iam-i18n.js'
import { createCacheSessionMappingRepository } from './session/iam-session-repository-cache.js'
import { createSessionManager } from './session/iam-session-service.js'
import { createDbUserRepository } from './user/iam-user-repository-user.js'

const logger = core.logger.child({ module: 'iam', scope: 'initializer' })

// =============================================================================
// IAM 组件容器
// =============================================================================

/**
 * IAM 组件容器
 */
export interface IamComponents {
  /** 用户存储 */
  userRepository: UserRepository
  /** 角色存储 */
  roleRepository: RoleRepository
  /** 权限存储 */
  permissionRepository: PermissionRepository
  /** 角色-权限关联存储 */
  rolePermissionRepository: RolePermissionRepository
  /** 用户-角色关联存储 */
  userRoleRepository: UserRoleRepository
  /** 密码策略 */
  passwordStrategy: PasswordStrategy
  /** OTP 策略（可选） */
  otpStrategy?: OtpStrategy
  /** LDAP 策略（可选） */
  ldapStrategy?: AuthStrategy
  /** 会话管理器 */
  sessionManager: SessionManager
  /** 授权管理器 */
  authzManager: AuthzManager
}

/**
 * 初始化选项
 */
export interface InitOptions {
  /** 数据库服务 */
  db: DbService
  /** 缓存服务 */
  cache: CacheService
  /** IAM 配置 */
  config: IamConfig
  /** LDAP 客户端工厂（启用 LDAP 登录时必填） */
  ldapClientFactory?: LdapClientFactory
  /** LDAP 用户同步开关（默认 true） */
  ldapSyncUser?: boolean
}

/** 密码提供者 */
const passwordProvider = haiCrypto.password.create()

/**
 * 初始化 IAM 组件
 *
 * 按顺序初始化存储层、认证策略、会话管理器、授权管理器等所有组件。
 * 各存储层会自动创建所需的数据库表。
 *
 * @param options - 初始化选项（数据库、缓存、配置、LDAP 工厂等）
 * @returns 成功时返回 IamComponents 容器，失败时返回 CONFIG_ERROR
 */
export async function initializeComponents(options: InitOptions): Promise<Result<IamComponents, IamError>> {
  const { db, config, cache } = options

  try {
    // 初始化存储
    const userRepository = await createDbUserRepository(db)
    const roleRepository = await createDbRoleRepository(db)
    const permissionRepository = await createDbPermissionRepository(db)
    const rolePermissionRepository = await createDbRolePermissionRepository(db, permissionRepository, cache)
    const userRoleRepository = await createDbUserRoleRepository(db, roleRepository, cache)

    // 密码策略
    const securityConfig = SecurityConfigSchema.parse(config.security ?? {})

    const passwordStrategy = createPasswordStrategy({
      passwordConfig: config.password,
      userRepository,
      maxLoginAttempts: securityConfig.maxLoginAttempts,
      lockoutDuration: securityConfig.lockoutDuration,
    })

    const loginConfig = LoginConfigSchema.parse(config.login ?? {})
    const otpConfig = config.otp ? OtpConfigSchema.parse(config.otp) : undefined

    // OTP 策略
    let otpStrategy: OtpStrategy | undefined
    if (loginConfig.otp && otpConfig) {
      const otpRepository = await createDbOtpRepository(db)
      otpStrategy = createOtpStrategy({
        otpConfig,
        userRepository,
        otpRepository,
        autoRegister: true,
        registerConfig: config.register,
        maxLoginAttempts: securityConfig.maxLoginAttempts,
        lockoutDuration: securityConfig.lockoutDuration,
      })
    }

    // LDAP 策略
    let ldapStrategy: AuthStrategy | undefined
    if (loginConfig.ldap && config.ldap && options.ldapClientFactory) {
      ldapStrategy = createLdapStrategy({
        ldapConfig: config.ldap,
        userRepository,
        ldapClientFactory: options.ldapClientFactory,
        syncUser: options.ldapSyncUser ?? true,
        maxLoginAttempts: securityConfig.maxLoginAttempts,
        lockoutDuration: securityConfig.lockoutDuration,
      })
    }

    // 会话管理器
    const sessionConfig = SessionConfigSchema.parse(config.session ?? {})
    const sessionMappingRepository: SessionMappingRepository = createCacheSessionMappingRepository(cache)
    const sessionManager: SessionManager = createSessionManager({
      maxAge: sessionConfig.maxAge,
      sliding: sessionConfig.sliding,
      singleDevice: sessionConfig.singleDevice,
      sessionMappingRepository,
    })

    // 授权管理器
    const authzManager = createRbacManager({
      rbacConfig: config.rbac,
      roleRepository,
      permissionRepository,
      rolePermissionRepository,
      userRoleRepository,
    })

    return ok({
      userRepository,
      roleRepository,
      permissionRepository,
      rolePermissionRepository,
      userRoleRepository,
      passwordStrategy,
      otpStrategy,
      ldapStrategy,
      sessionManager,
      authzManager,
    })
  }
  catch (error) {
    logger.error('Failed to initialize IAM components', { error })
    return err({
      code: IamErrorCode.CONFIG_ERROR,
      message: iamM('iam_initComponentFailed'),
      cause: error,
    })
  }
}

// =============================================================================
// 密码哈希与验证
// =============================================================================

/**
 * 密码哈希函数
 *
 * 使用 @hai/crypto 对明文密码进行哈希处理。
 *
 * @param password - 明文密码
 * @returns 哈希字符串，或 INTERNAL_ERROR
 */
export function hashPassword(password: string): Result<string, IamError> {
  const result = passwordProvider.hash(password)
  if (!result.success) {
    return err({
      code: IamErrorCode.INTERNAL_ERROR,
      message: result.error.message,
    })
  }
  return ok(result.data)
}

/**
 * 密码验证函数
 *
 * 校验明文密码与哈希是否匹配。
 *
 * @param password - 明文密码
 * @param hash - 已存储的哈希
 * @returns 匹配返回 true，不匹配返回 false
 */
export function verifyPassword(password: string, hash: string): Result<boolean, IamError> {
  const result = passwordProvider.verify(password, hash)
  if (!result.success) {
    return err({
      code: IamErrorCode.INTERNAL_ERROR,
      message: result.error.message,
    })
  }
  return ok(result.data)
}

// =============================================================================
// 种子数据
// =============================================================================

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
 * 在事务中初始化默认角色、权限和角色-权限关联。
 * 使用 `ON CONFLICT DO NOTHING` 确保幂等性（兼容 SQLite / PostgreSQL）。
 *
 * @param db - 数据库服务实例
 * @param options - 种子数据选项（可控制是否初始化角色/权限/关联）
 * @returns 成功返回 ok(undefined)，失败返回 REPOSITORY_ERROR
 */
export async function seedIamData(
  db: DbService,
  options: SeedOptions = { roles: true, permissions: true, rolePermissions: true },
): Promise<Result<void, IamError>> {
  const txResult = await db.tx.wrap(async (tx) => {
    const isPostgres = db.config?.type === 'postgresql'
    // PostgreSQL 需要 Date 对象和 boolean；SQLite 需要 number 和 0/1
    const now: Date | number = isPostgres ? new Date() : Date.now()
    const toBool = (v: boolean): boolean | number => isPostgres ? v : (v ? 1 : 0)

    // 1. 初始化角色
    if (options.roles) {
      for (const role of DEFAULT_ROLES) {
        const id = `role_${role.code}`
        await tx.execute(
          `INSERT INTO iam_roles (id, code, name, description, is_system, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          [id, role.code, role.name, role.description, toBool(role.isSystem), now, now],
        )
      }
    }

    // 2. 初始化权限
    if (options.permissions) {
      for (const perm of DEFAULT_PERMISSIONS) {
        const id = `perm_${perm.code.replace(':', '_')}`
        await tx.execute(
          `INSERT INTO iam_permissions (id, code, name, resource, action, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          [id, perm.code, perm.name, perm.resource, perm.action, now, now],
        )
      }
    }

    // 3. 分配角色权限
    if (options.rolePermissions) {
      // 为管理员分配所有权限
      const adminRoleId = 'role_admin'
      const allPermsResult = await tx.query<{ id: string }>(`SELECT id FROM iam_permissions`)
      if (allPermsResult.success) {
        for (const perm of allPermsResult.data) {
          await tx.execute(
            `INSERT INTO iam_role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
            [adminRoleId, perm.id],
          )
        }
      }

      // 为普通用户分配基本权限
      const userRoleId = 'role_user'
      const userPermIds = ['perm_user_read']
      for (const permId of userPermIds) {
        await tx.execute(
          `INSERT INTO iam_role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
          [userRoleId, permId],
        )
      }

      // 为访客分配只读权限
      const guestRoleId = 'role_guest'
      const guestPermIds = ['perm_user_read']
      for (const permId of guestPermIds) {
        await tx.execute(
          `INSERT INTO iam_role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
          [guestRoleId, permId],
        )
      }
    }
  })

  if (!txResult.success) {
    logger.error('Failed to seed IAM data', { error: txResult.error })
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM('iam_initSeedDataFailed'),
      cause: txResult.error,
    })
  }

  logger.info('IAM seed data initialized')
  return ok(undefined)
}
