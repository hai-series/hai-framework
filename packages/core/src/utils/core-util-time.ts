/**
 * =============================================================================
 * @hai/core - 时间操作工具
 * =============================================================================
 */

import { i18n } from '../i18n/index.js'

/**
 * 格式化日期。
 *
 * @example
 * ```ts
 * time.formatDate(new Date(), 'YYYY-MM-DD')
 * ```
 */
function formatDate(date: Date, format = 'YYYY-MM-DD'): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

/**
 * 相对时间描述。
 *
 * @example
 * ```ts
 * time.timeAgo(new Date(Date.now() - 60000))
 * ```
 */
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60)
    return i18n.coreM('time_secondsAgo', { params: { n: seconds } })
  if (seconds < 3600)
    return i18n.coreM('time_minutesAgo', { params: { n: Math.floor(seconds / 60) } })
  if (seconds < 86400)
    return i18n.coreM('time_hoursAgo', { params: { n: Math.floor(seconds / 3600) } })
  return i18n.coreM('time_daysAgo', { params: { n: Math.floor(seconds / 86400) } })
}

/**
 * 获取当前时间戳（毫秒）。
 *
 * @example
 * ```ts
 * const ts = time.now()
 * ```
 */
function now(): number {
  return Date.now()
}

/**
 * 获取当前时间戳（秒）。
 *
 * @example
 * ```ts
 * const ts = time.nowSeconds()
 * ```
 */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * 解析日期字符串。
 *
 * @example
 * ```ts
 * const date = time.parseDate('2024-01-01')
 * ```
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr)
}

/**
 * 判断是否为有效日期。
 *
 * @example
 * ```ts
 * time.isValidDate(new Date('invalid')) // false
 * ```
 */
function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime())
}

/**
 * 添加天数。
 *
 * @example
 * ```ts
 * time.addDays(new Date(), 7)
 * ```
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * 添加小时。
 *
 * @example
 * ```ts
 * time.addHours(new Date(), 1)
 * ```
 */
function addHours(date: Date, hours: number): Date {
  const result = new Date(date)
  result.setHours(result.getHours() + hours)
  return result
}

/**
 * 获取日期的开始时间（00:00:00）。
 *
 * @example
 * ```ts
 * time.startOfDay(new Date())
 * ```
 */
function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * 获取日期的结束时间（23:59:59）。
 *
 * @example
 * ```ts
 * time.endOfDay(new Date())
 * ```
 */
function endOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

/**
 * 时间操作工具对象。
 *
 * @example
 * ```ts
 * time.formatDate(new Date())
 * ```
 */
export const time = {
  formatDate,
  timeAgo,
  now,
  nowSeconds,
  parseDate,
  isValidDate,
  addDays,
  addHours,
  startOfDay,
  endOfDay,
}
