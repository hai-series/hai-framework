// @vitest-environment jsdom
import type { AuthPanelActions, AuthPanelConfig, LoginFormData, LoginFormProps } from '../src/lib/components/scenes/types.js'
import { err, ok } from '@h-ai/core'
import { createRawSnippet, flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { AuthPanel, ChangePasswordForm, LoginForm, RegisterForm } from '../src/lib/components/scenes/iam/index.js'
import { setUILocale } from '../src/lib/messages.js'
import { toast } from '../src/lib/toast.svelte.js'

afterEach(() => toast.clear())

const config: AuthPanelConfig = {
  login: { password: true, ldap: false, email: false, sms: false },
  register: { enabled: true },
  passwordReset: { enabled: false },
  password: { minLength: 8, maxLength: 128, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecialChar: false },
  otp: { length: 6, resendInterval: 60 },
  agreements: { showOnLogin: true, showOnRegister: true, userAgreementUrl: 'https://example.com/terms', privacyPolicyUrl: 'https://example.com/privacy' },
  ui: { variant: 'card' },
}

function snippet(text: string) {
  return createRawSnippet(() => ({ render: () => `<p>${text}</p>` }))
}

describe('authentication form extensions and agreements', () => {
  it('确认密码逐字符比较，兼容字符差异显示字段提示且不能静默进入提交层', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onsubmit = vi.fn()
    const component = mount(ChangePasswordForm, { target, props: { onsubmit } })
    function input(id: string, value: string) {
      const element = target.querySelector<HTMLInputElement>(id)!
      element.value = value
      element.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
    }
    try {
      flushSync()
      input('#old-password', 'CurrentPassword123!')
      input('#new-password', 'NewPassword123!')
      input('#confirm-password', 'ＮewPassword123!')
      target.querySelector('form')!.requestSubmit()
      expect(onsubmit).not.toHaveBeenCalled()
      expect(target.textContent).toContain('两次密码输入不一致')
      input('#confirm-password', 'NewPassword123!')
      target.querySelector('form')!.requestSubmit()
      expect(onsubmit).toHaveBeenCalledWith({ oldPassword: 'CurrentPassword123!', newPassword: 'NewPassword123!', confirmPassword: 'NewPassword123!' })
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('首次改密失败使用柔和错误样式和安全原因，保留追踪编号且成功前不授权', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const action = async () => ok(undefined)
    const renewPassword = vi.fn<NonNullable<AuthPanelActions['renewPassword']>>(action)
      .mockResolvedValueOnce(err({ code: 'hai:iam:034', message: 'Private policy detail', httpStatus: 400, traceId: 'renew-same' }))
      .mockResolvedValueOnce(err({ code: 'hai:iam:002', message: 'Original password wrong', httpStatus: 401, traceId: 'renew-credentials' }))
    const onauthenticated = vi.fn()
    const component = mount(AuthPanel, { target, props: {
      config: { ...config, agreements: { showOnLogin: false, showOnRegister: false } },
      actions: { login: async () => err({ code: 'hai:iam:025', message: 'Private initial detail', httpStatus: 401 }), register: action, sendOtp: action, requestPasswordReset: action, confirmPasswordReset: action, renewPassword },
      onauthenticated,
    } })
    function input(selector: string, value: string) {
      const element = target.querySelector<HTMLInputElement>(selector)!
      element.value = value
      element.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
    }
    try {
      flushSync()
      input('input[name="username"]', 'config_admin')
      input('input[type="password"]', 'InitialPassword123!')
      target.querySelector('form')!.requestSubmit()
      await vi.waitFor(() => expect(target.querySelector('.change-password-form')).not.toBeNull())
      expect(toast.items.some(item => item.message.includes('修改初始密码'))).toBe(true)
      input('#old-password', 'InitialPassword123!')
      input('#new-password', 'InitialPassword123!')
      input('#confirm-password', 'InitialPassword123!')
      target.querySelector('form')!.requestSubmit()
      await vi.waitFor(() => expect(toast.items.some(item => item.message.includes('新密码不能与当前密码相同'))).toBe(true))
      expect(toast.items.at(-1)?.message).toContain('traceId: renew-same')
      expect(target.querySelector('.alert-error')).toBeNull()
      expect(target.textContent).not.toContain('Private')
      expect(onauthenticated).not.toHaveBeenCalled()
      input('#old-password', 'WrongPassword123!')
      input('#new-password', 'NextPassword123!')
      input('#confirm-password', 'NextPassword123!')
      target.querySelector('form')!.requestSubmit()
      await vi.waitFor(() => expect(toast.items.some(item => item.message.includes('用户名或密码不正确'))).toBe(true))
      expect(target.textContent).not.toContain('Original password wrong')
      input('#old-password', 'InitialPassword123!')
      target.querySelector('form')!.requestSubmit()
      await vi.waitFor(() => expect(target.querySelector('.login-form')).not.toBeNull())
      expect(onauthenticated).not.toHaveBeenCalled()
      expect(renewPassword).toHaveBeenCalledTimes(3)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it.each(['hai:iam:007', 'hai:iam:025'])('首次/过期先验证旧密码并完成改密，不提前授权：%s', async (code) => {
    const target = document.createElement('div')
    document.body.append(target)
    const action = async () => ok(undefined)
    const renewPassword = vi.fn(action)
    const onauthenticated = vi.fn()
    const component = mount(AuthPanel, { target, props: {
      config: { ...config, agreements: { showOnLogin: false, showOnRegister: false } },
      actions: { login: async () => err({ code, message: 'Update password', httpStatus: 401 }), register: action, sendOtp: action, requestPasswordReset: action, confirmPasswordReset: action, renewPassword },
      onauthenticated,
    } })
    function input(selector: string, value: string) {
      const element = target.querySelector<HTMLInputElement>(selector)!
      element.value = value
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
    try {
      flushSync()
      input('input[name="username"]', 'alice')
      input('input[type="password"]', 'OldPassword123')
      flushSync()
      target.querySelector('form')!.requestSubmit()
      await vi.waitFor(() => expect(target.querySelector('.change-password-form')).not.toBeNull())
      expect(target.querySelector<HTMLInputElement>('#renew-identifier')!.value).toBe('alice')
      expect(target.querySelector<HTMLInputElement>('#old-password')!.value).toBe('')
      expect(onauthenticated).not.toHaveBeenCalled()
      input('#old-password', 'OldPassword123')
      input('#new-password', 'NewPassword123')
      input('#confirm-password', 'NewPassword123')
      flushSync()
      target.querySelector('form')!.requestSubmit()
      await vi.waitFor(() => expect(renewPassword).toHaveBeenCalledWith({ identifier: 'alice', password: 'OldPassword123', newPassword: 'NewPassword123' }))
      await vi.waitFor(() => expect(target.querySelector('.login-form')).not.toBeNull())
      expect(onauthenticated).not.toHaveBeenCalled()
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it.each(['password', 'email', 'sms'] as const)('登录仅提交实际认证字段且不展示未实现的持久会话选择：%s', async (method) => {
    const target = document.createElement('div')
    document.body.append(target)
    const onsubmit = vi.fn()
    const component = mount(LoginForm, { target, props: { methods: [method], onsubmit } })
    try {
      flushSync()
      expect(target.querySelector('input[type="checkbox"]')).toBeNull()
      expectTypeOf<Extract<'rememberMe', keyof LoginFormData>>().toEqualTypeOf<never>()
      expectTypeOf<Extract<'showRememberMe', keyof LoginFormProps>>().toEqualTypeOf<never>()
      const username = target.querySelector<HTMLInputElement>('input[name="username"]')!
      username.value = method === 'email' ? 'alice@example.com' : method === 'sms' ? '13900000000' : 'alice'
      username.dispatchEvent(new Event('input', { bubbles: true }))
      const credential = target.querySelector<HTMLInputElement>(method === 'password' ? 'input[type="password"]' : 'input[name="code"]')!
      credential.value = method === 'password' ? 'ExamplePassword123' : '123456'
      credential.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
      target.querySelector('form')!.requestSubmit()
      expect(onsubmit).toHaveBeenCalledOnce()
      expect(onsubmit.mock.calls[0]?.[0]).toEqual({
        username: username.value,
        password: method === 'password' ? 'ExamplePassword123' : '',
        method,
        code: method === 'password' ? undefined : '123456',
      })
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('找回密码成功使用浮动通知，表单保留重置入口且支持切换语言', async () => {
    setUILocale('zh-CN')
    const target = document.createElement('div')
    document.body.append(target)
    const action = async () => ok(undefined)
    const component = mount(AuthPanel, { target, props: {
      config: { ...config, passwordReset: { enabled: true } },
      initialMode: 'forgot',
      actions: { login: action, register: action, sendOtp: action, requestPasswordReset: action, confirmPasswordReset: action },
    } })
    try {
      flushSync()
      target.querySelector('form')!.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(toast.items[0]?.message).toContain('重置通知已发送'))
      expect(target.querySelector('.alert-success')).toBeNull()
      expect(target.querySelector('.forgot-password-form')).not.toBeNull()
      setUILocale('en-US')
      flushSync()
      const reset = [...target.querySelectorAll('button')].find(button => button.textContent === 'I have a reset token')!
      expect(reset).toBeDefined()
      reset.click()
      flushSync()
      expect(target.querySelector('.reset-password-form')).not.toBeNull()
    }
    finally {
      toast.clear()
      setUILocale('zh-CN')
      await unmount(component)
      target.remove()
    }
  })

  it('lDAP 登录不受本地新密码长度策略限制', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onsubmit = vi.fn()
    const component = mount(LoginForm, { target, props: { methods: ['ldap'], onsubmit } })
    try {
      flushSync()
      const username = target.querySelector<HTMLInputElement>('input[name="username"]')!
      username.value = 'ldap-user'
      username.dispatchEvent(new Event('input', { bubbles: true }))
      const password = target.querySelector<HTMLInputElement>('input[type="password"]')!
      password.value = 'short'
      password.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
      target.querySelector('form')!.requestSubmit()
      expect(onsubmit).toHaveBeenCalledOnce()
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('已显示的认证错误随 UI 语言更新，布局参数透传给场景表单', async () => {
    setUILocale('en-US')
    const target = document.createElement('div')
    document.body.append(target)
    const action = async () => err({ code: 'hai:iam:001', httpStatus: 401, system: 'hai', module: 'iam' }, 'Server language')
    const component = mount(AuthPanel, { target, props: {
      config,
      columns: 2,
      labelPosition: 'left',
      actions: { login: action, register: action, sendOtp: action, requestPasswordReset: action, confirmPasswordReset: action },
    } })
    try {
      flushSync()
      target.querySelector('form')!.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(toast.items.some(item => item.message.includes('Username or password is incorrect.'))).toBe(true))
      expect(target.querySelector('.hai-form-grid')?.getAttribute('data-columns')).toBe('2')
      expect(target.querySelector('.hai-form-field')?.getAttribute('data-label-position')).toBe('left')
      setUILocale('zh-CN')
      flushSync()
      expect(toast.items.some(item => item.message.includes('用户名或密码不正确'))).toBe(true)
      expect(target.textContent).not.toContain('Server language')
    }
    finally {
      setUILocale('zh-CN')
      await unmount(component)
      target.remove()
    }
  })

  it.each(['login', 'register', 'forgot', 'reset'] as const)('客户端接管完成前禁止输入，完成后恢复交互：%s', async (initialMode) => {
    const target = document.createElement('div')
    document.body.append(target)
    const action = async () => ok(undefined)
    const component = mount(AuthPanel, { target, props: {
      config: { ...config, passwordReset: { enabled: true } },
      initialMode,
      actions: { login: action, register: action, sendOtp: action, requestPasswordReset: action, confirmPasswordReset: action },
    } })
    try {
      const input = target.querySelector<HTMLInputElement>('form input')!
      expect(input.matches(':disabled')).toBe(true)
      flushSync()
      expect(input.matches(':disabled')).toBe(false)
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it.each([
    { pathname: '/auth/reset-password', loginUrl: '/auth/login', staysReset: true },
    { pathname: '/auth/login', loginUrl: '/auth/login', staysReset: false },
    { pathname: '/#/reset-password', loginUrl: '#/login', staysReset: true },
    { pathname: '/#/login', loginUrl: '#/login', staysReset: false },
    { pathname: '/auth/login?next=profile', loginUrl: '/auth/login?next=profile', staysReset: false },
    { pathname: '/auth/login?next=profile', loginUrl: '/auth/login', staysReset: true },
    { pathname: '/auth/login', loginUrl: '/auth/login', staysReset: true, ctrlKey: true },
    { pathname: '/auth/login', loginUrl: '/auth/login', staysReset: true, metaKey: true },
  ])('登录链接跨路由等待导航，当前路由切换场景：$pathname ($loginUrl)', async ({ pathname, loginUrl, staysReset, ...modifiers }) => {
    setUILocale('zh-CN')
    const originalUrl = window.location.href
    window.history.replaceState(null, '', pathname)
    const target = document.createElement('div')
    document.body.append(target)
    const action = async () => ok(undefined)
    const component = mount(AuthPanel, { target, props: {
      config: { ...config, passwordReset: { enabled: true } },
      initialMode: 'reset',
      loginUrl,
      actions: { login: action, register: action, sendOtp: action, requestPasswordReset: action, confirmPasswordReset: action },
    } })
    let preventedByPanel: boolean | undefined
    const observeNavigation = (event: MouseEvent) => {
      preventedByPanel = event.defaultPrevented
      // 组件在挂载根节点先处理事件；随后禁止 jsdom 执行真实导航。
      event.preventDefault()
    }
    document.addEventListener('click', observeNavigation)
    try {
      flushSync()
      const link = target.querySelector<HTMLAnchorElement>(`a[href="${loginUrl}"]`)!
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers }))
      flushSync()
      expect(Boolean(target.querySelector('.reset-password-form'))).toBe(staysReset)
      expect(Boolean(target.querySelector('.login-form'))).toBe(!staysReset)
      expect(preventedByPanel).toBe(!staysReset)
    }
    finally {
      document.removeEventListener('click', observeNavigation)
      await unmount(component)
      target.remove()
      window.history.replaceState(null, '', originalUrl)
    }
  })

  it.each([LoginForm, RegisterForm])('配置 Markdown 正文优先于 URL，隐私正文也可独立显示', async (Form) => {
    setUILocale('zh-CN')
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(Form, { target, props: { agreements: {
      userAgreementUrl: 'https://example.com/terms',
      userAgreementMarkdown: '# 配置协议\n\n**重要条款**\n\n[unsafe](javascript:alert(1))\n\n<script>window.__agreementExecuted = true</script>',
      privacyPolicyMarkdown: '## 配置隐私\n\n- 仅使用必要资料',
    } } })
    try {
      flushSync()
      const terms = [...target.querySelectorAll('button')].find(button => button.textContent === '用户协议')!
      terms.click()
      flushSync()
      expect(target.querySelector('[role="dialog"] h1')?.textContent).toBe('配置协议')
      expect(target.querySelector('strong')?.textContent).toBe('重要条款')
      expect(target.querySelector('iframe')).toBeNull()
      expect(target.querySelector('script')).toBeNull()
      expect(target.querySelector('[href^="javascript:"]')).toBeNull()
      target.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      flushSync()
      const privacy = [...target.querySelectorAll('button')].find(button => button.textContent === '隐私政策')!
      privacy.click()
      flushSync()
      expect(target.querySelector('[role="dialog"] h2')?.textContent).toBe('配置隐私')
      expect(target.querySelector('li')?.textContent).toBe('仅使用必要资料')
      expect(target.querySelector('[role="dialog"] a[target="_blank"]')).toBeNull()
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it.each([LoginForm, RegisterForm])('协议在当前页面弹窗展示，关闭后保留表单且没有提交', async (Form) => {
    setUILocale('zh-CN')
    const target = document.createElement('div')
    document.body.append(target)
    const onsubmit = vi.fn()
    const component = mount(Form, { target, props: { agreements: config.agreements, onsubmit } })
    try {
      flushSync()
      const input = target.querySelector<HTMLInputElement>('input[type="text"]')!
      input.value = 'preserved-user'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      const terms = [...target.querySelectorAll('button')].find(button => button.textContent === '用户协议')!
      terms.click()
      flushSync()
      expect(target.querySelector('[role="dialog"]')?.textContent).toContain('用户协议')
      expect(target.querySelector('iframe')?.getAttribute('src')).toBe('https://example.com/terms')
      expect(target.querySelector('iframe')?.getAttribute('sandbox')).toBe('')
      target.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      flushSync()
      expect(target.querySelector('iframe')).toBeNull()
      expect(input.value).toBe('preserved-user')
      expect(onsubmit).not.toHaveBeenCalled()
      const privacy = [...target.querySelectorAll('button')].find(button => button.textContent === '隐私政策')!
      privacy.click()
      flushSync()
      expect(target.querySelector('iframe')?.getAttribute('src')).toBe('https://example.com/privacy')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })

  it('authPanel 透传登录和注册扩展，并保留内置导航', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const action = async () => ok(undefined)
    const component = mount(AuthPanel, { target, props: {
      config,
      actions: { login: action, register: action, sendOtp: action, requestPasswordReset: action, confirmPasswordReset: action },
      loginHeader: snippet('Login heading'),
      loginFields: snippet('Login field'),
      loginFooter: snippet('Login footer'),
      registerHeader: snippet('Register heading'),
      registerFields: snippet('Register field'),
      registerFooter: snippet('Register footer'),
    } })
    try {
      flushSync()
      expect(target.querySelector('.login-form-header')?.textContent).toBe('Login heading')
      expect(target.querySelector('.login-form-extra-fields')?.textContent).toBe('Login field')
      expect(target.querySelector('.login-form-footer')?.textContent).toContain('Login footer')
      const register = [...target.querySelectorAll('button')].find(button => button.textContent === '立即注册')!
      register.click()
      flushSync()
      expect(target.querySelector('.register-form-header')?.textContent).toBe('Register heading')
      expect(target.querySelector('.register-form-extra-fields')?.textContent).toBe('Register field')
      expect(target.querySelector('.register-form-footer')?.textContent).toContain('Register footer')
      expect(target.querySelector('.register-form-footer')?.textContent).toContain('立即登录')
      expect(target.textContent).not.toContain('Login heading')
    }
    finally {
      await unmount(component)
      target.remove()
    }
  })
})
