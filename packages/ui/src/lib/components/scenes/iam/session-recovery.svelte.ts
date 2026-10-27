/** 会话失效时保留页面，以正常登录流程恢复原主体；不保存密码、请求体或凭据。 */
import type { AuthPanelConfig } from '../types.js'
import { untrack } from 'svelte'

/**
 * 页面级会话恢复控制器；同一时刻多个请求共享一次确认。
 * @example
 * ```ts
 * import { createSessionRecovery, type SessionRecovery } from '@h-ai/ui'
 * const recovery: SessionRecovery = createSessionRecovery()
 * recovery.configure(null)
 * const restored = await recovery.recover()
 * ```
 */
export interface SessionRecovery {
  readonly open: boolean
  readonly config: AuthPanelConfig | null
  readonly user: { id: string, username?: string } | undefined
  readonly version: number
  /** 在应用根布局同步公开配置及当前用户；退出/切换用户时取消原待恢复请求。 */
  configure: (config: AuthPanelConfig | null, user?: { id: string, username?: string }) => void
  /** 传给Kit/API client的recoverSession；没有已登录主体时不弹窗。 */
  recover: () => Promise<boolean>
  /** 仅在限定原userId的正常登录成功后调用。 */
  complete: (userId: string, version: number) => void
  /** 取消只中止原请求的恢复，不自动清空页面草稿。 */
  cancel: () => void
}

/**
 * 创建与SessionRecoveryDialog配套的页面级恢复控制器，不依赖具体业务路由。
 * @returns 只保留公开配置、原主体及单个等待Promise的控制器。
 * @example
 * ```ts
 * import { createSessionRecovery } from '@h-ai/ui'
 * const recovery = createSessionRecovery()
 * // 布局以 configure(publicConfig, currentUser) 装配；销毁时 cancel()。
 * recovery.cancel()
 * ```
 */
export function createSessionRecovery(): SessionRecovery {
  class Recovery implements SessionRecovery {
    open = $state(false)
    config = $state<AuthPanelConfig | null>(null)
    user = $state<{ id: string, username?: string }>()
    private pending?: Promise<boolean>
    private resolve?: (restored: boolean) => void
    private generation = 0
    get version(): number { return this.generation }

    configure(config: AuthPanelConfig | null, user?: { id: string, username?: string }): void {
      untrack(() => {
        if (this.user?.id !== user?.id)
          this.cancel()
      })
      this.config = config
      this.user = user
    }

    recover = async (): Promise<boolean> => {
      if (!this.user || !this.config)
        return false
      if (this.pending)
        return this.pending
      this.generation++
      this.open = true
      this.pending = new Promise((resolve) => {
        this.resolve = resolve
      })
      return this.pending
    }

    complete(userId: string, version: number): void {
      if (this.open && userId === this.user?.id && version === this.generation)
        this.finish(true)
    }

    cancel(): void { this.finish(false) }

    private finish(restored: boolean): void {
      this.generation++
      const resolve = this.resolve
      this.resolve = undefined
      this.pending = undefined
      this.open = false
      resolve?.(restored)
    }
  }
  return new Recovery()
}
