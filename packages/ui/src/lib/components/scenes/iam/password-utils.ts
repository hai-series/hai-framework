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

/**
 * 按约定进行 Unicode 归一化，保留用户密码的空白字符。
 * @param value - 待处理或校验的值。
 * @returns 按约定 Unicode 形式归一化的密码，保留空白字符。
 *
 * @example 模块内部上下文
 * ```ts
 * const normalized = normalizePassword('Ａbcd1234!')
 * ```
 */
export function normalizePassword(value: string): string {
  return value.normalize('NFKC')
}

/**
 * 比较两次密码是否一致
 * @param password - 用户输入的密码，不能持久化为 UI 偏好。
 * @param confirmPassword - 再次输入的确认密码。
 * @returns 归一化后两次密码输入是否一致。
 *
 * @example 模块内部上下文
 * ```ts
 * const same = arePasswordsEqual('Ａbcd1234!', 'Abcd1234!')
 * ```
 */
export function arePasswordsEqual(password: string, confirmPassword: string): boolean {
  return normalizePassword(password) === normalizePassword(confirmPassword)
}

/**
 * 与 IAM 密码策略一致的前端提示；服务端仍执行最终校验。
 * @param password - 用户输入的密码，不能持久化为 UI 偏好。
 * @param policy - 服务端公开的密码策略。
 * @returns 第一项未满足策略的提示，全部满足时为空字符串。
 *
 * @example 模块内部上下文
 * ```ts
 * const message = passwordPolicyError('Example-pass-42!', { minLength: 12, maxLength: 128, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecialChar: true })
 * ```
 */
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
  const classes = [/[A-Z]/, /[a-z]/, /\d/, /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/].filter(pattern => pattern.test(password)).length
  if (classes < (policy.minCharacterClasses ?? 0))
    return uiM('password_policy_classes', { count: policy.minCharacterClasses ?? 0 })
  return ''
}

/**
 * 按当前 UI 语言说明服务端公开的密码策略。
 * @param policy - 服务端公开的密码策略。
 * @returns 按当前 UI 语言拼接的密码策略说明。
 *
 * @example 模块内部上下文
 * ```ts
 * const hint = passwordPolicyHint({ minLength: 12, maxLength: 128, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecialChar: true })
 * ```
 */
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
  if (policy.minCharacterClasses)
    requirements.push(uiM('password_policy_classes', { count: policy.minCharacterClasses }))
  return requirements.join(' · ')
}
