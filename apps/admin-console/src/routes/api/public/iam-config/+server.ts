/**
 * =============================================================================
 * Admin Console - 公开 API: IAM 配置
 * =============================================================================
 * 返回 IAM 的公开配置子集（密码策略、注册开关、登录方式、协议等），
 * 供前端表单校验和 UI 展示使用。
 * =============================================================================
 */

import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const GET = kit.handler(async () => {
  const iamConfig = iam.config
  return kit.response.ok({
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
    session: {
      maxAge: iamConfig?.session?.maxAge ?? 86400,
    },
  })
})
