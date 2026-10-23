/**
 * @h-ai/ui — 平台检测工具
 *
 * 提供运行时平台检测与 Svelte 5 响应式平台状态。
 * @module platform
 */

/**
 * 运行平台
 *
 * @example
 * ```ts
 * import type { Platform } from '@h-ai/ui'
 * const example: Platform = 'web'
 * ```
 */
export type Platform = 'web' | 'h5' | 'android' | 'ios' | 'unknown'

const ANDROID_UA_REGEX = /android/
const IOS_UA_REGEX = /iphone|ipad|ipod/

/**
 * 检测当前运行平台
 *
 * @returns 当前平台标识
 *
 * @example
 * ```ts
 * import { detectPlatform } from '@h-ai/ui'
 * const platform = detectPlatform()
 * ```
 */
export function detectPlatform(): Platform {
  if (typeof window === 'undefined') {
    return 'unknown'
  }

  const ua = navigator.userAgent.toLowerCase()

  // Capacitor 注入全局标识
  if ('Capacitor' in window) {
    const cap = (window as Record<string, unknown>).Capacitor as { getPlatform?: () => string }
    const platform = cap?.getPlatform?.()
    if (platform === 'android')
      return 'android'
    if (platform === 'ios')
      return 'ios'
  }

  // 移动端 UA 检测
  if (ANDROID_UA_REGEX.test(ua))
    return 'h5'
  if (IOS_UA_REGEX.test(ua))
    return 'h5'

  // 移动端特征检测
  if ('ontouchstart' in window && navigator.maxTouchPoints > 0 && window.innerWidth < 768) {
    return 'h5'
  }

  return 'web'
}

/**
 * 判断是否为移动端
 * @returns 当前是否为 H5 或 Android/iOS 原生壳。
 *
 * @example
 * ```ts
 * import { isMobile } from '@h-ai/ui'
 * const compactLayout = isMobile()
 * ```
 */
export function isMobile(): boolean {
  const platform = detectPlatform()
  return platform === 'h5' || platform === 'android' || platform === 'ios'
}

/**
 * 判断是否为 Capacitor App
 * @returns 是否为 Capacitor Android/iOS 原生壳。
 *
 * @example
 * ```ts
 * import { isNativeApp } from '@h-ai/ui'
 * const useNativeBridge = isNativeApp()
 * ```
 */
export function isNativeApp(): boolean {
  const platform = detectPlatform()
  return platform === 'android' || platform === 'ios'
}

/**
 * Svelte 5 Runes 响应式平台状态
 *
 * @returns 包含当前平台、是否移动端和是否原生应用的响应式对象
 *
 * @example
 * ```ts
 * import { usePlatform } from '@h-ai/ui'
 * const platform = usePlatform()
 * const device = platform.current
 * ```
 */
export function usePlatform() {
  const current = $state(detectPlatform())
  const mobile = $derived(current === 'h5' || current === 'android' || current === 'ios')
  const app = $derived(current === 'android' || current === 'ios')

  return {
    get current() { return current },
    get isMobile() { return mobile },
    get isApp() { return app },
  }
}
