/**
 * @h-ai/iam — 用户存储实现
 *
 * 基于 @h-ai/reldb 的用户存储实现。
 * @module iam-user-repository-user
 */

import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations, ReldbCrudFieldDefinition, ReldbCrudRepository } from '@h-ai/reldb'
import type { StoredUser, User } from './iam-user-types.js'
import { core } from '@h-ai/core'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'
import { clearLoginFailures } from '../authn/iam-authn-lockout.js'
import { guardIamMutation, guardIamStatement } from '../iam-cache.js'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { isUserActive, normalizeIamContact } from './iam-user-utils.js'

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
  /** 按当前账户状态与凭据代际清除 Redis 失败计数。 */
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

  /** 按 OTP 渠道匹配唯一的规范化联系方式；历史重复数据拒绝身份解析。 */
  findByOtpContact: (channel: 'email' | 'phone', identifier: string, tx?: DmlWithTxOperations) => Promise<HaiResult<StoredUser | null>>

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
 * 在事务读账号和角色前取得同一账号的写入锁。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function lock(tx: DmlWithTxOperations, userId: string) {
 *   return lockIamUser(tx, userId)
 * }
 * ```
 */
export async function lockIamUser(tx: DmlWithTxOperations, userId: string): Promise<HaiResult<void>> {
  // SQLite 没有 FOR UPDATE。先获取写事务，再读取数据，避免从旧快照升级写锁。
  const locked = reldb.config?.type === 'sqlite'
    ? await tx.execute(`UPDATE ${TABLE_NAME} SET id = id WHERE id = ?`, [userId])
    : await tx.get(`SELECT id FROM ${TABLE_NAME} WHERE id = ? FOR UPDATE`, [userId])
  return locked.success
    ? core.ok(undefined)
    : locked
}

/**
 * 更新已加锁的用户。真实换绑清除对应验证标记，联系方式或账号状态变化作废旧凭据。
 * 返回是否在同一事务中推进了凭据代际。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function updateLocked(repository: UserRepository, tx: DmlWithTxOperations, current: StoredUser) {
 *   return updateIamUserProfile(repository, tx, current, { displayName: 'Alice' })
 * }
 * ```
 */
export async function updateIamUserProfile(repository: UserRepository, tx: DmlWithTxOperations, current: StoredUser, data: Partial<User>): Promise<HaiResult<boolean>> {
  const emailChanged = data.email !== undefined && normalizeIamContact('email', data.email) !== normalizeIamContact('email', current.email)
  const phoneChanged = data.phone !== undefined && normalizeIamContact('phone', data.phone) !== normalizeIamContact('phone', current.phone)
  const profile = { ...data }
  if (emailChanged)
    profile.emailVerified = false
  if (phoneChanged)
    profile.phoneVerified = false
  const updated = await repository.updateById(current.id, profile, tx)
  if (!updated.success)
    return updated

  const securityChanged = emailChanged || phoneChanged
    || (data.accountStatus !== undefined && data.accountStatus !== current.accountStatus)
    || (data.accountType !== undefined && data.accountType !== current.accountType)
    || (data.accountExpiresAt !== undefined && (data.accountExpiresAt?.getTime() ?? null) !== (current.accountExpiresAt?.getTime() ?? null))
  if (!securityChanged)
    return core.ok(false)

  const advanced = await tx.execute(
    `UPDATE ${TABLE_NAME} SET credential_version = ?, reset_version = ?, reset_hash = NULL, reset_expires_at = NULL, reset_attempts = 0 WHERE id = ? AND credential_version = ?`,
    [
      crypto.randomUUID(),
      crypto.randomUUID(),
      current.id,
      current.credentialVersion ?? '',
    ],
  )
  if (!advanced.success)
    return advanced
  return advanced.data.changes === 1
    ? core.ok(true)
    : core.err(HaiIamError.CONFLICT, iamM('iam_sessionStateConflict'))
}

/**
 * 用户字段定义
 */
const USER_FIELDS: ReldbCrudFieldDefinition[] = [
  {
    fieldName: 'mustChangePassword',
    columnName: 'must_change_password',
    def: { type: 'BOOLEAN', notNull: true, defaultValue: false },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'accountType',
    columnName: 'account_type',
    def: { type: 'TEXT', notNull: true, defaultValue: 'permanent' },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'accountStatus',
    columnName: 'account_status',
    def: { type: 'TEXT', notNull: true, defaultValue: 'active' },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'accountExpiresAt',
    columnName: 'account_expires_at',
    def: { type: 'TIMESTAMP' },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'lastLoginAt',
    columnName: 'last_login_at',
    def: { type: 'TIMESTAMP' },
    select: true,
    create: false,
    update: false,
  },
  {
    fieldName: 'credentialVersion',
    columnName: 'credential_version',
    def: { type: 'TEXT', notNull: true, defaultValue: '' },
    select: true,
    create: false,
    update: false,
  },
  {
    fieldName: 'resetVersion',
    columnName: 'reset_version',
    def: { type: 'TEXT', notNull: true, defaultValue: '' },
    select: true,
    create: false,
    update: false,
  },
  {
    fieldName: 'resetHash',
    columnName: 'reset_hash',
    def: { type: 'TEXT' },
    select: true,
    create: false,
    update: false,
  },
  {
    fieldName: 'resetExpiresAt',
    columnName: 'reset_expires_at',
    def: { type: 'BIGINT' },
    select: true,
    create: false,
    update: false,
  },
  {
    fieldName: 'resetAttempts',
    columnName: 'reset_attempts',
    def: { type: 'INTEGER', notNull: true, defaultValue: 0 },
    select: true,
    create: false,
    update: false,
  },
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
    fieldName: 'loginLockoutVersion',
    columnName: 'login_lockout_version',
    def: { type: 'TEXT', notNull: true, defaultValue: 'initial' },
    select: true,
    create: false,
    update: false,
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
  const ready = await repo.ready()
  if (!ready.success)
    throw ready.error
  repo.create = guardIamMutation(repo.create.bind(repo), 1)
  repo.updateById = guardIamMutation(repo.updateById.bind(repo), 2)
  repo.deleteById = guardIamMutation(repo.deleteById.bind(repo), 1)
  repo.suspendInactive = guardIamStatement(repo.suspendInactive.bind(repo))
  repo.setPassword = guardIamStatement(repo.setPassword.bind(repo))
  repo.commitPasswordReset = guardIamStatement(repo.commitPasswordReset.bind(repo))
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

  ready(): Promise<HaiResult<void>> {
    return this.ensureSchema()
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
    const result = await reldb.sql.execute(`UPDATE ${TABLE_NAME} SET last_login_at = ? WHERE id = ?`, [
      reldb.config?.type === 'sqlite'
        ? Date.now()
        : new Date(),
      userId,
    ])
    return result.success
      ? core.ok(undefined)
      : this.buildQueryError(result.error, result.error)
  }

  async suspendInactive(cutoff: Date): Promise<HaiResult<number>> {
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET account_status = ?, credential_version = ?, reset_version = ?, reset_hash = NULL, reset_expires_at = NULL WHERE account_status = ? AND COALESCE(last_login_at, created_at) <= ?`,
      [
        'dormant',
        crypto.randomUUID(),
        crypto.randomUUID(),
        'active',
        reldb.config?.type === 'sqlite'
          ? cutoff.getTime()
          : cutoff,
      ],
    )
    return result.success
      ? core.ok(result.data.changes)
      : this.buildQueryError(result.error, result.error)
  }

  /** 改密推进凭据代际；会话存储清理失败也不能让旧凭据恢复授权。 */
  async setPassword(input: { userId: string, expectedVersion: string, passwordHash: string, mustChangePassword?: boolean }): Promise<HaiResult<boolean>> {
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET password_hash = ?, password_updated_at = ?, credential_version = ?, reset_version = ?, must_change_password = ?, reset_hash = NULL, reset_expires_at = NULL, reset_attempts = 0 WHERE id = ? AND credential_version = ?`,
      [
        input.passwordHash,
        reldb.config?.type === 'sqlite'
          ? Date.now()
          : new Date(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        reldb.config?.type === 'postgresql'
          ? input.mustChangePassword === true
          : Number(input.mustChangePassword === true),
        input.userId,
        input.expectedVersion,
      ],
    )
    return result.success
      ? core.ok(result.data.changes === 1)
      : this.buildQueryError(result.error, result.error)
  }

  /** 发布只替换读取到的重置代际；旧发送者暂停后不能覆盖接管节点的新令牌。 */
  async publishPasswordReset(input: { user: StoredUser, tokenHash: string, expiresAt: Date }): Promise<HaiResult<boolean>> {
    const expiry = input.expiresAt.getTime()
    if (!Number.isSafeInteger(expiry))
      return core.err(HaiIamError.INVALID_ARGUMENT, iamM('iam_resetTokenInvalid'))
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET reset_hash = ?, reset_expires_at = ?, reset_attempts = 0, reset_version = ? WHERE id = ? AND credential_version = ? AND reset_version = ? AND account_status = ? AND ? > ${this.databaseNow()}`,
      [
        input.tokenHash,
        expiry,
        crypto.randomUUID(),
        input.user.id,
        input.user.credentialVersion ?? '',
        input.user.resetVersion ?? '',
        'active',
        expiry,
      ],
    )
    return result.success
      ? core.ok(result.data.changes === 1)
      : this.buildQueryError(result.error, result.error)
  }

  /** 条件计次返回新代际；业务策略失败也消耗尝试次数。 */
  async claimPasswordReset(tokenHash: string, maxAttempts: number): Promise<HaiResult<StoredUser>> {
    const found = await this.findOneBy('reset_hash = ?', [tokenHash])
    if (!found.success)
      return found
    const user = found.data
    if (!user)
      return core.err(HaiIamError.RESET_TOKEN_INVALID, iamM('iam_resetTokenInvalid'))
    if (!isUserActive(user))
      return core.err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
    if ((user.resetAttempts ?? 0) >= maxAttempts)
      return core.err(HaiIamError.RESET_TOKEN_MAX_ATTEMPTS, iamM('iam_resetTokenMaxAttempts'))
    const version = crypto.randomUUID()
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET reset_attempts = reset_attempts + 1, reset_version = ? WHERE id = ? AND reset_hash = ? AND reset_version = ? AND credential_version = ? AND reset_attempts < ? AND reset_expires_at > ${this.databaseNow()} AND account_status = ?`,
      [
        version,
        user.id,
        tokenHash,
        user.resetVersion ?? '',
        user.credentialVersion ?? '',
        maxAttempts,
        'active',
      ],
    )
    if (!result.success)
      return this.buildQueryError(result.error, result.error)
    if (result.data.changes !== 1)
      return core.err(HaiIamError.RESET_TOKEN_INVALID, iamM('iam_resetTokenInvalid'))
    return core.ok({ ...user, resetVersion: version, resetAttempts: (user.resetAttempts ?? 0) + 1 })
  }

  /** 与新密码一同推进锁定代际，让迟到的失败计数继续停留在旧键中。 */
  async commitPasswordReset(input: { user: StoredUser, tokenHash: string, passwordHash: string }): Promise<HaiResult<boolean>> {
    const result = await reldb.sql.execute(
      `UPDATE ${TABLE_NAME} SET password_hash = ?, password_updated_at = ?, credential_version = ?, reset_version = ?, login_lockout_version = ?, must_change_password = FALSE, reset_hash = NULL, reset_expires_at = NULL, reset_attempts = 0 WHERE id = ? AND reset_hash = ? AND reset_version = ? AND credential_version = ? AND reset_expires_at > ${this.databaseNow()} AND account_status = ?`,
      [
        input.passwordHash,
        reldb.config?.type === 'sqlite'
          ? Date.now()
          : new Date(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        input.user.id,
        input.tokenHash,
        input.user.resetVersion ?? '',
        input.user.credentialVersion ?? '',
        'active',
      ],
    )
    return result.success
      ? core.ok(result.data.changes === 1)
      : this.buildQueryError(result.error, result.error)
  }

  async resetLoginFailures(userId: string, expectedCredentialVersion: string, lockoutEnabled = true): Promise<HaiResult<void>> {
    return reldb.tx.wrapResult(async (tx) => {
      // 持有账号行锁时核对原凭据仍有效，再清当前代计数，避免已撤销凭据清除新状态。
      const locked = await lockIamUser(tx, userId)
      if (!locked.success)
        return locked
      const user = await this.findById(userId, tx)
      if (!user.success)
        return user
      if (!user.data || !isUserActive(user.data))
        return core.err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
      if ((user.data.credentialVersion ?? '') !== expectedCredentialVersion)
        return core.err(HaiIamError.SESSION_INVALID, iamM('iam_sessionExpired'))
      return clearLoginFailures(user.data, lockoutEnabled)
    })
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

  async findByOtpContact(channel: 'email' | 'phone', identifier: string, tx?: DmlWithTxOperations): Promise<HaiResult<StoredUser | null>> {
    // SQL 只缩小候选范围；最终匹配同时规避各数据库大小写、空白与排序规则差异。
    // 手机号候选允许分隔符，邮箱候选允许首尾空白；非 ASCII 地址直接在应用侧折叠大小写。
    const ascii = [...identifier].every(character => character.charCodeAt(0) < 128)
    const where = channel === 'phone'
      ? 'phone LIKE ?'
      : ascii
        ? 'LOWER(REPLACE(REPLACE(email, \'I\', \'i\'), \'K\', \'k\')) LIKE ? ESCAPE \'!\''
        : 'email LIKE ?'
    const candidate = channel === 'phone'
      ? [...identifier].join('%')
      : ascii
        ? identifier.replace(/[!%_]/g, '!$&')
        : '@'
    const result = await this.findAll({
      where,
      params: [`%${candidate}%`],
    }, tx)
    if (!result.success)
      return this.buildQueryError(result.error, result.error)
    const matching = result.data.filter(user => normalizeIamContact(channel, user[channel]) === identifier)
    if (matching.length > 1)
      return core.err(HaiIamError.OTP_INVALID, iamM('iam_otpNotExistOrExpired'))
    return core.ok(matching[0] ?? null)
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
    return core.err(
      HaiIamError.REPOSITORY_ERROR,
      iamM('iam_queryUserFailed', {
        params: { message: error.message },
      }),
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
    return core.ok(result.data)
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
    return core.ok(result.data[0] ?? null)
  }
}
