/**
 * =============================================================================
 * @hai/ui - Accordion 类型定义
 * =============================================================================
 */

export interface AccordionItem {
  /** 唯一标识 */
  id: string
  /** 标题 */
  title: string
  /** 内容（字符串或 Snippet） */
  content?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 图标（可选） */
  icon?: string
}
