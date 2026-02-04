/**
 * =============================================================================
 * @hai/core - 时间工具测试
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { core } from '../src/core-index.node.js'

describe('core.time', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
    core.i18n.setGlobalLocale('en-US')
  })

  afterEach(() => {
    vi.useRealTimers()
    core.i18n.setGlobalLocale('zh-CN')
  })

  it('formatDate 应该按格式输出', () => {
    const date = new Date(2024, 4, 6, 7, 8, 9)
    expect(core.time.formatDate(date, 'YYYY-MM-DD')).toBe('2024-05-06')
    expect(core.time.formatDate(date, 'YYYY-MM-DD HH:mm:ss')).toBe('2024-05-06 07:08:09')
  })

  it('timeAgo 应该返回相对时间', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const earlier = new Date(now.getTime() - 30 * 1000)
    expect(core.time.timeAgo(earlier)).toBe('30 seconds ago')
  })

  it('now/nowSeconds 应该返回当前时间戳', () => {
    expect(core.time.now()).toBe(new Date('2025-01-01T00:00:00.000Z').getTime())
    expect(core.time.nowSeconds()).toBe(Math.floor(Date.now() / 1000))
  })

  it('parseDate/isValidDate 应该处理日期', () => {
    const parsed = core.time.parseDate('2024-01-15')
    expect(core.time.isValidDate(parsed)).toBe(true)
    expect(core.time.isValidDate(new Date('invalid'))).toBe(false)
  })

  it('addDays/addHours 应该增加时间', () => {
    const base = new Date(2024, 0, 1, 0, 0, 0)
    expect(core.time.addDays(base, 2).getDate()).toBe(3)
    expect(core.time.addHours(base, 5).getHours()).toBe(5)
  })

  it('startOfDay/endOfDay 应该设置日边界', () => {
    const base = new Date(2024, 0, 1, 12, 34, 56)
    const start = core.time.startOfDay(base)
    const end = core.time.endOfDay(base)

    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)

    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getSeconds()).toBe(59)
    expect(end.getMilliseconds()).toBe(999)
  })
})
