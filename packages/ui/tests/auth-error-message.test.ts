// @vitest-environment jsdom
/** 认证错误跟随当前浏览器 UI 语言，只显示安全提示和关联标识。 */
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

  it.each(['hai:iam:9999', 'app:account:001', 'constructor', '__proto__', 400])('未知错误不把内部消息带入认证界面：%s', (code) => {
    expect(authErrorMessage({ code, message: 'Private database or account detail' })).toBe('暂时无法完成认证请求，请稍后重试')
  })

  it.each(['hai:iam:001', 'hai:iam:002', 'hai:iam:003', 'hai:iam:302'])('凭据错误不能说明用户名或密码哪个错误：%s', (code) => {
    expect(authErrorMessage({ code, message: 'This account has no password' })).toBe('用户名或密码不正确')
  })

  it('新旧密码相同、首次改密和会话上限提供可操作的提示', () => {
    expect(authErrorMessage({ code: 'hai:iam:034', message: 'Private detail' })).toContain('新密码不能与当前密码相同')
    expect(authErrorMessage({ code: 'hai:iam:025', message: 'Private detail' })).toContain('修改初始密码')
    expect(authErrorMessage({ code: 'hai:iam:108', message: 'Private detail' })).toContain('退出其他')
    expect(authErrorMessage({ code: 'hai:iam:026', message: 'Internal IP rule' })).not.toContain('Internal IP rule')
  })

  it('服务异常即使携带已知业务错误码也不能暴露原文', () => {
    expect(authErrorMessage({ code: 'hai:iam:002', message: 'Private exception', httpStatus: 500 })).toBe('暂时无法完成认证请求，请稍后重试')
  })

  it('重新本地化认证错误后仍在末尾保留 traceId', () => {
    setUILocale('en-US')
    expect(authErrorMessage({ code: 'hai:iam:002', message: '密码错误', traceId: 'req-login' })).toBe('Username or password is incorrect. (traceId: req-login)')
  })
})
