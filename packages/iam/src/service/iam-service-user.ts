/**
 * =============================================================================
 * @hai/iam - 用户服务
 * =============================================================================
 *
 * 提供用户管理相关操作的实现。
 * 将用户管理逻辑从 iam-main.ts 中提取出来。
 *
 * @module service/iam-service-user
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { IamConfig } from '../iam-config.js'
import type {
  AuthzManager,
  AgreementDisplay,
  IamError,
  RegisterOptions,
  RegisterResult,
  SessionManager,
  StoredUser,
  User,
  UserOperations,
  UserRepository,
} from '../iam-types.js'
import type { PasswordStrategy } from '../strategy/index.js'
import { err, ok } from '@hai/core'

import { AgreementConfigSchema, IamErrorCode, RegisterConfigSchema } from '../iam-config.js'
import { getIamMessage } from '../iam-i18n.js'
import { verifyPassword } from './iam-service-initializer.js'

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
          message: getIamMessage('iam_registerDisabled'),
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
          message: getIamMessage('iam_usernameAlreadyExist'),
        })
      }

      // 检查邮箱是否存在
      if (options.email) {
        const emailExistsResult = await userRepository.existsByEmail(options.email)
        if (emailExistsResult.success && emailExistsResult.data) {
          return err({
            code: IamErrorCode.USER_ALREADY_EXISTS,
            message: getIamMessage('iam_emailAlreadyUsed'),
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
        return createResult as Result<RegisterResult, IamError>
      }

      // 分配默认角色
      if (config.rbac?.defaultRole) {
        const roleResult = await authzManager.getRole(config.rbac.defaultRole)
        if (roleResult.success && roleResult.data) {
          await authzManager.assignRole(createResult.data.id, roleResult.data.id)
        }
      }

      return ok({
        user: toUser(createResult.data),
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
        return userResult as Result<User, IamError>
      }

      if (!userResult.data) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: getIamMessage('iam_userNotExist'),
        })
      }

      return ok(toUser(userResult.data))
    },

    async getUser(userId: string): Promise<Result<User | null, IamError>> {
      const userResult = await userRepository.findById(userId)
      if (!userResult.success) {
        return userResult as Result<User | null, IamError>
      }

      return ok(userResult.data ? toUser(userResult.data) : null)
    },

    async listUsers(): Promise<Result<User[], IamError>> {
      const usersResult = await userRepository.findAll()
      if (!usersResult.success) {
        return usersResult as Result<User[], IamError>
      }

      return ok(usersResult.data.map(toUser))
    },

    async updateUser(userId: string, data: Partial<User>): Promise<Result<User, IamError>> {
      const updateResult = await userRepository.update(userId, data)
      if (!updateResult.success) {
        return updateResult as Result<User, IamError>
      }

      return ok(toUser(updateResult.data))
    },

    async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<Result<void, IamError>> {
      // 获取用户
      const userResult = await userRepository.findById(userId)
      if (!userResult.success || !userResult.data) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: getIamMessage('iam_userNotExist'),
        })
      }

      const user = userResult.data

      // 验证旧密码
      if (!user.passwordHash) {
        return err({
          code: IamErrorCode.INVALID_CREDENTIALS,
          message: getIamMessage('iam_accountNoPassword'),
        })
      }

      const verifyResult = verifyPassword(oldPassword, user.passwordHash)
      if (!verifyResult.success || !verifyResult.data) {
        return err({
          code: IamErrorCode.INVALID_CREDENTIALS,
          message: getIamMessage('iam_originalPasswordWrong'),
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
      await userRepository.update(userId, {
        passwordHash: hashResult.data,
        passwordUpdatedAt: new Date(),
      })

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
        message: getIamMessage('iam_featureNotImplemented'),
      })
    },

    validatePassword(password: string): Result<void, IamError> {
      return passwordStrategy.validatePassword(password)
    },
  }
}
