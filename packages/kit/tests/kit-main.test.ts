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
      expect(typeof kit.middleware.csrf).toBe('function')
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

  // ─── session 子命名空间 ───

  describe('kit.session', () => {
    it('包含会话 Cookie 管理函数', () => {
      expect(typeof kit.session.setCookie).toBe('function')
      expect(typeof kit.session.clearCookie).toBe('function')
    })
  })

  // ─── 客户端子命名空间 ───

  describe('kit.client', () => {
    it('包含 create 统一客户端工厂', () => {
      expect(typeof kit.client.create).toBe('function')
    })
  })

  // ─── i18n 子命名空间 ───

  describe('kit.i18n', () => {
    it('包含 setLocale', () => {
      expect(typeof kit.i18n.setLocale).toBe('function')
    })
  })
})
