/**
 * @h-ai/capacitor — 推送通知及其受管监听生命周期。
 * @module capacitor-push
 */
import type { PluginListenerHandle } from '@capacitor/core'
import type { HaiResult } from '@h-ai/core'
import type { PushCleanup, PushNotificationCallbacks, PushOptions, PushRegistration } from './capacitor-types.js'
import { core, err, ok } from '@h-ai/core'
import { capacitorM } from './capacitor-i18n.js'
import { HaiCapacitorError } from './capacitor-types.js'

const logger = core.logger.child({ module: 'capacitor', scope: 'push' })

/** 两类推送流程共用的资源所有权；关闭立即停止回调，迟到 handle 仍必须回收。 */
interface PushScope {
  readonly signal: AbortSignal
  assertOpen: () => void
  attach: (add: () => Promise<PluginListenerHandle>) => Promise<void>
  wait: <T>(operation: () => Promise<T>) => Promise<T>
  finishSetup: () => void
  dispose: () => Promise<void>
}

const activeScopes = new Set<PushScope>()

/** 为一次注册/监听建立所有权，不使用 removeAllListeners 影响其他消费者。 */
function createPushScope(options?: PushOptions): PushScope {
  let scope: PushScope
  const controller = new AbortController()
  const handles = new Set<PluginListenerHandle>()
  const removals = new Map<PluginListenerHandle, Promise<void>>()
  let pending = 0
  let closing: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancelled = () => new Error(capacitorM('capacitor_pushCancelled'))

  function releaseIfComplete(): void {
    if (controller.signal.aborted && pending === 0 && handles.size === 0)
      activeScopes.delete(scope)
  }

  function remove(handle: PluginListenerHandle): Promise<void> {
    const current = removals.get(handle)
    if (current)
      return current
    const removal = Promise.resolve().then(() => handle.remove()).then(() => {
      handles.delete(handle)
    }).finally(() => {
      removals.delete(handle)
      releaseIfComplete()
    })
    removals.set(handle, removal)
    return removal
  }

  function finishSetup(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  function dispose(): Promise<void> {
    controller.abort()
    finishSetup()
    options?.signal?.removeEventListener('abort', onAbort)
    if (closing)
      return closing
    closing = Promise.allSettled([...handles].map(remove)).then((results) => {
      releaseIfComplete()
      if (results.some(result => result.status === 'rejected'))
        throw new Error(capacitorM('capacitor_pushCleanupFailed'))
    }).finally(() => { closing = undefined })
    return closing
  }

  function onAbort(): void {
    void dispose().catch(() => logger.warn('Push listener cleanup failed; retry cleanup or capacitor.close'))
  }

  scope = {
    signal: controller.signal,
    assertOpen() {
      if (controller.signal.aborted)
        throw cancelled()
    },
    async attach(add) {
      scope.assertOpen()
      pending++
      try {
        const handle = await add()
        handles.add(handle)
        if (controller.signal.aborted) {
          await remove(handle)
          throw cancelled()
        }
      }
      finally {
        pending--
        releaseIfComplete()
      }
    },
    async wait(operation) {
      scope.assertOpen()
      let interrupt: (() => void) | undefined
      const aborted = new Promise<never>((_, reject) => {
        interrupt = () => reject(cancelled())
        controller.signal.addEventListener('abort', interrupt, { once: true })
      })
      try {
        return await Promise.race([Promise.resolve().then(operation), aborted])
      }
      finally {
        if (interrupt)
          controller.signal.removeEventListener('abort', interrupt)
      }
    },
    finishSetup,
    dispose,
  }
  activeScopes.add(scope)
  timer = setTimeout(onAbort, 30_000)
  options?.signal?.addEventListener('abort', onAbort, { once: true })
  if (options?.signal?.aborted)
    onAbort()
  return scope
}

/** 原生能力必须实际存在；Web 插件不可作为 FCM/APNs 注册证明。 */
async function loadPushPlugin() {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform())
    throw new Error(capacitorM('capacitor_notAvailable'))
  return (await import('@capacitor/push-notifications')).PushNotifications
}

/**
 * 关闭模块所拥有的全部推送监听器；失败句柄保留以便再次 close 重试。
 * @returns 全部移除成功，或 PUSH_CLEANUP_FAILED；迟到句柄到达时立即移除。
 * @example const closed = await closePushListeners(); if (!closed.success) await closePushListeners()
 */
export async function closePushListeners(): Promise<HaiResult<void>> {
  const results = await Promise.allSettled([...activeScopes].map(scope => scope.dispose()))
  return results.some(result => result.status === 'rejected')
    ? err(HaiCapacitorError.PUSH_CLEANUP_FAILED, capacitorM('capacitor_pushCleanupFailed'))
    : ok(undefined)
}

/**
 * 注册原生推送 Token；30 秒包含权限、挂载监听器与原生注册等待。
 * 部分失败、超时、AbortSignal 和模块关闭都会回收已知及迟到句柄。
 * @param options - 可选取消信号；取消返回失败结果，不注册后续原生操作。
 * @returns 真实原生插件返回的 token 或 PUSH_REGISTER_FAILED。
 * @example
 * const controller = new AbortController()
 * const result = await capacitor.push.register({ signal: controller.signal })
 * if (result.success) await api.post('/push/register', { token: result.data.token })
 */
export async function registerPush(options?: PushOptions): Promise<HaiResult<PushRegistration>> {
  const scope = createPushScope(options)
  try {
    const token = await scope.wait(async () => {
      const push = await loadPushPlugin()
      scope.assertOpen()
      const permission = await push.requestPermissions()
      scope.assertOpen()
      if (permission.receive !== 'granted')
        throw new Error(capacitorM('capacitor_pushRegisterFailed'))
      let resolveToken!: (value: string) => void
      let rejectToken!: (reason: Error) => void
      const tokenResult = new Promise<string>((resolve, reject) => {
        resolveToken = resolve
        rejectToken = reject
      })
      // 在触发 register 之前就订阅结果，避免同步插件回调丢失或未处理拒绝。
      const setup = async () => {
        await scope.attach(() => push.addListener('registration', (result) => {
          if (!scope.signal.aborted)
            resolveToken(result.value)
        }))
        await scope.attach(() => push.addListener('registrationError', () => {
          if (!scope.signal.aborted)
            rejectToken(new Error(capacitorM('capacitor_pushRegisterFailed')))
        }))
        scope.assertOpen()
        await push.register()
      }
      return (await Promise.all([setup(), tokenResult]))[1]
    })
    await scope.dispose()
    return ok({ token })
  }
  catch (cause) {
    await scope.dispose().catch(() => logger.warn('Push registration cleanup failed; retry capacitor.close'))
    return err(HaiCapacitorError.PUSH_REGISTER_FAILED, capacitorM('capacitor_pushRegisterFailed'), cause)
  }
}

/**
 * 监听原生推送事件；设置阶段限时 30 秒，之后由 cleanup、信号或模块关闭结束。
 * @param callbacks - 收到消息与点击消息的回调。
 * @param options - 可选取消信号，监听建立后仍有效。
 * @returns 幂等清理函数；清理失败可见且可重试，关闭后立即停止业务回调。
 * @example
 * const result = await capacitor.push.listen({ onReceived: notification => showNotice(notification) })
 * if (result.success) {
 *   const cleaned = await result.data()
 *   if (!cleaned.success) await result.data()
 * }
 */
export async function listenPush(callbacks: PushNotificationCallbacks, options?: PushOptions): Promise<HaiResult<PushCleanup>> {
  const scope = createPushScope(options)
  try {
    await scope.wait(async () => {
      const push = await loadPushPlugin()
      scope.assertOpen()
      if (callbacks.onReceived) {
        await scope.attach(() => push.addListener('pushNotificationReceived', (notification) => {
          if (!scope.signal.aborted)
            callbacks.onReceived?.({ id: notification.id, title: notification.title, body: notification.body, data: notification.data as Record<string, unknown> })
        }))
      }
      if (callbacks.onActionPerformed) {
        await scope.attach(() => push.addListener('pushNotificationActionPerformed', (action) => {
          if (!scope.signal.aborted)
            callbacks.onActionPerformed?.({ id: action.notification.id, title: action.notification.title, body: action.notification.body, data: action.notification.data as Record<string, unknown> })
        }))
      }
    })
    scope.assertOpen()
    scope.finishSetup()
    return ok(async () => {
      try {
        await scope.dispose()
        return ok(undefined)
      }
      catch (cause) {
        return err(HaiCapacitorError.PUSH_CLEANUP_FAILED, capacitorM('capacitor_pushCleanupFailed'), cause)
      }
    })
  }
  catch (cause) {
    await scope.dispose().catch(() => logger.warn('Push setup cleanup failed; retry capacitor.close'))
    return err(HaiCapacitorError.PUSH_LISTEN_FAILED, capacitorM('capacitor_pushListenFailed'), cause)
  }
}
