/**
 * @h-ai/capacitor — Token 存储
 *
 * 基于原生安全存储插件的 TokenStorage 实现。
 * 仅在 Capacitor 原生环境启用，拒绝回退到不安全的 Web 存储。
 *
 * @module capacitor-token-storage
 */

import type { TokenStorage } from '@h-ai/api-client'
import type { HaiResult } from '@h-ai/core'
import { Preferences } from '@capacitor/preferences'
import { core, err, ok } from '@h-ai/core'
import { capacitorM } from './capacitor-i18n.js'
import { HaiCapacitorError } from './capacitor-types.js'

const logger = core.logger.child({ module: 'capacitor', scope: 'token-storage' })

interface SecureStoragePluginLike {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

/** Preferences 存储 Key */
const PREF_ACCESS_TOKEN = 'hai_access_token'
const PREF_REFRESH_TOKEN = 'hai_refresh_token'

let secureStoragePromise: Promise<SecureStoragePluginLike | null> | null = null
let secureStorageWarningLogged = false

function logSecureStorageUnavailable(reason: string, error?: unknown): void {
  if (secureStorageWarningLogged)
    return

  secureStorageWarningLogged = true
  logger.warn('Capacitor secure token storage unavailable; token persistence is disabled', {
    reason,
    error,
  })
}

async function loadSecureStoragePlugin(): Promise<SecureStoragePluginLike | null> {
  if (!secureStoragePromise) {
    secureStoragePromise = (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) {
          logSecureStorageUnavailable('non-native-platform')
          return null
        }

        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
        return SecureStorage
      }
      catch (error) {
        logSecureStorageUnavailable('plugin-load-failed', error)
        return null
      }
    })()
  }

  return secureStoragePromise
}

/**
 * 创建基于原生安全存储的 TokenStorage
 *
 * 在原生 Android/iOS 环境下使用 `@aparajita/capacitor-secure-storage`
 * 保存 access token / refresh token；Web 环境不做不安全回退。
 *
 * @returns TokenStorage 实例
 *
 * @example
 * ```ts
 * import { createCapacitorTokenStorage } from '@h-ai/capacitor'
 * import { apiClient } from '@h-ai/api-client'
 *
 * await apiClient.init({
 *   baseUrl: 'https://api.example.com/v1',
 *   auth: {
 *     storage: createCapacitorTokenStorage(),
 *     refreshPath: '/auth/refresh',
 *   },
 * })
 * ```
 */
export function createCapacitorTokenStorage(): TokenStorage {
  return {
    async getAccessToken(): Promise<string | null> {
      try {
        const storage = await loadSecureStoragePlugin()
        if (!storage)
          return null

        return await storage.getItem(PREF_ACCESS_TOKEN)
      }
      catch (error) {
        logger.error('Failed to get access token from secure storage', { error })
        return null
      }
    },

    async getRefreshToken(): Promise<string | null> {
      try {
        const storage = await loadSecureStoragePlugin()
        if (!storage)
          return null

        return await storage.getItem(PREF_REFRESH_TOKEN)
      }
      catch (error) {
        logger.error('Failed to get refresh token from secure storage', { error })
        return null
      }
    },

    async setAccessToken(token: string): Promise<void> {
      try {
        const storage = await loadSecureStoragePlugin()
        if (!storage)
          return

        await storage.setItem(PREF_ACCESS_TOKEN, token)
      }
      catch (error) {
        logger.error('Failed to set access token in secure storage', { error })
      }
    },

    async setRefreshToken(token: string): Promise<void> {
      try {
        const storage = await loadSecureStoragePlugin()
        if (!storage)
          return

        await storage.setItem(PREF_REFRESH_TOKEN, token)
      }
      catch (error) {
        logger.error('Failed to set refresh token in secure storage', { error })
      }
    },

    async clear(): Promise<void> {
      try {
        const storage = await loadSecureStoragePlugin()
        if (!storage)
          return

        await Promise.all([
          storage.removeItem(PREF_ACCESS_TOKEN),
          storage.removeItem(PREF_REFRESH_TOKEN),
        ])
      }
      catch (error) {
        logger.error('Failed to clear tokens from secure storage', { error })
      }
    },
  }
}

/**
 * 安全读取 Preference 值（返回 HaiResult）
 *
 * @param key - Preference Key
 * @returns HaiResult 包裹的值
 *
 * @example
 * ```ts
 * const result = await capacitor.preferences.get('my_key')
 * if (result.success) {
 *   result.data // 值或 null
 * }
 * ```
 */
export async function safeGetPreference(key: string): Promise<HaiResult<string | null>> {
  try {
    const { value } = await Preferences.get({ key })
    return ok(value)
  }
  catch (cause) {
    return err(
      HaiCapacitorError.PREFERENCES_GET_FAILED,
      capacitorM('capacitor_preferencesGetFailed'),
      cause,
    )
  }
}

/**
 * 安全写入 Preference 值
 *
 * @param key - Preference Key
 * @param value - 要写入的值
 * @returns HaiResult
 *
 * @example
 * ```ts
 * await capacitor.preferences.set('my_key', 'value')
 * ```
 */
export async function safeSetPreference(key: string, value: string): Promise<HaiResult<void>> {
  try {
    await Preferences.set({ key, value })
    return ok(undefined)
  }
  catch (cause) {
    return err(
      HaiCapacitorError.PREFERENCES_SET_FAILED,
      capacitorM('capacitor_preferencesSetFailed'),
      cause,
    )
  }
}

/**
 * 安全删除 Preference 值
 *
 * @param key - Preference Key
 * @returns HaiResult
 *
 * @example
 * ```ts
 * await capacitor.preferences.remove('my_key')
 * ```
 */
export async function safeRemovePreference(key: string): Promise<HaiResult<void>> {
  try {
    await Preferences.remove({ key })
    return ok(undefined)
  }
  catch (cause) {
    return err(
      HaiCapacitorError.PREFERENCES_REMOVE_FAILED,
      capacitorM('capacitor_preferencesRemoveFailed'),
      cause,
    )
  }
}
