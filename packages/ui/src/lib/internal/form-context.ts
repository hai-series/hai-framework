/** 表单布局和字段提示的内部上下文，不要求应用转发控件属性。 */
import type { FormLayoutOptions } from '../types.js'
import { getContext } from 'svelte'

/**
 * 表单布局的私有 Svelte Context 键；应用通过 FormLayout 使用。
 *
 * @example 模块内部上下文
 * ```ts
 * const context = getContext<FormLayoutOptions | undefined>(FORM_LAYOUT_CONTEXT)
 * const columns = context?.columns
 * ```
 */
export const FORM_LAYOUT_CONTEXT = Symbol('hai-form-layout')
/**
 * 字段标签、错误与主控件关联的私有 Context 键。
 *
 * @example 模块内部上下文
 * ```ts
 * const field = getContext<FormFieldContext | undefined>(FORM_FIELD_CONTEXT)
 * const controlId = field?.controlId
 * ```
 */
export const FORM_FIELD_CONTEXT = Symbol('hai-form-field')
/**
 * Modal/Drawer 向内部表单同步可见性的私有 Context 键。
 *
 * @example 模块内部上下文
 * ```ts
 * const visibility = getContext<FormVisibilityContext | undefined>(FORM_VISIBILITY_CONTEXT)
 * const open = visibility?.open
 * ```
 */
export const FORM_VISIBILITY_CONTEXT = Symbol('hai-form-visibility')

/**
 * 表单宿主的响应式可见状态，用于关闭时重置触碰校验。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: FormVisibilityContext = { open: true }
 * ```
 */
interface FormVisibilityContext {
  readonly open: boolean
}

/**
 * 组件初始化阶段读取可见性；没有宿主时返回 undefined。
 * @returns 最近宿主的可见状态；无宿主时为 undefined。
 *
 * @example 模块内部上下文
 * ```ts
 * const visibility = getFormVisibilityContext()
 * const open = visibility?.open ?? true
 * ```
 */
export function getFormVisibilityContext(): FormVisibilityContext | undefined {
  return getContext<FormVisibilityContext | undefined>(FORM_VISIBILITY_CONTEXT)
}

/**
 * 标签、消息和主控件的关联状态，只在当前组件树中使用。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: FormFieldContext = { controlId: 'email', labelId: 'email-label', messageId: 'email-error', error: '邮箱不能为空' }
 * ```
 */
export interface FormFieldContext {
  readonly label?: string
  readonly controlId: string
  readonly labelId: string
  readonly messageId: string | undefined
  readonly error: string
}

/**
 * 组件初始化阶段读取祖先布局；没有祖先时使用控件默认布局。
 * @returns 最近表单布局；无祖先时为 undefined。
 *
 * @example 模块内部上下文
 * ```ts
 * const layout = getFormLayoutContext()
 * const columns = layout?.columns ?? 1
 * ```
 */
export function getFormLayoutContext(): FormLayoutOptions | undefined {
  return getContext<FormLayoutOptions | undefined>(FORM_LAYOUT_CONTEXT)
}

/**
 * 组件初始化阶段读取最近字段的无障碍关联和校验消息。
 * @returns 最近字段的标签、控件和校验消息关联；无字段时为 undefined。
 *
 * @example 模块内部上下文
 * ```ts
 * const field = getFormFieldContext()
 * const descriptionId = field?.messageId
 * ```
 */
export function getFormFieldContext(): FormFieldContext | undefined {
  return getContext<FormFieldContext | undefined>(FORM_FIELD_CONTEXT)
}
