/**
 * =============================================================================
 * @h-ai/kit - 传输加密测试
 * =============================================================================
 * 覆盖：
 * - createTransportEncryption：密钥对生成、客户端注册、加密/解密
 * - createKeyExchangeHandler：密钥交换端点
 * - isValidEncryptedPayload：载荷校验
 * - transportEncryptionMiddleware：中间件加解密 + 排除路径 + 未启用
 * - 完整往返：客户端加密 → 服务端解密 → 服务端加密 → 客户端解密
 * =============================================================================
 */

import type {
  EncryptedPayload,
  TransportCryptoServiceLike,
} from '../src/modules/crypto/crypto-types.js'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createKeyExchangeHandler,
  createTransportEncryption,
  isValidEncryptedPayload,
} from '../src/modules/crypto/transport-encryption.js'
import { transportEncryptionMiddleware } from '../src/modules/crypto/transport-middleware.js'

// ─── Mock 加密服务 ───

/**
 * 创建一个可实际完成加密/解密往返的 Mock 加密服务
 *
 * 非对称：使用简单的 XOR + base16 模拟非对称加密
 * 对称：使用 reverse + prefix 模拟对称加密
 */
function createMockCryptoService(): TransportCryptoServiceLike {
  let keyPairCounter = 0

  return {
    asymmetric: {
      generateKeyPair: () => {
        keyPairCounter++
        return {
          success: true,
          data: {
            publicKey: `mock_pub_key_${keyPairCounter}`,
            privateKey: `mock_priv_key_${keyPairCounter}`,
          },
        }
      },
      encrypt: (data: string, _publicKey: string) => {
        // 简单模拟：base64 编码 + 前缀标识
        const encoded = Buffer.from(data).toString('base64')
        return { success: true, data: `SM2ENC:${encoded}` }
      },
      decrypt: (ciphertext: string, _privateKey: string) => {
        // 简单模拟：去前缀 + base64 解码
        if (!ciphertext.startsWith('SM2ENC:')) {
          return { success: false, error: { code: 1, message: 'Invalid ciphertext' } }
        }
        const decoded = Buffer.from(ciphertext.slice(7), 'base64').toString()
        return { success: true, data: decoded }
      },
    },
    symmetric: {
      generateKey: () => `symkey_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      encryptWithIV: (data: string, _key: string) => {
        // 简单模拟：base64 编码
        const iv = `mock_iv_${Math.random().toString(36).slice(2, 10)}`
        const ciphertext = Buffer.from(data).toString('base64')
        return { success: true, data: { ciphertext, iv } }
      },
      decryptWithIV: (ciphertext: string, _key: string, _iv: string) => {
        // 简单模拟：base64 解码
        const plaintext = Buffer.from(ciphertext, 'base64').toString()
        return { success: true, data: plaintext }
      },
    },
  }
}

/**
 * 创建密钥生成失败的 Mock
 */
function createFailingCryptoService(): TransportCryptoServiceLike {
  return {
    asymmetric: {
      generateKeyPair: () => ({ success: false, error: { code: 1, message: 'Key generation failed' } }),
      encrypt: () => ({ success: false, error: { code: 2, message: 'Encrypt failed' } }),
      decrypt: () => ({ success: false, error: { code: 3, message: 'Decrypt failed' } }),
    },
    symmetric: {
      generateKey: () => 'dummy',
      encryptWithIV: () => ({ success: false, error: { code: 4, message: 'Symmetric encrypt failed' } }),
      decryptWithIV: () => ({ success: false, error: { code: 5, message: 'Symmetric decrypt failed' } }),
    },
  }
}

// =============================================================================
// createTransportEncryption
// =============================================================================

describe('createTransportEncryption', () => {
  let cryptoService: TransportCryptoServiceLike

  beforeEach(() => {
    cryptoService = createMockCryptoService()
  })

  it('生成服务端密钥对并返回公钥', () => {
    const manager = createTransportEncryption(cryptoService)
    const pubKey = manager.getServerPublicKey()
    expect(pubKey).toBeTruthy()
    expect(pubKey).toContain('mock_pub_key')
  })

  it('密钥对生成失败时抛出异常', () => {
    const failing = createFailingCryptoService()
    expect(() => createTransportEncryption(failing)).toThrow()
  })

  it('注册客户端公钥并返回唯一 clientId', () => {
    const manager = createTransportEncryption(cryptoService)
    const id1 = manager.registerClientKey('client_pub_1')
    const id2 = manager.registerClientKey('client_pub_2')
    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
  })

  it('可通过 clientId 查询已注册的客户端公钥', () => {
    const manager = createTransportEncryption(cryptoService)
    const id = manager.registerClientKey('my_client_pub')
    expect(manager.getClientPublicKey(id)).toBe('my_client_pub')
    expect(manager.getClientPublicKey('nonexistent')).toBeUndefined()
  })

  it('加密响应 → 解密请求完整往返', () => {
    const manager = createTransportEncryption(cryptoService)
    const clientId = manager.registerClientKey('client_pub_key')

    const originalData = JSON.stringify({ message: 'hello world', count: 42 })

    // 服务端加密响应
    const encrypted = manager.encryptResponse(clientId, originalData)
    expect(encrypted.encryptedKey).toBeTruthy()
    expect(encrypted.ciphertext).toBeTruthy()
    expect(encrypted.iv).toBeTruthy()

    // 服务端解密请求（模拟客户端使用同样格式发来的数据）
    const decrypted = manager.decryptRequest(encrypted)
    expect(decrypted).toBe(originalData)
  })

  it('加密时客户端不存在应抛出异常', () => {
    const manager = createTransportEncryption(cryptoService)
    expect(() => manager.encryptResponse('nonexistent', 'data')).toThrow()
  })

  it('多客户端密钥隔离', () => {
    const manager = createTransportEncryption(cryptoService)
    const id1 = manager.registerClientKey('pub_A')
    const id2 = manager.registerClientKey('pub_B')

    expect(manager.getClientPublicKey(id1)).toBe('pub_A')
    expect(manager.getClientPublicKey(id2)).toBe('pub_B')
    expect(manager.getClientPublicKey(id1)).not.toBe(manager.getClientPublicKey(id2))
  })
})

// =============================================================================
// createKeyExchangeHandler
// =============================================================================

describe('createKeyExchangeHandler', () => {
  let cryptoService: TransportCryptoServiceLike

  beforeEach(() => {
    cryptoService = createMockCryptoService()
  })

  it('正常密钥交换返回 serverPublicKey 和 clientId', async () => {
    const manager = createTransportEncryption(cryptoService)
    const handler = createKeyExchangeHandler(manager)

    const request = new Request('http://localhost/api/kit/key-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: 'test_client_pub' }),
    })

    const response = await handler(request)
    expect(response.status).toBe(200)

    const data = await response.json() as { serverPublicKey: string, clientId: string }
    expect(data.serverPublicKey).toBeTruthy()
    expect(data.clientId).toBeTruthy()

    // 验证注册成功
    expect(manager.getClientPublicKey(data.clientId)).toBe('test_client_pub')
  })

  it('缺少 clientPublicKey 返回 400', async () => {
    const manager = createTransportEncryption(cryptoService)
    const handler = createKeyExchangeHandler(manager)

    const request = new Request('http://localhost/api/kit/key-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const response = await handler(request)
    expect(response.status).toBe(400)
  })

  it('无效 JSON 返回 500', async () => {
    const manager = createTransportEncryption(cryptoService)
    const handler = createKeyExchangeHandler(manager)

    const request = new Request('http://localhost/api/kit/key-exchange', {
      method: 'POST',
      body: 'not json',
    })

    const response = await handler(request)
    expect(response.status).toBe(500)
  })
})

// =============================================================================
// isValidEncryptedPayload
// =============================================================================

describe('isValidEncryptedPayload', () => {
  it('合法载荷返回 true', () => {
    expect(isValidEncryptedPayload({
      encryptedKey: 'key123',
      ciphertext: 'cipher123',
      iv: 'iv123',
    })).toBe(true)
  })

  it('缺少字段返回 false', () => {
    expect(isValidEncryptedPayload({ encryptedKey: 'key' })).toBe(false)
    expect(isValidEncryptedPayload({ encryptedKey: 'key', ciphertext: 'c' })).toBe(false)
  })

  it('空字符串返回 false', () => {
    expect(isValidEncryptedPayload({
      encryptedKey: '',
      ciphertext: 'c',
      iv: 'iv',
    })).toBe(false)
  })

  it('非对象返回 false', () => {
    expect(isValidEncryptedPayload(null)).toBe(false)
    expect(isValidEncryptedPayload('string')).toBe(false)
    expect(isValidEncryptedPayload(42)).toBe(false)
    expect(isValidEncryptedPayload(undefined)).toBe(false)
  })
})

// =============================================================================
// transportEncryptionMiddleware
// =============================================================================

describe('transportEncryptionMiddleware', () => {
  let cryptoService: TransportCryptoServiceLike

  beforeEach(() => {
    cryptoService = createMockCryptoService()
  })

  /**
   * 创建模拟的中间件上下文
   */
  function createContext(options: {
    pathname?: string
    method?: string
    headers?: Record<string, string>
    body?: string
  }) {
    const url = new URL(options.pathname ?? '/api/data', 'http://localhost')
    const request = new Request(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
    })
    return {
      event: {
        url,
        request,
        locals: {},
        params: {},
        route: { id: options.pathname ?? '/api/data' },
        getClientAddress: () => '127.0.0.1',
        cookies: {} as unknown,
      } as unknown as import('@sveltejs/kit').RequestEvent,
      requestId: 'test-req-1',
    }
  }

  it('未启用时直接透传', async () => {
    const middleware = transportEncryptionMiddleware({
      enabled: false,
      crypto: cryptoService,
    })

    const mockResponse = new Response('plain data')
    const next = vi.fn().mockResolvedValue(mockResponse)
    const context = createContext({})

    const response = await middleware(context, next)
    expect(next).toHaveBeenCalled()
    expect(await response.text()).toBe('plain data')
  })

  it('密钥交换端点返回公钥和 clientId', async () => {
    const middleware = transportEncryptionMiddleware({
      enabled: true,
      crypto: cryptoService,
    })

    const context = createContext({
      pathname: '/api/kit/key-exchange',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: 'test_pub_key' }),
    })

    const next = vi.fn()
    const response = await middleware(context, next)

    expect(response.status).toBe(200)
    expect(next).not.toHaveBeenCalled()

    const data = await response.json() as { serverPublicKey: string, clientId: string }
    expect(data.serverPublicKey).toBeTruthy()
    expect(data.clientId).toBeTruthy()
  })

  it('排除路径不做加解密', async () => {
    const middleware = transportEncryptionMiddleware({
      enabled: true,
      crypto: cryptoService,
      excludePaths: ['/api/public'],
    })

    const context = createContext({ pathname: '/api/public' })
    const mockResponse = new Response('public data')
    const next = vi.fn().mockResolvedValue(mockResponse)

    const response = await middleware(context, next)
    expect(next).toHaveBeenCalled()
    expect(await response.text()).toBe('public data')
  })

  it('排除路径前缀匹配', async () => {
    const middleware = transportEncryptionMiddleware({
      enabled: true,
      crypto: cryptoService,
      excludePaths: ['/api/public'],
    })

    const context = createContext({ pathname: '/api/public/health' })
    const mockResponse = new Response('health ok')
    const next = vi.fn().mockResolvedValue(mockResponse)

    const response = await middleware(context, next)
    expect(next).toHaveBeenCalled()
    expect(await response.text()).toBe('health ok')
  })

  it('无 X-Client-Id 请求头时默认返回 400（requireEncryption 默认 true）', async () => {
    const middleware = transportEncryptionMiddleware({
      enabled: true,
      crypto: cryptoService,
    })

    const context = createContext({
      pathname: '/api/data',
      method: 'GET',
    })
    const next = vi.fn()

    const response = await middleware(context, next)
    expect(response.status).toBe(400)
    expect(next).not.toHaveBeenCalled()
    const body = await response.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  it('requireEncryption=false 时无 X-Client-Id 透传明文', async () => {
    const middleware = transportEncryptionMiddleware({
      enabled: true,
      crypto: cryptoService,
      requireEncryption: false,
    })

    const context = createContext({
      pathname: '/api/data',
      method: 'GET',
    })
    const mockResponse = new Response('unencrypted')
    const next = vi.fn().mockResolvedValue(mockResponse)

    const response = await middleware(context, next)
    expect(next).toHaveBeenCalled()
    // 无 clientId 时不加密响应
    expect(response.headers.get('X-Encrypted')).toBeNull()
  })

  it('未注册的 clientId 返回 400', async () => {
    const middleware = transportEncryptionMiddleware({
      enabled: true,
      crypto: cryptoService,
    })

    const context = createContext({
      pathname: '/api/data',
      method: 'GET',
      headers: { 'X-Client-Id': 'unknown_client' },
    })
    const next = vi.fn()

    const response = await middleware(context, next)
    expect(response.status).toBe(400)
    expect(next).not.toHaveBeenCalled()
  })

  it('密钥交换 + 加密请求 + 加密响应完整流程', async () => {
    const middleware = transportEncryptionMiddleware({
      enabled: true,
      crypto: cryptoService,
    })

    // 1. 密钥交换
    const exchangeContext = createContext({
      pathname: '/api/kit/key-exchange',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: 'client_pub_123' }),
    })
    const exchangeResponse = await middleware(exchangeContext, vi.fn())
    const exchangeData = await exchangeResponse.json() as { serverPublicKey: string, clientId: string }
    expect(exchangeData.clientId).toBeTruthy()

    // 2. 客户端构造加密请求
    const originalBody = JSON.stringify({ action: 'test', value: 42 })
    const symKey = cryptoService.symmetric.generateKey()
    const symEnc = cryptoService.symmetric.encryptWithIV(originalBody, symKey)
    const asymEncKey = cryptoService.asymmetric.encrypt(symKey, exchangeData.serverPublicKey)

    const encryptedPayload: EncryptedPayload = {
      encryptedKey: asymEncKey.data!,
      ciphertext: symEnc.data!.ciphertext,
      iv: symEnc.data!.iv,
    }

    // 3. 发送加密请求
    const requestContext = createContext({
      pathname: '/api/data',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': exchangeData.clientId,
      },
      body: JSON.stringify(encryptedPayload),
    })

    const mockResponse = new Response(JSON.stringify({ result: 'ok' }))
    const next = vi.fn().mockResolvedValue(mockResponse)

    const response = await middleware(requestContext, next)

    // 4. 验证中间件调用了 next
    expect(next).toHaveBeenCalled()

    // 5. 验证响应被加密
    expect(response.headers.get('X-Encrypted')).toBe('true')
    const responseBody = await response.json() as EncryptedPayload
    expect(responseBody.encryptedKey).toBeTruthy()
    expect(responseBody.ciphertext).toBeTruthy()
    expect(responseBody.iv).toBeTruthy()
  })

  it('encryptResponse=false 时不加密响应', async () => {
    const middleware = transportEncryptionMiddleware({
      enabled: true,
      crypto: cryptoService,
      encryptResponse: false,
    })

    // 先做密钥交换
    const exchangeContext = createContext({
      pathname: '/api/kit/key-exchange',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: 'client_pub' }),
    })
    const exchangeResult = await middleware(exchangeContext, vi.fn())
    const { clientId } = await exchangeResult.json() as { clientId: string }

    // 发送请求
    const context = createContext({
      pathname: '/api/data',
      method: 'GET',
      headers: { 'X-Client-Id': clientId },
    })
    const mockResponse = new Response('plain response')
    const next = vi.fn().mockResolvedValue(mockResponse)

    const response = await middleware(context, next)
    expect(response.headers.get('X-Encrypted')).toBeNull()
    expect(await response.text()).toBe('plain response')
  })

  it('自定义 keyExchangePath', async () => {
    const middleware = transportEncryptionMiddleware({
      enabled: true,
      crypto: cryptoService,
      keyExchangePath: '/custom/exchange',
    })

    const context = createContext({
      pathname: '/custom/exchange',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey: 'pub' }),
    })

    const response = await middleware(context, vi.fn())
    expect(response.status).toBe(200)
    const data = await response.json() as { serverPublicKey: string }
    expect(data.serverPublicKey).toBeTruthy()
  })
})

// =============================================================================
// 完整端到端往返测试 (不通过中间件，直接测试加解密逻辑)
// =============================================================================

describe('端到端加解密往返', () => {
  it('模拟完整流程：客户端加密 → 服务端解密 → 服务端加密 → 客户端解密', () => {
    const cryptoService = createMockCryptoService()

    // 服务端：创建传输加密管理器
    const serverManager = createTransportEncryption(cryptoService)

    // 客户端：生成密钥对
    const clientKeyPair = cryptoService.asymmetric.generateKeyPair().data!
    const serverPublicKey = serverManager.getServerPublicKey()

    // 密钥交换
    const clientId = serverManager.registerClientKey(clientKeyPair.publicKey)

    // ── 客户端 → 服务端 ──

    const requestData = JSON.stringify({ query: 'SELECT * FROM users', page: 1 })

    // 客户端加密
    const symKey1 = cryptoService.symmetric.generateKey()
    const symEnc1 = cryptoService.symmetric.encryptWithIV(requestData, symKey1)
    const asymEncKey1 = cryptoService.asymmetric.encrypt(symKey1, serverPublicKey)

    const requestPayload: EncryptedPayload = {
      encryptedKey: asymEncKey1.data!,
      ciphertext: symEnc1.data!.ciphertext,
      iv: symEnc1.data!.iv,
    }

    // 服务端解密
    const decryptedRequest = serverManager.decryptRequest(requestPayload)
    expect(decryptedRequest).toBe(requestData)

    // ── 服务端 → 客户端 ──

    const responseData = JSON.stringify({ users: [{ id: 1, name: 'Alice' }], total: 1 })

    // 服务端加密
    const responsePayload = serverManager.encryptResponse(clientId, responseData)

    // 客户端解密
    const keyDecResult = cryptoService.asymmetric.decrypt(responsePayload.encryptedKey, clientKeyPair.privateKey)
    expect(keyDecResult.success).toBe(true)

    const contentDecResult = cryptoService.symmetric.decryptWithIV(
      responsePayload.ciphertext,
      keyDecResult.data!,
      responsePayload.iv,
    )
    expect(contentDecResult.success).toBe(true)
    expect(contentDecResult.data).toBe(responseData)
  })

  it('大量数据加解密', () => {
    const cryptoService = createMockCryptoService()
    const manager = createTransportEncryption(cryptoService)
    const clientId = manager.registerClientKey('client_pub')

    // 生成大量数据
    const largeData = JSON.stringify({
      items: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        description: `Description for item ${i} with enough text to make it realistic`,
      })),
    })

    const encrypted = manager.encryptResponse(clientId, largeData)
    const decrypted = manager.decryptRequest(encrypted)
    expect(decrypted).toBe(largeData)
  })

  it('特殊字符加解密', () => {
    const cryptoService = createMockCryptoService()
    const manager = createTransportEncryption(cryptoService)
    const clientId = manager.registerClientKey('client_pub')

    const specialData = JSON.stringify({
      chinese: '你好世界',
      emoji: '🎉🔐💻',
      html: '<script>alert("xss")</script>',
      newlines: 'line1\nline2\rline3',
      unicode: '\u0000\u001F\u007F',
    })

    const encrypted = manager.encryptResponse(clientId, specialData)
    const decrypted = manager.decryptRequest(encrypted)
    expect(decrypted).toBe(specialData)
  })

  it('空字符串加解密', () => {
    const cryptoService = createMockCryptoService()
    const manager = createTransportEncryption(cryptoService)
    const clientId = manager.registerClientKey('client_pub')

    const encrypted = manager.encryptResponse(clientId, '')
    const decrypted = manager.decryptRequest(encrypted)
    expect(decrypted).toBe('')
  })
})
