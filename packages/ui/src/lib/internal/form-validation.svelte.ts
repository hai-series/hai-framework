/** 将原生校验状态保留为消息键，显示时按当前 UI 语言解析。 */
import type { UIMessageKey } from '../messages.js'
import type { FormText } from '../types.js'
import { untrack } from 'svelte'
import { getUILocale, uiM } from '../messages.js'
import { getFormVisibilityContext } from './form-context.js'

export interface FormValidationIssue {
  key: UIMessageKey
  params?: Record<string, string | number>
}

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

export function resolveFormText(text?: FormText): string {
  if (typeof text !== 'function')
    return text ?? ''
  // 应用翻译函数也在 UI 语言同步后重新求值。
  void getUILocale()
  return text()
}

function readIssue(control: FormControl): FormValidationIssue | undefined {
  if (!control.willValidate)
    return undefined
  const validity = control.validity
  if (validity.valueMissing)
    return { key: 'form_required' }
  if (validity.typeMismatch)
    return { key: control.getAttribute('type') === 'email' ? 'form_email' : 'form_url' }
  // 程序回填的值也需校验长度，原生 tooShort/tooLong 只覆盖用户输入。
  const minLength = control.getAttribute('minlength')
  const maxLength = control.getAttribute('maxlength')
  if (validity.tooShort || (control.value && minLength !== null && control.value.length < Number(minLength)))
    return { key: 'form_min_length', params: { min: control.getAttribute('minlength') ?? '' } }
  if (validity.tooLong || (control.value && maxLength !== null && control.value.length > Number(maxLength)))
    return { key: 'form_max_length', params: { max: control.getAttribute('maxlength') ?? '' } }
  if (validity.rangeUnderflow)
    return { key: 'form_min', params: { min: control.getAttribute('min') ?? '' } }
  if (validity.rangeOverflow)
    return { key: 'form_max', params: { max: control.getAttribute('max') ?? '' } }
  if (validity.stepMismatch)
    return { key: 'form_step', params: { step: control.getAttribute('step') ?? '1' } }
  if (validity.badInput)
    return { key: 'form_number' }
  if (validity.patternMismatch)
    return { key: 'form_pattern' }
  return undefined
}

export function createControlValidation(getOverride: () => FormText | undefined = () => undefined, getValue?: () => unknown) {
  const visibility = getFormVisibilityContext()
  let issue = $state<FormValidationIssue>()
  let currentControl = $state<FormControl>()
  function reset() {
    issue = undefined
    currentControl?.setCustomValidity('')
  }
  $effect(() => {
    // 弹窗与抽屉保留子树；关闭时清理原生错误，重开不能沿用上次的触碰状态。
    if (visibility && !visibility.open)
      reset()
  })
  $effect(() => {
    const form = currentControl?.form
    form?.addEventListener('reset', reset)
    return () => form?.removeEventListener('reset', reset)
  })
  $effect(() => {
    getValue?.()
    const control = currentControl
    if (control) {
      // 回填、重置及约束变更不一定触发 input；同步清除过期的原生错误。
      untrack(() => {
        control.setCustomValidity('')
        if (issue)
          issue = readIssue(control)
      })
    }
  })
  return {
    get message() {
      return issue ? resolveFormText(getOverride()) || uiM(issue.key, issue.params) : ''
    },
    validate(control: FormControl) {
      currentControl = control
      control.setCustomValidity('')
      issue = readIssue(control)
      control.setCustomValidity(issue ? resolveFormText(getOverride()) || uiM(issue.key, issue.params) : '')
    },
    input(control: FormControl) {
      currentControl = control
      control.setCustomValidity('')
      if (issue)
        issue = readIssue(control)
    },
    reset,
  }
}
