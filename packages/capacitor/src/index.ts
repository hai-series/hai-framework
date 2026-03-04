/**
 * @h-ai/capacitor — 公共导出
 *
 * @module index
 */

// ─── 相机 ───
export { takePhoto } from './capacitor-camera.js'

// ─── 设备信息 ───
export { getAppVersion, getDeviceInfo } from './capacitor-device.js'

// ─── 模块入口 ───
export { capacitor, isCapacitorAvailable } from './capacitor-main.js'

// ─── 推送通知 ───
export { listenPush, registerPush } from './capacitor-push.js'

// ─── 状态栏 ───
export { configureStatusBar, hideStatusBar, showStatusBar } from './capacitor-status-bar.js'

// ─── Token 存储 ───
export {
  createCapacitorTokenStorage,
  safeGetPreference,
  safeRemovePreference,
  safeSetPreference,
} from './capacitor-token-storage.js'

// ─── 类型 ───
export type {
  CapacitorError,
  DeviceInfo,
  DevicePlatform,
  PhotoOptions,
  PhotoResult,
  PhotoSource,
  PushNotification,
  PushNotificationCallbacks,
  PushRegistration,
  StatusBarConfig,
  StatusBarStyle,
} from './capacitor-types.js'
export { CapacitorErrorCode } from './capacitor-types.js'
