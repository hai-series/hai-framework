/**
 * =============================================================================
 * @h-ai/scheduler - Cron 表达式工具（基于 croner）
 * =============================================================================
 *
 * 使用 croner 库解析和匹配 cron 表达式。
 * 支持标准 5/6 字段 cron 表达式及扩展语法。
 *
 * @module scheduler-cron
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { SchedulerError } from './scheduler-types.js'

import { err, ok } from '@h-ai/core'
import { Cron } from 'croner'

import { SchedulerErrorCode } from './scheduler-config.js'
import { schedulerM } from './scheduler-i18n.js'

// =============================================================================
// 公共 API
// =============================================================================

/**
 * 解析 cron 表达式并返回 Cron 实例
 *
 * @param expression - cron 表达式
 * @returns 解析结果，成功时返回 Cron 实例
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
export function parseCronExpression(expression: string): Result<Cron, SchedulerError> {
  try {
    const cron = new Cron(expression, { legacyMode: false })
    return ok(cron)
  }
  catch {
    return err({
      code: SchedulerErrorCode.INVALID_CRON,
      message: schedulerM('scheduler_invalidCron', { params: { expression } }),
    })
  }
}

/**
 * 判断给定时间是否匹配 cron 实例
 *
 * @param cron - croner Cron 实例
 * @param date - 要检查的时间
 * @returns 是否匹配
 */
export function matchesCron(cron: Cron, date: Date): boolean {
  return cron.match(date)
}
