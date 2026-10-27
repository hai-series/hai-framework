// @vitest-environment jsdom
import type { AuthPanelActions, AuthPanelConfig } from '../src/lib/components/scenes/types.js'
import { err, ok } from '@h-ai/core'
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import { createSessionRecovery, SessionRecoveryDialog } from '../src/lib/components/scenes/iam/index.js'

const config: AuthPanelConfig = {
  login: { password: true, ldap: false, email: false, sms: false },
  register: { enabled: true },
  passwordReset: { enabled: false },
  password: { minLength: 8, maxLength: 128, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSpecialChar: false },
  otp: { length: 6, resendInterval: 60 },
  agreements: { showOnLogin: false, showOnRegister: false },
  ui: { variant: 'card' },
}

it('匿名访问不弹窗；并发请求共用一次恢复，原主体和确认代际必须匹配', async () => {
  const recovery = createSessionRecovery()
  expect(await recovery.recover()).toBe(false)
  recovery.configure(config, { id: 'original', username: 'alice' })
  const first = recovery.recover()
  const second = recovery.recover()
  const version = recovery.version
  recovery.complete('another-user', version)
  expect(recovery.open).toBe(true)
  recovery.cancel()
  expect(await first).toBe(false)
  expect(await second).toBe(false)
  const next = recovery.recover()
  recovery.complete('original', version)
  expect(recovery.open).toBe(true)
  recovery.complete('original', recovery.version)
  expect(await next).toBe(true)
})

it('切换或退出账号会取消原请求的恢复，迟到响应不能继续新账号的动作', async () => {
  const recovery = createSessionRecovery()
  recovery.configure(config, { id: 'first' })
  const pending = recovery.recover()
  const version = recovery.version
  recovery.configure(config, { id: 'second' })
  expect(await pending).toBe(false)
  const next = recovery.recover()
  recovery.complete('first', version)
  expect(recovery.open).toBe(true)
  recovery.configure(null)
  expect(await next).toBe(false)
})

it('原地登录复用正常表单，验证错误保留弹窗和页面输入，成功时限定原主体', async () => {
  const recovery = createSessionRecovery()
  recovery.configure(config, { id: 'original', username: 'alice' })
  const pending = recovery.recover()
  const login = vi.fn<AuthPanelActions['login']>()
    .mockResolvedValueOnce(err({ code: 'hai:iam:002', message: 'Incorrect password', httpStatus: 401 }))
    .mockResolvedValueOnce(ok({ user: { id: 'original' } }))
  const action = async () => ok(undefined)
  const target = document.createElement('div')
  const draft = document.createElement('textarea')
  draft.value = 'Unsaved business draft'
  target.append(draft)
  document.body.append(target)
  const component = mount(SessionRecoveryDialog, { target, props: { recovery, actions: { login, register: action, sendOtp: action, requestPasswordReset: action, confirmPasswordReset: action } } })
  try {
    flushSync()
    const username = document.querySelector<HTMLInputElement>('[data-testid="session-recovery-dialog"] input[name=username]')!
    expect(username.value).toBe('alice')
    const form = document.querySelector<HTMLFormElement>('[data-testid="session-recovery-dialog"] form')!
    async function submit(value: string) {
      const password = form.querySelector<HTMLInputElement>('input[type=password]')!
      password.value = value
      password.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
      form.requestSubmit()
    }
    await submit('Wrong-password!')
    await vi.waitFor(() => {
      flushSync()
      expect(document.querySelector('[data-testid="session-recovery-dialog"] .alert-error')).not.toBeNull()
    })
    expect(recovery.open).toBe(true)
    expect(draft.value).toBe('Unsaved business draft')
    await submit('Current-password!')
    expect(await pending).toBe(true)
    flushSync()
    expect(document.querySelector('[data-testid="session-recovery-dialog"] input[type=password]')).toBeNull()
    expect(login).toHaveBeenLastCalledWith(expect.objectContaining({ identifier: 'alice', expectedUserId: 'original', password: 'Current-password!' }))
    expect(draft.value).toBe('Unsaved business draft')
  }
  finally {
    recovery.cancel()
    await unmount(component)
    target.remove()
  }
})
