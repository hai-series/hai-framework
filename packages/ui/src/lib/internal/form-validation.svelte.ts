/** 将原生校验状态保留为消息键，显示时按当前 UI 语言解析。 */
import type { UIMessageKey } from '../messages.js'
import type { FormText } from '../types.js'
import { untrack } from 'svelte'
import { getUILocale, uiM } from '../messages.js'
import { useToastFeedback } from '../toast.svelte.js'
import { getFormFieldContext, getFormVisibilityContext } from './form-context.js'

/**
 * 将字段错误交给公共 Toast；字段本身继续保留 aria-invalid 和关联说明。
 * @param message - 读取当前字段的错误。
 * @param label - 可选的独立字段名称；省略时使用 FormField 上下文。
 * @example 模块内部上下文
 * ```ts
 * // 在 Svelte 组件初始化时注册，状态由控件维护。
 * useControlFeedback(() => '邮箱格式不正确', () => '邮箱')
 * ```
 */
export function useControlFeedback(message: () => string, label?: () => string | undefined): void {
  const field = getFormFieldContext()
  const visibility = getFormVisibilityContext()
  useToastFeedback(() => {
    const value = message()
    if (!value || field?.error || visibility?.open === false)
      return ''
    const name = label?.() || field?.label
    return name ? uiM('form_field_error', { label: name, message: value }) : value
  })
}

/**
 * 可重新翻译的原生约束错误，不缓存某个语言的最终文案。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: FormValidationIssue = { key: 'form_min_length', params: { min: 12 } }
 * ```
 */
export interface FormValidationIssue {
  key: UIMessageKey
  params?: Record<string, string | number>
}

/**
 * 参与原生约束校验的表单控件集合。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: FormControl = document.createElement('input')
 * ```
 */
type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

/**
 * 在显示时求值表单提示，语言切换后读取最新业务翻译。
 * @param text - 待处理文本。
 * @returns 当前语言的表单提示，空输入为空字符串。
 *
 * @example 模块内部上下文
 * ```ts
 * const message = resolveFormText(() => '邮箱不能为空')
 * ```
 */
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

/**
 * 在组件初始化阶段创建原生约束校验状态；宿主关闭或表单 reset 时清除过期错误。
 * @param getOverride - 读取自定义校验提示的函数。
 * @param getValue - 读取当前控件值以跟踪程序回填的函数。
 * @returns 带响应式 message 和 validate/blur/input/reset 方法的校验状态。
 *
 * @example 模块内部上下文
 * ```ts
 * const validation = createControlValidation(() => '邮箱不能为空')
 * const input = document.createElement('input')
 * input.required = true
 * validation.validate(input)
 * const message = validation.message
 * validation.reset()
 * ```
 */
export function createControlValidation(getOverride: () => FormText | undefined = () => undefined, getValue?: () => unknown) {
  const visibility = getFormVisibilityContext()
  let issue = $state<FormValidationIssue>()
  let currentControl = $state<FormControl>()
  let edited = false
  function reset() {
    issue = undefined
    edited = false
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
    blur(control: FormControl) {
      // 默认焦点离开未输入的空字段时不挤动按钮/链接；提交仍由原生 invalid 校验。
      if (edited || control.value || issue)
        this.validate(control)
    },
    input(control: FormControl) {
      edited = true
      currentControl = control
      control.setCustomValidity('')
      if (issue)
        issue = readIssue(control)
    },
    reset,
  }
}
