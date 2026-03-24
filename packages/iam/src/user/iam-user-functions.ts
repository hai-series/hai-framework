/**
 * @h-ai/iam — 用户子功能工厂
 *
 * 提供用户管理相关操作：注册、查询、更新、密码管理等。
 * @module iam-user-functions
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { PasswordStrategyResult } from '../authn/password/iam-authn-password-strategy.js'
import type { AuthzOperations } from '../authz/iam-authz-types.js'
import type { IamConfig } from '../iam-config.js'
import type { SessionOperations } from '../session/iam-session-types.js'
import type { ResetTokenRepository } from './iam-user-repository-reset-token.js'
import type { UserRepository } from './iam-user-repository-user.js'
import type {
  AgreementDisplay,
  ListUsersOptions,
  RegisterOptions,
  RegisterResult,
  UpdateCurrentUserInput,
  User,
  UserOperations,
} from './iam-user-types.js'
import { core, err, ok } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { reldb } from '@h-ai/reldb'

import { AgreementConfigSchema, PasswordResetConfigSchema, RegisterConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'
import { createCacheResetTokenRepository } from './iam-user-repository-reset-token.js'
import { createDbUserRepository } from './iam-user-repository-user.js'
import { toUser } from './iam-user-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'user' })

// ─── 子功能依赖 ───

/**
 * 用户子功能依赖
 */
export interface UserOperationsDeps {
  config: IamConfig
  passwordStrategyResult: PasswordStrategyResult
  sessionFunctions: SessionOperations
  authzFunctions: AuthzOperations
  /** 密码重置令牌回调（由业务层注入） */
  onPasswordResetRequest?: (user: User, token: string, expiresAt: Date) => Promise<void>
}

/**
 * 创建用户子功能
 *
 * 内部创建用户存储，组装用户管理操作接口。
 */
export async function createUserOperations(deps: UserOperationsDeps): Promise<HaiResult<UserOperations>> {
  try {
    const { config, passwordStrategyResult, sessionFunctions, authzFunctions, onPasswordResetRequest } = deps

    const userRepository = await createDbUserRepository()
    const resetTokenRepository = createCacheResetTokenRepository()

    const functions = buildUserFunctions({
      userRepository,
      resetTokenRepository,
      passwordStrategyResult,
      sessionFunctions,
      authzFunctions,
      config,
      onPasswordResetRequest,
    })

    logger.info('User sub-feature initialized')
    return ok(functions)
  }
  catch (error) {
    logger.error('User sub-feature initialization failed', { error })
    return err(
      HaiIamError.CONFIG_ERROR,
      iamM('iam_initComponentFailed'),
      error,
    )
  }
}

// ─── 纯工具函数 ───

/**
 * 判断更新数据中是否包含有效字段
 *
 * @param data - 用户更新数据
 * @returns 包含至少一个非 undefined 字段返回 true
 */
function hasUpdateFields(data: Partial<User>): boolean {
  return Object.values(data).some(value => value !== undefined)
}

/**
 * 构建存储层错误响应
 *
 * @param messageKey - i18n 消息键
 * @param message - 原始错误消息
 * @returns 包含 REPOSITORY_ERROR 码的错误 Result
 */
function mapRepositoryError(messageKey: Parameters<typeof iamM>[0], message: string) {
  return err(
    HaiIamError.REPOSITORY_ERROR,
    iamM(messageKey, { params: { message } }),
  )
}

/**
 * 将底层更新错误转换为领域层 IAM 错误。
 *
 * @param message 底层错误消息
 * @returns 领域层错误结果
 */
function mapUpdateErrorAsDomainError(message: string): HaiResult<never> {
  const loweredMessage = message.toLowerCase()
  if (loweredMessage.includes('unique') || loweredMessage.includes('duplicate')) {
    return err(
      HaiIamError.USER_ALREADY_EXISTS,
      iamM('iam_userAlreadyExist'),
    )
  }

  return mapRepositoryError('iam_updateUserFailed', message)
}

/**
 * 更新用户前校验用户名和邮箱唯一性。
 *
 * @param userRepository - 用户仓库
 * @param userId - 用户 ID
 * @param data - 待更新用户字段
 * @returns 唯一性校验结果
 */
async function validateUniqueFieldsForUpdate(
  userRepository: UserRepository,
  userId: string,
  data: Partial<User>,
): Promise<HaiResult<void>> {
  const currentResult = await userRepository.findById(userId)
  if (!currentResult.success) {
    return mapRepositoryError('iam_queryUserFailed', currentResult.error.message) as HaiResult<void>
  }
  if (!currentResult.data) {
    return err(
      HaiIamError.USER_NOT_FOUND,
      iamM('iam_userNotExist'),
    )
  }

  if (data.username && data.username !== currentResult.data.username) {
    const usernameExistsResult = await userRepository.existsByUsername(data.username)
    if (!usernameExistsResult.success) {
      return mapRepositoryError('iam_queryUserFailed', usernameExistsResult.error.message) as HaiResult<void>
    }
    if (usernameExistsResult.data) {
      return err(
        HaiIamError.USER_ALREADY_EXISTS,
        iamM('iam_usernameAlreadyExist'),
      )
    }
  }

  if (data.email && data.email !== currentResult.data.email) {
    const emailExistsResult = await userRepository.existsByEmail(data.email)
    if (!emailExistsResult.success) {
      return mapRepositoryError('iam_queryUserFailed', emailExistsResult.error.message) as HaiResult<void>
    }
    if (emailExistsResult.data) {
      return err(
        HaiIamError.USER_ALREADY_EXISTS,
        iamM('iam_emailAlreadyUsed'),
      )
    }
  }

  return ok(undefined)
}

// ─── 内部实现 ───

/**
 * 子功能构建器共享上下文
 */
interface UserFnContext {
  userRepository: UserRepository
  resetTokenRepository: ResetTokenRepository
  validatePassword: (password: string) => HaiResult<void>
  hashPassword: (password: string) => HaiResult<string>
  sessionFunctions: SessionOperations
  authzFunctions: AuthzOperations
  config: IamConfig
  registerConfig: { enabled: boolean, defaultEnabled: boolean }
  agreementConfig: { showOnRegister: boolean, showOnLogin: boolean, userAgreementUrl?: string, privacyPolicyUrl?: string }
  onPasswordResetRequest?: (user: User, token: string, expiresAt: Date) => Promise<void>
}

// ─── 注册操作 ───

/**
 * 构建用户注册相关操作
 */
function buildRegistrationOps(ctx: UserFnContext): Pick<UserOperations, 'register' | 'validatePassword'> {
  const { userRepository, authzFunctions, config, registerConfig, agreementConfig } = ctx
  const { validatePassword, hashPassword } = ctx

  /**
   * 校验注册前置条件
   */
  async function validateRegisterPreconditions(options: RegisterOptions): Promise<HaiResult<void>> {
    if (!registerConfig.enabled) {
      return err(
        HaiIamError.REGISTER_DISABLED,
        iamM('iam_registerDisabled'),
      )
    }

    const validateResult = validatePassword(options.password)
    if (!validateResult.success)
      return validateResult

    const existsResult = await userRepository.existsByUsername(options.username)
    if (existsResult.success && existsResult.data) {
      return err(
        HaiIamError.USER_ALREADY_EXISTS,
        iamM('iam_usernameAlreadyExist'),
      )
    }

    if (options.email) {
      const emailExistsResult = await userRepository.existsByEmail(options.email)
      if (emailExistsResult.success && emailExistsResult.data) {
        return err(
          HaiIamError.USER_ALREADY_EXISTS,
          iamM('iam_emailAlreadyUsed'),
        )
      }
    }

    return ok(undefined)
  }

  /**
   * 构建注册页协议展示信息
   */
  function buildAgreementDisplay(): AgreementDisplay | undefined {
    if (!agreementConfig.showOnRegister)
      return undefined
    if (!agreementConfig.userAgreementUrl && !agreementConfig.privacyPolicyUrl)
      return undefined
    return {
      userAgreementUrl: agreementConfig.userAgreementUrl,
      privacyPolicyUrl: agreementConfig.privacyPolicyUrl,
      showOnRegister: agreementConfig.showOnRegister,
      showOnLogin: agreementConfig.showOnLogin,
    }
  }

  /**
   * 为新用户分配默认角色
   */
  async function assignDefaultRole(userId: string): Promise<void> {
    if (!config.rbac?.defaultRole)
      return
    const roleResult = await authzFunctions.getRoleByCode(config.rbac.defaultRole)
    if (roleResult.success && roleResult.data) {
      await authzFunctions.assignRole(userId, roleResult.data.id)
    }
  }

  return {
    async register(options: RegisterOptions): Promise<HaiResult<RegisterResult>> {
      // 校验前置条件
      const preResult = await validateRegisterPreconditions(options)
      if (!preResult.success)
        return preResult as HaiResult<RegisterResult>

      // 哈希密码
      const hashResult = hashPassword(options.password)
      if (!hashResult.success)
        return hashResult as HaiResult<RegisterResult>

      // 事务：创建用户
      const txResult = await reldb.tx.begin()
      if (!txResult.success) {
        return mapRepositoryError('iam_createUserFailed', txResult.error.message) as HaiResult<RegisterResult>
      }
      const tx = txResult.data

      const createResult = await userRepository.create({
        username: options.username,
        email: options.email,
        phone: options.phone,
        displayName: options.displayName,
        enabled: registerConfig.defaultEnabled,
        emailVerified: false,
        phoneVerified: false,
        passwordHash: hashResult.data,
        passwordUpdatedAt: new Date(),
        metadata: options.metadata,
      }, tx)

      if (!createResult.success) {
        await tx.rollback()
        return mapUpdateErrorAsDomainError(createResult.error.message) as HaiResult<RegisterResult>
      }

      const createdUserResult = await userRepository.findByUsername(options.username, tx)
      if (!createdUserResult.success || !createdUserResult.data) {
        await tx.rollback()
        return err(
          HaiIamError.USER_NOT_FOUND,
          iamM('iam_userNotExist'),
        )
      }

      const commitResult = await tx.commit()
      if (!commitResult.success) {
        return mapRepositoryError('iam_createUserFailed', commitResult.error.message) as HaiResult<RegisterResult>
      }

      const createdUser = createdUserResult.data

      // 分配默认角色（事务外，失败不影响注册结果）
      await assignDefaultRole(createdUser.id)

      logger.info('User registered', { userId: createdUser.id, username: options.username })
      return ok({
        user: toUser(createdUser),
        agreements: buildAgreementDisplay(),
      })
    },

    validatePassword(password: string): HaiResult<void> {
      return validatePassword(password)
    },
  }
}

// ─── 查询操作 ───

/**
 * 构建用户查询操作
 */
function buildUserQueryOps(ctx: UserFnContext): Pick<UserOperations, 'getCurrentUser' | 'getUser' | 'listUsers'> {
  const { userRepository, sessionFunctions, authzFunctions } = ctx

  return {
    async getCurrentUser(accessToken: string): Promise<HaiResult<User>> {
      const verifyResult = await sessionFunctions.verifyToken(accessToken)
      if (!verifyResult.success) {
        return verifyResult as HaiResult<User>
      }

      const userResult = await userRepository.findById(verifyResult.data.userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as HaiResult<User>
      }

      if (!userResult.data) {
        return err(
          HaiIamError.USER_NOT_FOUND,
          iamM('iam_userNotExist'),
        )
      }

      return ok(toUser(userResult.data))
    },

    async getUser(userId: string, options?: { include?: ('roles')[] }): Promise<HaiResult<User | null>> {
      const userResult = await userRepository.findById(userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as HaiResult<User | null>
      }

      if (!userResult.data) {
        return ok(null)
      }

      const user = toUser(userResult.data)

      if (options?.include?.includes('roles')) {
        const rolesResult = await authzFunctions.getUserRoles(userId)
        if (rolesResult.success) {
          user.roles = rolesResult.data
        }
      }

      return ok(user)
    },

    async listUsers(options?: ListUsersOptions): Promise<HaiResult<PaginatedResult<User>>> {
      const conditions: string[] = []
      const params: unknown[] = []

      if (options?.search) {
        // 转义 LIKE 通配符，防止用户输入 % 或 _ 产生非预期匹配
        const escaped = options.search.replace(/[%_\\]/g, '\\$&')
        const keyword = `%${escaped}%`
        conditions.push('(username LIKE ? OR email LIKE ? OR phone LIKE ? OR display_name LIKE ?)')
        params.push(keyword, keyword, keyword, keyword)
      }

      if (options?.enabled !== undefined) {
        conditions.push('enabled = ?')
        params.push(options.enabled ? 1 : 0)
      }

      const where = conditions.length > 0 ? conditions.join(' AND ') : undefined

      const usersResult = await userRepository.findPage({
        where,
        params: params.length > 0 ? params : undefined,
        orderBy: 'created_at DESC',
        pagination: options ? { page: options.page, pageSize: options.pageSize } : undefined,
      })
      if (!usersResult.success) {
        return mapRepositoryError('iam_queryUserListFailed', usersResult.error.message) as HaiResult<PaginatedResult<User>>
      }

      const items = usersResult.data.items.map(toUser)

      if (options?.include?.includes('roles') && items.length > 0) {
        const userIds = items.map(u => u.id)
        const rolesMapResult = await authzFunctions.getUserRolesForMany(userIds)
        if (rolesMapResult.success) {
          for (const user of items) {
            user.roles = rolesMapResult.data.get(user.id) ?? []
          }
        }
      }

      return ok({
        items,
        total: usersResult.data.total,
        page: usersResult.data.page,
        pageSize: usersResult.data.pageSize,
      })
    },
  }
}

// ─── 变更操作 ───

/**
 * 构建用户变更操作（更新、删除）
 */
function buildUserMutationOps(ctx: UserFnContext): Pick<UserOperations, 'updateCurrentUser' | 'updateUser' | 'deleteUser'> {
  const { userRepository, sessionFunctions, authzFunctions } = ctx

  return {
    async updateCurrentUser(accessToken: string, data: UpdateCurrentUserInput): Promise<HaiResult<User>> {
      const verifyResult = await sessionFunctions.verifyToken(accessToken)
      if (!verifyResult.success) {
        return verifyResult as HaiResult<User>
      }

      const userId = verifyResult.data.userId

      // 提取白名单字段，防止修改安全字段
      const safeData: Partial<User> = {}
      if (data.username !== undefined)
        safeData.username = data.username
      if (data.email !== undefined)
        safeData.email = data.email
      if (data.displayName !== undefined)
        safeData.displayName = data.displayName
      if (data.avatarUrl !== undefined)
        safeData.avatarUrl = data.avatarUrl
      if (data.phone !== undefined)
        safeData.phone = data.phone
      if (data.metadata !== undefined)
        safeData.metadata = data.metadata

      if (!hasUpdateFields(safeData)) {
        const currentResult = await userRepository.findById(userId)
        if (!currentResult.success) {
          return mapRepositoryError('iam_queryUserFailed', currentResult.error.message) as HaiResult<User>
        }
        if (!currentResult.data) {
          return err(
            HaiIamError.USER_NOT_FOUND,
            iamM('iam_userNotExist'),
          )
        }
        return ok(toUser(currentResult.data))
      }

      const uniqueResult = await validateUniqueFieldsForUpdate(userRepository, userId, safeData)
      if (!uniqueResult.success) {
        return uniqueResult as HaiResult<User>
      }

      const updateResult = await userRepository.updateById(userId, safeData)
      if (!updateResult.success) {
        return mapUpdateErrorAsDomainError(updateResult.error.message) as HaiResult<User>
      }

      if (updateResult.data.changes === 0) {
        return err(
          HaiIamError.USER_NOT_FOUND,
          iamM('iam_userNotExist'),
        )
      }
      const updatedResult = await userRepository.findById(userId)
      if (!updatedResult.success) {
        return mapRepositoryError('iam_queryUserFailed', updatedResult.error.message) as HaiResult<User>
      }
      if (!updatedResult.data) {
        return err(
          HaiIamError.USER_NOT_FOUND,
          iamM('iam_userNotExist'),
        )
      }

      return ok(toUser(updatedResult.data))
    },

    async updateUser(userId: string, data: Partial<User>): Promise<HaiResult<User>> {
      if (!hasUpdateFields(data)) {
        const currentResult = await userRepository.findById(userId)
        if (!currentResult.success) {
          return mapRepositoryError('iam_queryUserFailed', currentResult.error.message) as HaiResult<User>
        }
        if (!currentResult.data) {
          return err(
            HaiIamError.USER_NOT_FOUND,
            iamM('iam_userNotExist'),
          )
        }
        return ok(toUser(currentResult.data))
      }

      const uniqueResult = await validateUniqueFieldsForUpdate(userRepository, userId, data)
      if (!uniqueResult.success) {
        return uniqueResult as HaiResult<User>
      }

      const updateResult = await userRepository.updateById(userId, data)
      if (!updateResult.success) {
        return mapUpdateErrorAsDomainError(updateResult.error.message) as HaiResult<User>
      }

      if (updateResult.data.changes === 0) {
        return err(
          HaiIamError.USER_NOT_FOUND,
          iamM('iam_userNotExist'),
        )
      }

      // 禁用用户时注销所有活跃会话
      if (data.enabled === false) {
        await sessionFunctions.deleteByUserId(userId)
      }

      const updatedResult = await userRepository.findById(userId)
      if (!updatedResult.success) {
        return mapRepositoryError('iam_queryUserFailed', updatedResult.error.message) as HaiResult<User>
      }
      if (!updatedResult.data) {
        return err(
          HaiIamError.USER_NOT_FOUND,
          iamM('iam_userNotExist'),
        )
      }

      return ok(toUser(updatedResult.data))
    },

    async deleteUser(userId: string): Promise<HaiResult<void>> {
      logger.debug('Deleting user', { userId })

      const userResult = await userRepository.findById(userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as HaiResult<void>
      }
      if (!userResult.data) {
        return err(
          HaiIamError.USER_NOT_FOUND,
          iamM('iam_userNotExist'),
        )
      }

      const txResult = await reldb.tx.begin()
      if (!txResult.success) {
        return mapRepositoryError('iam_deleteUserFailed', txResult.error.message) as HaiResult<void>
      }
      const tx = txResult.data

      try {
        // 通过 authz 子模块清理用户角色关联
        const syncResult = await authzFunctions.syncRoles(userId, [], tx)
        if (!syncResult.success) {
          await tx.rollback()
          return mapRepositoryError('iam_deleteUserFailed', syncResult.error.message) as HaiResult<void>
        }

        // 删除用户记录
        const deleteResult = await userRepository.deleteById(userId, tx)
        if (!deleteResult.success) {
          await tx.rollback()
          return mapRepositoryError('iam_deleteUserFailed', deleteResult.error.message) as HaiResult<void>
        }

        const commitResult = await tx.commit()
        if (!commitResult.success) {
          return mapRepositoryError('iam_deleteUserFailed', commitResult.error.message) as HaiResult<void>
        }
      }
      catch (error) {
        await tx.rollback()
        return err(
          HaiIamError.REPOSITORY_ERROR,
          iamM('iam_deleteUserFailed', { params: { message: String(error) } }),
          error,
        )
      }

      // 事务提交后：最佳努力清理会话
      await sessionFunctions.deleteByUserId(userId)

      logger.info('User deleted', { userId })
      return ok(undefined)
    },
  }
}

// ─── 密码变更操作 ───

/**
 * 构建密码变更操作（管理员重置、用户改密）
 */
function buildPasswordChangeOps(ctx: UserFnContext): Pick<UserOperations, 'adminResetPassword' | 'changePassword' | 'changeCurrentUserPassword'> {
  const { userRepository, sessionFunctions } = ctx
  const { validatePassword, hashPassword } = ctx

  return {
    async adminResetPassword(userId: string, newPassword: string): Promise<HaiResult<void>> {
      logger.debug('Admin resetting user password', { userId })

      const userResult = await userRepository.findById(userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as HaiResult<void>
      }
      if (!userResult.data) {
        return err(
          HaiIamError.USER_NOT_FOUND,
          iamM('iam_userNotExist'),
        )
      }

      const validateResult = validatePassword(newPassword)
      if (!validateResult.success)
        return validateResult

      const hashResult = hashPassword(newPassword)
      if (!hashResult.success)
        return hashResult as HaiResult<void>

      const updateResult = await userRepository.updateById(userId, {
        passwordHash: hashResult.data,
        passwordUpdatedAt: new Date(),
      })
      if (!updateResult.success) {
        return mapRepositoryError('iam_updateUserFailed', updateResult.error.message)
      }

      // 密码重置后注销该用户所有活跃会话
      await sessionFunctions.deleteByUserId(userId)

      logger.info('Admin reset password', { userId })
      return ok(undefined)
    },

    async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<HaiResult<void>> {
      // 获取用户
      const userResult = await userRepository.findById(userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as HaiResult<void>
      }
      if (!userResult.data) {
        return err(
          HaiIamError.USER_NOT_FOUND,
          iamM('iam_userNotExist'),
        )
      }

      const user = userResult.data

      // 验证旧密码
      if (!user.passwordHash) {
        return err(
          HaiIamError.INVALID_CREDENTIALS,
          iamM('iam_accountNoPassword'),
        )
      }

      const verifyResult = crypto.password.verify(oldPassword, user.passwordHash)
      if (!verifyResult.success || !verifyResult.data) {
        return err(
          HaiIamError.INVALID_CREDENTIALS,
          iamM('iam_originalPasswordWrong'),
        )
      }

      // 验证新密码强度
      const validateResult = validatePassword(newPassword)
      if (!validateResult.success)
        return validateResult

      // 哈希新密码
      const hashResult = hashPassword(newPassword)
      if (!hashResult.success)
        return hashResult as HaiResult<void>

      // 更新密码
      const updateResult = await userRepository.updateById(userId, {
        passwordHash: hashResult.data,
        passwordUpdatedAt: new Date(),
      })
      if (!updateResult.success) {
        return mapRepositoryError('iam_updateUserFailed', updateResult.error.message)
      }

      // 密码修改后注销该用户所有活跃会话
      await sessionFunctions.deleteByUserId(userId)

      logger.info('Password changed', { userId })
      return ok(undefined)
    },

    /**
     * 通过访问令牌定位当前用户并执行改密。
     *
     * @param accessToken 访问令牌
     * @param oldPassword 原密码
     * @param newPassword 新密码
     * @returns 改密执行结果
     */
    async changeCurrentUserPassword(accessToken: string, oldPassword: string, newPassword: string): Promise<HaiResult<void>> {
      const verifyResult = await sessionFunctions.verifyToken(accessToken)
      if (!verifyResult.success) {
        return verifyResult as HaiResult<void>
      }

      return this.changePassword(verifyResult.data.userId, oldPassword, newPassword)
    },
  }
}

// ─── 密码重置操作 ───

/**
 * 构建密码重置操作（请求重置、确认重置）
 */
function buildPasswordResetOps(ctx: UserFnContext): Pick<UserOperations, 'requestPasswordReset' | 'confirmPasswordReset'> {
  const { userRepository, resetTokenRepository, sessionFunctions, config, onPasswordResetRequest } = ctx
  const { validatePassword, hashPassword } = ctx

  return {
    async requestPasswordReset(identifier: string): Promise<HaiResult<void>> {
      logger.debug('Password reset requested', { identifier })

      const resetConfig = PasswordResetConfigSchema.parse(config.passwordReset ?? {})

      // 根据标识符查找用户
      const userResult = await userRepository.findByIdentifier(identifier)
      if (!userResult.success) {
        // 防止用户枚举：无论是否查找失败都返回 ok
        logger.warn('Failed to look up user for password reset', { identifier })
        return ok(undefined)
      }
      if (!userResult.data) {
        // 防止用户枚举：用户不存在也返回 ok
        logger.debug('User not found for password reset, returning ok to prevent enumeration', { identifier })
        return ok(undefined)
      }

      const user = toUser(userResult.data)

      // 生成令牌
      const token = globalThis.crypto.randomUUID()
      const expiresAt = new Date(Date.now() + resetConfig.tokenExpiresIn * 1000)

      // 保存新令牌（saveToken 内部重置尝试次数）
      const saveResult = await resetTokenRepository.saveToken(token, user.id, expiresAt)
      if (!saveResult.success) {
        return saveResult
      }

      // 通过回调通知业务层（如发送邮件）
      if (onPasswordResetRequest) {
        try {
          await onPasswordResetRequest(user, token, expiresAt)
        }
        catch (callbackError) {
          logger.error('Password reset callback failed', { userId: user.id, error: callbackError })
          // 回调失败不影响令牌生成，仍返回成功
        }
      }
      else {
        logger.warn('No password reset callback configured, token will not be delivered to user', { userId: user.id })
      }

      logger.info('Password reset token generated', { userId: user.id })
      return ok(undefined)
    },

    async confirmPasswordReset(token: string, newPassword: string): Promise<HaiResult<void>> {
      logger.debug('Confirming password reset')

      const resetConfig = PasswordResetConfigSchema.parse(config.passwordReset ?? {})

      // 先验证新密码强度（不消耗尝试次数）
      const validateResult = validatePassword(newPassword)
      if (!validateResult.success)
        return validateResult

      // 验证令牌并获取 userId（自动递增尝试次数、超限自动删除令牌）
      const tokenResult = await resetTokenRepository.tryGetUserByToken(token, resetConfig.maxAttempts)
      if (!tokenResult.success) {
        return tokenResult as HaiResult<void>
      }

      const userId = tokenResult.data

      // 查找用户
      const userResult = await userRepository.findById(userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as HaiResult<void>
      }
      if (!userResult.data) {
        return err(
          HaiIamError.USER_NOT_FOUND,
          iamM('iam_userNotExist'),
        )
      }

      // 哈希新密码
      const hashResult = hashPassword(newPassword)
      if (!hashResult.success)
        return hashResult as HaiResult<void>

      // 更新密码
      const updateResult = await userRepository.updateById(userId, {
        passwordHash: hashResult.data,
        passwordUpdatedAt: new Date(),
      })
      if (!updateResult.success) {
        return mapRepositoryError('iam_updateUserFailed', updateResult.error.message)
      }

      // 删除已使用的令牌
      await resetTokenRepository.removeToken(token)

      // 注销该用户所有活跃会话
      await sessionFunctions.deleteByUserId(userId)

      logger.info('Password reset confirmed', { userId })
      return ok(undefined)
    },
  }
}

// ─── 组装 ───

/**
 * 组装用户操作
 *
 * 将注册、查询、变更、密码管理四类子操作组合为统一的 UserOperations。
 */
function buildUserFunctions(deps: UserBuilderDeps): UserOperations {
  const { validatePassword, hashPassword } = deps.passwordStrategyResult

  const ctx: UserFnContext = {
    ...deps,
    validatePassword,
    hashPassword,
    registerConfig: RegisterConfigSchema.parse(deps.config.register ?? {}),
    agreementConfig: AgreementConfigSchema.parse(deps.config.agreements ?? {}),
  }

  return {
    ...buildRegistrationOps(ctx),
    ...buildUserQueryOps(ctx),
    ...buildUserMutationOps(ctx),
    ...buildPasswordChangeOps(ctx),
    ...buildPasswordResetOps(ctx),
  }
}

interface UserBuilderDeps {
  userRepository: UserRepository
  resetTokenRepository: ResetTokenRepository
  passwordStrategyResult: PasswordStrategyResult
  sessionFunctions: SessionOperations
  authzFunctions: AuthzOperations
  config: IamConfig
  onPasswordResetRequest?: (user: User, token: string, expiresAt: Date) => Promise<void>
}
