/**
 * @h-ai/ui — ActionSheet 类型定义
 * @module action-sheet-types
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
