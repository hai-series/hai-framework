/** CRUD 客户端字段校验；仅返回消息键，避免错误文案锁定在提交时的语言。 */
import type { FormValidationIssue } from '../../../internal/form-validation.svelte.js'
import type { CrudFieldDef } from './crud-controller.svelte.js'

export function getCrudValidationIssue(field: CrudFieldDef, value: unknown): FormValidationIssue | undefined {
  const rules = field.validation
  const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0)
  if (rules?.required && (empty || (value === false && (field.type === 'boolean' || field.type === 'checkbox'))))
    return { key: 'form_required' }
  if (empty)
    return undefined

  if (field.type === 'number') {
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number))
      return { key: 'form_number' }
    if (rules?.min !== undefined && number < rules.min)
      return { key: 'form_min', params: { min: rules.min } }
    if (rules?.max !== undefined && number > rules.max)
      return { key: 'form_max', params: { max: rules.max } }
  }
  else if (typeof value === 'string') {
    if (rules?.min !== undefined && value.length < rules.min)
      return { key: 'form_min_length', params: { min: rules.min } }
    if (rules?.max !== undefined && value.length > rules.max)
      return { key: 'form_max_length', params: { max: rules.max } }
  }

  if (field.type === 'email' && !/^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)*$/i.test(String(value)))
    return { key: 'form_email' }
  if (field.type === 'url') {
    if (!URL.canParse(String(value)))
      return { key: 'form_url' }
  }
  if (rules?.pattern) {
    try {
      if (!new RegExp(`^(?:${rules.pattern})$`, 'v').test(String(value)))
        return { key: 'form_pattern' }
    }
    catch {
      return { key: 'form_pattern' }
    }
  }
  return undefined
}
