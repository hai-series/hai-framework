/**
 * =============================================================================
 * @h-ai/ui - Utils 工具函数测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  cn,
  generateId,
  getAlertVariantClass,
  getBadgeSizeClass,
  getBadgeVariantClass,
  getInputSizeClass,
  getProgressVariantClass,
  getSizeClass,
  getVariantClass,
} from '../src/lib/utils.js'

describe('cn - 类名合并', () => {
  it('应该合并多个类名', () => {
    expect(cn('btn', 'btn-primary')).toBe('btn btn-primary')
  })

  it('应该过滤 falsy 值', () => {
    expect(cn('btn', false, undefined, null, '', 'active')).toBe('btn active')
  })

  it('应该处理条件类名', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('btn', isActive && 'active', isDisabled && 'disabled')).toBe('btn active')
  })

  it('应该返回空字符串当没有有效类名', () => {
    expect(cn(false, undefined, null)).toBe('')
  })
})

describe('getVariantClass - 变体类名', () => {
  it('应该返回默认变体类名', () => {
    expect(getVariantClass('default')).toBe('btn-neutral')
  })

  it('应该返回 primary 变体类名', () => {
    expect(getVariantClass('primary')).toBe('btn-primary')
  })

  it('应该返回所有变体类名', () => {
    expect(getVariantClass('secondary')).toBe('btn-secondary')
    expect(getVariantClass('success')).toBe('btn-success')
    expect(getVariantClass('warning')).toBe('btn-warning')
    expect(getVariantClass('error')).toBe('btn-error')
    expect(getVariantClass('info')).toBe('btn-info')
  })

  it('应该支持自定义前缀', () => {
    expect(getVariantClass('primary', 'alert')).toBe('alert-primary')
    expect(getVariantClass('error', 'badge')).toBe('badge-error')
  })
})

describe('getSizeClass - 尺寸类名', () => {
  it('应该返回正确的尺寸类名', () => {
    expect(getSizeClass('xs')).toBe('btn-xs')
    expect(getSizeClass('sm')).toBe('btn-sm')
    expect(getSizeClass('lg')).toBe('btn-lg')
    expect(getSizeClass('xl')).toBe('btn-xl')
  })

  it('应该对 md 返回空字符串', () => {
    expect(getSizeClass('md')).toBe('')
  })

  it('应该支持自定义前缀', () => {
    expect(getSizeClass('sm', 'input')).toBe('input-sm')
    expect(getSizeClass('lg', 'badge')).toBe('badge-lg')
  })
})

describe('getInputSizeClass - 输入框尺寸类名', () => {
  it('应该返回正确的输入框尺寸类名', () => {
    expect(getInputSizeClass('xs')).toBe('input-xs')
    expect(getInputSizeClass('sm')).toBe('input-sm')
    expect(getInputSizeClass('lg')).toBe('input-lg')
    expect(getInputSizeClass('xl')).toBe('input-xl')
  })

  it('应该对 md 返回空字符串', () => {
    expect(getInputSizeClass('md')).toBe('')
  })
})

describe('getBadgeVariantClass - 徽章变体类名', () => {
  it('应该返回徽章变体类名', () => {
    expect(getBadgeVariantClass('primary')).toBe('badge-primary')
    expect(getBadgeVariantClass('success')).toBe('badge-success')
    expect(getBadgeVariantClass('error')).toBe('badge-error')
  })
})

describe('getBadgeSizeClass - 徽章尺寸类名', () => {
  it('应该返回徽章尺寸类名', () => {
    expect(getBadgeSizeClass('sm')).toBe('badge-sm')
    expect(getBadgeSizeClass('lg')).toBe('badge-lg')
  })
})

describe('getAlertVariantClass - 警告框变体类名', () => {
  it('应该返回警告框变体类名', () => {
    expect(getAlertVariantClass('success')).toBe('alert-success')
    expect(getAlertVariantClass('error')).toBe('alert-error')
    expect(getAlertVariantClass('warning')).toBe('alert-warning')
    expect(getAlertVariantClass('info')).toBe('alert-info')
  })
})

describe('getProgressVariantClass - 进度条变体类名', () => {
  it('应该返回进度条变体类名', () => {
    expect(getProgressVariantClass('primary')).toBe('progress-primary')
    expect(getProgressVariantClass('success')).toBe('progress-success')
  })
})

describe('generateId - ID 生成', () => {
  it('应该生成唯一 ID', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })

  it('应该支持自定义前缀', () => {
    const id = generateId('modal')
    expect(id.startsWith('modal-')).toBe(true)
  })

  it('应该生成足够长度的 ID', () => {
    const id = generateId()
    expect(id.length).toBeGreaterThan(5)
  })
})
