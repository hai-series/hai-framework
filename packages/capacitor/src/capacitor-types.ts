/**
 * @h-ai/capacitor — 类型定义
 *
 * Capacitor 原生桥接模块的公共类型。
 * @module capacitor-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import { core } from '@h-ai/core'

const CapacitorErrorInfo = {
  INIT_FAILED: '001:500',
  NOT_AVAILABLE: '002:400',
  INIT_IN_PROGRESS: '003:409',
  NOT_INITIALIZED: '010:500',
  PREFERENCES_GET_FAILED: '011:500',
  PREFERENCES_SET_FAILED: '012:500',
  PREFERENCES_REMOVE_FAILED: '013:500',
  DEVICE_INFO_FAILED: '020:500',
  APP_VERSION_FAILED: '021:500',
  PUSH_REGISTER_FAILED: '030:500',
  PUSH_LISTEN_FAILED: '031:500',
  PUSH_CLEANUP_FAILED: '032:500',
  CAMERA_FAILED: '040:500',
  STATUS_BAR_FAILED: '050:500',
} as const satisfies ErrorInfo

/**
 * Capacitor 模块的公共错误定义；业务操作通过 HaiResult 返回。
 * @example
 * ```ts
 * import { HaiCapacitorError } from '@h-ai/capacitor'
 * import { err } from '@h-ai/core'
 *
 * const result = err(HaiCapacitorError.NOT_AVAILABLE, 'Native bridge required')
 * if (!result.success) void result.error.code
 * ```
 */
export const HaiCapacitorError = core.error.buildHaiErrorsDef('capacitor', CapacitorErrorInfo)

// ─── 子操作接口 ───

/**
 * 设备信息操作
 * @example
 * ```ts
 * import type { DeviceOperations } from '@h-ai/capacitor'
 *
 * async function use(operations: DeviceOperations) {
 *   const result = await operations.getInfo()
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * // 由已初始化的 capacitor.device 提供这些操作。
 * ```
 */
export interface DeviceOperations {
  /** 获取设备信息（平台、型号、系统版本等） */
  getInfo: () => Promise<HaiResult<DeviceInfo>>
  /** 获取应用版本信息 */
  getAppVersion: () => Promise<HaiResult<{ version: string, build: string }>>
}

/**
 * 相机操作
 * @example
 * ```ts
 * import type { CameraOperations } from '@h-ai/capacitor'
 *
 * async function use(operations: CameraOperations) {
 *   const result = await operations.takePhoto({ source: 'photos' })
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * // 由已初始化的 capacitor.camera 提供这些操作。
 * ```
 */
export interface CameraOperations {
  /** 拍照或选取相册图片 */
  takePhoto: (options?: PhotoOptions) => Promise<HaiResult<PhotoResult>>
}

/**
 * 推送通知操作
 * @example
 * ```ts
 * import type { PushOperations } from '@h-ai/capacitor'
 *
 * async function use(operations: PushOperations) {
 *   const result = await operations.register()
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * // 由已初始化的 capacitor.push 提供这些操作。
 * ```
 */
export interface PushOperations {
  /** 注册原生 Token；30 秒总超时，可取消，结束时回收监听器。 */
  register: (options?: PushOptions) => Promise<HaiResult<PushRegistration>>
  /** 监听原生事件；设置阶段限时 30 秒，成功后由 cleanup/信号/模块关闭释放。 */
  listen: (callbacks: PushNotificationCallbacks, options?: PushOptions) => Promise<HaiResult<PushCleanup>>
}

/**
 * 状态栏操作
 * @example
 * ```ts
 * import type { StatusBarOperations } from '@h-ai/capacitor'
 *
 * async function use(operations: StatusBarOperations) {
 *   const result = await operations.configure({ style: 'dark' })
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * // 由已初始化的 capacitor.statusBar 提供这些操作。
 * ```
 */
export interface StatusBarOperations {
  /** 配置状态栏（样式、背景色、沉浸式） */
  configure: (config: StatusBarConfig) => Promise<HaiResult<void>>
  /** 显示状态栏 */
  show: () => Promise<HaiResult<void>>
  /** 隐藏状态栏 */
  hide: () => Promise<HaiResult<void>>
}

/**
 * Preferences 操作（安全读写，返回 HaiResult）
 * @example
 * ```ts
 * import type { PreferencesOperations } from '@h-ai/capacitor'
 *
 * async function use(operations: PreferencesOperations) {
 *   const result = await operations.get('theme')
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * // 由已初始化的 capacitor.preferences 提供这些操作。
 * ```
 */
export interface PreferencesOperations {
  /** 安全读取 Preference 值 */
  get: (key: string) => Promise<HaiResult<string | null>>
  /** 安全写入 Preference 值 */
  set: (key: string, value: string) => Promise<HaiResult<void>>
  /** 安全删除 Preference 值 */
  remove: (key: string) => Promise<HaiResult<void>>
}

// ─── 函数接口 ───

/**
 * Capacitor 模块服务对象接口
 * @example
 * ```ts
 * import { capacitor } from '@h-ai/capacitor'
 *
 * const initialized = await capacitor.init()
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await capacitor.device.getInfo()
 *   if (!result.success) throw new Error(result.error.message)
 *   void result.data
 * } finally {
 *   const closed = await capacitor.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface CapacitorFunctions {
  /** 初始化 Capacitor 模块 */
  init: () => Promise<HaiResult<void>>
  /** 关闭模块并回收推送监听；失败时保持不可用，保留句柄供再次 close 重试。 */
  close: () => Promise<HaiResult<void>>
  /** 获取当前平台 */
  getPlatform: () => string
  /** 是否运行在原生 App 中 */
  isNative: () => boolean
  /** 是否已初始化 */
  readonly isInitialized: boolean

  /** 设备信息操作 */
  readonly device: DeviceOperations
  /** 相机操作 */
  readonly camera: CameraOperations
  /** 推送通知操作 */
  readonly push: PushOperations
  /** 状态栏操作 */
  readonly statusBar: StatusBarOperations
  /** Preferences 安全读写操作 */
  readonly preferences: PreferencesOperations
}

// ─── 设备信息 ───

/**
 * 设备平台
 * @example
 * ```ts
 * import type { DevicePlatform } from '@h-ai/capacitor'
 *
 * const value: DevicePlatform = 'android'
 * void value
 * ```
 */
export type DevicePlatform = 'ios' | 'android' | 'web'

/**
 * 设备信息
 * @example
 * ```ts
 * import type { DeviceInfo } from '@h-ai/capacitor'
 *
 * const value: DeviceInfo = { platform: 'android', osVersion: '15', model: 'Example device', manufacturer: 'Example', isVirtual: false }
 * void value
 * ```
 */
export interface DeviceInfo {
  /** 平台（ios / android / web） */
  platform: DevicePlatform
  /** 操作系统版本（如 '14.5'） */
  osVersion: string
  /** 设备型号（如 'iPhone 14 Pro'） */
  model: string
  /** 设备制造商 */
  manufacturer: string
  /** 是否为虚拟设备（模拟器） */
  isVirtual: boolean
  /** 应用版本 */
  appVersion?: string
  /** 应用 Build 号 */
  appBuild?: string
}

// ─── 推送通知 ───

/**
 * 推送流程的取消选项；listen 成功后信号仍可终止监听。
 * @example
 * ```ts
 * import type { PushOptions } from '@h-ai/capacitor'
 *
 * const value: PushOptions = { signal: new AbortController().signal }
 * void value
 * ```
 */
export interface PushOptions {
  /** 取消当前注册或监听，不影响其他消费者拥有的句柄。 */
  signal?: AbortSignal
}

/**
 * 幂等推送清理函数；原生 remove 失败返回错误，调用同一函数可重试。
 * @example
 * ```ts
 * import type { PushCleanup } from '@h-ai/capacitor'
 *
 * async function release(cleanup: PushCleanup) {
 *   const result = await cleanup()
 *   if (!result.success) return cleanup() // 同一所有权句柄允许重试清理。
 *   return result
 * }
 * ```
 */
export type PushCleanup = () => Promise<HaiResult<void>>

/**
 * 推送通知数据
 * @example
 * ```ts
 * import type { PushNotification } from '@h-ai/capacitor'
 *
 * const value: PushNotification = { id: 'notice_1', title: 'Order ready', data: { orderId: 'order_1' } }
 * void value
 * ```
 */
export interface PushNotification {
  /** 通知 ID */
  id: string
  /** 标题 */
  title?: string
  /** 正文 */
  body?: string
  /** 附加数据 */
  data?: Record<string, unknown>
}

/**
 * 推送注册结果
 * @example
 * ```ts
 * import type { PushRegistration } from '@h-ai/capacitor'
 *
 * const value: PushRegistration = { token: 'example-only-native-token' }
 * void value
 * ```
 */
export interface PushRegistration {
  /** 设备推送 Token */
  token: string
}

/**
 * 推送通知回调
 * @example
 * ```ts
 * import type { PushNotificationCallbacks } from '@h-ai/capacitor'
 *
 * const value: PushNotificationCallbacks = { onReceived: notification => { document.title = notification.title ?? 'Notice' } }
 * void value
 * ```
 */
export interface PushNotificationCallbacks {
  /** 收到推送时调用 */
  onReceived?: (notification: PushNotification) => void
  /** 用户点击推送时调用 */
  onActionPerformed?: (notification: PushNotification) => void
}

// ─── 相机 ───

/**
 * 照片来源
 * @example
 * ```ts
 * import type { PhotoSource } from '@h-ai/capacitor'
 *
 * const value: PhotoSource = 'photos'
 * void value
 * ```
 */
export type PhotoSource = 'camera' | 'photos' | 'prompt'

/**
 * 照片选项
 * @example
 * ```ts
 * import type { PhotoOptions } from '@h-ai/capacitor'
 *
 * const value: PhotoOptions = { source: 'photos', resultType: 'uri', quality: 90, width: 1200 }
 * void value
 * ```
 */
export interface PhotoOptions {
  /** 来源（默认 'prompt'） */
  source?: PhotoSource
  /** 图片质量 0-100（默认 90） */
  quality?: number
  /** 最大宽度（像素） */
  width?: number
  /** 最大高度（像素） */
  height?: number
  /** 返回格式 */
  resultType?: 'uri' | 'base64' | 'dataUrl'
}

/**
 * 照片结果
 * @example
 * ```ts
 * import type { PhotoResult } from '@h-ai/capacitor'
 *
 * const value: PhotoResult = { data: 'file:///example/photo.jpeg', format: 'jpeg' }
 * void value
 * ```
 */
export interface PhotoResult {
  /** 图片路径或 base64 数据 */
  data: string
  /** 原生插件返回的格式扩展名（如 jpeg），不是 MIME 类型 */
  format: string
}

// ─── 状态栏 ───

/**
 * 状态栏样式
 * @example
 * ```ts
 * import type { StatusBarStyle } from '@h-ai/capacitor'
 *
 * const value: StatusBarStyle = 'dark'
 * void value
 * ```
 */
export type StatusBarStyle = 'dark' | 'light' | 'default'

/**
 * 状态栏配置
 * @example
 * ```ts
 * import type { StatusBarConfig } from '@h-ai/capacitor'
 *
 * const value: StatusBarConfig = { style: 'dark', overlay: false }
 * void value
 * ```
 */
export interface StatusBarConfig {
  /** 状态栏文字样式 */
  style?: StatusBarStyle
  /** 背景颜色（十六进制） */
  backgroundColor?: string
  /** 是否覆盖在内容上（沉浸式） */
  overlay?: boolean
}
