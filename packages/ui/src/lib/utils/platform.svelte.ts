/**
 * @h-ai/ui — 平台检测工具
 *
 * 提供运行时平台检测与 Svelte 5 响应式平台状态。
 * @module platform
 */

/** 运行平台 */
export type Platform = 'web' | 'h5' | 'android' | 'ios' | 'unknown'

/**
 * 检测当前运行平台
 *
 * @returns 当前平台标识
 *
 * @example
 * ```ts
 * const platform = detectPlatform()
 * if (platform === 'android') {
 *   // Android 特定逻辑
 * }
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
  if (/android/.test(ua))
    return 'h5'
  if (/iphone|ipad|ipod/.test(ua))
    return 'h5'

  // 移动端特征检测
  if ('ontouchstart' in window && navigator.maxTouchPoints > 0 && window.innerWidth < 768) {
    return 'h5'
  }

  return 'web'
}

/**
 * 判断是否为移动端
 */
export function isMobile(): boolean {
  const platform = detectPlatform()
  return platform === 'h5' || platform === 'android' || platform === 'ios'
}

/**
 * 判断是否为 Capacitor App
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
 * ```svelte
 * <script>
 *   import { usePlatform } from '@hai/ui'
 *   const platform = usePlatform()
 * </script>
 *
 * {#if platform.isMobile}
 *   <BottomNav />
 * {:else}
 *   <Sidebar />
 * {/if}
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
