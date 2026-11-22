import type { CronBuilderState, CronWeekdayValue } from './cron-expression-builder-types.js'
import { CronExpressionParser } from 'cron-parser'

/** 拆分 Cron 字段的空白分隔符。 */
const CRON_WHITESPACE_RE = /\s+/
/** 验证是否为纯整数字符串。 */
const INTEGER_RE = /^\d+$/
/** 验证是否为合法的步进分钟表达式。 */
const MINUTE_INTERVAL_RE = /^\*\/(\d+)$/
/** 可视化 builder 支持的标准五段表达式。 */
const STANDARD_FIVE_SEGMENT_LENGTH = 5
/** 支持把前导秒字段为 0 的六段表达式映射到可视化 builder。 */
const STANDARD_SIX_SEGMENT_LENGTH = 6

/**
 * builder 输出星期的固定顺序，从周一到周日。
 *
 * @example
 * ```ts
 * import { CRON_BUILDER_WEEKDAY_ORDER } from '@h-ai/ui'
 * const weekdays = [...CRON_BUILDER_WEEKDAY_ORDER]
 * ```
 */
export const CRON_BUILDER_WEEKDAY_ORDER: readonly CronWeekdayValue[] = ['1', '2', '3', '4', '5', '6', '0']

/**
 * 创建可视化 Cron builder 的默认状态。
 *
 * @returns 可直接交给 CronExpressionBuilder 的初始状态。
 *
 * @example
 * ```ts
 * import { createDefaultCronBuilderState } from '@h-ai/ui'
 * const state = createDefaultCronBuilderState()
 * ```
 */
export function createDefaultCronBuilderState(): CronBuilderState {
  return {
    mode: 'day',
    customExpression: '',
    minuteInterval: 5,
    hour: 10,
    minute: 0,
    monthDay: 1,
    weekDays: ['1'],
  }
}

/**
 * 将 Cron 表达式映射为 builder 状态。
 * 仅对常见五段表达式和前导秒为 0 的六段表达式启用可视化模式，其余回退到自定义模式。
 *
 * @param expression 要解析的 Cron 表达式。
 * @returns 可视化或自定义模式状态。
 *
 * @example
 * ```ts
 * import { cronExpressionToBuilderState } from '@h-ai/ui'
 * const state = cronExpressionToBuilderState('0 10 * * *')
 * ```
 */
export function cronExpressionToBuilderState(expression: string): CronBuilderState {
  const normalized = expression.trim()
  if (!normalized) {
    return createDefaultCronBuilderState()
  }

  const builderExpression = normalizeCronExpressionForBuilder(normalized)
  if (!builderExpression) {
    return {
      ...createDefaultCronBuilderState(),
      mode: 'custom',
      customExpression: normalized,
    }
  }

  const segments = builderExpression.split(CRON_WHITESPACE_RE)
  const [minutePart, hourPart, dayOfMonth, month, dayOfWeek] = segments
  const defaults = createDefaultCronBuilderState()
  const baseState: CronBuilderState = {
    ...defaults,
    customExpression: builderExpression,
  }
  const minuteInterval = parseMinuteInterval(minutePart)
  if (minuteInterval && hourPart === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return {
      ...baseState,
      mode: 'minute',
      minuteInterval,
    }
  }

  const minute = parseSegment(minutePart, 0, 59)
  if (minute === undefined)
    return { ...baseState, mode: 'custom', customExpression: normalized }

  if (hourPart === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return {
      ...baseState,
      mode: 'hour',
      minute,
    }
  }

  const hour = parseSegment(hourPart, 0, 23)
  if (hour === undefined) {
    return {
      ...baseState,
      mode: 'custom',
      customExpression: normalized,
      minute,
    }
  }

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return {
      ...baseState,
      mode: 'day',
      hour,
      minute,
    }
  }

  if (dayOfMonth === '*' && month === '*') {
    const weekDays = expandCronWeekDays(dayOfWeek)
    if (weekDays.length > 0) {
      return {
        ...baseState,
        mode: 'week',
        hour,
        minute,
        weekDays,
      }
    }
  }

  const monthDay = parseSegment(dayOfMonth, 1, 31)
  if (month === '*' && dayOfWeek === '*' && monthDay !== undefined) {
    return {
      ...baseState,
      mode: 'month',
      hour,
      minute,
      monthDay,
    }
  }

  return {
    ...baseState,
    mode: 'custom',
    customExpression: normalized,
    hour,
    minute,
  }
}

/**
 * 将 builder 状态序列化为标准五段 Cron 表达式。
 *
 * @param state 要序列化的 builder 状态。
 * @returns 标准五段 Cron 表达式；自定义模式返回清理后的原文。
 *
 * @example
 * ```ts
 * import { createDefaultCronBuilderState, cronBuilderStateToExpression } from '@h-ai/ui'
 * const expression = cronBuilderStateToExpression({ ...createDefaultCronBuilderState(), mode: 'day' })
 * ```
 */
export function cronBuilderStateToExpression(state: CronBuilderState): string {
  if (state.mode === 'custom') {
    return state.customExpression.trim()
  }

  const minute = clampNumber(state.minute, 0, 59, 0)
  const hour = clampNumber(state.hour, 0, 23, 0)

  switch (state.mode) {
    case 'minute':
      return `*/${clampNumber(state.minuteInterval, 1, 59, 5)} * * * *`
    case 'hour':
      return `${minute} * * * *`
    case 'day':
      return `${minute} ${hour} * * *`
    case 'week':
      return `${minute} ${hour} * * ${serializeWeekDays(state.weekDays)}`
    case 'month':
      return `${minute} ${hour} ${clampNumber(state.monthDay, 1, 31, 1)} * *`
    default:
      return ''
  }
}

/**
 * 使用 cron-parser 校验 Cron 表达式；业务调用方可在此基础上限制字段数量。
 *
 * @param expression 要校验的 Cron 表达式。
 * @returns 表达式可被 cron-parser 解析时为 true。
 *
 * @example
 * ```ts
 * import { isCronExpressionValid } from '@h-ai/ui'
 * const valid = isCronExpressionValid('0 10 * * *')
 * ```
 */
export function isCronExpressionValid(expression: string): boolean {
  const normalized = expression.trim()
  if (!normalized) {
    return false
  }

  try {
    void CronExpressionParser.parse(normalized)
    return true
  }
  catch {
    return false
  }
}

function isIntegerSegment(value: string | undefined): value is string {
  return value !== undefined && INTEGER_RE.test(value)
}

function parseSegment(value: string | undefined, min: number, max: number): number | undefined {
  if (!isIntegerSegment(value))
    return undefined
  const number = Number.parseInt(value, 10)
  return number >= min && number <= max
    ? number
    : undefined
}

function parseMinuteInterval(value: string | undefined): number | null {
  if (value === undefined) {
    return null
  }

  const match = MINUTE_INTERVAL_RE.exec(value)
  if (!match) {
    return null
  }

  const parsed = Number.parseInt(match[1] ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 59) {
    return null
  }

  return parsed
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function normalizeCronExpressionForBuilder(expression: string): string | null {
  const segments = expression.split(CRON_WHITESPACE_RE).filter(Boolean)
  if (segments.length === STANDARD_FIVE_SEGMENT_LENGTH) {
    return segments.join(' ')
  }

  if (segments.length === STANDARD_SIX_SEGMENT_LENGTH && segments[0] === '0') {
    return segments.slice(1).join(' ')
  }

  return null
}

function expandCronWeekDays(dayOfWeek: string | undefined): CronWeekdayValue[] {
  const normalized = dayOfWeek?.trim() ?? ''
  if (!normalized || normalized === '*') {
    return []
  }

  const expanded = new Set<CronWeekdayValue>()
  for (const part of normalized.split(',')) {
    const token = part.trim()
    if (!token) {
      return []
    }

    if (token.includes('-')) {
      const parts = token.split('-')
      const [startToken, endToken] = parts
      if (parts.length !== 2 || !isIntegerSegment(startToken) || !isIntegerSegment(endToken)) {
        return []
      }

      const start = Number.parseInt(startToken, 10)
      const end = Number.parseInt(endToken, 10)
      if (!isCronWeekDayInRange(start) || !isCronWeekDayInRange(end) || start > end) {
        return []
      }

      for (let current = start; current <= end; current += 1) {
        expanded.add(normalizeCronWeekDayValue(current))
      }
      continue
    }

    if (!isIntegerSegment(token)) {
      return []
    }

    const value = Number.parseInt(token, 10)
    if (!isCronWeekDayInRange(value)) {
      return []
    }
    expanded.add(normalizeCronWeekDayValue(value))
  }

  return CRON_BUILDER_WEEKDAY_ORDER.filter(value => expanded.has(value))
}

function serializeWeekDays(weekDays: readonly CronWeekdayValue[]): string {
  const normalized = CRON_BUILDER_WEEKDAY_ORDER.filter(value => weekDays.includes(value))
  if (normalized.length === 0) {
    return '1'
  }

  return normalized.join(',')
}

function isCronWeekDayInRange(value: number): boolean {
  return value >= 0 && value <= 7
}

function normalizeCronWeekDayValue(value: number): CronWeekdayValue {
  return value === 7
    ? '0'
    : String(value) as CronWeekdayValue
}
