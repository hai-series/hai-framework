// @vitest-environment jsdom
import type { AuthPanelConfig } from '../src/lib/components/scenes/types.js'
import { err, ok } from '@h-ai/core'
import { createRawSnippet, flushSync, mount, unmount } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { AuthPanel, LoginForm, RegisterForm } from '../src/lib/components/scenes/iam/index.js'
import { setUILocale } from '../src/lib/messages.js'

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
  it('找回密码通知保留表单与重置入口，并随语言更新', async () => {
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
      await vi.waitFor(() => expect(target.textContent).toContain('重置通知已发送'))
      expect(target.querySelector('.forgot-password-form')).not.toBeNull()
      setUILocale('en-US')
      flushSync()
      expect(target.textContent).toContain('If the account exists')
      const reset = [...target.querySelectorAll('button')].find(button => button.textContent === 'I have a reset token')!
      expect(reset).toBeDefined()
      reset.click()
      flushSync()
      expect(target.querySelector('.reset-password-form')).not.toBeNull()
    }
    finally {
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
      await vi.waitFor(() => expect(target.textContent).toContain('Username or password is incorrect.'))
      expect(target.querySelector('.hai-form-grid')?.getAttribute('data-columns')).toBe('2')
      expect(target.querySelector('.hai-form-field')?.getAttribute('data-label-position')).toBe('left')
      setUILocale('zh-CN')
      flushSync()
      expect(target.textContent).toContain('用户名或密码不正确')
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
  ])('登录链接跨路由等待导航，当前路由切换场景：$pathname', async ({ pathname, loginUrl, staysReset }) => {
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
    try {
      flushSync()
      const link = target.querySelector<HTMLAnchorElement>(`a[href="${loginUrl}"]`)!
      // 单测接管真实导航，观察组件是否在路由完成前错误地替换表单。
      link.addEventListener('click', event => event.preventDefault())
      link.click()
      flushSync()
      expect(Boolean(target.querySelector('.reset-password-form'))).toBe(staysReset)
      expect(Boolean(target.querySelector('.login-form'))).toBe(!staysReset)
    }
    finally {
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
