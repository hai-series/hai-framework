/**
 * 浏览器中的 Capacitor bridge 暴露的可选平台检测方法。
 * @example 模块内部上下文
 * ```ts
 * const sampleBridge: CapacitorBridge = { getPlatform: () => 'android', isNativePlatform: () => true }
 * ```
 */
interface CapacitorBridge {
  getPlatform?: () => string
  isNativePlatform?: () => boolean
}

/** 浏览器环境可能由 Capacitor 运行时注入 bridge；SSR 不提供 window。 */
function getBridge(): CapacitorBridge | undefined {
  return typeof window === 'undefined'
    ? undefined
    : Reflect.get(window, 'Capacitor') as CapacitorBridge | undefined
}

/**
 * 检查是否有注入的 Capacitor 全局对象。
 * @example 模块内部上下文
 * ```ts
 * const bridgeAvailable = isCapacitorAvailable()
 * ```
 */
export function isCapacitorAvailable(): boolean {
  try {
    return getBridge() !== undefined
  }
  catch {
    return false
  }
}

/**
 * 取出 bridge 平台标识；Web 与 SSR 使用相同默认值。
 * @example 模块内部上下文
 * ```ts
 * const isAndroid = readPlatform() === 'android'
 * ```
 */
export function readPlatform(): string {
  try {
    return getBridge()?.getPlatform?.() ?? 'web'
  }
  catch {
    return 'web'
  }
}

/**
 * 由 bridge 判断是否在原生环境；没有可读标识时视为 Web。
 * @example 模块内部上下文
 * ```ts
 * const canUseNativePlugins = isNative()
 * ```
 */
export function isNative(): boolean {
  try {
    return getBridge()?.isNativePlatform?.() ?? false
  }
  catch {
    return false
  }
}
