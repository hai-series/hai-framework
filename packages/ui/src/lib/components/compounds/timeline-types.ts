/**
 * @h-ai/ui — Timeline 类型定义
 * @module timeline-types
 */

export interface TimelineItem {
  /** 唯一标识 */
  id: string
  /** 标题 */
  title: string
  /** 描述内容 */
  description?: string
  /** 时间/日期标签 */
  time?: string
  /** 图标（可选，支持 emoji 或字符） */
  icon?: string
  /** 状态颜色 */
  color?: 'default' | 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info'
  /** 是否已完成 */
  completed?: boolean
}
