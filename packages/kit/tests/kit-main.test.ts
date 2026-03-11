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
    it('包含所有守卫工厂', () => {
      expect(typeof kit.guard.auth).toBe('function')
      expect(typeof kit.guard.session).toBe('function')
      expect(typeof kit.guard.role).toBe('function')
      expect(typeof kit.guard.permission).toBe('function')
      expect(typeof kit.guard.hasPermission).toBe('function')
      expect(typeof kit.guard.assertPermission).toBe('function')
      expect(typeof kit.guard.requirePermission).toBe('function')
      expect(typeof kit.guard.all).toBe('function')
      expect(typeof kit.guard.any).toBe('function')
      expect(typeof kit.guard.not).toBe('function')
      expect(typeof kit.guard.conditional).toBe('function')
    })
  })

  // ─── middleware 子命名空间 ───

  describe('kit.middleware', () => {
    it('包含所有中间件工厂', () => {
      expect(typeof kit.middleware.cors).toBe('function')
      expect(typeof kit.middleware.logging).toBe('function')
      expect(typeof kit.middleware.rateLimit).toBe('function')
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
      expect(typeof kit.validate.form).toBe('function')
      expect(typeof kit.validate.query).toBe('function')
      expect(typeof kit.validate.params).toBe('function')
      expect(typeof kit.validate.formOrFail).toBe('function')
      expect(typeof kit.validate.queryOrFail).toBe('function')
      expect(typeof kit.validate.paramsOrFail).toBe('function')
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
      expect(typeof kit.auth.setAccessTokenCookie).toBe('function')
      expect(typeof kit.auth.clearAccessTokenCookie).toBe('function')
      expect(typeof kit.auth.setBrowserAccessToken).toBe('function')
      expect(typeof kit.auth.clearBrowserAccessToken).toBe('function')
      expect(typeof kit.auth.createBrowserTokenStore).toBe('function')
      expect(typeof kit.auth.createHandleFetch).toBe('function')
    })

    it('不暴露内部实现方法', () => {
      const auth = kit.auth as Record<string, unknown>
      expect(auth.ACCESS_TOKEN_KEY).toBeUndefined()
      expect(auth.getBearerTokenFromRequest).toBeUndefined()
      expect(auth.getAccessToken).toBeUndefined()
      expect(auth.getBrowserAccessToken).toBeUndefined()
    })
  })

  // ─── i18n 子命名空间 ───

  describe('kit.i18n', () => {
    it('包含 setLocale', () => {
      expect(typeof kit.i18n.setLocale).toBe('function')
    })
  })
})
