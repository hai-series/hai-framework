/**
 * ScheduleInput schema metadata 的公开入口。
 *
 * 日期时间草稿和 canonical 值工具只供 ScheduleInput 内部使用；这个模块
 * 保持工作流 schema 消费者所需的最小公开 API。
 */
export { normalizeScheduleInputConfig } from './schedule-input.js'
export type { ScheduleInputConfig } from './schedule-input.js'
