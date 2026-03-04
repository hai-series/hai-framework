/**
 * @h-ai/capacitor — 设备信息
 *
 * 封装 `@capacitor/device` 插件，提供统一的设备信息读取接口。
 *
 * @module capacitor-device
 */

import type { Result } from '@h-ai/core'
import type { CapacitorError, DeviceInfo } from './capacitor-types.js'
import { err, ok } from '@h-ai/core'
import { capacitorM } from './capacitor-i18n.js'
import { CapacitorErrorCode } from './capacitor-types.js'

/**
 * 获取设备信息
 *
 * 需要安装 `@capacitor/device` 插件。
 *
 * @returns 设备信息（平台、系统版本、型号等）
 *
 * @example
 * ```ts
 * import { getDeviceInfo } from '@h-ai/capacitor'
 *
 * const result = await getDeviceInfo()
 * if (result.success) {
 *   console.log(result.data.platform) // 'android' | 'ios' | 'web'
 * }
 * ```
 */
export async function getDeviceInfo(): Promise<Result<DeviceInfo, CapacitorError>> {
  try {
    const { Device } = await import('@capacitor/device')
    const info = await Device.getInfo()

    return ok({
      platform: info.platform as DeviceInfo['platform'],
      osVersion: info.osVersion,
      model: info.model,
      manufacturer: info.manufacturer,
      isVirtual: info.isVirtual,
    })
  }
  catch (cause) {
    return err({
      code: CapacitorErrorCode.DEVICE_INFO_FAILED,
      message: capacitorM('capacitor_deviceInfoFailed'),
      cause,
    })
  }
}

/**
 * 获取应用版本信息
 *
 * @returns appVersion 与 appBuild
 */
export async function getAppVersion(): Promise<Result<{ version: string, build: string }, CapacitorError>> {
  try {
    const { App } = await import('@capacitor/app')
    const info = await App.getInfo()

    return ok({
      version: info.version,
      build: info.build,
    })
  }
  catch (cause) {
    return err({
      code: CapacitorErrorCode.DEVICE_INFO_FAILED,
      message: capacitorM('capacitor_deviceInfoFailed'),
      cause,
    })
  }
}
