/**
 * @h-ai/ui — ActionSheet 类型定义
 * @module action-sheet-types
 */

/**
 * 底部操作菜单条目；危险动作可用 destructive 强调，禁用项不会触发选择。
 *
 * @example
 * ```ts
 * import type { ActionSheetItem } from '@h-ai/ui'
 * const example: ActionSheetItem = { id: 'remove', label: '删除', destructive: true }
 * ```
 */
export interface ActionSheetItem {
  /** 操作 ID */
  id: string
  /** 显示文本 */
  label: string
  /** 是否为危险操作（红色文字） */
  destructive?: boolean
  /** 是否禁用 */
  disabled?: boolean
}
