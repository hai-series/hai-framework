/** 再鉴别只保存当前页面待确认动作；密码与单次凭据不进入持久存储。 */
import * as m from '$lib/paraglide/messages.js'
import { apiFetch } from '$lib/utils/api'
import { createSensitiveActions } from '@h-ai/ui/components/scenes/iam/index'
import { authActions } from './auth.js'

export const sensitiveActions = createSensitiveActions(authActions)

/** 操作 ID 由调用点写明，与服务端守卫同名；取消时中止尚未发送的业务请求。 */
export async function sensitiveFetch(operation: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ticket = await sensitiveActions.authorize(operation)
  if (ticket === null)
    throw new Error(m.security_action_cancelled())
  const headers = new Headers(init?.headers)
  if (ticket)
    headers.set('x-hai-reauthentication', ticket)
  return apiFetch(input, { ...init, headers })
}
