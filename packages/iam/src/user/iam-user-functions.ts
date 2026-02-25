/**
 * @hai/iam — 用户子功能工厂
 *
 * 提供用户管理相关操作：注册、查询、更新、密码管理等。
 */

import type { PaginatedResult, Result } from '@hai/core'
import type { DbFunctions } from '@hai/db'
import type { PasswordStrategy } from '../authn/password/iam-authn-password-strategy.js'
import type { IamAuthzFunctions } from '../authz/iam-authz-types.js'
import type { IamConfig, IamErrorCodeType } from '../iam-config.js'
import type { IamError } from '../iam-types.js'
import type { IamSessionFunctions } from '../session/iam-session-types.js'
import type { UserRepository } from './iam-user-repository-user.js'
import type {
  AgreementDisplay,
  IamUserFunctions,
  ListUsersOptions,
  RegisterOptions,
  RegisterResult,
  User,
} from './iam-user-types.js'
import { core, err, ok } from '@hai/core'
import { crypto } from '@hai/crypto'

import { AgreementConfigSchema, IamErrorCode, RegisterConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { createDbUserRepository } from './iam-user-repository-user.js'
import { toUser } from './iam-user-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'user' })

// ─── 子功能依赖 ───

/**
 * 用户子功能依赖
 */
export interface IamUserFunctionsDeps {
  config: IamConfig
  db: DbFunctions
  passwordStrategy: PasswordStrategy
  sessionFunctions: IamSessionFunctions
  authzFunctions: IamAuthzFunctions
}

/**
 * 创建用户子功能
 *
 * 内部创建用户存储，组装用户管理操作接口。
 */
export async function createIamUserFunctions(deps: IamUserFunctionsDeps): Promise<Result<IamUserFunctions, IamError>> {
  try {
    const { config, db, passwordStrategy, sessionFunctions, authzFunctions } = deps

    const userRepository = await createDbUserRepository(db)

    const functions = buildUserFunctions({
      db,
      userRepository,
      passwordStrategy,
      sessionFunctions,
      authzFunctions,
      config,
    })

    logger.info('User sub-feature initialized')
    return ok(functions)
  }
  catch (error) {
    logger.error('User sub-feature initialization failed', { error })
    return err({
      code: IamErrorCode.CONFIG_ERROR,
      message: iamM('iam_initComponentFailed'),
      cause: error,
    })
  }
}

// ─── 内部实现 ───

interface UserBuilderDeps {
  db: DbFunctions
  userRepository: UserRepository
  passwordStrategy: PasswordStrategy
  sessionFunctions: IamSessionFunctions
  authzFunctions: IamAuthzFunctions
  config: IamConfig
}

/**
 * 组装用户操作
 */
function buildUserFunctions(deps: UserBuilderDeps): IamUserFunctions {
  const {
    db,
    userRepository,
    passwordStrategy,
    sessionFunctions,
    authzFunctions,
    config,
  } = deps

  const registerConfig = RegisterConfigSchema.parse(config.register ?? {})
  const agreementConfig = AgreementConfigSchema.parse(config.agreements ?? {})

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
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM(messageKey, { params: { message } }),
    })
  }

  /**
   * 构建注册页协议展示信息
   *
   * 根据配置决定是否在注册时展示用户协议/隐私协议链接。
   *
   * @returns 协议展示信息，或 undefined（未启用时）
   */
  function buildAgreementDisplay(): AgreementDisplay | undefined {
    if (!agreementConfig.showOnRegister) {
      return undefined
    }
    if (!agreementConfig.userAgreementUrl && !agreementConfig.privacyPolicyUrl) {
      return undefined
    }
    return {
      userAgreementUrl: agreementConfig.userAgreementUrl,
      privacyPolicyUrl: agreementConfig.privacyPolicyUrl,
      showOnRegister: agreementConfig.showOnRegister,
      showOnLogin: agreementConfig.showOnLogin,
    }
  }

  /**
   * 校验注册前置条件
   *
   * 检查注册开关、密码强度、用户名/邮箱唯一性。
   *
   * @param options - 注册选项
   * @returns 校验通过返回 ok(undefined)，失败返回对应错误
   */
  async function validateRegisterPreconditions(options: RegisterOptions): Promise<Result<void, IamError>> {
    if (!registerConfig.enabled) {
      return err({ code: IamErrorCode.REGISTER_DISABLED, message: iamM('iam_registerDisabled') })
    }

    const validateResult = passwordStrategy.validatePassword(options.password)
    if (!validateResult.success)
      return validateResult

    const existsResult = await userRepository.existsByUsername(options.username)
    if (existsResult.success && existsResult.data) {
      return err({ code: IamErrorCode.USER_ALREADY_EXISTS, message: iamM('iam_usernameAlreadyExist') })
    }

    if (options.email) {
      const emailExistsResult = await userRepository.existsByEmail(options.email)
      if (emailExistsResult.success && emailExistsResult.data) {
        return err({ code: IamErrorCode.USER_ALREADY_EXISTS, message: iamM('iam_emailAlreadyUsed') })
      }
    }

    return ok(undefined)
  }

  /**
   * 为新用户分配默认角色
   *
   * 在事务外执行，失败不影响注册结果。
   *
   * @param userId - 新用户 ID
   */
  async function assignDefaultRole(userId: string): Promise<void> {
    if (!config.rbac?.defaultRole)
      return
    const roleResult = await authzFunctions.getRole(config.rbac.defaultRole)
    if (roleResult.success && roleResult.data) {
      await authzFunctions.assignRole(userId, roleResult.data.id)
    }
  }

  return {
    async register(options: RegisterOptions): Promise<Result<RegisterResult, IamError>> {
      // 校验前置条件
      const preResult = await validateRegisterPreconditions(options)
      if (!preResult.success)
        return preResult as Result<RegisterResult, IamError>

      // 哈希密码
      const hashResult = passwordStrategy.hashPassword(options.password)
      if (!hashResult.success)
        return hashResult as Result<RegisterResult, IamError>

      // 事务：创建用户 + 分配默认角色
      const txResult = await db.tx.wrap(async (tx) => {
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
          const errorMsg = createResult.error.message.toLowerCase()
          if (errorMsg.includes('unique') || errorMsg.includes('duplicate')) {
            throw Object.assign(new Error(iamM('iam_userAlreadyExist')), { code: IamErrorCode.USER_ALREADY_EXISTS })
          }
          throw Object.assign(new Error(createResult.error.message), { code: IamErrorCode.REPOSITORY_ERROR })
        }

        const createdUserResult = await userRepository.findByUsername(options.username, tx)
        if (!createdUserResult.success || !createdUserResult.data) {
          throw Object.assign(new Error(iamM('iam_userNotExist')), { code: IamErrorCode.USER_NOT_FOUND })
        }

        return createdUserResult.data
      })

      if (!txResult.success) {
        const cause = txResult.error.cause as { code?: IamErrorCodeType } | undefined
        const code = cause?.code ?? IamErrorCode.REPOSITORY_ERROR
        return err({ code, message: txResult.error.message, cause: txResult.error })
      }

      const createdUser = txResult.data

      // 分配默认角色（事务外，失败不影响注册结果）
      await assignDefaultRole(createdUser.id)

      logger.info('User registered', { userId: createdUser.id, username: options.username })
      return ok({
        user: toUser(createdUser),
        agreements: buildAgreementDisplay(),
      })
    },

    async getCurrentUser(accessToken: string): Promise<Result<User, IamError>> {
      const verifyResult = await sessionFunctions.verifyToken(accessToken)
      if (!verifyResult.success) {
        return verifyResult as Result<User, IamError>
      }

      const userResult = await userRepository.findById(verifyResult.data.userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as Result<User, IamError>
      }

      if (!userResult.data) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: iamM('iam_userNotExist'),
        })
      }

      return ok(toUser(userResult.data))
    },

    async getUser(userId: string): Promise<Result<User | null, IamError>> {
      const userResult = await userRepository.findById(userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as Result<User | null, IamError>
      }

      return ok(userResult.data ? toUser(userResult.data) : null)
    },

    async listUsers(options?: ListUsersOptions): Promise<Result<PaginatedResult<User>, IamError>> {
      const conditions: string[] = []
      const params: unknown[] = []

      if (options?.search) {
        const keyword = `%${options.search}%`
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
        return mapRepositoryError('iam_queryUserListFailed', usersResult.error.message) as Result<PaginatedResult<User>, IamError>
      }

      const items = usersResult.data.items.map(toUser)
      return ok({
        items,
        total: usersResult.data.total,
        page: usersResult.data.page,
        pageSize: usersResult.data.pageSize,
      })
    },

    async updateUser(userId: string, data: Partial<User>): Promise<Result<User, IamError>> {
      if (!hasUpdateFields(data)) {
        const currentResult = await userRepository.findById(userId)
        if (!currentResult.success) {
          return mapRepositoryError('iam_queryUserFailed', currentResult.error.message) as Result<User, IamError>
        }
        if (!currentResult.data) {
          return err({
            code: IamErrorCode.USER_NOT_FOUND,
            message: iamM('iam_userNotExist'),
          })
        }
        return ok(toUser(currentResult.data))
      }

      const updateResult = await userRepository.updateById(userId, data)
      if (!updateResult.success) {
        return mapRepositoryError('iam_updateUserFailed', updateResult.error.message) as Result<User, IamError>
      }

      if (updateResult.data.changes === 0) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: iamM('iam_userNotExist'),
        })
      }

      const updatedResult = await userRepository.findById(userId)
      if (!updatedResult.success) {
        return mapRepositoryError('iam_queryUserFailed', updatedResult.error.message) as Result<User, IamError>
      }
      if (!updatedResult.data) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: iamM('iam_userNotExist'),
        })
      }

      return ok(toUser(updatedResult.data))
    },

    async deleteUser(userId: string): Promise<Result<void, IamError>> {
      logger.debug('Deleting user', { userId })

      const userResult = await userRepository.findById(userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as Result<void, IamError>
      }
      if (!userResult.data) {
        return err({ code: IamErrorCode.USER_NOT_FOUND, message: iamM('iam_userNotExist') })
      }

      // 清理用户角色关联
      const rolesResult = await authzFunctions.getUserRoles(userId)
      if (rolesResult.success) {
        for (const role of rolesResult.data) {
          await authzFunctions.removeRole(userId, role.id)
        }
      }

      const deleteResult = await userRepository.deleteById(userId)
      if (!deleteResult.success) {
        return mapRepositoryError('iam_deleteUserFailed', deleteResult.error.message) as Result<void, IamError>
      }

      logger.info('User deleted', { userId })
      return ok(undefined)
    },

    async adminResetPassword(userId: string, newPassword: string): Promise<Result<void, IamError>> {
      logger.debug('Admin resetting user password', { userId })

      const userResult = await userRepository.findById(userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as Result<void, IamError>
      }
      if (!userResult.data) {
        return err({ code: IamErrorCode.USER_NOT_FOUND, message: iamM('iam_userNotExist') })
      }

      const validateResult = passwordStrategy.validatePassword(newPassword)
      if (!validateResult.success)
        return validateResult

      const hashResult = passwordStrategy.hashPassword(newPassword)
      if (!hashResult.success)
        return hashResult as Result<void, IamError>

      const updateResult = await userRepository.updateById(userId, {
        passwordHash: hashResult.data,
        passwordUpdatedAt: new Date(),
      })
      if (!updateResult.success) {
        return mapRepositoryError('iam_updateUserFailed', updateResult.error.message)
      }

      logger.info('Admin reset password', { userId })
      return ok(undefined)
    },

    async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<Result<void, IamError>> {
      // 获取用户
      const userResult = await userRepository.findById(userId)
      if (!userResult.success) {
        return mapRepositoryError('iam_queryUserFailed', userResult.error.message) as Result<void, IamError>
      }
      if (!userResult.data) {
        return err({ code: IamErrorCode.USER_NOT_FOUND, message: iamM('iam_userNotExist') })
      }

      const user = userResult.data

      // 验证旧密码
      if (!user.passwordHash) {
        return err({ code: IamErrorCode.INVALID_CREDENTIALS, message: iamM('iam_accountNoPassword') })
      }

      const verifyResult = crypto.password.verify(oldPassword, user.passwordHash)
      if (!verifyResult.success || !verifyResult.data) {
        return err({ code: IamErrorCode.INVALID_CREDENTIALS, message: iamM('iam_originalPasswordWrong') })
      }

      // 验证新密码强度
      const validateResult = passwordStrategy.validatePassword(newPassword)
      if (!validateResult.success)
        return validateResult

      // 哈希新密码
      const hashResult = passwordStrategy.hashPassword(newPassword)
      if (!hashResult.success)
        return hashResult as Result<void, IamError>

      // 更新密码
      const updateResult = await userRepository.updateById(userId, {
        passwordHash: hashResult.data,
        passwordUpdatedAt: new Date(),
      })
      if (!updateResult.success) {
        return mapRepositoryError('iam_updateUserFailed', updateResult.error.message)
      }

      logger.info('Password changed', { userId })
      return ok(undefined)
    },

    async requestPasswordReset(_identifier: string): Promise<Result<void, IamError>> {
      // TODO: 实现密码重置邮件发送
      return ok(undefined)
    },

    async confirmPasswordReset(_token: string, _newPassword: string): Promise<Result<void, IamError>> {
      // TODO: 实现密码重置确认
      return err({
        code: IamErrorCode.INTERNAL_ERROR,
        message: iamM('iam_featureNotImplemented'),
      })
    },

    validatePassword(password: string): Result<void, IamError> {
      return passwordStrategy.validatePassword(password)
    },
  }
}
