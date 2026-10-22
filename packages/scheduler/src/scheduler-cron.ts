/**
 * @h-ai/scheduler — Cron 表达式工具（基于 croner）
 *
 * 使用 croner 库解析和匹配 cron 表达式。 支持标准 5/6 字段 cron 表达式及扩展语法。
 * @module scheduler-cron
 */

import type { HaiResult } from '@h-ai/core'
import { err, ok } from '@h-ai/core'
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
  try {
    const cron = new Cron(expression, { legacyMode: false, timezone: timezone ?? 'UTC' })
    return ok(cron)
  }
  catch {
    return err(
      HaiSchedulerError.INVALID_CRON,
      schedulerM('scheduler_invalidCron', { params: { expression } }),
    )
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
