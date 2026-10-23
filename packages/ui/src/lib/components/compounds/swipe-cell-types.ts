/**
 * @h-ai/ui — SwipeCell 类型定义
 * @module swipe-cell-types
 */

/**
 * 滑动单元格的操作按钮；id 交给宿主完成实际业务动作。
 *
 * @example
 * ```ts
 * import type { SwipeCellAction } from '@h-ai/ui'
 * const example: SwipeCellAction = { id: 'remove', label: '删除', variant: 'error', width: 80 }
 * ```
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
