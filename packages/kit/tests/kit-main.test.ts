/**
 * =============================================================================
 * @hai/kit - kit 统一出口测试
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

  it('kit.setAllModulesLocale 是函数', () => {
    expect(typeof kit.setAllModulesLocale).toBe('function')
  })

  // ─── guard 子命名空间 ───

  describe('kit.guard', () => {
    it('包含所有守卫工厂', () => {
      expect(typeof kit.guard.auth).toBe('function')
      expect(typeof kit.guard.role).toBe('function')
      expect(typeof kit.guard.permission).toBe('function')
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
    })
  })

  // ─── 模块集成子命名空间 ───

  describe('kit.iam', () => {
    it('包含 IAM 集成函数', () => {
      expect(typeof kit.iam.createHandle).toBe('function')
      expect(typeof kit.iam.requireAuth).toBe('function')
      expect(typeof kit.iam.createActions).toBe('function')
    })
  })

  describe('kit.cache', () => {
    it('包含 Cache 集成函数', () => {
      expect(typeof kit.cache.createHandle).toBe('function')
      expect(typeof kit.cache.createUtils).toBe('function')
    })
  })

  describe('kit.storage', () => {
    it('包含 Storage 集成函数', () => {
      expect(typeof kit.storage.createEndpoint).toBe('function')
    })
  })

  describe('kit.crypto', () => {
    it('包含 Crypto 集成函数', () => {
      expect(typeof kit.crypto.createCsrfManager).toBe('function')
      expect(typeof kit.crypto.createEncryptedCookie).toBe('function')
      expect(typeof kit.crypto.createTransportEncryption).toBe('function')
      expect(typeof kit.crypto.createKeyExchangeHandler).toBe('function')
      expect(typeof kit.crypto.isValidEncryptedPayload).toBe('function')
      expect(typeof kit.crypto.transportEncryptionMiddleware).toBe('function')
    })
  })

  // ─── 客户端子命名空间 ───

  describe('kit.client', () => {
    it('包含客户端 Store 工厂', () => {
      expect(typeof kit.client.useSession).toBe('function')
      expect(typeof kit.client.useUpload).toBe('function')
      expect(typeof kit.client.useIsAuthenticated).toBe('function')
      expect(typeof kit.client.useUser).toBe('function')
      expect(typeof kit.client.useTransportEncryption).toBe('function')
    })
  })
})
