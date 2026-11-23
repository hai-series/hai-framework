/**
 * =============================================================================
 * @h-ai/ui - 错误页预设解析测试
 * =============================================================================
 * 验证 resolveErrorPreset 将任意状态码映射到最接近的内置预设。
 */

import { ERROR_PRESETS, ui } from '@h-ai/ui'
import { describe, expect, it } from 'vitest'

describe('resolveErrorPreset', () => {
  it('精确命中内置预设', () => {
    expect(ui.resolveErrorPreset(401)).toBe('401')
    expect(ui.resolveErrorPreset(403)).toBe('403')
    expect(ui.resolveErrorPreset(404)).toBe('404')
    expect(ui.resolveErrorPreset(500)).toBe('500')
    expect(ui.resolveErrorPreset(503)).toBe('503')
  })

  it('支持字符串状态码', () => {
    expect(ui.resolveErrorPreset('404')).toBe('404')
    expect(ui.resolveErrorPreset('500')).toBe('500')
  })

  it('未知 5xx 回退到 500，其它回退到 404', () => {
    expect(ui.resolveErrorPreset(502)).toBe('500')
    expect(ui.resolveErrorPreset(418)).toBe('404')
    expect(ui.resolveErrorPreset(undefined)).toBe('404')
  })

  it('每个预设都包含展示信息', () => {
    for (const info of Object.values(ERROR_PRESETS)) {
      expect(info.code).toBeTruthy()
      expect(info.titleKey).toBeTruthy()
      expect(info.descKey).toBeTruthy()
      expect(info.icon).toContain('icon-[')
    }
  })
})
