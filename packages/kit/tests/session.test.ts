/**
 * =============================================================================
 * @h-ai/kit - Session Cookie 工具测试
 * =============================================================================
 */

import { describe, expect, it, vi } from 'vitest'
import { clearSessionCookie, setSessionCookie } from '../src/kit-session.js'

/**
 * 创建模拟 Cookies 对象
 */
function createMockCookies() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
    serialize: vi.fn(),
  } as any
}

describe('setSessionCookie', () => {
  it('使用默认配置设置 Cookie', () => {
    const cookies = createMockCookies()

    setSessionCookie(cookies, 'test-token-123')

    expect(cookies.set).toHaveBeenCalledTimes(1)
    expect(cookies.set).toHaveBeenCalledWith(
      'hai_session',
      'test-token-123',
      expect.objectContaining({
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
      }),
    )
  })

  it('支持自定义有效期', () => {
    const cookies = createMockCookies()

    setSessionCookie(cookies, 'token', { maxAge: 3600 })

    expect(cookies.set).toHaveBeenCalledWith(
      'hai_session',
      'token',
      expect.objectContaining({
        maxAge: 3600,
      }),
    )
  })

  it('支持自定义 Cookie 名称', () => {
    const cookies = createMockCookies()

    setSessionCookie(cookies, 'token', { cookieName: 'my_session' })

    expect(cookies.set).toHaveBeenCalledWith(
      'my_session',
      'token',
      expect.objectContaining({
        path: '/',
      }),
    )
  })

  it('支持 secure 选项', () => {
    const cookies = createMockCookies()

    setSessionCookie(cookies, 'token', { secure: true })

    expect(cookies.set).toHaveBeenCalledWith(
      'hai_session',
      'token',
      expect.objectContaining({
        secure: true,
      }),
    )
  })
})

describe('clearSessionCookie', () => {
  it('使用默认名称删除 Cookie', () => {
    const cookies = createMockCookies()

    clearSessionCookie(cookies)

    expect(cookies.delete).toHaveBeenCalledTimes(1)
    expect(cookies.delete).toHaveBeenCalledWith('hai_session', { path: '/' })
  })

  it('支持自定义 Cookie 名称', () => {
    const cookies = createMockCookies()

    clearSessionCookie(cookies, { cookieName: 'my_session' })

    expect(cookies.delete).toHaveBeenCalledWith('my_session', { path: '/' })
  })
})
