/** 登录许可只依赖配置、服务端时间和宿主可信地址；规则在初始化时编译。 */
import type { HaiResult } from '@h-ai/core'
import type { IamConfig } from '../iam-config.js'
import type { AuthRequestContext } from './iam-authn-types.js'
import { core, err, ok } from '@h-ai/core'
import { iamM } from '../iam-i18n.js'
import { HaiIamError } from '../iam-types.js'

/**
 * 创建单个 IAM 实例的登录许可检查器。
 * @param policy - 已由 Schema 校验的策略。
 * @returns 使用可信上下文与服务端时钟的检查函数。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const check = createLoginAccessCheck(undefined)
 * const allowed = check({ ip: '192.0.2.10' })
 * ```
 */
export function createLoginAccessCheck(policy: IamConfig['loginAccess']): (context?: AuthRequestContext) => HaiResult<void> {
  if (!policy?.enabled)
    return () => ok(undefined)
  const { enabled: _enabled, ...condition } = policy
  const check = core.access.createConditionCheck(condition)
  return context => check(context?.ip).allowed ? ok(undefined) : err(HaiIamError.LOGIN_ACCESS_DENIED, iamM('iam_loginAccessDenied'))
}
