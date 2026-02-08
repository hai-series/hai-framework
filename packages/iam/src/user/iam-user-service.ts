/**
 * =============================================================================
 * @hai/iam - 用户服务
 * =============================================================================
 *
 * 提供用户管理相关操作的实现。
 *
 * @module user/iam-user-service
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { PasswordStrategy } from '../authn/password/iam-authn-password-strategy.js'
import type { AuthzManager } from '../authz/rbac/iam-authz-rbac-types.js'
import type { IamConfig, IamErrorCodeType } from '../iam-config.js'
import type { IamError } from '../iam-core-types.js'
import type { SessionManager } from '../session/iam-session-types.js'
import type { UserRepository } from './iam-user-repository-user.js'
import type {
  AgreementDisplay,
  RegisterOptions,
  RegisterResult,
  User,
  UserOperations,
} from './iam-user-types.js'
import { core, err, ok } from '@hai/core'

import { AgreementConfigSchema, IamErrorCode, RegisterConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { verifyPassword } from '../iam-initializer.js'
import { toUser } from './iam-user-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'user' })

/**
 * 用户服务依赖
 */
export interface UserServiceDeps {
  /** 数据库服务（用于事务支持） */
  db: DbService
  /** 用户存储 */
  userRepository: UserRepository
  /** 密码策略 */
  passwordStrategy: PasswordStrategy
  /** 会话管理器 */
  sessionManager: SessionManager
  /** 授权管理器 */
  authzManager: AuthzManager
  /** IAM 配置 */
  config: IamConfig
}

/**
 * 创建用户操作
 *
 * 将用户存储、密码策略、会话管理器、授权管理器组装成用户管理操作接口。
 * 包含注册、查询、更新、密码管理等全套用户生命周期操作。
 *
 * @param deps - 依赖组件（数据库、存储、策略、会话、授权、配置）
 * @returns 用户操作接口
 */
export function createUserOperations(deps: UserServiceDeps): UserOperations {
  const {
    db,
    userRepository,
    passwordStrategy,
    sessionManager,
    authzManager,
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
    const roleResult = await authzManager.getRole(config.rbac.defaultRole)
    if (roleResult.success && roleResult.data) {
      await authzManager.assignRole(userId, roleResult.data.id)
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
      const verifyResult = await sessionManager.verifyToken(accessToken)
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

    async listUsers(options?: PaginationOptionsInput): Promise<Result<PaginatedResult<User>, IamError>> {
      const usersResult = await userRepository.findPage({
        orderBy: 'created_at DESC',
        pagination: options,
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

      const verifyResult = verifyPassword(oldPassword, user.passwordHash)
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
