/** 可选敏感操作再鉴别；由操作入口在现有权限/资源检查之后调用。 */
import type { IamFunctions } from '@h-ai/iam'
import type { RequestEvent } from '@sveltejs/kit'
import { getAccessToken } from '../kit-auth.js'
import { fromError } from '../kit-response.js'

/**
 * 要求选定操作携带短期单次再鉴别票据；失败抛出 Response，由 kit.handler 返回。
 * 不替代已有认证、权限与资源范围守卫；操作 ID 必须由服务端指定。
 * @param iam - 已初始化的 IAM 服务。
 * @param event - 当前请求与 Cookie，不能跨请求保存。
 * @param operation - 当前服务端操作 ID。
 * @returns 策略关闭、未选操作或证明校验成功时无返回值。
 * @example
 * ```ts
 * import { iam } from '@h-ai/iam'
 * import type { SessionLike } from '@h-ai/kit'
 * import type { RequestEvent } from '@sveltejs/kit'
 * import { kit } from '@h-ai/kit'
 * // session 由应用在当前请求完成鉴别后传入，不在跨请求闭包中保存。
 * async function remove(event: Pick<RequestEvent, 'request' | 'cookies'>, session: SessionLike) {
 *   kit.guard.require(session, 'user:delete')
 *   await kit.guard.requireSensitive(iam, event, 'iam.users.delete')
 *   return kit.response.ok({ allowed: true })
 * }
 * ```
 */
export async function requireSensitiveOperation(iam: IamFunctions, event: Pick<RequestEvent, 'request' | 'cookies'>, operation: string): Promise<void> {
  const policy = iam.publicConfig?.reauthentication
  if (!policy?.enabled || !policy.operations.includes(operation))
    return
  const checked = await iam.auth.checkSensitiveOperation(getAccessToken(event.request, event.cookies) ?? '', operation, event.request.headers.get('x-hai-reauthentication') ?? undefined)
  if (!checked.success)
    throw fromError(checked.error)
}
