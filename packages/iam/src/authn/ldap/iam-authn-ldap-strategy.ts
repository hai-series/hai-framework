/**
 * =============================================================================
 * @hai/iam - LDAP 认证策略
 * =============================================================================
 *
 * LDAP 目录认证方式
 *
 * @module authn/ldap/iam-authn-ldap-strategy
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { LdapConfig } from '../../iam-config.js'
import type { IamError } from '../../iam-core-types.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { StoredUser, User } from '../../user/iam-user-types.js'
import type { AuthStrategy, Credentials } from '../iam-authn-types.js'
import { err, ok } from '@hai/core'

import { IamErrorCode } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { toUser } from '../../user/iam-user-utils.js'
import { ensureCredentialType, isAccountLocked, recordLoginFailure, resetLoginFailures } from '../iam-authn-utils.js'

/**
 * LDAP 客户端接口
 */
export interface LdapClient {
  /**
   * 绑定（认证）
   */
  bind: (dn: string, password: string) => Promise<Result<void, IamError>>

  /**
   * 搜索用户
   */
  search: (base: string, filter: string, attributes: string[]) => Promise<Result<LdapSearchEntry[], IamError>>

  /**
   * 解除绑定
   */
  unbind: () => Promise<Result<void, IamError>>
}

/**
 * LDAP 搜索结果条目
 */
export interface LdapSearchEntry {
  /** DN */
  dn: string
  /** 属性 */
  attributes: Record<string, string | string[]>
}

/**
 * LDAP 客户端工厂
 */
export type LdapClientFactory = (config: LdapConfig) => Promise<Result<LdapClient, IamError>>

/**
 * LDAP 认证策略配置
 */
export interface LdapStrategyConfig {
  /** LDAP 配置 */
  ldapConfig: LdapConfig
  /** 用户存储 */
  userRepository: UserRepository
  /** LDAP 客户端工厂 */
  ldapClientFactory: LdapClientFactory
  /** 是否同步用户到本地数据库 */
  syncUser?: boolean
  /** 最大登录失败次数（默认 5） */
  maxLoginAttempts?: number
  /** 锁定时间（秒，默认 900 = 15分钟） */
  lockoutDuration?: number
}

/**
 * 创建 LDAP 认证策略
 */
export function createLdapStrategy(config: LdapStrategyConfig): AuthStrategy {
  const {
    ldapConfig,
    userRepository,
    ldapClientFactory,
    syncUser = true,
    maxLoginAttempts = 5,
    lockoutDuration = 900,
  } = config

  /**
   * 获取属性值（支持单值和多值）
   */
  function getAttributeValue(entry: LdapSearchEntry, attr: string): string | undefined {
    const value = entry.attributes[attr]
    if (Array.isArray(value)) {
      return value[0]
    }
    return value
  }

  /**
   * 构建 LDAP 用户信息
   */
  function buildLdapUser(entry: LdapSearchEntry, ldapUsername: string, ldapEmail?: string, ldapDisplayName?: string): User {
    const now = new Date()
    return {
      id: entry.dn,
      username: ldapUsername,
      email: ldapEmail,
      displayName: ldapDisplayName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      metadata: {
        ldapDn: entry.dn,
        authSource: 'ldap',
      },
    }
  }

  return {
    type: 'ldap',
    name: 'ldap-strategy',

    async authenticate(credentials: Credentials): Promise<Result<User, IamError>> {
      // 类型检查
      const credentialResult = ensureCredentialType(credentials, 'ldap')
      if (!credentialResult.success) {
        return credentialResult as Result<User, IamError>
      }

      const { username, password } = credentialResult.data

      // 创建 LDAP 客户端
      const clientResult = await ldapClientFactory(ldapConfig)
      if (!clientResult.success) {
        return err({
          code: IamErrorCode.LDAP_CONNECTION_FAILED,
          message: iamM('iam_ldapConnectionFailed'),
          cause: clientResult.error,
        })
      }

      const client = clientResult.data

      try {
        // 先用管理员账号绑定
        const adminBindResult = await client.bind(ldapConfig.bindDn, ldapConfig.bindPassword)
        if (!adminBindResult.success) {
          return err({
            code: IamErrorCode.LDAP_BIND_FAILED,
            message: iamM('iam_ldapAdminBindFailed'),
            cause: adminBindResult.error,
          })
        }

        // 搜索用户
        const searchFilter = ldapConfig.searchFilter.replace('{{username}}', username)
        const searchResult = await client.search(
          ldapConfig.searchBase,
          searchFilter,
          [ldapConfig.usernameAttribute, ldapConfig.emailAttribute, ldapConfig.displayNameAttribute],
        )

        if (!searchResult.success) {
          return err({
            code: IamErrorCode.LDAP_SEARCH_FAILED,
            message: iamM('iam_ldapSearchFailed'),
            cause: searchResult.error,
          })
        }

        const entries = searchResult.data
        if (entries.length === 0) {
          return err({
            code: IamErrorCode.USER_NOT_FOUND,
            message: iamM('iam_userNotExist'),
          })
        }

        const entry = entries[0]

        // 提取用户信息
        const ldapUsername = getAttributeValue(entry, ldapConfig.usernameAttribute) || username
        const ldapEmail = getAttributeValue(entry, ldapConfig.emailAttribute)
        const ldapDisplayName = getAttributeValue(entry, ldapConfig.displayNameAttribute)

        // 查找本地用户（用于状态判断与失败计数）
        const localUserResult = await userRepository.findByUsername(ldapUsername)
        if (!localUserResult.success) {
          return localUserResult as Result<User, IamError>
        }

        let storedUser = localUserResult.data as StoredUser | null

        if (storedUser) {
          if (!storedUser.enabled) {
            return err({
              code: IamErrorCode.USER_DISABLED,
              message: iamM('iam_accountDisabled'),
            })
          }

          if (isAccountLocked(storedUser)) {
            return err({
              code: IamErrorCode.USER_LOCKED,
              message: iamM('iam_accountLocked'),
            })
          }
        }

        // 用用户的 DN 进行绑定验证密码
        const userBindResult = await client.bind(entry.dn, password)
        if (!userBindResult.success) {
          if (storedUser) {
            await recordLoginFailure(userRepository, storedUser, { maxLoginAttempts, lockoutDuration })
          }
          return err({
            code: IamErrorCode.INVALID_CREDENTIALS,
            message: iamM('iam_passwordWrong'),
          })
        }

        if (!storedUser && syncUser) {
          // 创建本地用户
          const createResult = await userRepository.create({
            username: ldapUsername,
            email: ldapEmail,
            displayName: ldapDisplayName,
            enabled: true,
            emailVerified: !!ldapEmail,
            metadata: {
              ldapDn: entry.dn,
              authSource: 'ldap',
            },
          })
          if (!createResult.success) {
            return err({
              code: IamErrorCode.REPOSITORY_ERROR,
              message: iamM('iam_createUserFailed', { params: { message: createResult.error.message } }),
              cause: createResult.error,
            })
          }

          const createdResult = await userRepository.findByUsername(ldapUsername)
          if (!createdResult.success) {
            return createdResult as Result<User, IamError>
          }
          storedUser = createdResult.data
        }
        else if (storedUser && syncUser) {
          // 更新本地用户信息
          const updateResult = await userRepository.updateById(storedUser.id, {
            email: ldapEmail || storedUser.email,
            displayName: ldapDisplayName || storedUser.displayName,
            metadata: {
              ...storedUser.metadata,
              ldapDn: entry.dn,
              authSource: 'ldap',
            },
          })
          if (updateResult.success) {
            const refreshed = await userRepository.findByUsername(ldapUsername)
            if (refreshed.success) {
              storedUser = refreshed.data ?? storedUser
            }
          }
        }

        if (!storedUser) {
          // 如果不同步用户，直接返回 LDAP 用户信息
          const ldapUser = buildLdapUser(entry, ldapUsername, ldapEmail, ldapDisplayName)
          return ok(ldapUser)
        }

        await resetLoginFailures(userRepository, storedUser)

        return ok(toUser(storedUser))
      }
      finally {
        // 确保解除绑定
        await client.unbind()
      }
    },
  }
}
