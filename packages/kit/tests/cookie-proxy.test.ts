/**
 * =============================================================================
 * @h-ai/kit - Cookie 加密代理测试
 * =============================================================================
 * 覆盖：
 * - createEncryptedCookieProxy：加密写入、解密读取、前缀识别
 * - 不在加密名单中的 Cookie 正常透传
 * - 加密/解密失败时的降级策略
 * - 其他 Cookies 方法（delete / getAll / serialize）原样代理
 * =============================================================================
 */

import type { Cookies } from '@sveltejs/kit'
import type { CookieProxyConfig } from '../src/hooks/kit-cookie-proxy.js'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { createEncryptedCookieProxy } from '../src/hooks/kit-cookie-proxy.js'

// ─── Mock Cookies ───

function createMockCookies(store: Record<string, string> = {}) {
  return {
    get: vi.fn((name: string) => store[name]),
    set: vi.fn((name: string, value: string) => { store[name] = value }),
    delete: vi.fn((name: string) => { delete store[name] }),
    getAll: vi.fn(() => Object.entries(store).map(([name, value]) => ({ name, value }))),
    serialize: vi.fn(() => ''),
  } as unknown as Cookies
}

// ─── Mock 对称加密服务 ───

function createMockSymmetric() {
  return {
    generateKey: () => `symkey_${Date.now()}`,
    encryptWithIV: (data: string, _key: string) => {
      const iv = 'mock_iv_12345678'
      const ciphertext = Buffer.from(data).toString('base64')
      return { success: true, data: { ciphertext, iv } }
    },
    decryptWithIV: (ciphertext: string, _key: string, _iv: string) => {
      const plaintext = Buffer.from(ciphertext, 'base64').toString()
      return { success: true, data: plaintext }
    },
  }
}

function createFailingSymmetric() {
  return {
    generateKey: () => 'dummy',
    encryptWithIV: () => ({ success: false, error: { code: 1, message: 'Encrypt failed' } }),
    decryptWithIV: () => ({ success: false, error: { code: 2, message: 'Decrypt failed' } }),
  }
}

// ─── 测试 ───

describe('createEncryptedCookieProxy', () => {
  const encryptionKey = 'test_encryption_key_0123456789ab'

  function makeConfig(overrides: Partial<CookieProxyConfig> = {}): CookieProxyConfig {
    return {
      names: new Set(['session_token', 'refresh_token']),
      symmetric: createMockSymmetric(),
      encryptionKey,
      ...overrides,
    }
  }

  // ─── set() 加密写入 ───

  describe('set()', () => {
    it('加密名单中的 Cookie 写入加密值', () => {
      const store: Record<string, string> = {}
      const cookies = createMockCookies(store)
      const config = makeConfig()
      const proxy = createEncryptedCookieProxy(cookies, config)

      proxy.set('session_token', 'my_secret_token', { path: '/' })

      // 写入的值应该带 enc: 前缀
      const setCall = cookies.set.mock.calls[0]!
      expect(setCall[0]).toBe('session_token')
      expect(setCall[1]).toMatch(/^enc:/)
      // enc:{iv}:{ciphertext} 格式
      const parts = (setCall[1] as string).split(':')
      expect(parts.length).toBe(3)
      expect(parts[0]).toBe('enc')
    })

    it('不在加密名单中的 Cookie 原样写入', () => {
      const store: Record<string, string> = {}
      const cookies = createMockCookies(store)
      const config = makeConfig()
      const proxy = createEncryptedCookieProxy(cookies, config)

      proxy.set('other_cookie', 'plain_value', { path: '/' })

      const setCall = cookies.set.mock.calls[0]!
      expect(setCall[0]).toBe('other_cookie')
      expect(setCall[1]).toBe('plain_value')
    })

    it('加密失败时降级：原样写入明文', () => {
      const store: Record<string, string> = {}
      const cookies = createMockCookies(store)
      const config = makeConfig({ symmetric: createFailingSymmetric() })
      const proxy = createEncryptedCookieProxy(cookies, config)

      proxy.set('session_token', 'my_secret_token', { path: '/' })

      const setCall = cookies.set.mock.calls[0]!
      expect(setCall[1]).toBe('my_secret_token')
    })
  })

  // ─── get() 解密读取 ───

  describe('get()', () => {
    it('读取加密 Cookie 时自动解密', () => {
      const config = makeConfig()

      // 先用 encryptWithIV 手动加密一个值
      const encResult = config.symmetric.encryptWithIV('my_secret_token', encryptionKey)
      const storedValue = `enc:${encResult.data!.iv}:${encResult.data!.ciphertext}`

      const cookies = createMockCookies({ session_token: storedValue })
      const proxy = createEncryptedCookieProxy(cookies, config)

      const value = proxy.get('session_token')
      expect(value).toBe('my_secret_token')
    })

    it('没有 enc: 前缀的值原样返回（兼容明文迁移）', () => {
      const cookies = createMockCookies({ session_token: 'plain_token_value' })
      const config = makeConfig()
      const proxy = createEncryptedCookieProxy(cookies, config)

      const value = proxy.get('session_token')
      expect(value).toBe('plain_token_value')
    })

    it('不在加密名单中的 Cookie 原样返回', () => {
      const cookies = createMockCookies({ other_cookie: 'some_value' })
      const config = makeConfig()
      const proxy = createEncryptedCookieProxy(cookies, config)

      const value = proxy.get('other_cookie')
      expect(value).toBe('some_value')
    })

    it('cookie 不存在时返回 undefined', () => {
      const cookies = createMockCookies({})
      const config = makeConfig()
      const proxy = createEncryptedCookieProxy(cookies, config)

      const value = proxy.get('nonexistent')
      expect(value).toBeUndefined()
    })

    it('解密失败时返回原始值', () => {
      const storedValue = 'enc:bad_iv:bad_ciphertext'
      const cookies = createMockCookies({ session_token: storedValue })
      const config = makeConfig({ symmetric: createFailingSymmetric() })
      const proxy = createEncryptedCookieProxy(cookies, config)

      const value = proxy.get('session_token')
      expect(value).toBe(storedValue)
    })
  })

  // ─── 往返一致性 ───

  describe('往返一致性', () => {
    it('set() 写入后 get() 读回原始值', () => {
      const store: Record<string, string> = {}
      const config = makeConfig()

      // 写入
      const writeCookies = createMockCookies(store)
      const writeProxy = createEncryptedCookieProxy(writeCookies, config)
      writeProxy.set('session_token', 'round_trip_value', { path: '/' })

      // 取出写入的值（从 set mock 获取）
      const encryptedValue = writeCookies.set.mock.calls[0]![1] as string

      // 读取
      const readCookies = createMockCookies({ session_token: encryptedValue })
      const readProxy = createEncryptedCookieProxy(readCookies, config)
      const result = readProxy.get('session_token')

      expect(result).toBe('round_trip_value')
    })

    it('多个加密 Cookie 互不干扰', () => {
      const store: Record<string, string> = {}
      const config = makeConfig()

      const writeCookies = createMockCookies(store)
      const writeProxy = createEncryptedCookieProxy(writeCookies, config)
      writeProxy.set('session_token', 'session_value', { path: '/' })
      writeProxy.set('refresh_token', 'refresh_value', { path: '/' })

      const sessionEnc = writeCookies.set.mock.calls[0]![1] as string
      const refreshEnc = writeCookies.set.mock.calls[1]![1] as string

      // 加密后的值不同
      expect(sessionEnc).not.toBe(refreshEnc)

      const readCookies = createMockCookies({
        session_token: sessionEnc,
        refresh_token: refreshEnc,
      })
      const readProxy = createEncryptedCookieProxy(readCookies, config)

      expect(readProxy.get('session_token')).toBe('session_value')
      expect(readProxy.get('refresh_token')).toBe('refresh_value')
    })
  })

  // ─── 其他方法透传 ───

  describe('其他方法透传', () => {
    it('delete() 原样代理', () => {
      const cookies = createMockCookies({ session_token: 'value' })
      const config = makeConfig()
      const proxy = createEncryptedCookieProxy(cookies, config)

      proxy.delete('session_token', { path: '/' })
      expect(cookies.delete).toHaveBeenCalledWith('session_token', { path: '/' })
    })

    it('getAll() 原样代理', () => {
      const cookies = createMockCookies({ a: '1', b: '2' })
      const config = makeConfig()
      const proxy = createEncryptedCookieProxy(cookies, config)

      proxy.getAll()
      expect(cookies.getAll).toHaveBeenCalled()
    })

    it('serialize() 原样代理', () => {
      const cookies = createMockCookies()
      const config = makeConfig()
      const proxy = createEncryptedCookieProxy(cookies, config)

      proxy.serialize('test')
      expect(cookies.serialize).toHaveBeenCalled()
    })
  })
})
