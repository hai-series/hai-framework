/** 认证错误跟随当前 UI 语言，并保留应用自定义消息。 */
import { afterEach, describe, expect, it } from 'vitest'
import { authErrorMessage } from '../src/lib/components/scenes/iam/auth-error-message.js'
import { setUILocale } from '../src/lib/messages.js'

afterEach(() => setUILocale('zh-CN'))

describe('authentication error localization', () => {
  it('使用 UI 语言而不是服务端返回语言，并支持切换', () => {
    setUILocale('en-US')
    expect(authErrorMessage({ code: 'hai:iam:002', message: '密码错误' })).toBe('Username or password is incorrect.')
    setUILocale('zh-CN')
    expect(authErrorMessage({ code: 'hai:iam:002', message: 'Incorrect password' })).toBe('用户名或密码不正确')
  })

  it('验证码、重置和目录错误同样本地化，不显示内部目录详情', () => {
    setUILocale('en-US')
    expect(authErrorMessage({ code: 'hai:iam:011', message: '服务端文案' })).toContain('wait')
    expect(authErrorMessage({ code: 'hai:iam:021', message: '服务端文案' })).toContain('reset token')
    expect(authErrorMessage({ code: 'hai:iam:301', message: 'Internal directory detail' })).not.toContain('Internal directory detail')
  })

  it('未知应用错误保留调用方的业务文案', () => {
    expect(authErrorMessage({ code: 'app:account:001', message: 'Application message' })).toBe('Application message')
  })
})
