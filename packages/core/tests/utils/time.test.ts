/**
 * =============================================================================
 * @hai/core - 时间操作工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  addDays,
  addHours,
  endOfDay,
  formatDate,
  isValidDate,
  now,
  nowSeconds,
  parseDate,
  startOfDay,
  timeAgo,
} from '../../src/utils/core-util-time.js'

describe('core-util-time', () => {
  describe('formatDate()', () => {
    it('应格式化为默认格式 YYYY-MM-DD', () => {
      const date = new Date('2024-01-15T12:30:45Z')
      expect(formatDate(date)).toBe('2024-01-15')
    })

    it('应支持自定义格式', () => {
      const date = new Date('2024-01-15T08:30:45')
      expect(formatDate(date, 'YYYY/MM/DD')).toBe('2024/01/15')
      expect(formatDate(date, 'HH:mm:ss')).toBe('08:30:45')
      expect(formatDate(date, 'YYYY-MM-DD HH:mm')).toBe('2024-01-15 08:30')
    })
  })

  describe('timeAgo()', () => {
    it('应显示秒前', () => {
      const date = new Date(Date.now() - 30 * 1000)
      expect(timeAgo(date)).toBe('30 秒前')
    })

    it('应显示分钟前', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000)
      expect(timeAgo(date)).toBe('5 分钟前')
    })

    it('应显示小时前', () => {
      const date = new Date(Date.now() - 3 * 60 * 60 * 1000)
      expect(timeAgo(date)).toBe('3 小时前')
    })

    it('应显示天前', () => {
      const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      expect(timeAgo(date)).toBe('2 天前')
    })
  })

  describe('now()', () => {
    it('应返回当前时间戳（毫秒）', () => {
      const before = Date.now()
      const result = now()
      const after = Date.now()

      expect(result).toBeGreaterThanOrEqual(before)
      expect(result).toBeLessThanOrEqual(after)
    })
  })

  describe('nowSeconds()', () => {
    it('应返回当前时间戳（秒）', () => {
      const result = nowSeconds()
      const expected = Math.floor(Date.now() / 1000)

      expect(result).toBeCloseTo(expected, 0)
    })
  })

  describe('parseDate()', () => {
    it('应解析日期字符串', () => {
      const date = parseDate('2024-01-15')
      expect(date.getFullYear()).toBe(2024)
      expect(date.getMonth()).toBe(0) // 0-indexed
      expect(date.getDate()).toBe(15)
    })
  })

  describe('isValidDate()', () => {
    it('应对有效日期返回 true', () => {
      expect(isValidDate(new Date())).toBe(true)
      expect(isValidDate(new Date('2024-01-15'))).toBe(true)
    })

    it('应对无效日期返回 false', () => {
      expect(isValidDate(new Date('invalid'))).toBe(false)
    })
  })

  describe('addDays()', () => {
    it('应添加天数', () => {
      const date = new Date('2024-01-15')
      const result = addDays(date, 5)

      expect(result.getDate()).toBe(20)
    })

    it('应支持负数', () => {
      const date = new Date('2024-01-15')
      const result = addDays(date, -5)

      expect(result.getDate()).toBe(10)
    })

    it('不应修改原日期', () => {
      const date = new Date('2024-01-15')
      addDays(date, 5)

      expect(date.getDate()).toBe(15)
    })
  })

  describe('addHours()', () => {
    it('应添加小时', () => {
      const date = new Date('2024-01-15T10:00:00')
      const result = addHours(date, 3)

      expect(result.getHours()).toBe(13)
    })
  })

  describe('startOfDay()', () => {
    it('应返回当天开始时间', () => {
      const date = new Date('2024-01-15T14:30:45')
      const result = startOfDay(date)

      expect(result.getHours()).toBe(0)
      expect(result.getMinutes()).toBe(0)
      expect(result.getSeconds()).toBe(0)
    })
  })

  describe('endOfDay()', () => {
    it('应返回当天结束时间', () => {
      const date = new Date('2024-01-15T14:30:45')
      const result = endOfDay(date)

      expect(result.getHours()).toBe(23)
      expect(result.getMinutes()).toBe(59)
      expect(result.getSeconds()).toBe(59)
    })
  })
})
