/**
 * @h-ai/ui — Accordion 类型定义
 * @module accordion-types
 */

/**
 * 手风琴条目；id 应在当前条目集合内稳定且唯一。
 *
 * @example
 * ```ts
 * import type { AccordionItem } from '@h-ai/ui'
 * const example: AccordionItem = { id: 'intro', title: '简介', content: '操作说明' }
 * ```
 */
export interface AccordionItem {
  /** 唯一标识 */
  id: string
  /** 标题 */
  title: string
  /** 纯文本内容；自定义渲染使用 Accordion 的 children Snippet。 */
  content?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 图标（可选） */
  icon?: string
}
