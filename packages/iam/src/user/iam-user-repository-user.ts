/**
 * @h-ai/iam — 用户存储实现
 *
 * 基于 @h-ai/reldb 的用户存储实现。
 * @module iam-user-repository-user
 */

import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations, ReldbCrudFieldDefinition, ReldbCrudRepository } from '@h-ai/reldb'
import type { LoginFailurePolicy } from '../authn/iam-authn-utils.js'
import type { StoredUser } from './iam-user-types.js'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'

// ─── 用户存储接口 ───

/**
 * 用户存储接口
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function commitPassword(repository: UserRepository, current: StoredUser, passwordHash: string) {
 *   const written = await repository.setPassword({ userId: current.id, expectedVersion: current.credentialVersion ?? '', passwordHash })
 *   if (!written.success)
 *     return written
 *   if (!written.data)
 *     return { applied: false } // 凭据代际已变化；不能继续签发本次认证的会话。
 *   return { applied: true }
 * }
 * ```
 */
export interface UserRepository extends ReldbCrudRepository<StoredUser> {
  /** 成功鉴别后记录登录时间；不修改角色或其他用户资料。 */
  recordSuccessfulLogin: (userId: string) => Promise<HaiResult<void>>
  /** 按最后成功登录/创建时间原子休眠并推进凭据代际。 */
  suspendInactive: (cutoff: Date) => Promise<HaiResult<number>>
  /** 按读取到的凭据代际改密并撤销重置令牌；旧版本不能覆盖较新密码。 */
  setPassword: (input: { userId: string, expectedVersion: string, passwordHash: string, mustChangePassword?: boolean }) => Promise<HaiResult<boolean>>
  /** 按用户快照发布新重置令牌；不使用 Redis/数据库之间的伪事务。 */
  publishPasswordReset: (input: { user: StoredUser, tokenHash: string, expiresAt: Date }) => Promise<HaiResult<boolean>>
  /** 按当前重置代际计次并颁发提交快照；新发布/尝试使旧快照失效。 */
  claimPasswordReset: (tokenHash: string, maxAttempts: number) => Promise<HaiResult<StoredUser>>
  /** 最终一条 SQL 同时验证授权代际、有效期、启用状态、消费令牌并改密。 */
  commitPasswordReset: (input: { user: StoredUser, tokenHash: string, passwordHash: string }) => Promise<HaiResult<boolean>>
  /** 在数据库中原子累加失败次数并执行锁定策略。 */
  recordLoginFailure: (userId: string, policy: LoginFailurePolicy) => Promise<HaiResult<void>>
  /** 仅未锁定且启用的账户可以清除失败计数。 */
  resetLoginFailures: (userId: string, expectedCredentialVersion: string, lockoutEnabled?: boolean) => Promise<HaiResult<void>>
  /**
   * 根据用户名获取用户
   */
  findByUsername: (username: string, tx?: DmlWithTxOperations) => Promise<HaiResult<StoredUser | null>>

  /**
   * 根据邮箱获取用户
   */
  findByEmail: (email: string, tx?: DmlWithTxOperations) => Promise<HaiResult<StoredUser | null>>

  /**
   * 根据手机号获取用户
   */
  findByPhone: (phone: string, tx?: DmlWithTxOperations) => Promise<HaiResult<StoredUser | null>>

  /**
   * 根据标识符获取用户（用户名/邮箱/手机号）
   */
  findByIdentifier: (identifier: string, tx?: DmlWithTxOperations) => Promise<HaiResult<StoredUser | null>>

  /**
   * 检查用户名是否存在
   */
  existsByUsername: (username: string, tx?: DmlWithTxOperations) => Promise<HaiResult<boolean>>

  /**
   * 检查邮箱是否存在
   */
  existsByEmail: (email: string, tx?: DmlWithTxOperations) => Promise<HaiResult<boolean>>

}

// ─── 用户存储实现 ───

/**
 * 用户表名
 */
const TABLE_NAME = 'hai_iam_users'

/**
 * 用户字段定义
 */
const USER_FIELDS: ReldbCrudFieldDefinition[] = [
  { fieldName: 'mustChangePassword', columnName: 'must_change_password', def: { type: 'BOOLEAN', notNull: true, defaultValue: false }, select: true, create: true, update: false },
  { fieldName: 'accountType', columnName: 'account_type', def: { type: 'TEXT', notNull: true, defaultValue: 'permanent' }, select: true, create: true, update: true },
  { fieldName: 'accountStatus', columnName: 'account_status', def: { type: 'TEXT', notNull: true, defaultValue: 'active' }, select: true, create: true, update: true },
  { fieldName: 'accountExpiresAt', columnName: 'account_expires_at', def: { type: 'TIMESTAMP' }, select: true, create: true, update: true },
  { fieldName: 'lastLoginAt', columnName: 'last_login_at', def: { type: 'TIMESTAMP' }, select: true, create: false, update: false },
  { fieldName: 'credentialVersion', columnName: 'credential_version', def: { type: 'TEXT', notNull: true, defaultValue: '' }, select: true, create: false, update: false },
  { fieldName: 'resetVersion', columnName: 'reset_version', def: { type: 'TEXT', notNull: true, defaultValue: '' }, select: true, create: false, update: false },
  { fieldName: 'resetHash', columnName: 'reset_hash', def: { type: 'TEXT' }, select: true, create: false, update: false },
  { fieldName: 'resetExpiresAt', columnName: 'reset_expires_at', def: { type: 'BIGINT' }, select: true, create: false, update: false },
  { fieldName: 'resetAttempts', columnName: 'reset_attempts', def: { type: 'INTEGER', notNull: true, defaultValue: 0 }, select: true, create: false, update: false },
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'TEXT' as const, primaryKey: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'username',
    columnName: 'username',
    def: { type: 'TEXT' as const, notNull: true, unique: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'email',
    columnName: 'email',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'phone',
    columnName: 'phone',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'displayName',
    columnName: 'display_name',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'avatarUrl',
    columnName: 'avatar_url',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'enabled',
    columnName: 'enabled',
    def: { type: 'BOOLEAN' as const, notNull: true, defaultValue: 1 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'emailVerified',
    columnName: 'email_verified',
    def: { type: 'BOOLEAN' as const, defaultValue: 0 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'phoneVerified',
    columnName: 'phone_verified',
    def: { type: 'BOOLEAN' as const, defaultValue: 0 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'passwordHash',
    columnName: 'password_hash',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'passwordUpdatedAt',
    columnName: 'password_updated_at',
    def: { type: 'TIMESTAMP' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'loginFailedCount',
    columnName: 'login_failed_count',
    def: { type: 'INTEGER' as const, defaultValue: 0 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'firstLoginFailedAt',
    columnName: 'first_login_failed_at',
    def: { type: 'TIMESTAMP' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'lastLoginFailedAt',
    columnName: 'last_login_failed_at',
    def: { type: 'TIMESTAMP' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'lockedUntil',
    columnName: 'locked_until',
    def: { type: 'TIMESTAMP' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'metadata',
    columnName: 'metadata',
    def: { type: 'JSON' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
]

/** 用户存储单例缓存（通过 reldb.sql 引用比较检测 db 生命周期切换） */
let userRepoInstance: UserRepository | null = null
let userRepoSqlOps: unknown = null

/**
 * 重置用户存储单例
 *
 * 在 iam.close() 时调用，释放对旧 db 实例的引用。
 * 仅重置本地引用，不删除共享存储数据。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // 所有使用该仓储的 IAM 子功能均已关闭后，才清理工厂缓存。
 * resetUserRepoSingleton()
 * ```
 */
export function resetUserRepoSingleton(): void {
  userRepoInstance = null
  userRepoSqlOps = null
}

/**
 * 创建基于数据库的用户存储实例
 *
 * 单例模式：同一 db 生命周期内重复调用返回缓存实例，
 * db 重新初始化后自动创建新实例。
 *
 * @returns 用户存储接口实现
 * @internal
 * @example 模块内部上下文
 * ```ts
 * // RelDB 已初始化；后续仓储读取仍可能失败，必须检查 HaiResult。
 * const repository = await createDbUserRepository()
 * const found = await repository.findByUsername('alice')
 * if (!found.success)
 *   return found
 * return found.data?.credentialVersion ?? null
 * ```
 */
export async function createDbUserRepository(): Promise<UserRepository> {
  if (userRepoInstance && userRepoSqlOps === reldb.sql)
    return userRepoInstance

  const repo = new DbUserRepository()
  // 确保底层表创建完成（BaseReldbCrudRepository 的表创建是异步的）
  await repo.count()
  userRepoInstance = repo
  userRepoSqlOps = reldb.sql
  return repo
}

/**
 * 基于数据库的用户存储实现
 *
 * 继承 BaseReldbCrudRepository，提供按用户名/邮箱/手机号/标识符的查询能力。
 */
class DbUserRepository extends BaseReldbCrudRepository<StoredUser> implements UserRepository {
  constructor() {
    super(reldb, {
      table: TABLE_NAME,
      fields: USER_FIELDS,
    })
  }

  /** 数据库时钟在执行最终 SQL 时核验有效期，暂停进程不能复用旧的 Date.now()。 */
  private databaseNow(): string {
    if (reldb.config?.type === 'postgresql')
      return '(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)'
    if (reldb.config?.type === 'mysql')
      return '(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000)'
    return 'CAST((julianday(\'now\') - 2440587.5) * 86400000 AS INTEGER)'
  }

  async recordSuccessfulLogin(userId: string): Promise<HaiResult<void>> {
    const result = await reldb.sql.execute(`UPDATE ${TABLE_NAME} SET last_login_at = ? WHERE id = ?`, [reldb.config?.type === 'sqlite' ? Date.now() : new Date(), userId])
    return result.success ? ok(undefined) : this.buildQueryError(result.error, result.error)
  }

  async suspendInactive(cutoff: Date): Promise<HaiResult<number>> {
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET account_status = ?, credential_version = ?, reset_version = ?, reset_hash = NULL, reset_expires_at = NULL WHERE enabled = ? AND account_status = ? AND COALESCE(last_login_at, created_at) <= ?`,
      ['dormant', crypto.randomUUID(), crypto.randomUUID(), reldb.config?.type === 'postgresql' ? true : 1, 'active', reldb.config?.type === 'sqlite' ? cutoff.getTime() : cutoff],
    )
    return result.success ? ok(result.data.changes) : this.buildQueryError(result.error, result.error)
  }

  /** 改密推进凭据代际；会话存储清理失败也不能让旧凭据恢复授权。 */
  async setPassword(input: { userId: string, expectedVersion: string, passwordHash: string, mustChangePassword?: boolean }): Promise<HaiResult<boolean>> {
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET password_hash = ?, password_updated_at = ?, credential_version = ?, reset_version = ?, must_change_password = ?, reset_hash = NULL, reset_expires_at = NULL, reset_attempts = 0 WHERE id = ? AND credential_version = ? AND enabled = ?`,
      [input.passwordHash, reldb.config?.type === 'sqlite' ? Date.now() : new Date(), crypto.randomUUID(), crypto.randomUUID(), reldb.config?.type === 'postgresql' ? input.mustChangePassword === true : Number(input.mustChangePassword === true), input.userId, input.expectedVersion, reldb.config?.type === 'postgresql' ? true : 1],
    )
    return result.success ? ok(result.data.changes === 1) : this.buildQueryError(result.error, result.error)
  }

  /** 发布只替换读取到的重置代际；旧发送者暂停后不能覆盖接管节点的新令牌。 */
  async publishPasswordReset(input: { user: StoredUser, tokenHash: string, expiresAt: Date }): Promise<HaiResult<boolean>> {
    const expiry = input.expiresAt.getTime()
    if (!Number.isSafeInteger(expiry))
      return err(HaiIamError.INVALID_ARGUMENT, iamM('iam_resetTokenInvalid'))
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET reset_hash = ?, reset_expires_at = ?, reset_attempts = 0, reset_version = ? WHERE id = ? AND credential_version = ? AND reset_version = ? AND enabled = ? AND ? > ${this.databaseNow()}`,
      [input.tokenHash, expiry, crypto.randomUUID(), input.user.id, input.user.credentialVersion ?? '', input.user.resetVersion ?? '', reldb.config?.type === 'postgresql' ? true : 1, expiry],
    )
    return result.success ? ok(result.data.changes === 1) : this.buildQueryError(result.error, result.error)
  }

  /** 条件计次返回新代际；业务策略失败也消耗尝试次数。 */
  async claimPasswordReset(tokenHash: string, maxAttempts: number): Promise<HaiResult<StoredUser>> {
    const found = await this.findOneBy('reset_hash = ?', [tokenHash])
    if (!found.success)
      return found
    const user = found.data
    if (!user)
      return err(HaiIamError.RESET_TOKEN_INVALID, iamM('iam_resetTokenInvalid'))
    if (!user.enabled)
      return err(HaiIamError.USER_DISABLED, iamM('iam_accountDisabled'))
    if ((user.resetAttempts ?? 0) >= maxAttempts)
      return err(HaiIamError.RESET_TOKEN_MAX_ATTEMPTS, iamM('iam_resetTokenMaxAttempts'))
    const version = crypto.randomUUID()
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET reset_attempts = reset_attempts + 1, reset_version = ? WHERE id = ? AND reset_hash = ? AND reset_version = ? AND credential_version = ? AND reset_attempts < ? AND reset_expires_at > ${this.databaseNow()} AND enabled = ?`,
      [version, user.id, tokenHash, user.resetVersion ?? '', user.credentialVersion ?? '', maxAttempts, reldb.config?.type === 'postgresql' ? true : 1],
    )
    if (!result.success)
      return this.buildQueryError(result.error, result.error)
    if (result.data.changes !== 1)
      return err(HaiIamError.RESET_TOKEN_INVALID, iamM('iam_resetTokenInvalid'))
    return ok({ ...user, resetVersion: version, resetAttempts: (user.resetAttempts ?? 0) + 1 })
  }

  /** 密码与令牌消费同一行原子提交，禁止先消费 Redis 凭据再无条件写数据库。 */
  async commitPasswordReset(input: { user: StoredUser, tokenHash: string, passwordHash: string }): Promise<HaiResult<boolean>> {
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET password_hash = ?, password_updated_at = ?, credential_version = ?, reset_version = ?, must_change_password = FALSE, reset_hash = NULL, reset_expires_at = NULL, reset_attempts = 0, login_failed_count = 0, first_login_failed_at = NULL, locked_until = NULL, last_login_failed_at = NULL WHERE id = ? AND reset_hash = ? AND reset_version = ? AND credential_version = ? AND reset_expires_at > ${this.databaseNow()} AND enabled = ?`,
      [input.passwordHash, reldb.config?.type === 'sqlite' ? Date.now() : new Date(), crypto.randomUUID(), crypto.randomUUID(), input.user.id, input.tokenHash, input.user.resetVersion ?? '', input.user.credentialVersion ?? '', reldb.config?.type === 'postgresql' ? true : 1],
    )
    return result.success ? ok(result.data.changes === 1) : this.buildQueryError(result.error, result.error)
  }

  async recordLoginFailure(userId: string, policy: LoginFailurePolicy): Promise<HaiResult<void>> {
    if (policy.lockoutEnabled === false)
      return ok(undefined)
    const sqlite = reldb.config?.type === 'sqlite'
    const timestamp = Date.now()
    const now = sqlite ? timestamp : new Date(timestamp)
    const cutoff = timestamp - (policy.failureWindow ?? 86400) * 1000
    const windowStart = sqlite ? cutoff : new Date(cutoff)
    const deadline = timestamp + policy.lockoutDuration * 1000
    const lockedUntil = sqlite ? deadline : new Date(deadline)
    // 到期解锁是条件更新；后续原子递增不读取进程中的旧计数。
    const expired = await reldb.sql.execute(`UPDATE ${TABLE_NAME} SET login_failed_count = 0, locked_until = NULL, first_login_failed_at = ?, last_login_failed_at = NULL WHERE id = ? AND (locked_until <= ? OR (locked_until IS NULL AND (first_login_failed_at IS NULL OR first_login_failed_at <= ?)))`, [now, userId, now, windowStart])
    if (!expired.success)
      return this.buildQueryError(expired.error, expired.error)
    // 先计算锁定期限再递增次数，避免 MySQL 按 SET 顺序读取已更新的计数而提前锁定。
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET locked_until = CASE WHEN COALESCE(login_failed_count, 0) + 1 >= ? THEN ? ELSE locked_until END, login_failed_count = COALESCE(login_failed_count, 0) + 1, last_login_failed_at = ? WHERE id = ? AND locked_until IS NULL`,
      [policy.maxLoginAttempts, lockedUntil, now, userId],
    )
    if (!result.success)
      return this.buildQueryError(result.error, result.error)
    return ok(undefined)
  }

  async resetLoginFailures(userId: string, expectedCredentialVersion: string, lockoutEnabled = true): Promise<HaiResult<void>> {
    const params: unknown[] = [userId, expectedCredentialVersion, reldb.config?.type === 'postgresql' ? true : 1]
    if (lockoutEnabled)
      params.push(reldb.config?.type === 'sqlite' ? Date.now() : new Date())
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET login_failed_count = 0, first_login_failed_at = NULL, last_login_failed_at = NULL, locked_until = NULL WHERE id = ? AND credential_version = ? AND enabled = ? ${lockoutEnabled ? 'AND (locked_until IS NULL OR locked_until <= ?)' : ''}`,
      params,
    )
    if (!result.success)
      return this.buildQueryError(result.error, result.error)
    if (result.data.changes === 0) {
      const user = await this.findById(userId)
      if (!user.success)
        return user
      if (!user.data?.enabled)
        return err(HaiIamError.USER_DISABLED, iamM('iam_accountDisabled'))
      if ((user.data.credentialVersion ?? '') !== expectedCredentialVersion)
        return err(HaiIamError.SESSION_INVALID, iamM('iam_sessionExpired'))
      if (lockoutEnabled && user.data.lockedUntil && user.data.lockedUntil > new Date())
        return err(HaiIamError.USER_LOCKED, iamM('iam_accountLocked'))
    }
    return ok(undefined)
  }

  /** 根据用户名查找用户 */
  async findByUsername(username: string, tx?: DmlWithTxOperations): Promise<HaiResult<StoredUser | null>> {
    return this.findOneBy('username = ?', [username], tx)
  }

  /** 根据邮箱查找用户 */
  async findByEmail(email: string, tx?: DmlWithTxOperations): Promise<HaiResult<StoredUser | null>> {
    return this.findOneBy('email = ?', [email], tx)
  }

  /** 根据手机号查找用户 */
  async findByPhone(phone: string, tx?: DmlWithTxOperations): Promise<HaiResult<StoredUser | null>> {
    return this.findOneBy('phone = ?', [phone], tx)
  }

  /** 根据标识符查找用户（同时匹配用户名、邮箱、手机号） */
  async findByIdentifier(identifier: string, tx?: DmlWithTxOperations): Promise<HaiResult<StoredUser | null>> {
    return this.findOneBy('username = ? OR email = ? OR phone = ?', [identifier, identifier, identifier], tx)
  }

  /** 检查用户名是否已存在 */
  async existsByUsername(username: string, tx?: DmlWithTxOperations): Promise<HaiResult<boolean>> {
    return this.existsBy('username = ?', [username], tx)
  }

  /** 检查邮箱是否已存在 */
  async existsByEmail(email: string, tx?: DmlWithTxOperations): Promise<HaiResult<boolean>> {
    return this.existsBy('email = ?', [email], tx)
  }

  /**
   * 构建查询错误响应
   *
   * @param error - 原始错误对象
   * @param error.message - 错误消息
   * @param cause - 错误原因
   */
  private buildQueryError(error: { message: string }, cause: unknown): HaiResult<never> {
    return err(
      HaiIamError.REPOSITORY_ERROR,
      iamM('iam_queryUserFailed', { params: { message: error.message } }),
      cause,
    )
  }

  /**
   * 按条件检查是否存在
   *
   * @param where - SQL WHERE 条件
   * @param params - 绑定参数
   * @param tx - 可选事务句柄
   */
  private async existsBy(where: string, params: unknown[], tx?: DmlWithTxOperations): Promise<HaiResult<boolean>> {
    const result = await this.exists({ where, params }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error, result.error)
    }
    return ok(result.data)
  }

  /**
   * 按条件查找单条记录
   *
   * @param where - SQL WHERE 条件
   * @param params - 绑定参数
   * @param tx - 可选事务句柄
   * @returns 单条用户记录，或 null
   */
  private async findOneBy(where: string, params: unknown[], tx?: DmlWithTxOperations): Promise<HaiResult<StoredUser | null>> {
    const result = await this.findAll({ where, params, limit: 1 }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error, result.error)
    }
    return ok(result.data[0] ?? null)
  }
}
