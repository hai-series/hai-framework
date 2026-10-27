import type { CrudFieldDef } from '../src/lib/components/scenes/crud/index.js'
// @vitest-environment jsdom
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Input, Select, Textarea } from '../src/lib/components/primitives/index.js'
import { CrudEditPanel } from '../src/lib/components/scenes/crud/index.js'
import { PasswordInput, UserProfile } from '../src/lib/components/scenes/iam/index.js'
import { setUILocale } from '../src/lib/messages.js'
import ControlledValidationHarness from './fixtures/ControlledValidationHarness.svelte'
import FormLayoutHarness from './fixtures/FormLayoutHarness.svelte'
import FormVisibilityHarness from './fixtures/FormVisibilityHarness.svelte'

afterEach(() => setUILocale('zh-CN'))

function target() {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  flushSync()
}

describe('form layout and accessible errors', () => {
  it.each([false, true])('关闭保留子树的容器后清除校验，重开保持未访问状态：drawer=%s', async (drawer) => {
    const element = target()
    const component = mount(FormVisibilityHarness, { target: element, props: { drawer } })
    try {
      flushSync()
      const control = element.querySelector<HTMLInputElement>('input[required]')!
      input(control, 'draft')
      input(control, '')
      control.dispatchEvent(new FocusEvent('blur'))
      flushSync()
      expect(control.getAttribute('aria-invalid')).toBe('true')
      element.querySelector<HTMLButtonElement>('[data-testid="close"]')!.click()
      flushSync()
      element.querySelector<HTMLButtonElement>('[data-testid="reopen"]')!.click()
      flushSync()
      expect(control.validity.customError).toBe(false)
      expect(control.hasAttribute('aria-invalid')).toBe(false)
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it('资料表单的业务约束在失焦时显示，取消后恢复有效数据', async () => {
    const element = target()
    const component = mount(UserProfile, { target: element, props: {
      user: { username: 'original' },
      editable: true,
      alwaysEditable: true,
      fields: ['username'],
      fieldConstraints: { username: { pattern: '\\w{3,20}', validationMessage: () => 'Use 3 to 20 letters or digits' } },
    } })
    try {
      flushSync()
      const control = element.querySelector<HTMLInputElement>('input[name="username"]')!
      input(control, 'a')
      control.dispatchEvent(new FocusEvent('blur'))
      flushSync()
      expect(element.textContent).toContain('Use 3 to 20 letters or digits')
      element.querySelector<HTMLButtonElement>('button[type="button"]')!.click()
      flushSync()
      expect(control.value).toBe('original')
      expect(control.hasAttribute('aria-invalid')).toBe(false)
      expect(control.checkValidity()).toBe(true)
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it.each([Input, Textarea, PasswordInput])('未输入空字段失焦不挤动操作，输入后失焦或提交仍校验必填', async (Control) => {
    setUILocale('en-US')
    const element = target()
    const component = mount(Control, { target: element, props: { required: true } })
    try {
      flushSync()
      const control = element.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!
      expect(control.hasAttribute('aria-invalid')).toBe(false)
      control.dispatchEvent(new FocusEvent('blur'))
      flushSync()
      expect(control.hasAttribute('aria-invalid')).toBe(false)
      input(control, 'draft')
      input(control, '')
      control.dispatchEvent(new FocusEvent('blur'))
      flushSync()
      expect(control.getAttribute('aria-invalid')).toBe('true')
      expect(element.textContent).toContain('This field is required.')
      input(control, 'Corrected')
      expect(control.hasAttribute('aria-invalid')).toBe(false)
      expect(control.checkValidity()).toBe(true)
      expect(element.textContent).not.toContain('This field is required.')
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it.each([undefined, 8])('密码长度仅在明确声明约束时校验：minLength=%s', async (minLength) => {
    const element = target()
    const component = mount(PasswordInput, { target: element, props: { minLength } })
    try {
      flushSync()
      const control = element.querySelector('input')!
      input(control, 'short')
      control.dispatchEvent(new FocusEvent('blur'))
      flushSync()
      expect(control.getAttribute('aria-invalid')).toBe(minLength ? 'true' : null)
      input(control, 'long-enough')
      expect(control.hasAttribute('aria-invalid')).toBe(false)
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it('选择框离开整个控件后显示错误，进入选项时不提前提示', async () => {
    const element = target()
    const component = mount(Select, { target: element, props: { required: true, options: [{ value: 'admin', label: 'Admin' }] } })
    try {
      flushSync()
      const control = element.querySelector<HTMLInputElement>('input')!
      control.focus()
      flushSync()
      const option = document.querySelector<HTMLElement>('[role="option"]')!
      option.focus()
      flushSync()
      expect(control.hasAttribute('aria-invalid')).toBe(false)
      control.focus()
      control.blur()
      flushSync()
      expect(control.getAttribute('aria-invalid')).toBe('true')
      control.focus()
      flushSync()
      document.querySelector<HTMLElement>('[role="option"]')!.click()
      flushSync()
      expect(control.hasAttribute('aria-invalid')).toBe(false)
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it.each([false, true])('受控字段回填后清除旧的错误：multiline=%s', async (multiline) => {
    const element = target()
    const component = mount(ControlledValidationHarness, { target: element, props: { multiline } })
    try {
      flushSync()
      const control = element.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!
      expect(control.checkValidity()).toBe(false)
      flushSync()
      expect(control.getAttribute('aria-invalid')).toBe('true')
      element.querySelector('button')!.click()
      flushSync()
      expect(control.value).toBe('Restored')
      expect(control.checkValidity()).toBe(true)
      expect(control.hasAttribute('aria-invalid')).toBe(false)
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it('字段继承标签配置，自动关联控件和提示，显式跨度保留', async () => {
    const element = target()
    const component = mount(FormLayoutHarness, { target: element, props: { columns: 2, labelPosition: 'left', error: 'Invalid email' } })
    try {
      flushSync()
      expect(element.querySelector('.hai-form-grid')?.getAttribute('data-columns')).toBe('2')
      expect(element.querySelector('[data-field="notes"]')?.getAttribute('data-col-span')).toBe('auto')
      expect(element.querySelector('[data-field="short-notes"]')?.getAttribute('data-col-span')).toBe('1')
      expect(element.querySelector('[data-field="full-row"]')?.getAttribute('data-col-span')).toBe('2')
      for (const field of element.querySelectorAll('.hai-form-field')) {
        expect(field.getAttribute('data-label-position')).toBe('left')
        const label = field.querySelector('label')!
        expect(label.control).toBe(field.querySelector('input:not([type="hidden"]), textarea'))
      }
      const email = element.querySelector<HTMLInputElement>('input[name="email"]')!
      expect(email.getAttribute('aria-invalid')).toBe('true')
      expect(document.getElementById(email.getAttribute('aria-describedby')!)?.textContent).toContain('Invalid email')
      const name = element.querySelector<HTMLInputElement>('input[name="name"]')!
      expect(document.getElementById(name.getAttribute('aria-describedby')!)?.textContent).toContain('Your display name')
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it.each([Input, Textarea])('自定义提示仅在无效时生效，修正后能够提交', async (Control) => {
    setUILocale('en-US')
    const element = target()
    const component = mount(Control, { target: element, props: { required: true, validationMessage: 'Please fill this in' } })
    try {
      flushSync()
      const control = element.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!
      expect(control.validity.customError).toBe(false)
      expect(control.checkValidity()).toBe(false)
      flushSync()
      expect(control.validationMessage).toBe('Please fill this in')
      expect(control.getAttribute('aria-invalid')).toBe('true')
      input(control, 'Corrected')
      expect(control.checkValidity()).toBe(true)
      expect(control.validity.customError).toBe(false)
      expect(element.textContent).not.toContain('Please fill this in')
      expect(control.hasAttribute('aria-invalid')).toBe(false)
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it('已经显示的错误随语言切换更新，重置只触发一次并清空错误', async () => {
    setUILocale('en-US')
    const onreset = vi.fn()
    const element = target()
    const component = mount(FormLayoutHarness, { target: element, props: { onreset } })
    try {
      flushSync()
      const control = element.querySelector<HTMLInputElement>('input[name="name"]')!
      expect(control.checkValidity()).toBe(false)
      flushSync()
      expect(element.textContent).toContain('This field is required.')
      setUILocale('zh-CN')
      flushSync()
      expect(element.textContent).toContain('请填写此项。')
      expect(control.validationMessage).toBe('请填写此项。')
      element.querySelector<HTMLButtonElement>('button[type="reset"]')!.click()
      flushSync()
      expect(onreset).toHaveBeenCalledTimes(1)
      expect(control.validity.customError).toBe(false)
      expect(control.hasAttribute('aria-invalid')).toBe(false)
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it.each([0, false])('选择值 %s 不被当作空值，必填与表单序列化正常', async (value) => {
    const element = target()
    const component = mount(Select, { target: element, props: { value, required: true, name: 'choice', options: [{ value, label: 'Chosen' }] } })
    try {
      flushSync()
      expect(element.querySelector<HTMLInputElement>('input')?.value).toBe('Chosen')
      const control = element.querySelector('select')!
      expect(control.checkValidity()).toBe(true)
      expect(control.value).toBe(String(value))
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })
})

describe('crud create and edit validation', () => {
  it.each(['create', 'edit'] as const)('%s 仅在访问字段失焦后校验，修正后清除错误', async (mode) => {
    setUILocale('en-US')
    const element = target()
    const component = mount(CrudEditPanel, { target: element, props: {
      open: true,
      mode,
      fields: [
        { id: 'name', label: 'Name', type: 'string', validation: { min: 3, required: true, message: () => 'Name needs 3 characters' } },
        { id: 'email', label: 'Email', type: 'email', validation: { required: true } },
      ],
    } })
    try {
      flushSync()
      const control = element.querySelector<HTMLInputElement>('input[name="name"]')!
      expect(element.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
      control.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      flushSync()
      expect(element.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
      input(control, 'ab')
      expect(element.textContent).not.toContain('Name needs 3 characters')
      control.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      flushSync()
      expect(element.textContent).toContain('Name needs 3 characters')
      expect(element.querySelector<HTMLInputElement>('input[name="email"]')!.hasAttribute('aria-invalid')).toBe(false)
      input(control, 'Ada')
      expect(element.textContent).not.toContain('Name needs 3 characters')
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it.each([
    { type: 'number', validation: { min: 1 }, bad: 0, good: 1, message: 'at least 1' },
    { type: 'number', validation: { max: 10 }, bad: 11, good: 10, message: 'no greater than 10' },
    { type: 'string', validation: { min: 3 }, bad: 'ab', good: 'abc', message: 'at least 3 characters' },
    { type: 'textarea', validation: { max: 3 }, bad: 'abcd', good: 'abc', message: 'no more than 3 characters' },
    { type: 'string', validation: { pattern: '[A-Z]+' }, bad: 'abc', good: 'ABC', message: 'required format' },
    { type: 'email', validation: {}, bad: 'bad', good: 'ada@example.com', message: 'valid email' },
    { type: 'url', validation: {}, bad: 'bad', good: 'https://example.com', message: 'valid URL' },
  ] satisfies Array<{ type: CrudFieldDef['type'], validation: CrudFieldDef['validation'], bad: string | number, good: string | number, message: string }>)('$type 的 $validation 校验允许修正后提交', async ({ type, validation, bad, good, message }) => {
    setUILocale('en-US')
    const onsubmit = vi.fn()
    const element = target()
    const component = mount(CrudEditPanel, { target: element, props: {
      open: true,
      fields: [{ id: 'value', label: 'Value', type, validation }],
      formData: { value: bad },
      onsubmit,
    } })
    try {
      flushSync()
      const form = element.querySelector('form')!
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      flushSync()
      expect(onsubmit).not.toHaveBeenCalled()
      expect(element.textContent).toContain(message)
      input(form.querySelector<HTMLInputElement | HTMLTextAreaElement>('[name="value"]')!, String(good))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      flushSync()
      expect(onsubmit).toHaveBeenCalledExactlyOnceWith({ value: good })
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it.each(['drawer', 'modal'] as const)('%s 的保存与键盘提交统一校验，错误可修复', async (variant) => {
    setUILocale('en-US')
    const onsubmit = vi.fn()
    const element = target()
    const component = mount(CrudEditPanel, { target: element, props: {
      open: true,
      variant,
      columns: 2,
      labelPosition: 'left',
      formData: { amount: '', name: '', roles: [] },
      fields: [
        { id: 'name', label: 'Name', type: 'string', validation: { required: true, min: 3 } },
        { id: 'amount', label: 'Amount', type: 'number', validation: { required: true, min: 1 } },
        { id: 'roles', label: 'Roles', type: 'multi-select', validation: { required: true }, options: [{ value: 'admin', label: 'Admin' }] },
      ],
      onsubmit,
    } })
    try {
      flushSync()
      const save = [...element.querySelectorAll('button')].find(button => button.textContent?.includes('Create'))!
      save.click()
      flushSync()
      expect(onsubmit).not.toHaveBeenCalled()
      expect(element.querySelectorAll('[aria-invalid="true"]')).toHaveLength(3)
      setUILocale('zh-CN')
      flushSync()
      expect(element.textContent).toContain('请填写此项。')
      input(element.querySelector<HTMLInputElement>('input[name="name"]')!, 'ab')
      expect(element.textContent).toContain('请至少输入 3 个字符。')
      input(element.querySelector<HTMLInputElement>('input[name="name"]')!, 'Ada')
      input(element.querySelector<HTMLInputElement>('input[name="amount"]')!, '2')
      element.querySelector<HTMLInputElement>('form input[type="checkbox"]')!.click()
      flushSync()
      expect(element.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
      element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      flushSync()
      expect(onsubmit).toHaveBeenCalledExactlyOnceWith({ name: 'Ada', amount: 2, roles: ['admin'] })
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })

  it('编辑跳过只读字段，支持延迟翻译的自定义校验文案', async () => {
    const onsubmit = vi.fn()
    const element = target()
    const component = mount(CrudEditPanel, { target: element, props: {
      open: true,
      mode: 'edit',
      fields: [
        { id: 'id', label: 'ID', type: 'string', readonly: true, validation: { required: true } },
        { id: 'email', label: 'Email', type: 'email', validation: { required: true, message: () => 'Custom email error' } },
      ],
      onsubmit,
    } })
    try {
      flushSync()
      element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      flushSync()
      expect(element.textContent).toContain('Custom email error')
      expect(element.querySelectorAll('[aria-invalid="true"]')).toHaveLength(1)
      input(element.querySelector<HTMLInputElement>('input[name="email"]')!, 'ada@example.com')
      element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      flushSync()
      expect(onsubmit).toHaveBeenCalledExactlyOnceWith({ email: 'ada@example.com' })
    }
    finally {
      await unmount(component)
      element.remove()
    }
  })
})
