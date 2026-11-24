/**
 * @h-ai/scheduler — Cron 表达式工具（基于 croner）
 *
 * 使用 croner 解析和匹配按分钟执行的五字段 cron 表达式。
 * @module scheduler-cron
 */

import type { HaiResult } from '@h-ai/core'
import { core } from '@h-ai/core'
import { Cron } from 'croner'

import { schedulerM } from './scheduler-i18n.js'
import { HaiSchedulerError } from './scheduler-types.js'

// ─── 公共 API ───

/**
 * 解析 cron 表达式并返回 Cron 实例
 *
 * @param expression - cron 表达式
 * @param timezone - IANA 时区；省略时使用 UTC，不读取节点本地 TZ。
 * @returns 解析结果，成功时返回 Cron 实例
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const parsed = parseCronExpression('0 2 * * *')
 * if (!parsed.success) return parsed
 * const due = matchesCron(parsed.data, new Date('2026-10-23T02:00:00Z'))
 * return due
 * ```
 */
export function parseCronExpression(expression: string, timezone?: string): HaiResult<Cron> {
  const invalidCron = () => core.err(
    HaiSchedulerError.INVALID_CRON,
    schedulerM('scheduler_invalidCron', {
      params: { expression },
    }),
  )
  if (typeof expression !== 'string' || expression.trim().split(/\s+/).length !== 5)
    return invalidCron()

  const zone = timezone ?? 'UTC'
  const invalidTimezone = () => core.err(HaiSchedulerError.INVALID_CRON, schedulerM('scheduler_invalidTimezone', {
    params: { timezone: zone },
  }))
  // 数字偏移不属于任务定义的 IANA 时区契约。
  if (typeof zone !== 'string' || /^[+-]/.test(zone))
    return invalidTimezone()
  let timeZone: string
  try {
    // Croner 在构造时未必检查时区。
    timeZone = new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone
  }
  catch {
    return invalidTimezone()
  }
  try {
    return core.ok(new Cron(expression.trim(), { legacyMode: false, timezone: timeZone }))
  }
  catch {
    return invalidCron()
  }
}

/**
 * 判断给定时间是否匹配 cron 实例
 *
 * @param cron - croner Cron 实例
 * @param date - 要检查的时间
 * @returns 是否匹配
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const parsed = parseCronExpression('0 10 * * *', 'Asia/Shanghai')
 * if (!parsed.success) return parsed
 * const due = matchesCron(parsed.data, new Date('2026-10-23T02:00:00Z'))
 * return due
 * ```
 */
export function matchesCron(cron: Cron, date: Date): boolean {
  return cron.match(date)
}
