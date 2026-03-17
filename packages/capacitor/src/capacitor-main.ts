/**
 * @h-ai/capacitor — 模块入口（生命周期管理）
 *
 * 提供 Capacitor 原生桥接的初始化与环境检测。
 * `capacitor.init()` 应在应用启动时调用，用于检测 Capacitor 环境可用性。
 *
 * @module capacitor-main
 */

import type { Result } from '@h-ai/core'
import type { CameraOperations, CapacitorError, CapacitorFunctions, DeviceOperations, PreferencesOperations, PushOperations, StatusBarOperations } from './capacitor-types.js'
import { core, err, ok } from '@h-ai/core'
import { takePhoto } from './capacitor-camera.js'
import { CapacitorErrorCode } from './capacitor-config.js'
import { getAppVersion, getDeviceInfo } from './capacitor-device.js'
import { capacitorM } from './capacitor-i18n.js'
import { listenPush, registerPush } from './capacitor-push.js'
import { configureStatusBar, hideStatusBar, showStatusBar } from './capacitor-status-bar.js'
import { safeGetPreference, safeRemovePreference, safeSetPreference } from './capacitor-token-storage.js'

const logger = core.logger.child({ module: 'capacitor', scope: 'main' })

/** 是否已初始化 */
let initialized = false

/** 是否正在初始化中（并发防护） */
let initInProgress = false

/** 缓存平台信息 */
let cachedPlatform: string | null = null

// ─── 未初始化代理 ───

const notInitialized = core.module.createNotInitializedKit<CapacitorError>(
  CapacitorErrorCode.NOT_INITIALIZED,
  () => capacitorM('capacitor_notInitialized'),
)

const notInitializedDevice = notInitialized.proxy<DeviceOperations>()
const notInitializedCamera = notInitialized.proxy<CameraOperations>()
const notInitializedPush = notInitialized.proxy<PushOperations>()
const notInitializedStatusBar = notInitialized.proxy<StatusBarOperations>()
const notInitializedPreferences = notInitialized.proxy<PreferencesOperations>()

// ─── 已初始化时的操作实现 ───

const deviceOps: DeviceOperations = {
  getInfo: getDeviceInfo,
  getAppVersion,
}

const cameraOps: CameraOperations = {
  takePhoto,
}

const pushOps: PushOperations = {
  register: registerPush,
  listen: listenPush,
}

const statusBarOps: StatusBarOperations = {
  configure: configureStatusBar,
  show: showStatusBar,
  hide: hideStatusBar,
}

const preferencesOps: PreferencesOperations = {
  get: safeGetPreference,
  set: safeSetPreference,
  remove: safeRemovePreference,
}

// ─── 检测 Capacitor 是否可用（模块内部使用） ───

function isCapacitorAvailable(): boolean {
  try {
    return typeof window !== 'undefined'
      && (window as unknown as Record<string, unknown>).Capacitor !== undefined
  }
  catch {
    return false
  }
}

// ─── 服务对象 ───

/**
 * Capacitor 模块服务对象
 *
 * @example
 * ```ts
 * import { capacitor } from '@h-ai/capacitor'
 *
 * const result = await capacitor.init()
 * if (result.success) {
 *   const info = await capacitor.device.getInfo()
 *   await capacitor.statusBar.configure({ style: 'dark', overlay: true })
 * }
 * ```
 */
export const capacitor: CapacitorFunctions = {
  async init(): Promise<Result<void, CapacitorError>> {
    // 并发初始化防护：避免多次 init 同时执行导致资源泄漏
    if (initInProgress) {
      logger.warn('Capacitor init already in progress, skipping concurrent call')
      return err({
        code: CapacitorErrorCode.INIT_IN_PROGRESS,
        message: capacitorM('capacitor_initInProgress'),
      })
    }
    initInProgress = true

    try {
      if (initialized) {
        logger.warn('Capacitor module is already initialized, reinitializing')
        await capacitor.close()
      }

      logger.info('Initializing capacitor module')

      if (!isCapacitorAvailable()) {
        logger.error('Capacitor is not available in current environment')
        return err({
          code: CapacitorErrorCode.NOT_AVAILABLE,
          message: capacitorM('capacitor_notAvailable'),
        })
      }

      const { Capacitor } = await import('@capacitor/core')
      const platform = Capacitor.getPlatform()

      if (!platform) {
        logger.error('Capacitor initialization failed, platform not detected')
        return err({
          code: CapacitorErrorCode.INIT_FAILED,
          message: capacitorM('capacitor_initFailed'),
        })
      }

      cachedPlatform = platform
      initialized = true
      logger.info('Capacitor module initialized', { platform })
      return ok(undefined)
    }
    catch (cause) {
      logger.error('Capacitor module initialization failed', { error: cause })
      return err({
        code: CapacitorErrorCode.INIT_FAILED,
        message: capacitorM('capacitor_initFailed'),
        cause,
      })
    }
    finally {
      initInProgress = false
    }
  },

  async close() {
    if (!initialized) {
      logger.info('Capacitor module is already closed, skipping')
      return
    }
    logger.info('Closing capacitor module')
    initialized = false
    cachedPlatform = null
    logger.info('Capacitor module closed')
  },

  getPlatform(): string {
    if (cachedPlatform) {
      return cachedPlatform
    }
    try {
      const cap = (window as unknown as Record<string, unknown>).Capacitor as { getPlatform?: () => string } | undefined
      return cap?.getPlatform?.() ?? 'web'
    }
    catch {
      return 'web'
    }
  },

  isNative(): boolean {
    try {
      const cap = (window as unknown as Record<string, unknown>).Capacitor as { isNativePlatform?: () => boolean } | undefined
      return cap?.isNativePlatform?.() ?? false
    }
    catch {
      return false
    }
  },

  get isInitialized(): boolean {
    return initialized
  },

  get device(): DeviceOperations {
    return initialized ? deviceOps : notInitializedDevice
  },

  get camera(): CameraOperations {
    return initialized ? cameraOps : notInitializedCamera
  },

  get push(): PushOperations {
    return initialized ? pushOps : notInitializedPush
  },

  get statusBar(): StatusBarOperations {
    return initialized ? statusBarOps : notInitializedStatusBar
  },

  get preferences(): PreferencesOperations {
    return initialized ? preferencesOps : notInitializedPreferences
  },
}
