/**
 * =============================================================================
 * @h-ai/kit - kit 统一出口测试
 * =============================================================================
 * 验证 kit 对象的命名空间结构完整性
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { kit as browserKit } from '../src/browser.js'
import { kit } from '../src/index.js'

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

  describe.each([
    { target: 'Node', facade: kit },
    { target: '浏览器', facade: browserKit },
  ])('$target 公开工具入口', ({ facade }) => {
    it('按资源定义解析库存列和发布状态筛选器', () => {
      const label = () => '库存'
      const options = [
        { label: '已发布', value: true },
      ]

      expect(facade.crud.resolveText(label)).toBe('库存')
      expect(facade.crud.resolveText('商品名称')).toBe('商品名称')
      expect(facade.crud.resolveOptions(() => options)).toEqual(options)
      expect(facade.crud.resolveOptions(undefined)).toEqual([])
      expect(facade).not.toHaveProperty('resolveText')
      expect(facade).not.toHaveProperty('resolveOptions')
    })

    it('按文章范围的授权决定是否显示阅读入口', () => {
      expect(facade.guard.matchPermission('article:read', ['article:*'])).toBe(true)
      expect(facade.guard.matchPermission('user:read', ['article:*'])).toBe(false)
      expect(facade).not.toHaveProperty('matchPermission')
    })
  })

  it('浏览器仅提供可用于界面显示的权限匹配', () => {
    expect(Object.keys(browserKit.guard)).toEqual(['matchPermission'])
    expect(browserKit).not.toHaveProperty('a2a')
    expect(browserKit).not.toHaveProperty('crypto')
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

  // ─── 客户端子命名空间 ───

  describe('kit.client', () => {
    it('包含 create 统一客户端工厂', () => {
      expect(typeof kit.client.create).toBe('function')
      expect(typeof kit.client.installBrowserTransport).toBe('function')
      expect(typeof kit.client.installBrowserTransportFetch).toBe('function')
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
      expect(auth.createHandleFetch).toBeUndefined()
    })
  })

  // ─── i18n 子命名空间 ───

  describe('kit.i18n', () => {
    it('包含 setLocale', () => {
      expect(typeof kit.i18n.setLocale).toBe('function')
    })
  })
})
