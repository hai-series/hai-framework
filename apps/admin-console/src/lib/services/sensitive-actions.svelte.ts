/** 再鉴别只保存当前页面待确认动作；密码与单次凭据不进入持久存储。 */
import * as m from '$lib/paraglide/messages.js'
import { apiFetch } from '$lib/utils/api'
import { authActions } from './auth.js'

class SensitiveActions {
  open = $state(false)
  loading = $state(false)
  error = $state('')
  private policy = { enabled: false, operations: [] as string[] }
  private operation = ''
  private generation = 0
  private resolve?: (ticket: string | null) => void

  configure(policy: { enabled: boolean, operations: string[] }): void {
    this.policy = policy
  }

  async authorize(operation: string): Promise<string | null | undefined> {
    if (!this.policy.enabled || !this.policy.operations.includes(operation))
      return undefined
    if (this.open)
      return null
    this.operation = operation
    this.generation++
    this.error = ''
    this.open = true
    return new Promise((resolve) => {
      this.resolve = resolve
    })
  }

  async submit(password: string): Promise<void> {
    if (!this.open || this.loading)
      return
    this.loading = true
    this.error = ''
    const operation = this.operation
    const generation = this.generation
    const pending = this.resolve
    try {
      const proof = await authActions.reauthenticate(password, operation)
      if (generation !== this.generation)
        return
      if (!proof.success) {
        this.error = proof.error.message
        return
      }
      this.resolve = undefined
      this.open = false
      pending?.(proof.data.ticket)
    }
    catch {
      if (generation === this.generation)
        this.error = m.common_network_error()
    }
    finally {
      if (generation === this.generation)
        this.loading = false
    }
  }

  cancel(): void {
    this.generation++
    const resolve = this.resolve
    this.resolve = undefined
    this.open = false
    this.loading = false
    this.error = ''
    resolve?.(null)
  }
}

export const sensitiveActions = new SensitiveActions()

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
