/**
 * @h-ai/iam — LDAP 认证策略
 *
 * LDAP 目录认证方式
 * @module iam-authn-ldap-strategy
 */

import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { LdapConfig } from '../../iam-config.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { StoredUser } from '../../user/iam-user-types.js'
import type { AuthenticatedUser, AuthStrategy, Credentials } from '../iam-authn-types.js'
import { core, err, ok } from '@h-ai/core'
import { HaiReldbError, reldb } from '@h-ai/reldb'

import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'
import { isUserActive, toUser } from '../../user/iam-user-utils.js'
import { ensureCredentialType, isAccountLocked, recordLoginFailure, resetLoginFailures } from '../iam-authn-utils.js'
import { getLdapUserId, insertLdapIdentity, ldapEntryId } from './iam-authn-ldap-repository.js'

const logger = core.logger.child({ module: 'iam', scope: 'ldap-strategy' })

/**
 * 转义 LDAP 搜索过滤器中的特殊字符（RFC 4515）
 *
 * 防止 LDAP 注入攻击：将用户输入中的特殊字符转义为 `\xx` 形式。
 * 需转义字符：`*`、`(`、`)`、`\`、NUL（`\0`）。
 *
 * @param value - 用户输入值
 * @returns 转义后的安全字符串
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const escaped = escapeLdapFilterValue('alice*)(uid=*)')
 * const filter = `(uid=${escaped})` // 用户输入只作为值，不能扩展过滤表达式。
 * ```
 */
export function escapeLdapFilterValue(value: string): string {
  return value.replace(/[\\*()/\0]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(2, '0')
    return `\\${hex}`
  })
}

/**
 * LDAP 客户端接口
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function lookup(client: LdapClient) {
 *   const found = await client.search('ou=users,dc=example,dc=com', '(uid=alice)', ['uid', 'mail'])
 *   if (!found.success)
 *     return found
 *   return found.data.map(entry => entry.dn)
 * }
 * ```
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
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const entry: LdapSearchEntry = { dn: 'uid=alice,ou=users,dc=example,dc=com', attributes: { uid: 'alice', mail: ['alice@example.com'] } }
 * const username = entry.attributes.uid
 * ```
 */
export interface LdapSearchEntry {
  /** DN */
  dn: string
  /** 属性 */
  attributes: Record<string, string | string[]>
}

/**
 * LDAP 客户端工厂
 * @example
 * ```ts
 * import type { LdapClientFactory, LdapConfig } from '@h-ai/iam'
 * async function check(factory: LdapClientFactory, config: LdapConfig) {
 *   const opened = await factory(config)
 *   if (!opened.success)
 *     return opened
 *   const result = await opened.data.bind(config.bindDn, config.bindPassword)
 *   const closed = await opened.data.unbind()
 *   if (!closed.success)
 *     return closed
 *   return result
 * }
 * ```
 */
export type LdapClientFactory = (config: LdapConfig) => Promise<HaiResult<LdapClient>>

/**
 * LDAP 认证策略配置
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function configure(ldapConfig: LdapConfig, userRepository: UserRepository, ldapClientFactory: LdapClientFactory) {
 *   const config: LdapStrategyConfig = { ldapConfig, directoryId: 'staff', userRepository, ldapClientFactory, syncUser: true }
 *   return createLdapStrategy(config)
 * }
 * ```
 */
export interface LdapStrategyConfig {
  /** LDAP 配置 */
  ldapConfig: LdapConfig
  /** 已在启用 LDAP 时校验的目录命名空间。 */
  directoryId: string
  /** 用户存储 */
  userRepository: UserRepository
  /** LDAP 客户端工厂 */
  ldapClientFactory: LdapClientFactory
  /** 是否同步用户到本地数据库 */
  syncUser?: boolean
  /** 最大登录失败次数（默认 5） */
  lockoutEnabled?: boolean
  failureWindow?: number
  maxLoginAttempts?: number
  /** 锁定时间（秒，默认 900 = 15分钟） */
  lockoutDuration?: number
  /**
   * 自动注册前读取角色 ID，避免在 SQLite 写事务内占用另一个连接。
   */
  getRegistrationRole?: () => Promise<HaiResult<string | null>>
  /** 为新用户分配默认角色，和用户及绑定同事务提交。 */
  assignRegistrationRole?: (userId: string, roleId: string, tx: DmlWithTxOperations) => Promise<HaiResult<void>>
  /** 新同步账号的初始生命周期；休眠账号需要管理员激活。 */
  defaultAccountStatus?: 'active' | 'dormant'
}

/**
 * 创建 LDAP 认证策略
 *
 * 通过 LDAP 目录服务进行用户认证。
 * 支持用户同步到本地数据库、登录失败锁定等能力。
 *
 * @param config - LDAP 策略配置（LDAP 配置、用户存储、客户端工厂等）
 * @returns 认证策略实例
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function authenticate(config: LdapStrategyConfig, credentials: Credentials) {
 *   return createLdapStrategy(config).authenticate(credentials)
 * }
 * ```
 */
export function createLdapStrategy(config: LdapStrategyConfig): AuthStrategy {
  const {
    ldapConfig,
    directoryId,
    userRepository,
    ldapClientFactory,
    syncUser = true,
    maxLoginAttempts = 5,
    lockoutDuration = 900,
  } = config
  const failurePolicy = {
    maxLoginAttempts,
    lockoutDuration,
    lockoutEnabled: config.lockoutEnabled ?? true,
    failureWindow: config.failureWindow ?? 86400,
  }

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

  function rejected() {
    return err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))
  }

  async function boundUser(entryId: string): Promise<HaiResult<StoredUser | null>> {
    const linked = await getLdapUserId(directoryId, entryId)
    if (!linked.success)
      return linked
    return linked.data
      ? userRepository.findById(linked.data)
      : ok(null)
  }

  async function provision(entryId: string, username: string, email: string | undefined, displayName: string | undefined, dn: string): Promise<HaiResult<StoredUser>> {
    const role = await config.getRegistrationRole?.()
    if (role && !role.success)
      return role
    const result = await reldb.tx.begin()
    if (!result.success)
      return result
    const tx = result.data
    let committed = false
    try {
      const created = await userRepository.create({
        username,
        email,
        displayName,
        accountStatus: config.defaultAccountStatus ?? 'active',
        emailVerified: !!email,
        metadata: { ldapDn: dn, authSource: 'ldap' },
      }, tx)
      if (!created.success)
        return created
      const found = await userRepository.findByUsername(username, tx)
      if (!found.success)
        return found
      if (!found.data)
        return rejected()
      const user = found.data
      const linked = await insertLdapIdentity(directoryId, entryId, user.id, tx)
      if (!linked.success)
        return linked
      if (role?.data && config.assignRegistrationRole) {
        const assigned = await config.assignRegistrationRole(user.id, role.data, tx)
        if (!assigned.success)
          return assigned
      }
      const finished = await tx.commit()
      committed = finished.success
      return finished.success
        ? ok(user)
        : finished
    }
    finally {
      if (!committed) {
        const rolledBack = await tx.rollback()
        if (!rolledBack.success)
          logger.error('LDAP enrollment rollback failed', { errorCode: rolledBack.error.code, traceId: rolledBack.error.traceId })
      }
    }
  }

  return {
    type: 'ldap',
    name: 'ldap-strategy',

    async authenticate(credentials: Credentials): Promise<HaiResult<AuthenticatedUser>> {
      // 类型检查
      const credentialResult = ensureCredentialType(credentials, 'ldap')
      if (!credentialResult.success) {
        return credentialResult as HaiResult<AuthenticatedUser>
      }

      const { username, password } = credentialResult.data
      if (!username.trim() || !password)
        return err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))

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
          [
            ...new Set([
              ldapConfig.usernameAttribute,
              ldapConfig.emailAttribute,
              ldapConfig.displayNameAttribute,
              ldapConfig.identityAttribute,
            ]),
          ],
        )

        if (!searchResult.success) {
          return err(
            HaiIamError.LDAP_SEARCH_FAILED,
            iamM('iam_ldapSearchFailed'),
            searchResult.error,
          )
        }

        const entries = searchResult.data
        if (entries.length !== 1)
          return rejected()

        const entry = entries[0]
        const identity = entry.attributes[ldapConfig.identityAttribute]
        const entryId = ldapEntryId(ldapConfig.identityAttribute, Array.isArray(identity)
          ? identity.length === 1
            ? identity[0]
            : undefined
          : identity)
        if (!entryId)
          return rejected()

        // 提取用户信息
        const ldapUsername = getAttributeValue(entry, ldapConfig.usernameAttribute) || username
        const ldapEmail = getAttributeValue(entry, ldapConfig.emailAttribute)
        const ldapDisplayName = getAttributeValue(entry, ldapConfig.displayNameAttribute)

        const localUserResult = await boundUser(entryId)
        if (!localUserResult.success)
          return localUserResult
        let storedUser = localUserResult.data
        if (!storedUser) {
          if (!syncUser)
            return rejected()
          // 用户名只用于检测创建冲突，不能取得既存用户或影响其失败计数。
          const occupied = await userRepository.existsByUsername(ldapUsername)
          if (!occupied.success)
            return occupied
          if (occupied.data) {
            // 并发首登可能刚完成提交，只按同一稳定标识再次查找。
            const linked = await boundUser(entryId)
            if (!linked.success)
              return linked
            if (!linked.data)
              return rejected()
            storedUser = linked.data
          }
        }

        if (storedUser) {
          if (!isUserActive(storedUser)) {
            return err(
              HaiIamError.ACCOUNT_UNAVAILABLE,
              iamM('iam_accountUnavailable'),
            )
          }

          if (isAccountLocked(storedUser, failurePolicy)) {
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
            const failureResult = await recordLoginFailure(userRepository, storedUser, failurePolicy)
            if (!failureResult.success)
              return failureResult
          }
          logger.warn('LDAP user bind rejected', { userId: storedUser?.id })
          return rejected()
        }

        if (!storedUser) {
          const created = await provision(entryId, ldapUsername, ldapEmail, ldapDisplayName, entry.dn)
          if (created.success) {
            storedUser = created.data
          }
          else if (created.error.code === HaiReldbError.DUPLICATE_ENTRY.code) {
            // 并发创建只接受另一事务已经提交的同一目录绑定。
            const linked = await boundUser(entryId)
            if (!linked.success)
              return linked
            storedUser = linked.data
          }
          else {
            return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_ldapRepositoryFailed'), created.error)
          }
        }
        else if (syncUser) {
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
            const refreshed = await userRepository.findById(storedUser.id)
            if (refreshed.success) {
              storedUser = refreshed.data ?? storedUser
            }
          }
        }

        if (!storedUser)
          return rejected()

        const resetResult = await resetLoginFailures(userRepository, storedUser, failurePolicy)
        if (!resetResult.success)
          return resetResult
        logger.debug('LDAP authentication succeeded', { userId: storedUser.id })

        return ok({
          ...toUser(storedUser),
          credentialVersion: storedUser.credentialVersion ?? '',
        })
      }
      finally {
        // 确保解除绑定
        await client.unbind()
      }
    },
  }
}
