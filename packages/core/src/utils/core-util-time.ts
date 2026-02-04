/**
 * =============================================================================
 * @hai/core - 时间操作工具
 * =============================================================================
 */

import { i18n } from '../i18n/index.js'

/**
 * 格式化日期
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
 * 相对时间描述
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
 * 获取当前时间戳（毫秒）
 */
function now(): number {
  return Date.now()
}

/**
 * 获取当前时间戳（秒）
 */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * 解析日期字符串
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr)
}

/**
 * 判断是否为有效日期
 */
function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime())
}

/**
 * 添加天数
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * 添加小时
 */
function addHours(date: Date, hours: number): Date {
  const result = new Date(date)
  result.setHours(result.getHours() + hours)
  return result
}

/**
 * 获取日期的开始时间（00:00:00）
 */
function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * 获取日期的结束时间（23:59:59）
 */
function endOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

/**
 * 时间操作工具对象
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
