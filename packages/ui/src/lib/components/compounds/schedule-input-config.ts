/**
 * ScheduleInput schema metadata 的公开入口。
 *
 * 日期时间草稿和 canonical 值工具只供 ScheduleInput 内部使用；这个模块
 * 保持工作流 schema 消费者所需的最小公开 API。
 */

import { normalizeScheduleInputConfig } from './schedule-input.js'

export type { ScheduleInputConfig } from './schedule-input.js'

/**
 * 此组件子路径提供的运行工具。
 * @example
 * ```ts
 * import { ui } from '@h-ai/ui/components/compounds/schedule-input'
 *
 * // 未提供配置时应用 ScheduleInput 的默认设置。
 * const config = ui.normalizeScheduleInputConfig(undefined)
 * void config
 * ```
 */
export const ui = { normalizeScheduleInputConfig }
