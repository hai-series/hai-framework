/**
 * =============================================================================
 * hai Admin Console - 认证页面布局服务端
 * =============================================================================
 * 将 IAM 公开配置传递给认证相关页面（登录、注册、重置密码等）
 * =============================================================================
 */

import type { LayoutServerLoad } from './$types'
import { iam } from '@h-ai/iam'

export const load: LayoutServerLoad = async () => {
  const iamConfig = iam.config
  return {
    iamPublicConfig: {
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
    },
  }
}
