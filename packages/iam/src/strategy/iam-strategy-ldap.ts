/**
 * =============================================================================
 * @hai/iam - LDAP 认证策略
 * =============================================================================
 *
 * LDAP 目录认证方式
 *
 * @module iam-strategy-ldap
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  AuthStrategy,
  Credentials,
  IamError,
  LdapConfig,
  StoredUser,
  User,
  UserRepository,
} from '../iam-types.js'
import { err, ok } from '@hai/core'

import { IamErrorCode } from '../iam-config.js'

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
}

/**
 * 创建 LDAP 认证策略
 */
export function createLdapStrategy(config: LdapStrategyConfig): AuthStrategy {
  const { ldapConfig, userRepository, ldapClientFactory, syncUser = true } = config

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
   * 将 StoredUser 转换为 User（移除敏感信息）
   */
  function toUser(storedUser: StoredUser): User {
    return {
      id: storedUser.id,
      username: storedUser.username,
      email: storedUser.email,
      phone: storedUser.phone,
      displayName: storedUser.displayName,
      avatarUrl: storedUser.avatarUrl,
      enabled: storedUser.enabled,
      emailVerified: storedUser.emailVerified,
      phoneVerified: storedUser.phoneVerified,
      createdAt: storedUser.createdAt,
      updatedAt: storedUser.updatedAt,
      metadata: storedUser.metadata,
    }
  }

  return {
    type: 'ldap',
    name: 'ldap-strategy',

    async authenticate(credentials: Credentials): Promise<Result<User, IamError>> {
      // 类型检查
      if (credentials.type !== 'ldap') {
        return err({
          code: IamErrorCode.INVALID_CREDENTIALS,
          message: '凭证类型不匹配',
        })
      }

      const { username, password } = credentials

      // 创建 LDAP 客户端
      const clientResult = await ldapClientFactory(ldapConfig)
      if (!clientResult.success) {
        return err({
          code: IamErrorCode.LDAP_CONNECTION_FAILED,
          message: '无法连接到 LDAP 服务器',
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
            message: 'LDAP 管理员绑定失败',
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
            message: 'LDAP 搜索失败',
            cause: searchResult.error,
          })
        }

        const entries = searchResult.data
        if (entries.length === 0) {
          return err({
            code: IamErrorCode.USER_NOT_FOUND,
            message: '用户不存在',
          })
        }

        const entry = entries[0]

        // 用用户的 DN 进行绑定验证密码
        const userBindResult = await client.bind(entry.dn, password)
        if (!userBindResult.success) {
          return err({
            code: IamErrorCode.INVALID_CREDENTIALS,
            message: '密码错误',
          })
        }

        // 提取用户信息
        const ldapUsername = getAttributeValue(entry, ldapConfig.usernameAttribute) || username
        const ldapEmail = getAttributeValue(entry, ldapConfig.emailAttribute)
        const ldapDisplayName = getAttributeValue(entry, ldapConfig.displayNameAttribute)

        // 查找或创建本地用户
        const localUserResult = await userRepository.findByUsername(ldapUsername)
        if (!localUserResult.success) {
          return localUserResult as Result<User, IamError>
        }

        let storedUser = localUserResult.data

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
            return createResult as Result<User, IamError>
          }
          storedUser = createResult.data
        }
        else if (storedUser && syncUser) {
          // 更新本地用户信息
          const updateResult = await userRepository.update(storedUser.id, {
            email: ldapEmail || storedUser.email,
            displayName: ldapDisplayName || storedUser.displayName,
            metadata: {
              ...storedUser.metadata,
              ldapDn: entry.dn,
              authSource: 'ldap',
            },
          })
          if (updateResult.success) {
            storedUser = updateResult.data
          }
        }

        if (!storedUser) {
          // 如果不同步用户，直接返回 LDAP 用户信息
          const now = new Date()
          return ok({
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
          })
        }

        // 检查账户状态
        if (!storedUser.enabled) {
          return err({
            code: IamErrorCode.USER_DISABLED,
            message: '账户已禁用',
          })
        }

        return ok(toUser(storedUser))
      }
      finally {
        // 确保解除绑定
        await client.unbind()
      }
    },
  }
}
