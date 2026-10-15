/** 表单布局和字段提示的内部上下文，不要求应用转发控件属性。 */
import type { FormLayoutOptions } from '../types.js'
import { getContext } from 'svelte'

export const FORM_LAYOUT_CONTEXT = Symbol('hai-form-layout')
export const FORM_FIELD_CONTEXT = Symbol('hai-form-field')

export interface FormFieldContext {
  readonly controlId: string
  readonly labelId: string
  readonly messageId: string | undefined
  readonly error: string
}

export function getFormLayoutContext(): FormLayoutOptions | undefined {
  return getContext<FormLayoutOptions | undefined>(FORM_LAYOUT_CONTEXT)
}

export function getFormFieldContext(): FormFieldContext | undefined {
  return getContext<FormFieldContext | undefined>(FORM_FIELD_CONTEXT)
}
