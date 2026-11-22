/**
 * ScheduleInput 的 schema 配置和分钟级日期时间工具。
 * 计算使用配置的 IANA 时区，并保留有效回填值的显式 UTC 偏移。
 */

import { parseAbsolute, parseZonedDateTime } from '@internationalized/date'

const SCHEDULE_INPUT_TIMEZONE: string = 'Asia/Shanghai'
const SCHEDULE_INPUT_PRECISION = 'minute' as const

const SCHEDULE_INPUT_CONFIG_KEYS = new Set([
  'kind',
  'timezone',
  'precision',
  'allowCron',
])

/**
 * `ScheduleInput` 当前支持的值精度。
 *
 * @example 模块内部上下文
 * ```ts
 * const precision: ScheduleInputPrecision = 'minute'
 * ```
 */
type ScheduleInputPrecision = typeof SCHEDULE_INPUT_PRECISION

/**
 * `ScheduleInput` 的 schema 元数据。
 *
 * @example
 * ```ts
 * import type { ScheduleInputConfig } from '@h-ai/ui'
 * const config: ScheduleInputConfig = {
 *   kind: 'schedule', timezone: 'Asia/Shanghai', precision: 'minute', allowCron: true,
 * }
 * ```
 */
export interface ScheduleInputConfig {
  /** 输入类型标识。 */
  kind: 'schedule'
  /** IANA 时区，例如 `Asia/Shanghai` 或 `America/Los_Angeles`。 */
  timezone: string
  /** 输出值精度。 */
  precision: ScheduleInputPrecision
  /** 是否允许切换到高级 Cron 模式；省略时由规范化结果默认为 false。 */
  allowCron?: boolean
}

/**
 * ScheduleInput 的默认 schema 配置。
 *
 * @example 模块内部上下文
 * ```ts
 * const config = { ...DEFAULT_SCHEDULE_INPUT_CONFIG, allowCron: true }
 * ```
 */
export const DEFAULT_SCHEDULE_INPUT_CONFIG: ScheduleInputConfig = {
  kind: 'schedule',
  timezone: SCHEDULE_INPUT_TIMEZONE,
  precision: SCHEDULE_INPUT_PRECISION,
  allowCron: false,
}

/**
 * 归一化 schema 元数据；未知值和不支持的配置不会被静默降级。
 *
 * `allowCron` 是唯一可省略的字段，省略时统一归一化为 `false`。
 *
 * @param value 待校验的 schema 元数据。
 * @returns 归一化后的配置；不支持或格式错误时返回 undefined。
 *
 * @example
 * ```ts
 * import { normalizeScheduleInputConfig } from '@h-ai/ui'
 * const config = normalizeScheduleInputConfig({
 *   kind: 'schedule', timezone: 'Asia/Shanghai', precision: 'minute',
 * })
 * ```
 */
export function normalizeScheduleInputConfig(value: unknown): ScheduleInputConfig | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  if (Object.keys(value).some(key => !SCHEDULE_INPUT_CONFIG_KEYS.has(key))) {
    return undefined
  }

  if (value.kind !== 'schedule'
    || !isIanaTimezone(value.timezone)
    || value.precision !== SCHEDULE_INPUT_PRECISION
    || (value.allowCron !== undefined && typeof value.allowCron !== 'boolean')) {
    return undefined
  }

  return {
    kind: 'schedule',
    timezone: value.timezone,
    precision: SCHEDULE_INPUT_PRECISION,
    allowCron: value.allowCron ?? false,
  }
}

/**
 * ScheduleInput 日期时间编辑草稿。
 *
 * @example 模块内部上下文
 * ```ts
 * const draft: ScheduleDateTimeDraft = { date: '2026-11-22', hour: '10', minute: '05' }
 * ```
 */
export interface ScheduleDateTimeDraft {
  date: string
  hour: string
  minute: string
}

/**
 * ScheduleInput 日期时间校验状态。
 *
 * @example 模块内部上下文
 * ```ts
 * const status: ScheduleDateTimeStatus = 'valid'
 * ```
 */
export type ScheduleDateTimeStatus = 'empty' | 'partial' | 'invalid' | 'past' | 'valid'

/**
 * 已解析的 ScheduleInput canonical 日期时间值。
 *
 * @example 模块内部上下文
 * ```ts
 * const parsed: ParsedScheduleDateTimeValue = {
 *   date: '2026-11-22', hour: '10', minute: '05', seconds: '00', offset: '+08:00',
 * }
 * ```
 */
export interface ParsedScheduleDateTimeValue extends ScheduleDateTimeDraft {
  seconds: string
  offset: string
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const VALUE_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/
const HOUR_OR_MINUTE_RE = /^\d{1,2}$/

/**
 * 将公开的 canonical 日期时间值拆成可编辑字段；非 canonical 值也会保留其精度信息。
 *
 * @param value 待解析的日期时间值。
 * @returns 解析后的字段和精度信息；格式不匹配时返回 undefined。
 *
 * @example 模块内部上下文
 * ```ts
 * const parsed = parseScheduleDateTimeValue('2026-11-22T10:05:00+08:00')
 * ```
 */
export function parseScheduleDateTimeValue(value: unknown): ParsedScheduleDateTimeValue | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const match = VALUE_RE.exec(value)
  if (!match) {
    return undefined
  }

  return {
    date: match[1] ?? '',
    hour: match[2] ?? '',
    minute: match[3] ?? '',
    seconds: match[4] ?? '',
    offset: match[5] ?? '',
  }
}

/**
 * 将分钟级草稿转换为带 UTC 偏移的 ISO 日期时间。
 * 缺失的夏令时分钟会返回 undefined。重叠分钟默认取较早的一次，回填值可指定实际偏移。
 *
 * @param draft 日期时间编辑草稿。
 * @param timezone IANA 时区，默认 `Asia/Shanghai`。
 * @param offset 回填值已有的偏移，传入时核对该偏移与时区、日期和分钟一致。
 * @returns ISO 日期时间；草稿、时区或偏移不合法时返回 undefined。
 *
 * @example 模块内部上下文
 * ```ts
 * const value = serializeScheduleDateTime({ date: '2030-01-22', hour: '10', minute: '05' }, 'America/Los_Angeles')
 * // '2030-01-22T10:05:00-08:00'
 * ```
 */
export function serializeScheduleDateTime(
  draft: ScheduleDateTimeDraft,
  timezone = SCHEDULE_INPUT_TIMEZONE,
  offset?: string,
): string | undefined {
  if (!isStructurallyValidDraft(draft) || !isIanaTimezone(timezone))
    return undefined

  const local = `${draft.date}T${padTwoDigits(Number.parseInt(draft.hour, 10))}:${padTwoDigits(Number.parseInt(draft.minute, 10))}:00`
  try {
    if (offset !== undefined) {
      const resolved = isoPart(parseAbsolute(`${local}${offset}`, timezone).toString())
      const normalizedOffset = offset === 'Z'
        ? '+00:00'
        : offset
      return resolved === `${local}${normalizedOffset}`
        ? `${local}${offset}`
        : undefined
    }

    const resolved = isoPart(parseZonedDateTime(`${local}[${timezone}]`, 'earlier').toString())
    // 春季跳时可能把不存在的分钟挪到上一小时，比较本地字段可识别这种情况。
    return resolved.startsWith(local)
      ? resolved
      : undefined
  }
  catch {
    return undefined
  }
}

function isoPart(zoned: string): string {
  return zoned.slice(0, zoned.indexOf('['))
}

/**
 * 校验 canonical 日期时间值，当前时刻比较使用绝对时间戳而非浏览器本地时区。
 *
 * @param value 待校验的 canonical 值。
 * @param now 用于未来时间比较的当前时间。
 * @param timezone IANA 时区，默认北京时间。
 * @returns 日期时间的结构和未来性状态。
 *
 * @example 模块内部上下文
 * ```ts
 * const status = inspectScheduleDateTimeValue('2026-11-22T10:05:00+08:00')
 * ```
 */
export function inspectScheduleDateTimeValue(value: unknown, now = new Date(), timezone = SCHEDULE_INPUT_TIMEZONE): ScheduleDateTimeStatus {
  if (value === undefined || value === null || value === '') {
    return 'empty'
  }

  if (typeof value !== 'string') {
    return 'invalid'
  }

  const parsed = parseScheduleDateTimeValue(value)
  if (!parsed) {
    return 'invalid'
  }

  if (parsed.seconds !== '00') {
    return 'invalid'
  }

  return inspectScheduleDateTimeDraft(parsed, now, timezone, parsed.offset)
}

/**
 * 校验可编辑草稿；空草稿只在 required 层决定是否报错。
 *
 * @param draft 日期时间编辑草稿。
 * @param now 用于未来时间比较的当前时间。
 * @param timezone IANA 时区，默认北京时间。
 * @param offset 回填的显式偏移。
 * @returns 草稿的结构和未来性状态。
 *
 * @example 模块内部上下文
 * ```ts
 * const status = inspectScheduleDateTimeDraft({ date: '2026-11-22', hour: '10', minute: '05' })
 * ```
 */
export function inspectScheduleDateTimeDraft(
  draft: ScheduleDateTimeDraft,
  now = new Date(),
  timezone = SCHEDULE_INPUT_TIMEZONE,
  offset?: string,
): ScheduleDateTimeStatus {
  const { date, hour, minute } = draft
  if (!date && !hour && !minute) {
    return 'empty'
  }

  if (!date || !hour || !minute) {
    return 'partial'
  }

  const value = serializeScheduleDateTime(draft, timezone, offset)
  if (!value || !Number.isFinite(now.getTime()))
    return 'invalid'

  const scheduledAt = Date.parse(value)
  return scheduledAt <= now.getTime()
    ? 'past'
    : 'valid'
}

/**
 * 判断日期时间值是否满足可选/必填字段的有效性。
 *
 * @param value 待校验的 canonical 值。
 * @param required 是否要求非空值。
 * @param now 用于未来时间比较的当前时间。
 * @param timezone IANA 时区，默认北京时间。
 * @returns 值满足字段约束时为 true。
 *
 * @example 模块内部上下文
 * ```ts
 * const valid = isScheduleDateTimeValid('2026-11-22T10:05:00+08:00')
 * ```
 */
export function isScheduleDateTimeValid(
  value: unknown,
  required = false,
  now = new Date(),
  timezone = SCHEDULE_INPUT_TIMEZONE,
): boolean {
  const status = inspectScheduleDateTimeValue(value, now, timezone)
  return status === 'valid' || (status === 'empty' && !required)
}

function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[a-z][\w+-]*(?:\/[\w+-]+)*$/i.test(value))
    return false
  try {
    // 排除不受当前运行时支持的时区名称，固定偏移不能代替 IANA 名称。
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone.length > 0
  }
  catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStructurallyValidDraft(draft: ScheduleDateTimeDraft): boolean {
  const dateMatch = DATE_RE.exec(draft.date)
  return dateMatch !== null
    && isValidCalendarDate(dateMatch)
    && isTwoDigitInteger(draft.hour, 0, 23)
    && isTwoDigitInteger(draft.minute, 0, 59)
}

function isValidCalendarDate(match: RegExpExecArray): boolean {
  const year = Number.parseInt(match[1] ?? '', 10)
  const month = Number.parseInt(match[2] ?? '', 10)
  const day = Number.parseInt(match[3] ?? '', 10)
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) {
    return false
  }

  const daysInMonth = month === 2
    ? (isLeapYear(year)
        ? 29
        : 28)
    : [4, 6, 9, 11].includes(month)
        ? 30
        : 31
  return day <= daysInMonth
}

function isTwoDigitInteger(value: string, min: number, max: number): boolean {
  if (!HOUR_OR_MINUTE_RE.test(value)) {
    return false
  }

  const parsed = Number.parseInt(value, 10)
  return parsed >= min && parsed <= max
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0')
}
