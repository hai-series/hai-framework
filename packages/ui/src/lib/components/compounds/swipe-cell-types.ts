/**
 * @h-ai/ui — SwipeCell 类型定义
 * @module swipe-cell-types
 */

export interface SwipeCellAction {
  /** 操作 ID */
  id: string
  /** 显示文本 */
  label: string
  /** 按钮变体 */
  variant?: 'primary' | 'error' | 'warning' | 'info'
  /** 按钮宽度（px） */
  width?: number
}
