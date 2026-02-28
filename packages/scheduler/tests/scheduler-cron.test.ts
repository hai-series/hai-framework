/**
 * =============================================================================
 * @h-ai/scheduler - Cron 表达式解析测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { matchesCron, parseCronExpression } from '../src/scheduler-cron.js'

describe('parseCronExpression', () => {
  it('应解析通配符 "* * * * *"', () => {
    const result = parseCronExpression('* * * * *')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.minute).toHaveLength(60) // 0-59
      expect(result.data.hour).toHaveLength(24) // 0-23
      expect(result.data.dayOfMonth).toHaveLength(31) // 1-31
      expect(result.data.month).toHaveLength(12) // 1-12
      expect(result.data.dayOfWeek).toHaveLength(7) // 0-6
    }
  })

  it('应解析指定值 "30 2 15 6 3"', () => {
    const result = parseCronExpression('30 2 15 6 3')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.minute).toEqual([30])
      expect(result.data.hour).toEqual([2])
      expect(result.data.dayOfMonth).toEqual([15])
      expect(result.data.month).toEqual([6])
      expect(result.data.dayOfWeek).toEqual([3])
    }
  })

  it('应解析范围 "0-5 9-17 * * 1-5"', () => {
    const result = parseCronExpression('0-5 9-17 * * 1-5')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.minute).toEqual([0, 1, 2, 3, 4, 5])
      expect(result.data.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
      expect(result.data.dayOfWeek).toEqual([1, 2, 3, 4, 5])
    }
  })

  it('应解析步进 "*/5 */2 * * *"', () => {
    const result = parseCronExpression('*/5 */2 * * *')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.minute).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
      expect(result.data.hour).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22])
    }
  })

  it('应解析列表 "0,15,30,45 * * * *"', () => {
    const result = parseCronExpression('0,15,30,45 * * * *')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.minute).toEqual([0, 15, 30, 45])
    }
  })

  it('应解析混合语法 "1,10-15,*/20 * * * *"', () => {
    const result = parseCronExpression('1,10-15,*/20 * * * *')
    expect(result.success).toBe(true)
    if (result.success) {
      // 1, 10,11,12,13,14,15, 0,20,40 → 合并去重排序
      expect(result.data.minute).toEqual([0, 1, 10, 11, 12, 13, 14, 15, 20, 40])
    }
  })

  it('应解析范围步进 "1-30/5 * * * *"', () => {
    const result = parseCronExpression('1-30/5 * * * *')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.minute).toEqual([1, 6, 11, 16, 21, 26])
    }
  })

  it('应解析经典 cron：每天凌晨 2 点 "0 2 * * *"', () => {
    const result = parseCronExpression('0 2 * * *')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.minute).toEqual([0])
      expect(result.data.hour).toEqual([2])
    }
  })

  it('字段不足应返回 INVALID_CRON', () => {
    const result = parseCronExpression('* * *')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(10004)
    }
  })

  it('字段过多应返回 INVALID_CRON', () => {
    const result = parseCronExpression('* * * * * *')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(10004)
    }
  })

  it('无效字段值应返回 INVALID_CRON', () => {
    const result = parseCronExpression('60 * * * *')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(10004)
    }
  })

  it('无效范围应返回 INVALID_CRON', () => {
    const result = parseCronExpression('5-2 * * * *')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(10004)
    }
  })

  it('非数字字段应返回 INVALID_CRON', () => {
    const result = parseCronExpression('abc * * * *')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(10004)
    }
  })

  it('空字符串应返回 INVALID_CRON', () => {
    const result = parseCronExpression('')
    expect(result.success).toBe(false)
  })
})

describe('matchesCron', () => {
  it('通配符应匹配任何时间', () => {
    const result = parseCronExpression('* * * * *')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(matchesCron(result.data, new Date(2025, 0, 1, 0, 0))).toBe(true)
      expect(matchesCron(result.data, new Date(2025, 5, 15, 12, 30))).toBe(true)
    }
  })

  it('指定时间应精确匹配', () => {
    const result = parseCronExpression('30 14 * * *')
    expect(result.success).toBe(true)
    if (result.success) {
      // 14:30 应匹配
      expect(matchesCron(result.data, new Date(2025, 0, 1, 14, 30))).toBe(true)
      // 14:31 不应匹配
      expect(matchesCron(result.data, new Date(2025, 0, 1, 14, 31))).toBe(false)
      // 15:30 不应匹配
      expect(matchesCron(result.data, new Date(2025, 0, 1, 15, 30))).toBe(false)
    }
  })

  it('工作日 cron 应正确匹配', () => {
    const result = parseCronExpression('0 9 * * 1-5')
    expect(result.success).toBe(true)
    if (result.success) {
      // 2025-01-06 是周一
      expect(matchesCron(result.data, new Date(2025, 0, 6, 9, 0))).toBe(true)
      // 2025-01-05 是周日
      expect(matchesCron(result.data, new Date(2025, 0, 5, 9, 0))).toBe(false)
    }
  })

  it('每 5 分钟 cron 应正确匹配', () => {
    const result = parseCronExpression('*/5 * * * *')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(matchesCron(result.data, new Date(2025, 0, 1, 12, 0))).toBe(true)
      expect(matchesCron(result.data, new Date(2025, 0, 1, 12, 5))).toBe(true)
      expect(matchesCron(result.data, new Date(2025, 0, 1, 12, 3))).toBe(false)
    }
  })
})
