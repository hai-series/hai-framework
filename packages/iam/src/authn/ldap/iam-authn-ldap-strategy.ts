/**
 * @h-ai/iam — LDAP 认证策略
 *
 * LDAP 目录认证方式
 * @module iam-authn-ldap-strategy
 */

import type { HaiResult } from '@h-ai/core'
import type { LdapConfig } from '../../iam-config.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { StoredUser, User } from '../../user/iam-user-types.js'
import type { AuthStrategy, Credentials } from '../iam-authn-types.js'
import { core, err, ok } from '@h-ai/core'

import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'
import { toUser } from '../../user/iam-user-utils.js'
import { ensureCredentialType, isAccountLocked, recordLoginFailure, resetLoginFailures } from '../iam-authn-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'ldap-strategy' })

/**
 * 转义 LDAP 搜索过滤器中的特殊字符（RFC 4515）
 *
 * 防止 LDAP 注入攻击：将用户输入中的特殊字符转义为 `\xx` 形式。
 * 需转义字符：`*`、`(`、`)`、`\`、NUL（`\0`）。
 *
 * @param value - 用户输入值
 * @returns 转义后的安全字符串
 */
export function escapeLdapFilterValue(value: string): string {
  return value.replace(/[\\*()/\0]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(2, '0')
    return `\\${hex}`
  })
}

/**
 * LDAP 客户端接口
 */
export interface LdapClient {
  /**
   * 绑定（认证）
   */
  bind: (dn: string, password: string) => Promise<HaiResult<void>>

  /**
   * 搜索用户
   */
  search: (base: string, filter: string, attributes: string[]) => Promise<HaiResult<LdapSearchEntry[]>>

  /**
   * 解除绑定
   */
  unbind: () => Promise<HaiResult<void>>
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
export type LdapClientFactory = (config: LdapConfig) => Promise<HaiResult<LdapClient>>

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
  /**
   * 用户自动注册后的回调
   *
   * LDAP 同步创建本地新用户后调用，用于分配默认角色等后处理操作。
   *
   * @param userId - 新创建的用户 ID
   */
  onUserAutoRegistered?: (userId: string) => Promise<void>
}

/**
 * 创建 LDAP 认证策略
 *
 * 通过 LDAP 目录服务进行用户认证。
 * 支持用户同步到本地数据库、登录失败锁定等能力。
 *
 * @param config - LDAP 策略配置（LDAP 配置、用户存储、客户端工厂等）
 * @returns 认证策略实例
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
   * 获取 LDAP 搜索结果中的属性值
   *
   * 支持单值和多值属性，多值时返回第一个。
   *
   * @param entry - LDAP 搜索结果条目
   * @param attr - 属性名
   * @returns 属性值，或 undefined
   */
  function getAttributeValue(entry: LdapSearchEntry, attr: string): string | undefined {
    const value = entry.attributes[attr]
    if (Array.isArray(value)) {
      return value[0]
    }
    return value
  }

  /**
   * 构建 LDAP 用户信息对象
   *
   * 用于未开启用户同步时，直接返回 LDAP 目录中的用户信息。
   *
   * @param entry - LDAP 搜索结果条目
   * @param ldapUsername - 用户名
   * @param ldapEmail - 邮箱（可选）
   * @param ldapDisplayName - 显示名称（可选）
   * @returns User 对象（ID 为 LDAP DN）
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

    async authenticate(credentials: Credentials): Promise<HaiResult<User>> {
      // 类型检查
      const credentialResult = ensureCredentialType(credentials, 'ldap')
      if (!credentialResult.success) {
        return credentialResult as HaiResult<User>
      }

      const { username, password } = credentialResult.data

      // 创建 LDAP 客户端
      const clientResult = await ldapClientFactory(ldapConfig)
      if (!clientResult.success) {
        return err(
          HaiIamError.LDAP_CONNECTION_FAILED,
          iamM('iam_ldapConnectionFailed'),
          clientResult.error,
        )
      }

      const client = clientResult.data

      try {
        // 先用管理员账号绑定
        const adminBindResult = await client.bind(ldapConfig.bindDn, ldapConfig.bindPassword)
        if (!adminBindResult.success) {
          return err(
            HaiIamError.LDAP_BIND_FAILED,
            iamM('iam_ldapAdminBindFailed'),
            adminBindResult.error,
          )
        }

        // 搜索用户（转义用户输入，防止 LDAP 注入）
        const searchFilter = ldapConfig.searchFilter.replace('{{username}}', escapeLdapFilterValue(username))
        const searchResult = await client.search(
          ldapConfig.searchBase,
          searchFilter,
          [ldapConfig.usernameAttribute, ldapConfig.emailAttribute, ldapConfig.displayNameAttribute],
        )

        if (!searchResult.success) {
          return err(
            HaiIamError.LDAP_SEARCH_FAILED,
            iamM('iam_ldapSearchFailed'),
            searchResult.error,
          )
        }

        const entries = searchResult.data
        if (entries.length === 0) {
          return err(
            HaiIamError.USER_NOT_FOUND,
            iamM('iam_userNotExist'),
          )
        }

        const entry = entries[0]

        // 提取用户信息
        const ldapUsername = getAttributeValue(entry, ldapConfig.usernameAttribute) || username
        const ldapEmail = getAttributeValue(entry, ldapConfig.emailAttribute)
        const ldapDisplayName = getAttributeValue(entry, ldapConfig.displayNameAttribute)

        // 查找本地用户（用于状态判断与失败计数）
        const localUserResult = await userRepository.findByUsername(ldapUsername)
        if (!localUserResult.success) {
          return localUserResult as HaiResult<User>
        }

        let storedUser = localUserResult.data as StoredUser | null

        if (storedUser) {
          if (!storedUser.enabled) {
            return err(
              HaiIamError.USER_DISABLED,
              iamM('iam_accountDisabled'),
            )
          }

          if (isAccountLocked(storedUser)) {
            return err(
              HaiIamError.USER_LOCKED,
              iamM('iam_accountLocked'),
            )
          }
        }

        // 用用户的 DN 进行绑定验证密码
        const userBindResult = await client.bind(entry.dn, password)
        if (!userBindResult.success) {
          if (storedUser) {
            await recordLoginFailure(userRepository, storedUser, { maxLoginAttempts, lockoutDuration })
          }
          logger.warn('LDAP authentication failed', { username })
          return err(
            HaiIamError.INVALID_CREDENTIALS,
            iamM('iam_passwordWrong'),
          )
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
            return err(
              HaiIamError.REPOSITORY_ERROR,
              iamM('iam_createUserFailed', { params: { message: createResult.error.message } }),
              createResult.error,
            )
          }

          const createdResult = await userRepository.findByUsername(ldapUsername)
          if (!createdResult.success) {
            return createdResult as HaiResult<User>
          }
          storedUser = createdResult.data

          // LDAP 新用户同步后回调（分配默认角色等）
          if (storedUser && config.onUserAutoRegistered) {
            try {
              await config.onUserAutoRegistered(storedUser.id)
            }
            catch (callbackError) {
              logger.warn('onUserAutoRegistered callback failed', { userId: storedUser?.id, error: callbackError })
            }
          }
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
        logger.info('LDAP authentication succeeded', { userId: storedUser.id })

        return ok(toUser(storedUser))
      }
      finally {
        // 确保解除绑定
        await client.unbind()
      }
    },
  }
}
