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
  /** 相机访问失败 */
  CAMERA_FAILED: 8040,
  /** 状态栏设置失败 */
  STATUS_BAR_FAILED: 8050,
} as const

export type CapacitorErrorCodeType = (typeof CapacitorErrorCode)[keyof typeof CapacitorErrorCode]
