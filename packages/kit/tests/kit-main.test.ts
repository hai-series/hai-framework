/**
 * =============================================================================
 * @h-ai/kit - kit 统一出口测试
 * =============================================================================
 * 验证 kit 对象的命名空间结构完整性
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { kit } from '../src/kit-main.js'

describe('kit 统一出口', () => {
  it('kit 对象已导出', () => {
    expect(kit).toBeDefined()
  })

  // ─── 顶层方法 ───

  it('kit.createHandle 是函数', () => {
    expect(typeof kit.createHandle).toBe('function')
  })

  it('kit.sequence 是函数', () => {
    expect(typeof kit.sequence).toBe('function')
  })

  // ─── guard 子命名空间 ───

  describe('kit.guard', () => {
    it('包含权限守卫方法', () => {
      expect(typeof kit.guard.require).toBe('function')
      expect(typeof kit.guard.check).toBe('function')
    })
  })

  // ─── response 子命名空间 ───

  describe('kit.response', () => {
    it('包含所有响应工厂', () => {
      expect(typeof kit.response.ok).toBe('function')
      expect(typeof kit.response.created).toBe('function')
      expect(typeof kit.response.noContent).toBe('function')
      expect(typeof kit.response.error).toBe('function')
      expect(typeof kit.response.badRequest).toBe('function')
      expect(typeof kit.response.unauthorized).toBe('function')
      expect(typeof kit.response.forbidden).toBe('function')
      expect(typeof kit.response.notFound).toBe('function')
      expect(typeof kit.response.conflict).toBe('function')
      expect(typeof kit.response.validationError).toBe('function')
      expect(typeof kit.response.internalError).toBe('function')
      expect(typeof kit.response.redirect).toBe('function')
    })
  })

  // ─── validate 子命名空间 ───

  describe('kit.validate', () => {
    it('包含所有验证函数', () => {
      expect(typeof kit.validate.body).toBe('function')
      expect(typeof kit.validate.query).toBe('function')
      expect(typeof kit.validate.params).toBe('function')
    })
  })

  // ─── handler ───

  it('kit.handler 是函数', () => {
    expect(typeof kit.handler).toBe('function')
  })

  // ─── fromContract ───

  it('kit.fromContract 是函数', () => {
    expect(typeof kit.fromContract).toBe('function')
  })

  // ─── 客户端子命名空间 ───

  describe('kit.client', () => {
    it('包含 create 统一客户端工厂', () => {
      expect(typeof kit.client.create).toBe('function')
    })
  })

  // ─── auth 子命名空间 ───

  describe('kit.auth', () => {
    it('包含认证工具（仅应用层所需）', () => {
      expect(typeof kit.auth.login).toBe('function')
      expect(typeof kit.auth.loginWithOtp).toBe('function')
      expect(typeof kit.auth.loginWithLdap).toBe('function')
      expect(typeof kit.auth.loginWithApiKey).toBe('function')
      expect(typeof kit.auth.registerAndLogin).toBe('function')
      expect(typeof kit.auth.logout).toBe('function')
      expect(typeof kit.auth.setBrowserToken).toBe('function')
      expect(typeof kit.auth.clearBrowserToken).toBe('function')
      expect(typeof kit.auth.createTokenStore).toBe('function')
      expect(typeof kit.auth.createHandleFetch).toBe('function')
    })

    it('不暴露内部实现方法', () => {
      const auth = kit.auth as Record<string, unknown>
      expect(auth.ACCESS_TOKEN_KEY).toBeUndefined()
      expect(auth.getBearerTokenFromRequest).toBeUndefined()
      expect(auth.getAccessToken).toBeUndefined()
      expect(auth.getBrowserAccessToken).toBeUndefined()
      expect(auth.setToken).toBeUndefined()
      expect(auth.clearToken).toBeUndefined()
      expect(auth.withCookie).toBeUndefined()
      expect(auth.createSessionValidator).toBeUndefined()
    })
  })

  // ─── i18n 子命名空间 ───

  describe('kit.i18n', () => {
    it('包含 setLocale', () => {
      expect(typeof kit.i18n.setLocale).toBe('function')
    })
  })
})
