/**
 * @h-ai/capacitor — 错误码定义
 *
 * @module capacitor-config
 */

// ─── 错误码 ───

/** Capacitor 模块错误码（8000-8099） */
export const CapacitorErrorCode = {
  /** 初始化失败 */
  INIT_FAILED: 8000,
  /** Capacitor 环境不可用 */
  NOT_AVAILABLE: 8001,
  /** 初始化正在进行中 */
  INIT_IN_PROGRESS: 8002,
  /** 未初始化 */
  NOT_INITIALIZED: 8010,
  /** Preferences 读取失败 */
  PREFERENCES_GET_FAILED: 8011,
  /** Preferences 写入失败 */
  PREFERENCES_SET_FAILED: 8012,
  /** Preferences 删除失败 */
  PREFERENCES_REMOVE_FAILED: 8013,
  /** 获取设备信息失败 */
  DEVICE_INFO_FAILED: 8020,
  /** 推送注册失败 */
  PUSH_REGISTER_FAILED: 8030,
  /** 推送监听失败 */
  PUSH_LISTEN_FAILED: 8031,
  /** 相机访问失败 */
  CAMERA_FAILED: 8040,
  /** 状态栏设置失败 */
  STATUS_BAR_FAILED: 8050,
} as const

export type CapacitorErrorCodeType = (typeof CapacitorErrorCode)[keyof typeof CapacitorErrorCode]

/** Capacitor 错误码 → HTTP 状态码映射 */
export const CapacitorErrorHttpStatus: Record<number, number> = {
  [CapacitorErrorCode.INIT_FAILED]: 500,
  [CapacitorErrorCode.NOT_AVAILABLE]: 400,
  [CapacitorErrorCode.INIT_IN_PROGRESS]: 409,
  [CapacitorErrorCode.NOT_INITIALIZED]: 500,
  [CapacitorErrorCode.PREFERENCES_GET_FAILED]: 500,
  [CapacitorErrorCode.PREFERENCES_SET_FAILED]: 500,
  [CapacitorErrorCode.PREFERENCES_REMOVE_FAILED]: 500,
  [CapacitorErrorCode.DEVICE_INFO_FAILED]: 500,
  [CapacitorErrorCode.PUSH_REGISTER_FAILED]: 500,
  [CapacitorErrorCode.PUSH_LISTEN_FAILED]: 500,
  [CapacitorErrorCode.CAMERA_FAILED]: 500,
  [CapacitorErrorCode.STATUS_BAR_FAILED]: 500,
}
