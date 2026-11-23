/**
 * =============================================================================
 * @h-ai/ui - Utils 工具函数测试
 * =============================================================================
 */

import { ui } from '@h-ai/ui'
import { describe, expect, it } from 'vitest'

describe('getDataAttributes - data-* 属性透传', () => {
  it('应该只保留 data-* 属性', () => {
    expect(ui.getDataAttributes({
      'aria-label': '保存',
      'data-analytics-id': 'settings.save',
      'data-count': 3,
      'data-enabled': false,
      'id': 'save',
    })).toEqual({
      'data-analytics-id': 'settings.save',
      'data-count': 3,
      'data-enabled': false,
    })
  })

  it('应该忽略 null、undefined 和非标量 data-* 属性', () => {
    expect(ui.getDataAttributes({
      'data-empty': null,
      'data-list': ['a'],
      'data-meta': { source: 'test' },
      'data-missing': undefined,
      'data-valid': true,
    })).toEqual({
      'data-valid': true,
    })
  })
})

describe('cn - 类名合并', () => {
  it('应该合并多个类名', () => {
    expect(ui.cn('btn', 'btn-primary')).toBe('btn btn-primary')
  })

  it('应该过滤 falsy 值', () => {
    expect(ui.cn('btn', false, undefined, null, '', 'active')).toBe('btn active')
  })

  it('应该处理条件类名', () => {
    const isActive = true
    const isDisabled = false
    expect(ui.cn('btn', isActive && 'active', isDisabled && 'disabled')).toBe('btn active')
  })

  it('应该返回空字符串当没有有效类名', () => {
    expect(ui.cn(false, undefined, null)).toBe('')
  })
})

describe('getVariantClass - 变体类名', () => {
  it('应该返回默认变体类名', () => {
    expect(ui.getVariantClass('default')).toBe('')
  })

  it('应该返回 primary 变体类名', () => {
    expect(ui.getVariantClass('primary')).toBe('btn-primary')
  })

  it('应该返回所有变体类名', () => {
    expect(ui.getVariantClass('secondary')).toBe('btn-secondary')
    expect(ui.getVariantClass('success')).toBe('btn-success')
    expect(ui.getVariantClass('warning')).toBe('btn-warning')
    expect(ui.getVariantClass('error')).toBe('btn-error')
    expect(ui.getVariantClass('info')).toBe('btn-info')
  })

  it('应该支持自定义前缀', () => {
    expect(ui.getVariantClass('primary', 'alert')).toBe('alert-primary')
    expect(ui.getVariantClass('error', 'badge')).toBe('badge-error')
  })
})

describe('getSizeClass - 尺寸类名', () => {
  it('应该返回正确的尺寸类名', () => {
    expect(ui.getSizeClass('xs')).toBe('btn-xs')
    expect(ui.getSizeClass('sm')).toBe('btn-sm')
    expect(ui.getSizeClass('lg')).toBe('btn-lg')
    expect(ui.getSizeClass('xl')).toBe('btn-xl')
  })

  it('应该对 md 返回空字符串', () => {
    expect(ui.getSizeClass('md')).toBe('')
  })

  it('应该支持自定义前缀', () => {
    expect(ui.getSizeClass('sm', 'input')).toBe('input-sm')
    expect(ui.getSizeClass('lg', 'badge')).toBe('badge-lg')
    expect(ui.getSizeClass('sm', 'select')).toBe('select-sm')
  })
})

describe('getInputSizeClass - 输入框尺寸类名', () => {
  it('应该返回正确的输入框尺寸类名', () => {
    expect(ui.getInputSizeClass('xs')).toBe('input-xs')
    expect(ui.getInputSizeClass('sm')).toBe('input-sm')
    expect(ui.getInputSizeClass('lg')).toBe('input-lg')
    expect(ui.getInputSizeClass('xl')).toBe('input-xl')
  })

  it('应该对 md 返回空字符串', () => {
    expect(ui.getInputSizeClass('md')).toBe('')
  })
})

describe('getBadgeVariantClass - 徽章变体类名', () => {
  it('应该返回徽章变体类名', () => {
    expect(ui.getBadgeVariantClass('primary')).toBe('badge-primary')
    expect(ui.getBadgeVariantClass('success')).toBe('badge-success')
    expect(ui.getBadgeVariantClass('error')).toBe('badge-error')
  })
})

describe('getBadgeSizeClass - 徽章尺寸类名', () => {
  it('应该返回徽章尺寸类名', () => {
    expect(ui.getBadgeSizeClass('sm')).toBe('badge-sm')
    expect(ui.getBadgeSizeClass('lg')).toBe('badge-lg')
  })
})

describe('getAlertVariantClass - 警告框变体类名', () => {
  it('应该返回警告框变体类名', () => {
    expect(ui.getAlertVariantClass('success')).toBe('alert-success')
    expect(ui.getAlertVariantClass('error')).toBe('alert-error')
    expect(ui.getAlertVariantClass('warning')).toBe('alert-warning')
    expect(ui.getAlertVariantClass('info')).toBe('alert-info')
  })
})

describe('getProgressVariantClass - 进度条变体类名', () => {
  it('应该返回进度条变体类名', () => {
    expect(ui.getProgressVariantClass('primary')).toBe('progress-primary')
    expect(ui.getProgressVariantClass('success')).toBe('progress-success')
  })
})

describe('generateId - ID 生成', () => {
  it('应该生成唯一 ID', () => {
    const id1 = ui.generateId()
    const id2 = ui.generateId()
    expect(id1).not.toBe(id2)
  })

  it('应该支持自定义前缀', () => {
    const id = ui.generateId('modal')
    expect(id.startsWith('modal-')).toBe(true)
  })

  it('应该生成足够长度的 ID', () => {
    const id = ui.generateId()
    expect(id.length).toBeGreaterThan(5)
  })
})
