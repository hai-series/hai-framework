/**
 * =============================================================================
 * Admin Console - IAM 公开配置提取
 * =============================================================================
 *
 * 从 IAM 模块配置中提取安全子集（密码策略、注册开关、登录方式、协议链接等），
 * 供前端表单校验和页面渲染使用。
 *
 * 此方法在 (auth) 布局、admin 布局、公开 API 三处复用，
 * 修改一处即全部生效。
 * =============================================================================
 */

import { iam } from '@h-ai/iam'

/**
 * IAM 公开配置类型（传递给前端的安全子集）
 */
export interface IamPublicConfig {
  password: {
    minLength: number
    maxLength: number
    requireUppercase: boolean
    requireLowercase: boolean
    requireNumber: boolean
    requireSpecialChar: boolean
  }
  register: {
    enabled: boolean
  }
  login: {
    password: boolean
    otp: boolean
    ldap: boolean
  }
  agreements: {
    userAgreementUrl?: string
    privacyPolicyUrl?: string
    showOnRegister: boolean
    showOnLogin: boolean
  }
  session?: {
    maxAge: number
  }
}

/**
 * 构建 IAM 公开配置
 *
 * @param options - 配置选项
 * @param options.includeSession - 是否包含 session 相关配置（admin 布局和公开 API 需要，auth 布局不需要）
 */
export function buildIamPublicConfig(options?: { includeSession?: boolean }): IamPublicConfig {
  const iamConfig = iam.config
  const result: IamPublicConfig = {
    password: {
      minLength: iamConfig?.password?.minLength ?? 8,
      maxLength: iamConfig?.password?.maxLength ?? 128,
      requireUppercase: iamConfig?.password?.requireUppercase ?? true,
      requireLowercase: iamConfig?.password?.requireLowercase ?? true,
      requireNumber: iamConfig?.password?.requireNumber ?? true,
      requireSpecialChar: iamConfig?.password?.requireSpecialChar ?? false,
    },
    register: {
      enabled: iamConfig?.register?.enabled ?? true,
    },
    login: {
      password: iamConfig?.login?.password ?? true,
      otp: iamConfig?.login?.otp ?? true,
      ldap: iamConfig?.login?.ldap ?? true,
    },
    agreements: {
      userAgreementUrl: iamConfig?.agreements?.userAgreementUrl,
      privacyPolicyUrl: iamConfig?.agreements?.privacyPolicyUrl,
      showOnRegister: iamConfig?.agreements?.showOnRegister ?? true,
      showOnLogin: iamConfig?.agreements?.showOnLogin ?? false,
    },
  }

  if (options?.includeSession) {
    result.session = {
      maxAge: iamConfig?.session?.maxAge ?? 86400,
    }
  }

  return result
}
