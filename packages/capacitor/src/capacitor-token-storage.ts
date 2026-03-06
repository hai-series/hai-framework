/**
 * @h-ai/capacitor — Token 存储
 *
 * 基于 Capacitor Preferences 的 TokenStorage 实现，
 * 比浏览器 localStorage 更安全，适用于原生 App 场景。
 *
 * @module capacitor-token-storage
 */

import type { TokenStorage } from '@h-ai/api-client'
import type { Result } from '@h-ai/core'
import type { CapacitorError } from './capacitor-types.js'
import { Preferences } from '@capacitor/preferences'
import { core, err, ok } from '@h-ai/core'
import { CapacitorErrorCode } from './capacitor-config.js'
import { capacitorM } from './capacitor-i18n.js'

const logger = core.logger.child({ module: 'capacitor', scope: 'token-storage' })

/** Preferences 存储 Key */
const PREF_ACCESS_TOKEN = 'hai_access_token'
const PREF_REFRESH_TOKEN = 'hai_refresh_token'

/**
 * 创建基于 Capacitor Preferences 的 TokenStorage
 *
 * 使用 `@capacitor/preferences` 插件进行持久化存储，
 * 在 Android 使用 SharedPreferences，iOS 使用 UserDefaults，
 * 比 localStorage 有更好的安全性。
 *
 * @returns TokenStorage 实例
 *
 * @example
 * ```ts
 * import { createCapacitorTokenStorage } from '@h-ai/capacitor'
 * import { api } from '@h-ai/api-client'
 *
 * await api.init({
 *   baseUrl: 'https://api.example.com/v1',
 *   auth: {
 *     storage: createCapacitorTokenStorage(),
 *     refreshUrl: '/auth/refresh',
 *   },
 * })
 * ```
 */
export function createCapacitorTokenStorage(): TokenStorage {
  return {
    async getAccessToken(): Promise<string | null> {
      try {
        const { value } = await Preferences.get({ key: PREF_ACCESS_TOKEN })
        return value
      }
      catch (error) {
        logger.error('Failed to get access token from Preferences', { error })
        return null
      }
    },

    async getRefreshToken(): Promise<string | null> {
      try {
        const { value } = await Preferences.get({ key: PREF_REFRESH_TOKEN })
        return value
      }
      catch (error) {
        logger.error('Failed to get refresh token from Preferences', { error })
        return null
      }
    },

    async setAccessToken(token: string): Promise<void> {
      try {
        await Preferences.set({ key: PREF_ACCESS_TOKEN, value: token })
      }
      catch (error) {
        logger.error('Failed to set access token in Preferences', { error })
      }
    },

    async setRefreshToken(token: string): Promise<void> {
      try {
        await Preferences.set({ key: PREF_REFRESH_TOKEN, value: token })
      }
      catch (error) {
        logger.error('Failed to set refresh token in Preferences', { error })
      }
    },

    async clear(): Promise<void> {
      try {
        await Promise.all([
          Preferences.remove({ key: PREF_ACCESS_TOKEN }),
          Preferences.remove({ key: PREF_REFRESH_TOKEN }),
        ])
      }
      catch (error) {
        logger.error('Failed to clear tokens from Preferences', { error })
      }
    },
  }
}

/**
 * 安全读取 Preference 值（返回 Result）
 *
 * @param key - Preference Key
 * @returns Result 包裹的值
 */
export async function safeGetPreference(key: string): Promise<Result<string | null, CapacitorError>> {
  try {
    const { value } = await Preferences.get({ key })
    return ok(value)
  }
  catch (cause) {
    return err({
      code: CapacitorErrorCode.PREFERENCES_GET_FAILED,
      message: capacitorM('capacitor_preferencesGetFailed'),
      cause,
    })
  }
}

/**
 * 安全写入 Preference 值
 *
 * @param key - Preference Key
 * @param value - 要写入的值
 * @returns Result
 */
export async function safeSetPreference(key: string, value: string): Promise<Result<void, CapacitorError>> {
  try {
    await Preferences.set({ key, value })
    return ok(undefined)
  }
  catch (cause) {
    return err({
      code: CapacitorErrorCode.PREFERENCES_SET_FAILED,
      message: capacitorM('capacitor_preferencesSetFailed'),
      cause,
    })
  }
}

/**
 * 安全删除 Preference 值
 *
 * @param key - Preference Key
 * @returns Result
 */
export async function safeRemovePreference(key: string): Promise<Result<void, CapacitorError>> {
  try {
    await Preferences.remove({ key })
    return ok(undefined)
  }
  catch (cause) {
    return err({
      code: CapacitorErrorCode.PREFERENCES_REMOVE_FAILED,
      message: capacitorM('capacitor_preferencesRemoveFailed'),
      cause,
    })
  }
}
