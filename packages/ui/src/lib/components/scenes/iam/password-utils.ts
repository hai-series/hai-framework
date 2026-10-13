/**
 * @h-ai/ui — IAM 密码工具
 *
 * 密码规范化与一致性比较工具
 * @module password-utils
 */

/**
 * 规范化密码字符串
 * - 使用 NFKC 统一兼容字符
 */
import type { PasswordPolicy } from '../types.js'
import { uiM } from '../../../messages.js'

export function normalizePassword(value: string): string {
  return value.normalize('NFKC')
}

/**
 * 比较两次密码是否一致
 */
export function arePasswordsEqual(password: string, confirmPassword: string): boolean {
  return normalizePassword(password) === normalizePassword(confirmPassword)
}

/** 与 IAM 密码策略一致的前端提示；服务端仍执行最终校验。 */
export function passwordPolicyError(password: string, policy: PasswordPolicy): string {
  if (password.length < policy.minLength || password.length > policy.maxLength)
    return uiM('password_policy_length', { min: policy.minLength, max: policy.maxLength })
  if (policy.requireUppercase && !/[A-Z]/.test(password))
    return uiM('password_policy_uppercase')
  if (policy.requireLowercase && !/[a-z]/.test(password))
    return uiM('password_policy_lowercase')
  if (policy.requireNumber && !/\d/.test(password))
    return uiM('password_policy_number')
  if (policy.requireSpecialChar && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password))
    return uiM('password_policy_special')
  return ''
}

export function passwordPolicyHint(policy: PasswordPolicy): string {
  const requirements = [uiM('password_policy_length', { min: policy.minLength, max: policy.maxLength })]
  if (policy.requireUppercase)
    requirements.push(uiM('password_policy_uppercase'))
  if (policy.requireLowercase)
    requirements.push(uiM('password_policy_lowercase'))
  if (policy.requireNumber)
    requirements.push(uiM('password_policy_number'))
  if (policy.requireSpecialChar)
    requirements.push(uiM('password_policy_special'))
  return requirements.join(' · ')
}
