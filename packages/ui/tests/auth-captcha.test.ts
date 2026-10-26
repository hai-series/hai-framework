// @vitest-environment jsdom
import type { AuthPanelActions, AuthPanelConfig } from '../src/lib/components/scenes/types.js'
import { randomBytes, webcrypto } from 'node:crypto'
import { ok } from '@h-ai/core'
import { createChallenge, pbkdf2, verifySolution } from 'altcha/lib'
import { flushSync, mount, unmount } from 'svelte'
import { expect, it, vi } from 'vitest'
import { AuthPanel } from '../src/lib/components/scenes/iam/index.js'

const config: AuthPanelConfig = {
  login: { password: true, ldap: false, email: false, sms: false },
  register: { enabled: false },
  passwordReset: { enabled: false },
  password: { minLength: 8 },
  otp: { length: 6, resendInterval: 60 },
  agreements: { showOnLogin: false, showOnRegister: false },
  ui: { variant: 'card' },
}

it.each([false, true])('交互挑战开关=%s：真实求解且证明只随本次登录提交', async (enabled) => {
  vi.stubGlobal('crypto', webcrypto)
  const secret = randomBytes(32).toString('hex')
  const keySecret = randomBytes(32).toString('hex')
  const challenge = await createChallenge({ algorithm: 'PBKDF2/SHA-256', cost: 100, counter: 2, deriveKey: pbkdf2.deriveKey, hmacSignatureSecret: secret, hmacKeySignatureSecret: keySecret })
  const createCaptcha = vi.fn(async () => ok({ id: 'fixture-challenge', challenge }))
  const action = async () => ok(undefined)
  const login = vi.fn<AuthPanelActions['login']>(action)
  const target = document.createElement('div')
  document.body.append(target)
  const component = mount(AuthPanel, { target, props: { config: { ...config, captcha: { enabled } }, actions: { createCaptcha, login, register: action, sendOtp: action, requestPasswordReset: action, confirmPasswordReset: action } } })
  try {
    flushSync()
    for (const [selector, value] of [['input[name="username"]', 'alice'], ['input[type="password"]', 'ExamplePassword123']]) {
      const input = target.querySelector<HTMLInputElement>(selector)!
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    flushSync()
    target.querySelector('form')!.requestSubmit()
    await vi.waitFor(() => expect(login).toHaveBeenCalledTimes(1))
    expect(createCaptcha).toHaveBeenCalledTimes(enabled ? 1 : 0)
    const input = login.mock.calls[0]![0]
    if (enabled) {
      expect(createCaptcha).toHaveBeenCalledWith({ operation: 'login' })
      expect(input.captcha).toBeTypeOf('string')
      const payload = JSON.parse(input.captcha!)
      expect(payload.id).toBe('fixture-challenge')
      expect(await verifySolution({ challenge, solution: payload.solution, deriveKey: pbkdf2.deriveKey, hmacSignatureSecret: secret, hmacKeySignatureSecret: keySecret })).toMatchObject({ verified: true })
      expect(input.captcha).not.toContain(secret)
      expect(input.captcha).not.toContain(keySecret)
    }
    else {
      expect(input.captcha).toBeUndefined()
    }
  }
  finally {
    await unmount(component)
    target.remove()
    vi.unstubAllGlobals()
  }
})
