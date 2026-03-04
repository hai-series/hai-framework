/**
 * @h-ai/capacitor — 模块入口（生命周期管理）
 *
 * 提供 Capacitor 原生桥接的初始化与环境检测。
 * `capacitor.init()` 应在应用启动时调用，用于检测 Capacitor 环境可用性。
 *
 * @module capacitor-main
 */

import type { Result } from '@h-ai/core'
import type { CapacitorError } from './capacitor-types.js'
import { err, ok } from '@h-ai/core'
import { capacitorM } from './capacitor-i18n.js'
import { CapacitorErrorCode } from './capacitor-types.js'

/** 是否已初始化 */
let initialized = false

/**
 * 检测 Capacitor 是否可用
 *
 * @returns true 表示运行在 Capacitor 环境中
 */
export function isCapacitorAvailable(): boolean {
  try {
    return typeof window !== 'undefined'
      && (window as unknown as Record<string, unknown>).Capacitor !== undefined
  }
  catch {
    return false
  }
}

/**
 * Capacitor 模块服务对象
 *
 * @example
 * ```ts
 * import { capacitor } from '@h-ai/capacitor'
 *
 * const result = await capacitor.init()
 * if (result.success) {
 *   // Capacitor 环境就绪
 * }
 * ```
 */
export const capacitor = {
  /**
   * 初始化 Capacitor 模块
   *
   * 检测 Capacitor 环境可用性，不依赖任何配置文件。
   * 应在应用启动时（如 +layout.svelte onMount）调用。
   *
   * @returns Result
   */
  async init(): Promise<Result<void, CapacitorError>> {
    if (initialized) {
      return ok(undefined)
    }

    if (!isCapacitorAvailable()) {
      return err({
        code: CapacitorErrorCode.NOT_AVAILABLE,
        message: capacitorM('capacitor_notAvailable'),
      })
    }

    try {
      // 验证 Capacitor 核心可用
      const { Capacitor } = await import('@capacitor/core')
      const platform = Capacitor.getPlatform()

      if (!platform) {
        return err({
          code: CapacitorErrorCode.INIT_FAILED,
          message: capacitorM('capacitor_initFailed'),
        })
      }

      initialized = true
      return ok(undefined)
    }
    catch (cause) {
      return err({
        code: CapacitorErrorCode.INIT_FAILED,
        message: capacitorM('capacitor_initFailed'),
        cause,
      })
    }
  },

  /**
   * 获取当前平台
   *
   * @returns 'ios' | 'android' | 'web'
   */
  getPlatform(): string {
    try {
      // 直接从 window.Capacitor 读（避免异步 import）
      const cap = (window as unknown as Record<string, unknown>).Capacitor as { getPlatform?: () => string } | undefined
      return cap?.getPlatform?.() ?? 'web'
    }
    catch {
      return 'web'
    }
  },

  /**
   * 是否运行在原生 App 中
   */
  isNative(): boolean {
    try {
      const cap = (window as unknown as Record<string, unknown>).Capacitor as { isNativePlatform?: () => boolean } | undefined
      return cap?.isNativePlatform?.() ?? false
    }
    catch {
      return false
    }
  },

  /** 是否已初始化 */
  get isInitialized(): boolean {
    return initialized
  },
}
