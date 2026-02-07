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
import type { PasswordStrategy } from '../authn/password/iam-authn-password-strategy.js'
import type { AuthzManager } from '../authz/rbac/iam-authz-rbac-types.js'
import type { IamConfig } from '../iam-config.js'
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
import { err, ok } from '@hai/core'

import { AgreementConfigSchema, IamErrorCode, RegisterConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'
import { verifyPassword } from '../iam-initializer.js'
import { toUser } from './iam-user-utils.js'

/**
 * 用户服务依赖
 */
export interface UserServiceDeps {
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
 * @param deps - 依赖组件
 * @returns 用户操作接口
 */
export function createUserOperations(deps: UserServiceDeps): UserOperations {
  const {
    userRepository,
    passwordStrategy,
    sessionManager,
    authzManager,
    config,
  } = deps

  const registerConfig = RegisterConfigSchema.parse(config.register ?? {})
  const agreementConfig = AgreementConfigSchema.parse(config.agreements ?? {})

  function hasUpdateFields(data: Partial<User>): boolean {
    return Object.values(data).some(value => value !== undefined)
  }

  function mapRepositoryError(messageKey: Parameters<typeof iamM>[0], message: string) {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM(messageKey, { params: { message } }),
    })
  }

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

  return {
    async register(options: RegisterOptions): Promise<Result<RegisterResult, IamError>> {
      if (!registerConfig.enabled) {
        return err({
          code: IamErrorCode.REGISTER_DISABLED,
          message: iamM('iam_registerDisabled'),
        })
      }

      // 验证密码强度
      const validateResult = passwordStrategy.validatePassword(options.password)
      if (!validateResult.success) {
        return validateResult as Result<RegisterResult, IamError>
      }

      // 检查用户名是否存在
      const existsResult = await userRepository.existsByUsername(options.username)
      if (existsResult.success && existsResult.data) {
        return err({
          code: IamErrorCode.USER_ALREADY_EXISTS,
          message: iamM('iam_usernameAlreadyExist'),
        })
      }

      // 检查邮箱是否存在
      if (options.email) {
        const emailExistsResult = await userRepository.existsByEmail(options.email)
        if (emailExistsResult.success && emailExistsResult.data) {
          return err({
            code: IamErrorCode.USER_ALREADY_EXISTS,
            message: iamM('iam_emailAlreadyUsed'),
          })
        }
      }

      // 哈希密码
      const hashResult = passwordStrategy.hashPassword(options.password)
      if (!hashResult.success) {
        return hashResult as Result<RegisterResult, IamError>
      }

      // 创建用户
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
      })

      if (!createResult.success) {
        const errorMsg = createResult.error.message.toLowerCase()
        if (errorMsg.includes('unique') || errorMsg.includes('duplicate')) {
          return err({
            code: IamErrorCode.USER_ALREADY_EXISTS,
            message: iamM('iam_userAlreadyExist'),
          })
        }
        return mapRepositoryError('iam_createUserFailed', createResult.error.message)
      }

      const createdUserResult = await userRepository.findByUsername(options.username)
      if (!createdUserResult.success) {
        return createdUserResult as Result<RegisterResult, IamError>
      }

      if (!createdUserResult.data) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: iamM('iam_userNotExist'),
        })
      }

      const createdUser = createdUserResult.data

      // 分配默认角色
      if (config.rbac?.defaultRole) {
        const roleResult = await authzManager.getRole(config.rbac.defaultRole)
        if (roleResult.success && roleResult.data) {
          await authzManager.assignRole(createdUser.id, roleResult.data.id)
        }
      }

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

      const userResult = await userRepository.findById(verifyResult.data.sub)
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
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: iamM('iam_userNotExist'),
        })
      }

      const user = userResult.data

      // 验证旧密码
      if (!user.passwordHash) {
        return err({
          code: IamErrorCode.INVALID_CREDENTIALS,
          message: iamM('iam_accountNoPassword'),
        })
      }

      const verifyResult = verifyPassword(oldPassword, user.passwordHash)
      if (!verifyResult.success || !verifyResult.data) {
        return err({
          code: IamErrorCode.INVALID_CREDENTIALS,
          message: iamM('iam_originalPasswordWrong'),
        })
      }

      // 验证新密码强度
      const validateResult = passwordStrategy.validatePassword(newPassword)
      if (!validateResult.success) {
        return validateResult
      }

      // 哈希新密码
      const hashResult = passwordStrategy.hashPassword(newPassword)
      if (!hashResult.success) {
        return hashResult as Result<void, IamError>
      }

      // 更新密码
      const updateResult = await userRepository.updateById(userId, {
        passwordHash: hashResult.data,
        passwordUpdatedAt: new Date(),
      })

      if (!updateResult.success) {
        return mapRepositoryError('iam_updateUserFailed', updateResult.error.message)
      }

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
