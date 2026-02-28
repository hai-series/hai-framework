/**
 * =============================================================================
 * @h-ai/scheduler - Cron 表达式解析
 * =============================================================================
 *
 * 支持标准 5 字段 cron 表达式：分 时 日 月 周
 *
 * 语法：
 * - `*` 通配符
 * - `5` 指定值
 * - `1-5` 范围
 * - `1,3,5` 列表
 * - `* /5` 步进（每隔 N）
 * - `1-10/2` 范围步进
 *
 * @module scheduler-cron
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { CronFields, SchedulerError } from './scheduler-types.js'

import { err, ok } from '@h-ai/core'

import { SchedulerErrorCode } from './scheduler-config.js'
import { schedulerM } from './scheduler-i18n.js'

// =============================================================================
// 字段范围定义
// =============================================================================

interface FieldRange {
  min: number
  max: number
}

const FIELD_RANGES: FieldRange[] = [
  { min: 0, max: 59 }, // 分钟
  { min: 0, max: 23 }, // 小时
  { min: 1, max: 31 }, // 日期
  { min: 1, max: 12 }, // 月份
  { min: 0, max: 6 }, // 星期（0=周日）
]

const FIELD_NAMES = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const

// =============================================================================
// 解析单个字段
// =============================================================================

/**
 * 解析 cron 表达式中的单个字段
 *
 * @param field - 字段字符串（如 "1,3-5,*\/10"）
 * @param range - 字段值范围
 * @returns 匹配的数值数组
 */
function parseField(field: string, range: FieldRange): number[] | null {
  const values = new Set<number>()

  const parts = field.split(',')
  for (const part of parts) {
    const parsed = parsePart(part.trim(), range)
    if (parsed === null)
      return null
    for (const v of parsed) values.add(v)
  }

  const result = [...values].sort((a, b) => a - b)
  return result.length > 0 ? result : null
}

/**
 * 解析逗号分隔中的单个部分
 */
function parsePart(part: string, range: FieldRange): number[] | null {
  // 步进表达式：*/5 或 1-10/2
  if (part.includes('/')) {
    const [rangeStr, stepStr] = part.split('/')
    if (rangeStr === undefined || stepStr === undefined)
      return null
    const step = Number(stepStr)
    if (!Number.isInteger(step) || step <= 0)
      return null

    let start = range.min
    let end = range.max

    if (rangeStr !== '*') {
      const rangeParsed = parseRange(rangeStr, range)
      if (rangeParsed === null)
        return null
      start = rangeParsed[0]
      end = rangeParsed[rangeParsed.length - 1]
    }

    const values: number[] = []
    for (let i = start; i <= end; i += step) {
      values.push(i)
    }
    return values
  }

  // 通配符
  if (part === '*') {
    const values: number[] = []
    for (let i = range.min; i <= range.max; i++) {
      values.push(i)
    }
    return values
  }

  // 范围：1-5
  if (part.includes('-')) {
    return parseRange(part, range)
  }

  // 单值
  const value = Number(part)
  if (!Number.isInteger(value) || value < range.min || value > range.max)
    return null
  return [value]
}

/**
 * 解析范围字符串（如 "1-5"）
 */
function parseRange(rangeStr: string, range: FieldRange): number[] | null {
  const [startStr, endStr] = rangeStr.split('-')
  if (startStr === undefined || endStr === undefined)
    return null

  const start = Number(startStr)
  const end = Number(endStr)

  if (!Number.isInteger(start) || !Number.isInteger(end))
    return null
  if (start < range.min || end > range.max || start > end)
    return null

  const values: number[] = []
  for (let i = start; i <= end; i++) {
    values.push(i)
  }
  return values
}

// =============================================================================
// 公共 API
// =============================================================================

/**
 * 解析 cron 表达式
 *
 * @param expression - 标准 5 字段 cron 表达式（分 时 日 月 周）
 * @returns 解析结果
 *
 * @example
 * ```ts
 * // 每天凌晨 2 点
 * parseCronExpression('0 2 * * *')
 *
 * // 每 5 分钟
 * parseCronExpression('&#42;/5 * * * *')
 *
 * // 工作日 9 点到 17 点每小时
 * parseCronExpression('0 9-17 * * 1-5')
 * ```
 */
export function parseCronExpression(expression: string): Result<CronFields, SchedulerError> {
  const fields = expression.trim().split(/\s+/)

  if (fields.length !== 5) {
    return err({
      code: SchedulerErrorCode.INVALID_CRON,
      message: schedulerM('scheduler_invalidCron', { params: { expression } }),
    })
  }

  const result: Partial<Record<typeof FIELD_NAMES[number], number[]>> = {}

  for (let i = 0; i < 5; i++) {
    const parsed = parseField(fields[i], FIELD_RANGES[i])
    if (parsed === null) {
      return err({
        code: SchedulerErrorCode.INVALID_CRON,
        message: schedulerM('scheduler_invalidCron', { params: { expression } }),
      })
    }
    result[FIELD_NAMES[i]] = parsed
  }

  return ok(result as CronFields)
}

/**
 * 判断给定时间是否匹配 cron 字段
 *
 * @param fields - 解析后的 cron 字段
 * @param date - 要检查的时间
 * @returns 是否匹配
 */
export function matchesCron(fields: CronFields, date: Date): boolean {
  const minute = date.getMinutes()
  const hour = date.getHours()
  const dayOfMonth = date.getDate()
  const month = date.getMonth() + 1
  const dayOfWeek = date.getDay()

  return fields.minute.includes(minute)
    && fields.hour.includes(hour)
    && fields.dayOfMonth.includes(dayOfMonth)
    && fields.month.includes(month)
    && fields.dayOfWeek.includes(dayOfWeek)
}
