/**
 * =============================================================================
 * @h-ai/scheduler - Cron 表达式解析测试（基于 croner）
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { SchedulerErrorCode } from '../src/scheduler-config.js'
import { matchesCron, parseCronExpression } from '../src/scheduler-cron.js'

describe('parseCronExpression', () => {
  it('应解析通配符 "* * * * *"', () => {
    const result = parseCronExpression('* * * * *')
    expect(result.success).toBe(true)
  })

  it('应解析指定值 "30 2 15 6 3"', () => {
    const result = parseCronExpression('30 2 15 6 3')
    expect(result.success).toBe(true)
  })

  it('应解析范围 "0-5 9-17 * * 1-5"', () => {
    const result = parseCronExpression('0-5 9-17 * * 1-5')
    expect(result.success).toBe(true)
  })

  it('应解析步进 "*/5 */2 * * *"', () => {
    const result = parseCronExpression('*/5 */2 * * *')
    expect(result.success).toBe(true)
  })

  it('应解析列表 "0,15,30,45 * * * *"', () => {
    const result = parseCronExpression('0,15,30,45 * * * *')
    expect(result.success).toBe(true)
  })

  it('应解析混合语法 "1,10-15,*/20 * * * *"', () => {
    const result = parseCronExpression('1,10-15,*/20 * * * *')
    expect(result.success).toBe(true)
  })

  it('应解析范围步进 "1-30/5 * * * *"', () => {
    const result = parseCronExpression('1-30/5 * * * *')
    expect(result.success).toBe(true)
  })

  it('应解析经典 cron：每天凌晨 2 点 "0 2 * * *"', () => {
    const result = parseCronExpression('0 2 * * *')
    expect(result.success).toBe(true)
  })

  it('无效表达式应返回 INVALID_CRON', () => {
    const result = parseCronExpression('invalid cron')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(SchedulerErrorCode.INVALID_CRON)
    }
  })

  it('非数字字段应返回 INVALID_CRON', () => {
    const result = parseCronExpression('abc * * * *')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(SchedulerErrorCode.INVALID_CRON)
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
