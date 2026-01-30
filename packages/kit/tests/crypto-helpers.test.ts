/**
 * =============================================================================
 * @hai/kit - Crypto Helpers 测试
 * =============================================================================
 */

import type { Cookies, RequestEvent } from '@sveltejs/kit'
import type { CryptoServiceLike } from '../src/modules/crypto/crypto-types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCsrfManager,
  createEncryptedCookie,
  signRequest,
  verifyWebhookSignature,
} from '../src/modules/crypto/crypto-helpers.js'

/**
 * 创建模拟的 Crypto 服务
 */
function createMockCrypto(): CryptoServiceLike {
  return {
    hmac: {
      sign: vi.fn().mockResolvedValue({ success: true, data: 'mock-signature' }),
      verify: vi.fn().mockResolvedValue({ success: true, data: true }),
    },
    hash: {
      timingSafeEqual: vi.fn().mockResolvedValue({ success: true, data: true }),
    },
    random: {
      bytes: vi.fn().mockResolvedValue({
        success: true,
        data: new Uint8Array(32).fill(1),
      }),
    },
    aes: {
      encrypt: vi.fn().mockResolvedValue({ success: true, data: 'encrypted-value' }),
      decrypt: vi.fn().mockResolvedValue({ success: true, data: '{"test":"value"}' }),
    },
  }
}

/**
 * 创建模拟的 Cookies
 */
function createMockCookies(): Cookies {
  const store = new Map<string, string>()
  return {
    get: vi.fn((name: string) => store.get(name)),
    set: vi.fn((name: string, value: string) => store.set(name, value)),
    delete: vi.fn((name: string) => store.delete(name)),
    getAll: vi.fn(() => Array.from(store.entries()).map(([name, value]) => ({ name, value }))),
    serialize: vi.fn(),
    _store: store,
  } as unknown as Cookies & { _store: Map<string, string> }
}

/**
 * 创建模拟的 RequestEvent
 */
function createMockEvent(options: {
  method?: string
  headers?: Record<string, string>
  body?: string
  formData?: Record<string, string>
} = {}): RequestEvent {
  const url = new URL('http://localhost/api/webhook')
  const cookies = createMockCookies()

  let body: BodyInit | undefined
  if (options.formData) {
    const form = new FormData()
    Object.entries(options.formData).forEach(([key, value]) => {
      form.append(key, value)
    })
    body = form
  }
  else if (options.body) {
    body = options.body
  }

  return {
    request: new Request(url, {
      method: options.method || 'POST',
      headers: options.headers,
      body,
    }),
    url,
    cookies,
    locals: {},
    params: {},
    route: { id: '/api/webhook' },
    getClientAddress: () => '127.0.0.1',
  } as unknown as RequestEvent
}

describe('verifyWebhookSignature', () => {
  let mockCrypto: CryptoServiceLike

  beforeEach(() => {
    mockCrypto = createMockCrypto()
  })

  it('应该验证有效的 Webhook 签名', async () => {
    const event = createMockEvent({
      headers: { 'X-Signature': 'valid-signature' },
      body: '{"event":"test"}',
    })

    const result = await verifyWebhookSignature({
      crypto: mockCrypto,
      event,
      secretKey: 'webhook-secret',
    })

    expect(result).toBe(true)
    expect(mockCrypto.hmac.verify).toHaveBeenCalled()
  })

  it('应该在缺少签名头时返回 false', async () => {
    const event = createMockEvent({
      body: '{"event":"test"}',
    })

    const result = await verifyWebhookSignature({
      crypto: mockCrypto,
      event,
      secretKey: 'webhook-secret',
    })

    expect(result).toBe(false)
  })

  it('应该支持自定义签名头名称', async () => {
    const event = createMockEvent({
      headers: { 'X-Custom-Signature': 'valid-signature' },
      body: '{"event":"test"}',
    })

    const result = await verifyWebhookSignature({
      crypto: mockCrypto,
      event,
      secretKey: 'webhook-secret',
      signatureHeader: 'X-Custom-Signature',
    })

    expect(result).toBe(true)
  })

  it('应该在验证失败时返回 false', async () => {
    ;(mockCrypto.hmac.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: false,
    })

    const event = createMockEvent({
      headers: { 'X-Signature': 'invalid-signature' },
      body: '{"event":"test"}',
    })

    const result = await verifyWebhookSignature({
      crypto: mockCrypto,
      event,
      secretKey: 'webhook-secret',
    })

    expect(result).toBe(false)
  })
})

describe('signRequest', () => {
  let mockCrypto: CryptoServiceLike

  beforeEach(() => {
    mockCrypto = createMockCrypto()
  })

  it('应该签名请求体', async () => {
    const signature = await signRequest(
      mockCrypto,
      '{"data":"test"}',
      'secret-key',
    )

    expect(signature).toBe('mock-signature')
    expect(mockCrypto.hmac.sign).toHaveBeenCalledWith(
      '{"data":"test"}',
      'secret-key',
      'sha256',
    )
  })

  it('应该支持自定义算法', async () => {
    await signRequest(mockCrypto, 'body', 'key', 'sha512')

    expect(mockCrypto.hmac.sign).toHaveBeenCalledWith('body', 'key', 'sha512')
  })

  it('应该在签名失败时抛出错误', async () => {
    ;(mockCrypto.hmac.sign as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: { message: '签名失败' },
    })

    await expect(
      signRequest(mockCrypto, 'body', 'key'),
    ).rejects.toThrow('签名失败')
  })
})

describe('createCsrfManager', () => {
  let mockCrypto: CryptoServiceLike
  let csrfManager: ReturnType<typeof createCsrfManager>

  beforeEach(() => {
    mockCrypto = createMockCrypto()
    csrfManager = createCsrfManager({ crypto: mockCrypto })
  })

  it('应该生成 CSRF Token', async () => {
    const cookies = createMockCookies()
    const token = await csrfManager.generate(cookies)

    expect(token).toBeDefined()
    expect(typeof token).toBe('string')
    expect(cookies.set).toHaveBeenCalledWith(
      'csrf_token',
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    )
  })

  it('应该验证有效的 CSRF Token', async () => {
    const cookies = createMockCookies()
    ;(cookies as unknown as { _store: Map<string, string> })._store.set('csrf_token', 'valid-token')
    ;(cookies.get as ReturnType<typeof vi.fn>).mockReturnValue('valid-token')

    const event = createMockEvent({
      headers: { 'X-CSRF-Token': 'valid-token' },
    })
    event.cookies = cookies

    const result = await csrfManager.verify(event)

    expect(result).toBe(true)
  })

  it('应该在缺少 Cookie Token 时返回 false', async () => {
    const event = createMockEvent({
      headers: { 'X-CSRF-Token': 'some-token' },
    })

    const result = await csrfManager.verify(event)

    expect(result).toBe(false)
  })

  it('应该支持从 form data 获取 Token', async () => {
    const cookies = createMockCookies()
    ;(cookies.get as ReturnType<typeof vi.fn>).mockReturnValue('valid-token')

    const event = createMockEvent({
      method: 'POST',
      formData: { _csrf: 'valid-token' },
    })
    event.cookies = cookies

    const result = await csrfManager.verify(event)

    expect(result).toBe(true)
  })

  it('应该创建 CSRF 验证中间件', async () => {
    const handle = csrfManager.createHandle()
    const cookies = createMockCookies()
    ;(cookies.get as ReturnType<typeof vi.fn>).mockReturnValue('valid-token')

    const event = createMockEvent({
      method: 'POST',
      headers: { 'X-CSRF-Token': 'valid-token' },
    })
    event.cookies = cookies

    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    const response = await handle({ event, resolve })

    expect(resolve).toHaveBeenCalled()
  })

  it('应该跳过安全的 HTTP 方法', async () => {
    const handle = csrfManager.createHandle()
    const event = createMockEvent({ method: 'GET' })
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(resolve).toHaveBeenCalled()
  })

  it('应该在 Token 验证失败时返回 403', async () => {
    const handle = csrfManager.createHandle()
    const event = createMockEvent({ method: 'POST' })
    const resolve = vi.fn()

    const response = await handle({ event, resolve })

    expect(response.status).toBe(403)
    expect(resolve).not.toHaveBeenCalled()
  })
})

describe('createEncryptedCookie', () => {
  let mockCrypto: CryptoServiceLike
  let encryptedCookie: ReturnType<typeof createEncryptedCookie>

  beforeEach(() => {
    mockCrypto = createMockCrypto()
    encryptedCookie = createEncryptedCookie({
      crypto: mockCrypto,
      encryptionKey: 'secret-key-32-bytes-long-xxxxxxx',
    })
  })

  it('应该设置加密 Cookie', async () => {
    const cookies = createMockCookies()

    await encryptedCookie.set(cookies, 'user_data', { id: 'user-1' })

    expect(mockCrypto.aes.encrypt).toHaveBeenCalledWith(
      JSON.stringify({ id: 'user-1' }),
      'secret-key-32-bytes-long-xxxxxxx',
    )
    expect(cookies.set).toHaveBeenCalledWith(
      'user_data',
      'encrypted-value',
      expect.objectContaining({ httpOnly: true }),
    )
  })

  it('应该获取并解密 Cookie', async () => {
    const cookies = createMockCookies()
    ;(cookies.get as ReturnType<typeof vi.fn>).mockReturnValue('encrypted-value')

    const value = await encryptedCookie.get<{ test: string }>(cookies, 'data')

    expect(mockCrypto.aes.decrypt).toHaveBeenCalledWith(
      'encrypted-value',
      'secret-key-32-bytes-long-xxxxxxx',
    )
    expect(value).toEqual({ test: 'value' })
  })

  it('应该在 Cookie 不存在时返回 null', async () => {
    const cookies = createMockCookies()

    const value = await encryptedCookie.get(cookies, 'nonexistent')

    expect(value).toBeNull()
  })

  it('应该在解密失败时返回 null', async () => {
    ;(mockCrypto.aes.decrypt as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
    })

    const cookies = createMockCookies()
    ;(cookies.get as ReturnType<typeof vi.fn>).mockReturnValue('corrupted')

    const value = await encryptedCookie.get(cookies, 'data')

    expect(value).toBeNull()
  })

  it('应该删除 Cookie', () => {
    const cookies = createMockCookies()

    encryptedCookie.delete(cookies, 'data')

    expect(cookies.delete).toHaveBeenCalledWith('data', { path: '/' })
  })
})
