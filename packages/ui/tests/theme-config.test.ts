/**
 * =============================================================================
 * @h-ai/ui - 主题配置测试
 * =============================================================================
 * 覆盖 theme-config.ts 中的所有纯函数与配置数据
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  DAISYUI_THEMES_CONFIG,
  DARK_THEMES,
  DEFAULT_THEME,
  getCurrentTheme,
  getSavedTheme,
  getThemeInfo,
  getThemeInitScript,
  isDarkTheme,
  THEME_GROUPS,
  THEME_STORAGE_KEY,
  THEMES,
} from '../src/lib/theme-config.js'

// =============================================================================
// THEMES 数据完整性
// =============================================================================

describe('tHEMES - 主题数据完整性', () => {
  it('应该包含 15 个 DaisyUI 精选主题', () => {
    expect(THEMES.length).toBe(15)
  })

  it('每个主题应该包含必要字段', () => {
    for (const theme of THEMES) {
      expect(theme.id).toBeDefined()
      expect(typeof theme.id).toBe('string')
      expect(theme.id.length).toBeGreaterThan(0)

      expect(theme.name).toBeDefined()
      expect(typeof theme.name).toBe('string')
      expect(theme.name.length).toBeGreaterThan(0)

      expect(typeof theme.dark).toBe('boolean')

      expect(theme.primaryColor).toBeDefined()
      expect(typeof theme.primaryColor).toBe('string')
      expect(theme.primaryColor).toMatch(/^#[0-9a-f]{6}$/i)

      expect(theme.bgColor).toBeDefined()
      expect(typeof theme.bgColor).toBe('string')
      expect(theme.bgColor).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('主题 ID 应该唯一', () => {
    const ids = THEMES.map(t => t.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('应该包含 light 和 dark 默认主题', () => {
    const lightTheme = THEMES.find(t => t.id === 'light')
    const darkTheme = THEMES.find(t => t.id === 'dark')
    expect(lightTheme).toBeDefined()
    expect(darkTheme).toBeDefined()
    expect(lightTheme!.dark).toBe(false)
    expect(darkTheme!.dark).toBe(true)
  })

  it('亮色主题应小于暗色主题在数组中靠前', () => {
    // 验证 THEMES 中亮色主题在前、暗色主题在后
    const firstDarkIndex = THEMES.findIndex(t => t.dark)
    const lastLightIndex = THEMES.length - 1 - [...THEMES].reverse().findIndex(t => !t.dark)
    expect(firstDarkIndex).toBeGreaterThan(lastLightIndex - THEMES.filter(t => !t.dark).length)
  })
})

// =============================================================================
// DARK_THEMES
// =============================================================================

describe('dARK_THEMES - 暗色主题列表', () => {
  it('应该只包含暗色主题的 ID', () => {
    const expectedDark = THEMES.filter(t => t.dark).map(t => t.id)
    expect(DARK_THEMES).toEqual(expectedDark)
  })

  it('应该包含已知的暗色主题', () => {
    expect(DARK_THEMES).toContain('dark')
    expect(DARK_THEMES).toContain('dracula')
    expect(DARK_THEMES).toContain('night')
    expect(DARK_THEMES).toContain('business')
  })

  it('不应包含亮色主题', () => {
    expect(DARK_THEMES).not.toContain('light')
    expect(DARK_THEMES).not.toContain('cupcake')
    expect(DARK_THEMES).not.toContain('emerald')
  })
})

// =============================================================================
// THEME_GROUPS
// =============================================================================

describe('tHEME_GROUPS - 主题分组', () => {
  it('应该有两个分组（亮色和暗色）', () => {
    expect(THEME_GROUPS.length).toBe(2)
    expect(THEME_GROUPS[0].id).toBe('light')
    expect(THEME_GROUPS[1].id).toBe('dark')
  })

  it('亮色分组应该只包含亮色主题', () => {
    const lightGroup = THEME_GROUPS.find(g => g.id === 'light')!
    expect(lightGroup.themes.every(t => !t.dark)).toBe(true)
  })

  it('暗色分组应该只包含暗色主题', () => {
    const darkGroup = THEME_GROUPS.find(g => g.id === 'dark')!
    expect(darkGroup.themes.every(t => t.dark)).toBe(true)
  })

  it('两个分组的主题总数应该等于 THEMES 总数', () => {
    const totalInGroups = THEME_GROUPS.reduce((acc, g) => acc + g.themes.length, 0)
    expect(totalInGroups).toBe(THEMES.length)
  })

  it('分组应该有 i18n 名称 key', () => {
    expect(THEME_GROUPS[0].nameKey).toBe('theme_group_light')
    expect(THEME_GROUPS[1].nameKey).toBe('theme_group_dark')
  })
})

// =============================================================================
// getThemeInfo
// =============================================================================

describe('getThemeInfo - 获取主题信息', () => {
  it('应该返回已知主题的信息', () => {
    const info = getThemeInfo('light')
    expect(info).toBeDefined()
    expect(info!.id).toBe('light')
    expect(info!.name).toBe('Light')
    expect(info!.dark).toBe(false)
  })

  it('应该返回暗色主题的信息', () => {
    const info = getThemeInfo('dracula')
    expect(info).toBeDefined()
    expect(info!.id).toBe('dracula')
    expect(info!.dark).toBe(true)
  })

  it('不存在的主题应返回 undefined', () => {
    expect(getThemeInfo('nonexistent')).toBeUndefined()
  })

  it('空字符串应返回 undefined', () => {
    expect(getThemeInfo('')).toBeUndefined()
  })
})

// =============================================================================
// isDarkTheme
// =============================================================================

describe('isDarkTheme - 暗色主题判断', () => {
  it('暗色主题应返回 true', () => {
    expect(isDarkTheme('dark')).toBe(true)
    expect(isDarkTheme('dracula')).toBe(true)
    expect(isDarkTheme('night')).toBe(true)
    expect(isDarkTheme('coffee')).toBe(true)
    expect(isDarkTheme('sunset')).toBe(true)
  })

  it('亮色主题应返回 false', () => {
    expect(isDarkTheme('light')).toBe(false)
    expect(isDarkTheme('cupcake')).toBe(false)
    expect(isDarkTheme('emerald')).toBe(false)
    expect(isDarkTheme('winter')).toBe(false)
  })

  it('不存在的主题应返回 false', () => {
    expect(isDarkTheme('nonexistent')).toBe(false)
    expect(isDarkTheme('')).toBe(false)
  })
})

// =============================================================================
// 常量
// =============================================================================

describe('常量定义', () => {
  it('默认主题应该是 light', () => {
    expect(DEFAULT_THEME).toBe('light')
  })

  it('存储键名应该是 theme', () => {
    expect(THEME_STORAGE_KEY).toBe('theme')
  })
})

// =============================================================================
// getThemeInitScript
// =============================================================================

describe('getThemeInitScript - 主题初始化脚本', () => {
  it('应返回包含 localStorage 读取逻辑的脚本', () => {
    const script = getThemeInitScript()
    expect(typeof script).toBe('string')
    expect(script.length).toBeGreaterThan(0)
  })

  it('脚本应引用正确的 localStorage key', () => {
    const script = getThemeInitScript()
    expect(script).toContain(THEME_STORAGE_KEY)
  })

  it('脚本应包含默认主题 fallback', () => {
    const script = getThemeInitScript()
    expect(script).toContain(DEFAULT_THEME)
  })

  it('脚本应设置 data-theme 属性', () => {
    const script = getThemeInitScript()
    expect(script).toContain('data-theme')
  })

  it('脚本应该是自执行函数', () => {
    const script = getThemeInitScript()
    expect(script.startsWith('(function(){')).toBe(true)
    expect(script.endsWith('})()')).toBe(true)
  })
})

// =============================================================================
// getCurrentTheme（Node 环境无 document）
// =============================================================================

describe('getCurrentTheme - 获取当前主题', () => {
  it('node 环境应返回默认主题', () => {
    const theme = getCurrentTheme()
    expect(theme).toBe(DEFAULT_THEME)
  })
})

// =============================================================================
// getSavedTheme（Node 环境无 localStorage）
// =============================================================================

describe('getSavedTheme - 获取保存的主题', () => {
  it('node 环境应返回默认主题', () => {
    const theme = getSavedTheme()
    expect(theme).toBe(DEFAULT_THEME)
  })
})

// =============================================================================
// DAISYUI_THEMES_CONFIG
// =============================================================================

describe('dAISYUI_THEMES_CONFIG - DaisyUI 配置字符串', () => {
  it('应该是有效的字符串', () => {
    expect(typeof DAISYUI_THEMES_CONFIG).toBe('string')
    expect(DAISYUI_THEMES_CONFIG.length).toBeGreaterThan(0)
  })

  it('第一个主题应该标记为 --default', () => {
    const firstLine = DAISYUI_THEMES_CONFIG.split('\n')[0]
    expect(firstLine).toContain('--default')
    expect(firstLine).toContain(THEMES[0].id)
  })

  it('dark 主题应该标记为 --prefersdark', () => {
    expect(DAISYUI_THEMES_CONFIG).toContain('dark --prefersdark')
  })

  it('应该包含所有主题 ID', () => {
    for (const theme of THEMES) {
      expect(DAISYUI_THEMES_CONFIG).toContain(theme.id)
    }
  })
})
