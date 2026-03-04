/**
 * @h-ai/capacitor — 类型定义
 *
 * Capacitor 原生桥接模块的公共类型。
 * @module capacitor-types
 */

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

// ─── 错误码 ───

/** Capacitor 模块错误码（8000-8099） */
export enum CapacitorErrorCode {
  /** 初始化失败 */
  INIT_FAILED = 8000,
  /** Capacitor 环境不可用 */
  NOT_AVAILABLE = 8001,
  /** Preferences 读取失败 */
  PREFERENCES_GET_FAILED = 8010,
  /** Preferences 写入失败 */
  PREFERENCES_SET_FAILED = 8011,
  /** Preferences 删除失败 */
  PREFERENCES_REMOVE_FAILED = 8012,
  /** 获取设备信息失败 */
  DEVICE_INFO_FAILED = 8020,
  /** 推送注册失败 */
  PUSH_REGISTER_FAILED = 8030,
  /** 相机访问失败 */
  CAMERA_FAILED = 8040,
  /** 状态栏设置失败 */
  STATUS_BAR_FAILED = 8050,
}

/** Capacitor 模块错误 */
export interface CapacitorError {
  /** 错误码 */
  code: CapacitorErrorCode
  /** 错误描述 */
  message: string
  /** 原始错误 */
  cause?: unknown
}
