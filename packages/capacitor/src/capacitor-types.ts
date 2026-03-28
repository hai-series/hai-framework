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
  PUSH_REGISTER_FAILED: '030:500',
  PUSH_LISTEN_FAILED: '031:500',
  CAMERA_FAILED: '040:500',
  STATUS_BAR_FAILED: '050:500',
} as const satisfies ErrorInfo

export const HaiCapacitorError = core.error.buildHaiErrorsDef('capacitor', CapacitorErrorInfo)

// ─── 子操作接口 ───

/** 设备信息操作 */
export interface DeviceOperations {
  /** 获取设备信息（平台、型号、系统版本等） */
  getInfo: () => Promise<HaiResult<DeviceInfo>>
  /** 获取应用版本信息 */
  getAppVersion: () => Promise<HaiResult<{ version: string, build: string }>>
}

/** 相机操作 */
export interface CameraOperations {
  /** 拍照或选取相册图片 */
  takePhoto: (options?: PhotoOptions) => Promise<HaiResult<PhotoResult>>
}

/** 推送通知操作 */
export interface PushOperations {
  /** 注册推送通知，返回设备 Token */
  register: () => Promise<HaiResult<PushRegistration>>
  /** 监听推送通知事件，返回清理函数 */
  listen: (callbacks: PushNotificationCallbacks) => Promise<HaiResult<() => Promise<void>>>
}

/** 状态栏操作 */
export interface StatusBarOperations {
  /** 配置状态栏（样式、背景色、沉浸式） */
  configure: (config: StatusBarConfig) => Promise<HaiResult<void>>
  /** 显示状态栏 */
  show: () => Promise<HaiResult<void>>
  /** 隐藏状态栏 */
  hide: () => Promise<HaiResult<void>>
}

/** Preferences 操作（安全读写，返回 HaiResult） */
export interface PreferencesOperations {
  /** 安全读取 Preference 值 */
  get: (key: string) => Promise<HaiResult<string | null>>
  /** 安全写入 Preference 值 */
  set: (key: string, value: string) => Promise<HaiResult<void>>
  /** 安全删除 Preference 值 */
  remove: (key: string) => Promise<HaiResult<void>>
}

// ─── 函数接口 ───

/** Capacitor 模块服务对象接口 */
export interface CapacitorFunctions {
  /** 初始化 Capacitor 模块 */
  init: () => Promise<HaiResult<void>>
  /** 关闭模块，重置状态 */
  close: () => Promise<void>
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

/** 设备平台 */
export type DevicePlatform = 'ios' | 'android' | 'web'

/** 设备信息 */
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

/** 推送通知数据 */
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

/** 推送注册结果 */
export interface PushRegistration {
  /** 设备推送 Token */
  token: string
}

/** 推送通知回调 */
export interface PushNotificationCallbacks {
  /** 收到推送时调用 */
  onReceived?: (notification: PushNotification) => void
  /** 用户点击推送时调用 */
  onActionPerformed?: (notification: PushNotification) => void
}

// ─── 相机 ───

/** 照片来源 */
export type PhotoSource = 'camera' | 'photos' | 'prompt'

/** 照片选项 */
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

/** 照片结果 */
export interface PhotoResult {
  /** 图片路径或 base64 数据 */
  data: string
  /** MIME 类型 */
  format: string
}

// ─── 状态栏 ───

/** 状态栏样式 */
export type StatusBarStyle = 'dark' | 'light' | 'default'

/** 状态栏配置 */
export interface StatusBarConfig {
  /** 状态栏文字样式 */
  style?: StatusBarStyle
  /** 背景颜色（十六进制） */
  backgroundColor?: string
  /** 是否覆盖在内容上（沉浸式） */
  overlay?: boolean
}
