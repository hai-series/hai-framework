/**
 * @h-ai/iam — 认证通用工具
 *
 * 提供认证策略中的通用校验与工具函数。
 * @module iam-authn-utils
 */

import type { HaiError, HaiResult } from '@h-ai/core'
import type { UserRepository } from '../user/iam-user-repository-user.js'
import type { StoredUser } from '../user/iam-user-types.js'
import type { LoginFailurePolicy } from './iam-authn-lockout.js'
import type { Credentials } from './iam-authn-types.js'
import { core } from '@h-ai/core'
import { crypto, HaiCryptoError } from '@h-ai/crypto'

import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'

export { checkAccountLock, type LoginFailurePolicy, recordLoginFailure } from './iam-authn-lockout.js'

/**
 * 认证和密码写入统一映射 Crypto 工作队列饱和，保留其余内部错误的原因。
 * @example 模块内部上下文
 * ```ts
 * const result = await crypto.password.hashAsync('example')
 * const mapped = result.success ? result : mapPasswordWorkError(result.error)
 * void mapped
 * ```
 */
export function mapPasswordWorkError(error: HaiError): HaiResult<never> {
  return error.code === HaiCryptoError.PASSWORD_BUSY.code
    ? core.err(HaiIamError.SECURITY_BUSY, iamM('iam_securityBusy'), error)
    : core.err(HaiIamError.INTERNAL_ERROR, error.message, error)
}

/**
 * 不存在、无本地口令或受限账号执行同类哈希工作后统一拒绝凭据，不验证受限账号密码。
 * @returns 凭据错误；底层哈希故障保留为内部错误，不能静默伪装成认证失败。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const rejected = await rejectMissingPasswordCredentials()
 * if (!rejected.success) {
 *   const code = rejected.error.code
 * }
 * ```
 */
export async function rejectMissingPasswordCredentials(): Promise<HaiResult<never>> {
  // 此固定值仅用于计算量填充，不作为任何账号、密钥或业务凭据保存。
  const padded = await crypto.password.hashAsync('dummy-password-to-prevent-timing-leak')
  if (!padded.success)
    return mapPasswordWorkError(padded.error)
  return core.err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))
}

/**
 * 校验凭证类型并进行类型收窄
 *
 * 确保传入的凭证对象的 type 字段与预期匹配，
 * 匹配成功后通过 TypeScript 类型收窄返回具体凭证类型。
 *
 * @param credentials - 统一凭证对象
 * @param type - 预期的凭证类型（'password' | 'otp' | 'ldap'）
 * @returns 类型匹配返回收窄后的凭证；不匹配返回 INVALID_CREDENTIALS 错误
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const result = ensureCredentialType({ type: 'password', identifier: 'alice', password: 'ExampleOnly123!' }, 'password')
 * if (!result.success)
 *   return result
 * return result.data.identifier
 * ```
 */
export function ensureCredentialType<TType extends Credentials['type']>(
  credentials: Credentials,
  type: TType,
): HaiResult<Extract<Credentials, { type: TType }>> {
  if (credentials.type !== type) {
    return core.err(
      HaiIamError.INVALID_CREDENTIALS,
      iamM('iam_credentialTypeMismatch'),
    )
  }
  return core.ok(credentials as Extract<Credentials, { type: TType }>)
}

/**
 * 重置登录失败计数
 *
 * 登录成功后在账号行锁内核对凭据并按策略清除共享状态。
 * 账户状态、凭据代际、共享锁定或存储检查失败时中止会话签发。
 *
 * @param userRepository - 用户存储实例
 * @param user - 当前用户数据
 * @param policy - 可选锁定开关；关闭时跳过共享锁定状态。
 * @returns 成功返回数据，失败返回业务或基础设施错误；调用方必须先判断 success。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function authenticated(repository: UserRepository, user: StoredUser) {
 *   const result = await resetLoginFailures(repository, user)
 *   if (!result.success)
 *     return result
 *   return result.data
 * }
 * ```
 */
export async function resetLoginFailures(
  userRepository: UserRepository,
  user: StoredUser,
  policy?: Pick<LoginFailurePolicy, 'lockoutEnabled'>,
): Promise<HaiResult<void>> {
  return userRepository.resetLoginFailures(user.id, user.credentialVersion ?? '', policy?.lockoutEnabled)
}
