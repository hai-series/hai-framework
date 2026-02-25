/**
 * =============================================================================
 * @h-ai/core - 时间工具测试
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { core } from '../src/index.js'

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

  it('formatDate 默认格式应为 YYYY-MM-DD', () => {
    const date = new Date(2024, 0, 15, 12, 30, 45)
    expect(core.time.formatDate(date)).toBe('2024-01-15')
  })

  it('timeAgo 应该返回秒级相对时间', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const earlier = new Date(now.getTime() - 30 * 1000)
    expect(core.time.timeAgo(earlier)).toBe('30 seconds ago')
  })

  it('timeAgo 应该返回分钟级相对时间', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const earlier = new Date(now.getTime() - 5 * 60 * 1000) // 5 分钟
    expect(core.time.timeAgo(earlier)).toBe('5 minutes ago')
  })

  it('timeAgo 应该返回小时级相对时间', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const earlier = new Date(now.getTime() - 3 * 3600 * 1000) // 3 小时
    expect(core.time.timeAgo(earlier)).toBe('3 hours ago')
  })

  it('timeAgo 应该返回天级相对时间', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const earlier = new Date(now.getTime() - 7 * 86400 * 1000) // 7 天
    expect(core.time.timeAgo(earlier)).toBe('7 days ago')
  })

  it('timeAgo 中文 locale 应返回中文', () => {
    core.i18n.setGlobalLocale('zh-CN')
    const now = new Date('2025-01-01T00:00:00.000Z')
    const earlier = new Date(now.getTime() - 2 * 3600 * 1000) // 2 小时
    expect(core.time.timeAgo(earlier)).toBe('2 小时前')
  })

  it('now/nowSeconds 应该返回当前时间戳', () => {
    expect(core.time.now()).toBe(new Date('2025-01-01T00:00:00.000Z').getTime())
    expect(core.time.nowSeconds()).toBe(Math.floor(Date.now() / 1000))
  })

  it('parseDate/isValidDate 应该处理有效日期', () => {
    const parsed = core.time.parseDate('2024-01-15')
    expect(core.time.isValidDate(parsed)).toBe(true)
  })

  it('isValidDate 应该识别无效日期', () => {
    expect(core.time.isValidDate(new Date('invalid'))).toBe(false)
    expect(core.time.isValidDate(new Date('not-a-date'))).toBe(false)
  })

  it('addDays 应该增加/减少天数', () => {
    const base = new Date(2024, 0, 1, 0, 0, 0)
    expect(core.time.addDays(base, 2).getDate()).toBe(3)
    expect(core.time.addDays(base, -1).getDate()).toBe(31) // 回到 12 月
  })

  it('addHours 应该增加/减少小时', () => {
    const base = new Date(2024, 0, 1, 0, 0, 0)
    expect(core.time.addHours(base, 5).getHours()).toBe(5)
    expect(core.time.addHours(base, -1).getHours()).toBe(23) // 前一天 23 点
  })

  it('addDays/addHours 不应修改原始日期', () => {
    const base = new Date(2024, 0, 1, 12, 0, 0)
    const original = base.getTime()
    core.time.addDays(base, 5)
    core.time.addHours(base, 5)
    expect(base.getTime()).toBe(original)
  })

  it('startOfDay/endOfDay 应该设置日边界', () => {
    const base = new Date(2024, 0, 1, 12, 34, 56)
    const start = core.time.startOfDay(base)
    const end = core.time.endOfDay(base)

    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)

    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getSeconds()).toBe(59)
    expect(end.getMilliseconds()).toBe(999)
  })

  it('startOfDay/endOfDay 不应修改原始日期', () => {
    const base = new Date(2024, 0, 1, 12, 34, 56)
    const original = base.getTime()
    core.time.startOfDay(base)
    core.time.endOfDay(base)
    expect(base.getTime()).toBe(original)
  })
})
