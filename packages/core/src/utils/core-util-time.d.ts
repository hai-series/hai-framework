/**
 * =============================================================================
 * @h-ai/core - 时间操作工具
 * =============================================================================
 */
/**
 * 格式化日期。
 * @param date - 日期对象
 * @param format - 格式模板（默认 YYYY-MM-DD）
 * @returns 格式化后的字符串
 *
 * @example
 * ```ts
 * time.formatDate(new Date(), 'YYYY-MM-DD')
 * ```
 */
declare function formatDate(date: Date, format?: string): string
/**
 * 相对时间描述。
 * @param date - 目标日期
 * @returns 相对时间文案
 * @remarks 使用 i18n 消息返回结果。
 *
 * @example
 * ```ts
 * time.timeAgo(new Date(Date.now() - 60000))
 * ```
 */
declare function timeAgo(date: Date): string
/**
 * 获取当前时间戳（毫秒）。
 * @returns 当前时间戳（毫秒）
 *
 * @example
 * ```ts
 * const ts = time.now()
 * ```
 */
declare function now(): number
/**
 * 获取当前时间戳（秒）。
 * @returns 当前时间戳（秒）
 *
 * @example
 * ```ts
 * const ts = time.nowSeconds()
 * ```
 */
declare function nowSeconds(): number
/**
 * 解析日期字符串。
 * @param dateStr - 日期字符串
 * @returns Date 对象
 * @remarks 无效字符串将生成 Invalid Date。
 *
 * @example
 * ```ts
 * const date = time.parseDate('2024-01-01')
 * ```
 */
declare function parseDate(dateStr: string): Date
/**
 * 判断是否为有效日期。
 * @param date - Date 对象
 * @returns 是否为有效日期
 *
 * @example
 * ```ts
 * time.isValidDate(new Date('invalid')) // false
 * ```
 */
declare function isValidDate(date: Date): boolean
/**
 * 添加天数。
 * @param date - 原始日期
 * @param days - 增加天数（可为负数）
 * @returns 新的日期对象
 *
 * @example
 * ```ts
 * time.addDays(new Date(), 7)
 * ```
 */
declare function addDays(date: Date, days: number): Date
/**
 * 添加小时。
 * @param date - 原始日期
 * @param hours - 增加小时（可为负数）
 * @returns 新的日期对象
 *
 * @example
 * ```ts
 * time.addHours(new Date(), 1)
 * ```
 */
declare function addHours(date: Date, hours: number): Date
/**
 * 获取日期的开始时间（00:00:00）。
 * @param date - 目标日期
 * @returns 当天开始时间
 *
 * @example
 * ```ts
 * time.startOfDay(new Date())
 * ```
 */
declare function startOfDay(date: Date): Date
/**
 * 获取日期的结束时间（23:59:59）。
 * @param date - 目标日期
 * @returns 当天结束时间
 *
 * @example
 * ```ts
 * time.endOfDay(new Date())
 * ```
 */
declare function endOfDay(date: Date): Date
/**
 * 时间操作工具对象。
 *
 * @example
 * ```ts
 * time.formatDate(new Date())
 * ```
 */
export declare const time: {
  formatDate: typeof formatDate
  timeAgo: typeof timeAgo
  now: typeof now
  nowSeconds: typeof nowSeconds
  parseDate: typeof parseDate
  isValidDate: typeof isValidDate
  addDays: typeof addDays
  addHours: typeof addHours
  startOfDay: typeof startOfDay
  endOfDay: typeof endOfDay
}
export {}
// # sourceMappingURL=core-util-time.d.ts.map
