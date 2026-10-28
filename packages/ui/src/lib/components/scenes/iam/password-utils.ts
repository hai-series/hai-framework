/**
 * @h-ai/ui — IAM 密码工具
 *
 * 密码原始字符串比较及策略提示工具
 * @module password-utils
 */

import type { PasswordPolicy } from '../types.js'
import { uiM } from '../../../messages.js'

/**
 * 与服务端一致，逐字符比较两次密码；不归一化、裁剪空白或改写凭据。
 * @param password - 用户输入的密码，不能持久化为 UI 偏好。
 * @param confirmPassword - 再次输入的确认密码。
 * @returns 两次密码的原始字符串是否完全一致。
 *
 * @example 模块内部上下文
 * ```ts
 * const same = arePasswordsEqual('Ａbcd1234!', 'Abcd1234!')
 * ```
 */
export function arePasswordsEqual(password: string, confirmPassword: string): boolean {
  return password === confirmPassword
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
