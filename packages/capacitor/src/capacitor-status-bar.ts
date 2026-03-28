/**
 * @h-ai/capacitor — 状态栏
 *
 * 封装 `@capacitor/status-bar` 插件，支持沉浸式状态栏配置。
 *
 * @module capacitor-status-bar
 */

import type { HaiResult } from '@h-ai/core'
import type { StatusBarConfig } from './capacitor-types.js'
import { err, ok } from '@h-ai/core'
import { capacitorM } from './capacitor-i18n.js'
import { HaiCapacitorError } from './capacitor-types.js'

/**
 * 配置状态栏
 *
 * 需要安装 `@capacitor/status-bar` 插件。
 *
 * @param config - 状态栏配置
 * @returns HaiResult
 *
 * @example
 * ```ts
 * await capacitor.statusBar.configure({
 *   style: 'dark',
 *   overlay: true,
 *   backgroundColor: '#ffffff',
 * })
 * ```
 */
export async function configureStatusBar(config: StatusBarConfig): Promise<HaiResult<void>> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')

    // 设置样式
    if (config.style) {
      const styleMap: Record<string, typeof Style[keyof typeof Style]> = {
        dark: Style.Dark,
        light: Style.Light,
        default: Style.Default,
      }
      await StatusBar.setStyle({ style: styleMap[config.style] ?? Style.Default })
    }

    // 设置背景色
    if (config.backgroundColor) {
      await StatusBar.setBackgroundColor({ color: config.backgroundColor })
    }

    // 设置覆盖模式
    if (config.overlay !== undefined) {
      await StatusBar.setOverlaysWebView({ overlay: config.overlay })
    }

    return ok(undefined)
  }
  catch (cause) {
    return err(
      HaiCapacitorError.STATUS_BAR_FAILED,
      capacitorM('capacitor_statusBarFailed'),
      cause,
    )
  }
}

/**
 * 显示状态栏
 *
 * @returns HaiResult
 *
 * @example
 * ```ts
 * await capacitor.statusBar.show()
 * ```
 */
export async function showStatusBar(): Promise<HaiResult<void>> {
  try {
    const { StatusBar } = await import('@capacitor/status-bar')
    await StatusBar.show()
    return ok(undefined)
  }
  catch (cause) {
    return err(
      HaiCapacitorError.STATUS_BAR_FAILED,
      capacitorM('capacitor_statusBarFailed'),
      cause,
    )
  }
}

/**
 * 隐藏状态栏
 *
 * @returns HaiResult
 *
 * @example
 * ```ts
 * await capacitor.statusBar.hide()
 * ```
 */
export async function hideStatusBar(): Promise<HaiResult<void>> {
  try {
    const { StatusBar } = await import('@capacitor/status-bar')
    await StatusBar.hide()
    return ok(undefined)
  }
  catch (cause) {
    return err(
      HaiCapacitorError.STATUS_BAR_FAILED,
      capacitorM('capacitor_statusBarFailed'),
      cause,
    )
  }
}
