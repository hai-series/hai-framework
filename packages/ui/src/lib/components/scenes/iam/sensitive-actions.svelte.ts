/** 敏感操作密码确认的页面级状态；网络传输及业务动作仍由宿主提供。 */
import type { HaiResult } from '@h-ai/core'
import { untrack } from 'svelte'
import { uiM } from '../../../messages.js'

/**
 * 二次认证动作；直接接受 Kit/API client 的 createAuthActions() 返回值。
 * @example
 * ```ts
 * import type { SensitiveActionsOptions } from '@h-ai/ui'
 * import { kit } from '@h-ai/kit'
 * const options: SensitiveActionsOptions = kit.client.createAuthActions()
 * ```
 */
export interface SensitiveActionsOptions {
  /** 验证当前账号密码，取得仅供指定操作使用的短期单次凭据。 */
  reauthenticate: (password: string, operation: string) => Promise<HaiResult<{ ticket: string }>>
  /** 标准动作可提供实时公开策略，权限表变更无需等待重新加载页面。 */
  publicConfig?: () => Promise<HaiResult<{ reauthentication?: { enabled: boolean, operations: string[] } } | null>>
}

/**
 * 绑定 ReauthenticationDialog 的状态与动作；每个应用根布局创建一份。
 * @example
 * ```ts
 * import { createSensitiveActions } from '@h-ai/ui'
 * import { kit } from '@h-ai/kit'
 * const confirmation = createSensitiveActions(kit.client.createAuthActions())
 * confirmation.configure({ enabled: true, operations: ['orders.approve'] })
 * confirmation.cancel()
 * ```
 */
export interface SensitiveActions {
  readonly open: boolean
  readonly loading: boolean
  readonly error: string
  /** 设置服务端公开策略；撤销当前操作时取消待确认动作。 */
  configure: (policy: { enabled: boolean, operations: readonly string[] }) => void
  /** undefined 表示无需确认，null 表示取消/忙，字符串为本次操作证明。 */
  authorize: (operation: string) => Promise<string | null | undefined>
  /** 提交当前密码；错误在弹窗内显示，重复点击不会重复请求。 */
  submit: (password: string) => Promise<void>
  /** 关闭弹窗或布局卸载时调用；迟到响应不能放行其他动作。 */
  cancel: () => void
}

/**
 * 创建可跨业务复用的敏感动作确认状态，与 ReauthenticationDialog 配套。
 * 密码不写入状态或存储；证明仅返回给 authorize 的对应调用者，不设置全局请求头。
 * @param options - Kit/API client 的标准认证动作，或同签名自定义动作。
 * @returns 页面级确认控制器；业务授权和凭据消费始终由服务端执行。
 * @example
 * ```ts
 * import { createSensitiveActions } from '@h-ai/ui'
 * import { kit } from '@h-ai/kit'
 * const confirmation = createSensitiveActions(kit.client.createAuthActions())
 * confirmation.configure({ enabled: false, operations: [] })
 * const ticket = await confirmation.authorize('orders.approve')
 * // null 时中止；有 ticket 时仅传给这一笔请求。
 * void ticket
 * ```
 */
export function createSensitiveActions(options: SensitiveActionsOptions): SensitiveActions {
  class Confirmation implements SensitiveActions {
    open = $state(false)
    loading = $state(false)
    error = $state('')
    private policy: { enabled: boolean, operations: readonly string[] } = { enabled: false, operations: [] }
    private operation = ''
    private generation = 0
    private resolve?: (ticket: string | null) => void

    configure(policy: { enabled: boolean, operations: readonly string[] }): void {
      this.policy = { enabled: policy.enabled, operations: [...policy.operations] }
      // configure 通常从宿主 $effect 调用；不要把弹窗状态变成该 effect 的依赖。
      untrack(() => {
        if (this.open && (!policy.enabled || !policy.operations.includes(this.operation)))
          this.cancel()
      })
    }

    async authorize(operation: string): Promise<string | null | undefined> {
      if (this.open)
        return null
      if (this.policy.enabled && options.publicConfig) {
        const current = await options.publicConfig()
        if (!current.success || !current.data)
          return null
        if (current.data.reauthentication)
          this.configure(current.data.reauthentication)
      }
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
        const proof = await options.reauthenticate(password, operation)
        if (generation !== this.generation)
          return
        if (!proof.success) {
          this.error = proof.error.message
          return
        }
        this.resolve = undefined
        this.operation = ''
        this.open = false
        pending?.(proof.data.ticket)
      }
      catch {
        if (generation === this.generation)
          this.error = uiM('auth_network_error')
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
      this.operation = ''
      this.open = false
      this.loading = false
      this.error = ''
      resolve?.(null)
    }
  }
  return new Confirmation()
}
