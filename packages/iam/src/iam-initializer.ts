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
import type { SessionManager, SessionMappingRepository } from './session/iam-session-types.js'
import type { UserRepository } from './user/iam-user-repository-user.js'
import process from 'node:process'
import { err, ok } from '@hai/core'
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
import { createJwtSessionManager } from './session/jwt/iam-session-jwt.js'
import { createDbSessionMappingRepository } from './session/stateful/iam-session-stateful-repository-session-mapping.js'
import { createStatefulSessionManager } from './session/stateful/iam-session-stateful.js'
import { createDbUserRepository } from './user/iam-user-repository-user.js'

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
 * 生成默认 JWT 密钥
 */
function createDefaultJwtSecret(): string {
  const uuid = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return `change-me-in-production-${uuid}`
}

/**
 * 初始化 IAM 组件
 *
 * @param options - 初始化选项
 * @returns IAM 组件容器
 */
export async function initializeComponents(options: InitOptions): Promise<Result<IamComponents, IamError>> {
  const { db, config } = options

  try {
    // 初始化存储
    const userRepository = await createDbUserRepository(db)
    const roleRepository = await createDbRoleRepository(db)
    const permissionRepository = await createDbPermissionRepository(db)
    const rolePermissionRepository = await createDbRolePermissionRepository(db, permissionRepository)
    const userRoleRepository = await createDbUserRoleRepository(db, roleRepository)

    // 密码策略
    const securityConfig = SecurityConfigSchema.parse(config.security ?? {})

    const passwordStrategy = createPasswordStrategy({
      passwordConfig: config.password,
      userRepository,
      hashPassword: (password: string) => {
        const result = passwordProvider.hash(password)
        if (!result.success) {
          return err({
            code: IamErrorCode.INTERNAL_ERROR,
            message: result.error.message,
          })
        }
        return ok(result.data)
      },
      verifyPassword: (password: string, hash: string) => {
        const result = passwordProvider.verify(password, hash)
        if (!result.success) {
          return err({
            code: IamErrorCode.INTERNAL_ERROR,
            message: result.error.message,
          })
        }
        return ok(result.data)
      },
      maxLoginAttempts: securityConfig.maxLoginAttempts,
      lockoutDuration: securityConfig.lockoutDuration,
    }) as PasswordStrategy

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
    const jwtConfig = sessionConfig.jwt || {
      secret: process.env.JWT_SECRET || createDefaultJwtSecret(),
      algorithm: 'HS256' as const,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 604800,
    }

    let sessionManager: SessionManager
    if (sessionConfig.type === 'stateful') {
      const sessionMappingRepository: SessionMappingRepository = await createDbSessionMappingRepository(db)
      sessionManager = createStatefulSessionManager({
        jwt: jwtConfig,
        maxAge: sessionConfig.maxAge,
        sliding: sessionConfig.sliding,
        sessionMappingRepository,
      })
    }
    else {
      sessionManager = createJwtSessionManager({
        jwt: jwtConfig,
        maxAge: sessionConfig.maxAge,
      })
    }

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
