/**
 * @h-ai/ui — 错误页预设
 *
 * 为 ErrorPage 提供常见 HTTP 错误的内置文案 key 与图标。
 * @module error-presets
 */

import type { UIMessageKey } from '../../../messages.js'

/**
 * 内置错误预设标识
 *
 * @example
 * ```ts
 * import type { ErrorPreset } from '@h-ai/ui'
 * const example: ErrorPreset = '404'
 * ```
 */
export type ErrorPreset = '401' | '403' | '404' | '500' | '503'

/**
 * 单个错误预设的展示信息
 *
 * @example
 * ```ts
 * import type { ErrorPresetInfo } from '@h-ai/ui'
 * const example: ErrorPresetInfo = { code: '404', titleKey: 'error_404_title', descKey: 'error_404_desc', icon: 'icon-[tabler--map-search]' }
 * ```
 */
export interface ErrorPresetInfo {
  /** HTTP 状态码（用于大号展示） */
  code: string
  /** 标题文案 key */
  titleKey: UIMessageKey
  /** 描述文案 key */
  descKey: UIMessageKey
  /** Tabler 图标类名 */
  icon: string
}

/**
 * 错误预设映射表
 *
 * @example
 * ```ts
 * import { ERROR_PRESETS } from '@h-ai/ui'
 * const missing = ERROR_PRESETS['404']
 * const titleKey = missing.titleKey
 * ```
 */
export const ERROR_PRESETS: Record<ErrorPreset, ErrorPresetInfo> = {
  401: { code: '401', titleKey: 'error_401_title', descKey: 'error_401_desc', icon: 'icon-[tabler--lock]' },
  403: { code: '403', titleKey: 'error_403_title', descKey: 'error_403_desc', icon: 'icon-[tabler--shield-lock]' },
  404: { code: '404', titleKey: 'error_404_title', descKey: 'error_404_desc', icon: 'icon-[tabler--map-search]' },
  500: { code: '500', titleKey: 'error_500_title', descKey: 'error_500_desc', icon: 'icon-[tabler--server-off]' },
  503: { code: '503', titleKey: 'error_503_title', descKey: 'error_503_desc', icon: 'icon-[tabler--tool]' },
}

/**
 * 根据 HTTP 状态码解析到最接近的预设
 * @param status - HTTP 状态码或文本形式。
 * @returns 最接近输入状态的内置错误页标识。
 *
 * @example
 * ```ts
 * import { resolveErrorPreset } from '@h-ai/ui'
 * const unavailable = resolveErrorPreset(503)
 * const fallback = resolveErrorPreset(418)
 * ```
 */
export function resolveErrorPreset(status: number | string | undefined): ErrorPreset {
  const code = String(status ?? '')
  if (code in ERROR_PRESETS) {
    return code as ErrorPreset
  }
  const num = Number(code)
  if (num === 401)
    return '401'
  if (num === 403)
    return '403'
  if (num === 503)
    return '503'
  if (num >= 500)
    return '500'
  return '404'
}
