/**
 * @h-ai/capacitor — 推送通知
 *
 * 封装 `@capacitor/push-notifications` 插件，提供推送注册与消息监听。
 *
 * @module capacitor-push
 */

import type { HaiResult } from '@h-ai/core'
import type { PushNotificationCallbacks, PushRegistration } from './capacitor-types.js'
import { core, err, ok } from '@h-ai/core'
import { capacitorM } from './capacitor-i18n.js'
import { HaiCapacitorError } from './capacitor-types.js'

const logger = core.logger.child({ module: 'capacitor', scope: 'push' })

/**
 * 注册推送通知
 *
 * 请求推送权限并注册设备 Token。需要安装 `@capacitor/push-notifications`。
 * 注册超过 30 秒未响应时自动超时。
 *
 * @returns 设备推送 Token
 *
 * @example
 * ```ts
 * const result = await capacitor.push.register()
 * if (result.success) {
 *   await api.post('/push/register', { token: result.data.token })
 * }
 * ```
 */
export async function registerPush(): Promise<HaiResult<PushRegistration>> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // 请求权限
    const permResult = await PushNotifications.requestPermissions()
    if (permResult.receive !== 'granted') {
      return err(
        HaiCapacitorError.PUSH_REGISTER_FAILED,
        capacitorM('capacitor_pushRegisterFailed'),
      )
    }

    // 注册并等待 Token（带超时防护）
    const REGISTER_TIMEOUT_MS = 30_000
    const token = await new Promise<string>((resolve, reject) => {
      let settled = false
      let listeners: Array<{ remove: () => Promise<void> }> = []
      let timer: ReturnType<typeof setTimeout> | undefined

      async function cleanup(): Promise<void> {
        if (timer) {
          clearTimeout(timer)
        }
        const removeResults = await Promise.allSettled(listeners.map(listener => listener.remove()))
        const rejectedCount = removeResults.filter(result => result.status === 'rejected').length
        if (rejectedCount > 0) {
          logger.warn('Failed to remove push registration listeners', { rejectedCount })
        }
      }

      function settleWith(handler: (value: string | Error) => void, value: string | Error): void {
        if (settled)
          return

        settled = true
        void cleanup().finally(() => {
          handler(value)
        })
      }

      timer = setTimeout(() => {
        settleWith(reject as (value: string | Error) => void, new Error('Push registration timed out'))
      }, REGISTER_TIMEOUT_MS)

      void Promise.all([
        PushNotifications.addListener('registration', (t) => {
          settleWith(resolve as (value: string | Error) => void, t.value)
        }),
        PushNotifications.addListener('registrationError', (error) => {
          settleWith(reject as (value: string | Error) => void, error instanceof Error ? error : new Error(String(error)))
        }),
      ])
        .then(async (attachedListeners) => {
          listeners = attachedListeners
          if (settled)
            return

          await PushNotifications.register()
        })
        .catch((error) => {
          settleWith(reject as (value: string | Error) => void, error instanceof Error ? error : new Error(String(error)))
        })
    })

    return ok({ token })
  }
  catch (cause) {
    return err(
      HaiCapacitorError.PUSH_REGISTER_FAILED,
      capacitorM('capacitor_pushRegisterFailed'),
      cause,
    )
  }
}

/**
 * 监听推送通知事件
 *
 * @param callbacks - 回调配置（收到推送、点击推送）
 * @returns 包含清理函数的 HaiResult
 *
 * @example
 * ```ts
 * const result = await capacitor.push.listen({
 *   onReceived: (n) => handlePushReceived(n),
 *   onActionPerformed: (n) => router.goto('/notifications'),
 * })
 * if (result.success) {
 *   // 停止监听
 *   await result.data()
 * }
 * ```
 */
export async function listenPush(callbacks: PushNotificationCallbacks): Promise<HaiResult<() => Promise<void>>> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const listeners: Array<{ remove: () => Promise<void> }> = []

    if (callbacks.onReceived) {
      const listener = await PushNotifications.addListener(
        'pushNotificationReceived',
        (notification) => {
          callbacks.onReceived?.({
            id: notification.id,
            title: notification.title,
            body: notification.body,
            data: notification.data as Record<string, unknown>,
          })
        },
      )
      listeners.push(listener)
    }

    if (callbacks.onActionPerformed) {
      const listener = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action) => {
          callbacks.onActionPerformed?.({
            id: action.notification.id,
            title: action.notification.title,
            body: action.notification.body,
            data: action.notification.data as Record<string, unknown>,
          })
        },
      )
      listeners.push(listener)
    }

    const cleanup = async () => {
      const removeResults = await Promise.allSettled(listeners.map(listener => listener.remove()))
      const rejectedCount = removeResults.filter(result => result.status === 'rejected').length
      if (rejectedCount > 0) {
        logger.warn('Failed to remove push listeners', { rejectedCount })
      }
    }
    return ok(cleanup)
  }
  catch (cause) {
    return err(
      HaiCapacitorError.PUSH_LISTEN_FAILED,
      capacitorM('capacitor_pushListenFailed'),
      cause,
    )
  }
}
