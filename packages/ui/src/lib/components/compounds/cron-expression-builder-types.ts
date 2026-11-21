/**
 * Cron builder 的可视化模式。
 *
 * @example
 * ```ts
 * import type { CronBuilderMode } from '@h-ai/ui'
 * const mode: CronBuilderMode = 'week'
 * ```
 */
export type CronBuilderMode = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'custom'

/**
 * Cron builder 支持的星期值，0 和 7 都表示星期日，内部统一为 0。
 *
 * @example
 * ```ts
 * import type { CronWeekdayValue } from '@h-ai/ui'
 * const sunday: CronWeekdayValue = '0'
 * ```
 */
export type CronWeekdayValue = '0' | '1' | '2' | '3' | '4' | '5' | '6'

/**
 * 可视化 Cron builder 的内部状态。
 *
 * @example
 * ```ts
 * import type { CronBuilderState } from '@h-ai/ui'
 * const state: CronBuilderState = {
 *   mode: 'day', customExpression: '', minuteInterval: 5,
 *   hour: 10, minute: 0, monthDay: 1, weekDays: ['1'],
 * }
 * ```
 */
export interface CronBuilderState {
  mode: CronBuilderMode
  customExpression: string
  minuteInterval: number
  hour: number
  minute: number
  monthDay: number
  weekDays: CronWeekdayValue[]
}

/**
 * Cron builder 的快捷预设。
 *
 * @example
 * ```ts
 * import type { CronExpressionBuilderPreset } from '@h-ai/ui'
 * const preset: CronExpressionBuilderPreset = { expression: '0 10 * * *', label: 'Daily' }
 * ```
 */
export interface CronExpressionBuilderPreset {
  expression: string
  label: string
  description?: string
}

/**
 * Cron builder 的用户可见文案。
 *
 * @example
 * ```ts
 * import type { CronExpressionBuilderLabels } from '@h-ai/ui'
 * const labels: CronExpressionBuilderLabels = {
 *   presets: 'Presets', modeMinute: 'Every few minutes', modeHour: 'Hourly',
 *   modeDay: 'Daily', modeWeek: 'Weekly', modeMonth: 'Monthly', modeCustom: 'Custom',
 *   fieldInterval: 'Interval', fieldMinute: 'Minute', fieldTime: 'Time',
 *   fieldWeekdays: 'Weekdays', fieldMonthDay: 'Day of month', fieldExpression: 'Cron',
 * }
 * ```
 */
export interface CronExpressionBuilderLabels {
  presets: string
  modeMinute: string
  modeHour: string
  modeDay: string
  modeWeek: string
  modeMonth: string
  modeCustom: string
  fieldInterval: string
  fieldMinute: string
  fieldTime: string
  fieldWeekdays: string
  fieldMonthDay: string
  fieldExpression: string
}

/**
 * 星期选项，宿主可用本地化文案替换默认选项。
 *
 * @example
 * ```ts
 * import type { CronExpressionBuilderWeekdayOption } from '@h-ai/ui'
 * const monday: CronExpressionBuilderWeekdayOption = { value: '1', label: 'Mon' }
 * ```
 */
export interface CronExpressionBuilderWeekdayOption {
  value: CronWeekdayValue
  label: string
}
