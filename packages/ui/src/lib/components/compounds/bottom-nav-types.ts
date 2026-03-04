/**
 * @h-ai/ui — BottomNav 类型定义
 * @module bottom-nav-types
 */

import type { Snippet } from 'svelte'

export interface BottomNavItem {
  /** 导航项 ID */
  id: string
  /** 显示文本 */
  label: string
  /** 图标 Snippet（与 iconClass 二选一） */
  icon?: Snippet
  /** CSS 图标类名，如 'icon-[tabler--home]'（与 icon 二选一） */
  iconClass?: string
  /** 角标数字 */
  badge?: number
}
