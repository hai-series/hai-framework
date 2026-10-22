/**
 * @h-ai/capacitor — Token 存储
 *
 * 基于原生安全存储插件的 TokenStorage 实现。
 * 仅在 Capacitor 原生环境启用，拒绝回退到不安全的 Web 存储。
 *
 * @module capacitor-token-storage
 */

import type { SecureStoragePlugin } from '@aparajita/capacitor-secure-storage'
import type { TokenStorage } from '@h-ai/api-client'
import type { HaiResult } from '@h-ai/core'
import { Preferences } from '@capacitor/preferences'
import { err, ok } from '@h-ai/core'
import { capacitorM } from './capacitor-i18n.js'
import { HaiCapacitorError } from './capacitor-types.js'

/** 原生安全存储 Key；普通 Preferences 不存放认证凭据。 */
const PREF_ACCESS_TOKEN = 'hai_access_token'
const PREF_REFRESH_TOKEN = 'hai_refresh_token'

/** 动态 import 自带模块缓存；不永久缓存平台检查失败或缺失插件的结果。 */
async function loadSecureStoragePlugin(): Promise<SecureStoragePlugin> {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform())
    throw new Error(capacitorM('capacitor_notAvailable'))
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
  return SecureStorage
}

/**
 * 创建基于原生安全存储的 TokenStorage
 *
 * 在原生 Android/iOS 环境下使用 `@aparajita/capacitor-secure-storage`
 * 保存 access token / refresh token。所有方法的存储/平台错误均通过 Promise 拒绝传播，
 * Web 调用明确失败，不做存储回退或伪成功。
 * `clear()` 一开始即屏蔽本实例旧凭据，删除失败时仍保持屏蔽；相应 key 成功写入后恢复读取。
 * 任一凭据写入失败也会屏蔽整对凭据，避免 access 已保存、refresh 失败时暴露半完成登录。
 * 本实例屏蔽不代表原生持久数据已删除；跨重启撤销仍依赖服务端退出/撤销会话。
 *
 * @returns TokenStorage 实例
 * @throws 返回适配器的方法在插件不可用或原生存储失败时拒绝 Promise。
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
  let credentialGeneration = 0
  let accessBlocked = false
  let refreshBlocked = false

  /** 使本代际的读取/写入资格失效；实例内屏蔽不声称原生数据已经删除。 */
  function blockCredentials(): void {
    credentialGeneration++
    accessBlocked = true
    refreshBlocked = true
  }

  /** 部分写入失败时撤销整对本地凭据，交由认证调用方显式重试持久清理。 */
  async function writeToken(key: typeof PREF_ACCESS_TOKEN | typeof PREF_REFRESH_TOKEN, token: string): Promise<void> {
    const writeGeneration = credentialGeneration
    try {
      const storage = await loadSecureStoragePlugin()
      await storage.setItem(key, token)
      if (writeGeneration === credentialGeneration) {
        if (key === PREF_ACCESS_TOKEN)
          accessBlocked = false
        else
          refreshBlocked = false
      }
    }
    catch (error) {
      if (writeGeneration === credentialGeneration)
        blockCredentials()
      throw error
    }
  }

  return {
    async getAccessToken(): Promise<string | null> {
      const readGeneration = credentialGeneration
      const storage = await loadSecureStoragePlugin()
      if (accessBlocked)
        return null
      const token = await storage.getItem(PREF_ACCESS_TOKEN)
      return accessBlocked || readGeneration !== credentialGeneration ? null : token
    },

    async getRefreshToken(): Promise<string | null> {
      const readGeneration = credentialGeneration
      const storage = await loadSecureStoragePlugin()
      if (refreshBlocked)
        return null
      const token = await storage.getItem(PREF_REFRESH_TOKEN)
      return refreshBlocked || readGeneration !== credentialGeneration ? null : token
    },

    async setAccessToken(token: string): Promise<void> {
      await writeToken(PREF_ACCESS_TOKEN, token)
    },

    async setRefreshToken(token: string): Promise<void> {
      await writeToken(PREF_REFRESH_TOKEN, token)
    },

    async clear(): Promise<void> {
      blockCredentials()
      const storage = await loadSecureStoragePlugin()
      // 等全部删除完成再报告失败，避免迟到的删除与下一次登录写入交错。
      const results = await Promise.allSettled([
        storage.removeItem(PREF_ACCESS_TOKEN),
        storage.removeItem(PREF_REFRESH_TOKEN),
      ])
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
      if (errors.length > 0)
        throw new AggregateError(errors, capacitorM('capacitor_secureStorageClearFailed'))
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
