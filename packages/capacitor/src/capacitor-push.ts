/**
 * @h-ai/capacitor — 推送通知
 *
 * 封装 `@capacitor/push-notifications` 插件，提供推送注册与消息监听。
 *
 * @module capacitor-push
 */

import type { Result } from '@h-ai/core'
import type { CapacitorError, PushNotificationCallbacks, PushRegistration } from './capacitor-types.js'
import { err, ok } from '@h-ai/core'
import { CapacitorErrorCode } from './capacitor-config.js'
import { capacitorM } from './capacitor-i18n.js'

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
export async function registerPush(): Promise<Result<PushRegistration, CapacitorError>> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // 请求权限
    const permResult = await PushNotifications.requestPermissions()
    if (permResult.receive !== 'granted') {
      return err({
        code: CapacitorErrorCode.PUSH_REGISTER_FAILED,
        message: capacitorM('capacitor_pushRegisterFailed'),
      })
    }

    // 注册并等待 Token（带超时防护）
    const REGISTER_TIMEOUT_MS = 30_000
    const token = await new Promise<string>((resolve, reject) => {
      let regListener: { remove: () => Promise<void> } | undefined
      let errListener: { remove: () => Promise<void> } | undefined

      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('Push registration timed out'))
      }, REGISTER_TIMEOUT_MS)

      function cleanup() {
        clearTimeout(timer)
        regListener?.remove()
        errListener?.remove()
      }

      PushNotifications.addListener('registration', (t) => {
        cleanup()
        resolve(t.value)
      }).then((l) => { regListener = l })

      PushNotifications.addListener('registrationError', (error) => {
        cleanup()
        reject(error)
      }).then((l) => { errListener = l })

      PushNotifications.register()
    })

    return ok({ token })
  }
  catch (cause) {
    return err({
      code: CapacitorErrorCode.PUSH_REGISTER_FAILED,
      message: capacitorM('capacitor_pushRegisterFailed'),
      cause,
    })
  }
}

/**
 * 监听推送通知事件
 *
 * @param callbacks - 回调配置（收到推送、点击推送）
 * @returns 包含清理函数的 Result
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
export async function listenPush(callbacks: PushNotificationCallbacks): Promise<Result<() => Promise<void>, CapacitorError>> {
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
      await Promise.all(listeners.map(l => l.remove()))
    }
    return ok(cleanup)
  }
  catch (cause) {
    return err({
      code: CapacitorErrorCode.PUSH_LISTEN_FAILED,
      message: capacitorM('capacitor_pushListenFailed'),
      cause,
    })
  }
}
