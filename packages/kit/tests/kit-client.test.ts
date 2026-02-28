/**
 * =============================================================================
 * @h-ai/kit - 统一客户端测试
 * =============================================================================
 * 覆盖：
 * - createKitClient：默认配置（仅 CSRF）
 * - 写请求自动附加 CSRF Token
 * - 读请求不附加 CSRF Token
 * - transport 启用：自动密钥交换 + 请求加密 + 响应解密
 * - ready / init / destroy 生命周期
 * =============================================================================
 */

import type { TransportCryptoServiceLike } from '../src/modules/crypto/kit-crypto-types.js'
import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createKitClient } from '../src/client/kit-client.js'

// ─── Mock fetch ───

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Mock document.cookie ───

function setDocumentCookie(cookie: string) {
  Object.defineProperty(globalThis, 'document', {
    value: { cookie },
    writable: true,
    configurable: true,
  })
}

function clearDocumentCookie() {
  // @ts-expect-error 清理 mock
  delete globalThis.document
}

// ─── Mock Crypto Service ───

function createMockCryptoService(): TransportCryptoServiceLike {
  let keyPairCounter = 0

  return {
    asymmetric: {
      generateKeyPair: () => {
        keyPairCounter++
        return {
          success: true,
          data: {
            publicKey: `client_pub_${keyPairCounter}`,
            privateKey: `client_priv_${keyPairCounter}`,
          },
        }
      },
      encrypt: (data: string, _publicKey: string) => {
        const encoded = Buffer.from(data).toString('base64')
        return { success: true, data: `SM2ENC:${encoded}` }
      },
      decrypt: (ciphertext: string, _privateKey: string) => {
        if (!ciphertext.startsWith('SM2ENC:')) {
          return { success: false, error: { code: 1, message: 'Invalid' } }
        }
        const decoded = Buffer.from(ciphertext.slice(7), 'base64').toString()
        return { success: true, data: decoded }
      },
    },
    symmetric: {
      generateKey: () => `symkey_${Date.now()}`,
      encryptWithIV: (data: string, _key: string) => {
        const iv = `iv_${Math.random().toString(36).slice(2, 10)}`
        const ciphertext = Buffer.from(data).toString('base64')
        return { success: true, data: { ciphertext, iv } }
      },
      decryptWithIV: (ciphertext: string, _key: string, _iv: string) => {
        const plaintext = Buffer.from(ciphertext, 'base64').toString()
        return { success: true, data: plaintext }
      },
    },
  }
}

// =============================================================================
// 纯 CSRF 模式（无传输加密）
// =============================================================================

describe('createKitClient - 仅 CSRF', () => {
  afterEach(clearDocumentCookie)

  it('gET 请求不附加 CSRF Token', async () => {
    const { apiFetch } = createKitClient()

    await apiFetch('/api/users')

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.has('X-CSRF-Token')).toBe(false)
  })

  it('pOST 请求自动附加 CSRF Token', async () => {
    setDocumentCookie('hai_csrf=abc123')

    const { apiFetch } = createKitClient()

    await apiFetch('/api/users', { method: 'POST', body: '{}' })

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.get('X-CSRF-Token')).toBe('abc123')
  })

  it('dELETE 请求自动附加 CSRF Token', async () => {
    setDocumentCookie('hai_csrf=token456')

    const { apiFetch } = createKitClient()

    await apiFetch('/api/users/1', { method: 'DELETE' })

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.get('X-CSRF-Token')).toBe('token456')
  })

  it('无 CSRF Cookie 时不设置 Header', async () => {
    const { apiFetch } = createKitClient()

    await apiFetch('/api/users', { method: 'POST', body: '{}' })

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.has('X-CSRF-Token')).toBe(false)
  })

  it('自定义 CSRF Cookie/Header 名称', async () => {
    setDocumentCookie('my_csrf=custom_token')

    const { apiFetch } = createKitClient({
      csrfCookieName: 'my_csrf',
      csrfHeaderName: 'X-My-CSRF',
    })

    await apiFetch('/api/data', { method: 'PUT', body: '{}' })

    const [, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init.headers)
    expect(headers.get('X-My-CSRF')).toBe('custom_token')
  })

  it('ready 在无 transport 时始终为 true', () => {
    const client = createKitClient()
    expect(client.ready).toBe(true)
  })
})

// =============================================================================
// 传输加密模式
// =============================================================================

describe('createKitClient - 传输加密', () => {
  afterEach(clearDocumentCookie)

  it('init 触发密钥交换', async () => {
    const cryptoService = createMockCryptoService()

    // mock fetch 返回密钥交换成功
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      serverPublicKey: 'server_pub_key',
      clientId: 'client_001',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const client = createKitClient({
      transport: { crypto: cryptoService },
    })

    expect(client.ready).toBe(false)

    await client.init()

    expect(client.ready).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/kit/key-exchange',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('自定义密钥交换端点', async () => {
    const cryptoService = createMockCryptoService()

    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      serverPublicKey: 'server_pub_key',
      clientId: 'client_001',
    })))

    const client = createKitClient({
      transport: { crypto: cryptoService, keyExchangeUrl: '/my/exchange' },
    })

    await client.init()

    expect(fetchSpy).toHaveBeenCalledWith('/my/exchange', expect.anything())
  })

  it('写请求自动加密 body 并附加 X-Client-Id', async () => {
    const cryptoService = createMockCryptoService()

    // 密钥交换
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      serverPublicKey: 'server_pub_key',
      clientId: 'client_001',
    })))

    const client = createKitClient({
      transport: { crypto: cryptoService },
    })

    await client.init()

    // 业务请求
    fetchSpy.mockResolvedValueOnce(new Response('OK', { status: 200 }))

    await client.apiFetch('/api/data', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    })

    // 第二次调用（第一次是密钥交换）
    const [url, init] = fetchSpy.mock.calls[1]!
    expect(url).toBe('/api/data')
    const headers = new Headers(init.headers)
    expect(headers.get('X-Client-Id')).toBe('client_001')

    // body 应该是加密后的 JSON（包含 encryptedKey, ciphertext, iv）
    const payload = JSON.parse(init.body as string)
    expect(payload).toHaveProperty('encryptedKey')
    expect(payload).toHaveProperty('ciphertext')
    expect(payload).toHaveProperty('iv')
  })

  it('加密响应自动解密', async () => {
    const cryptoService = createMockCryptoService()

    // 密钥交换
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      serverPublicKey: 'server_pub_key',
      clientId: 'client_001',
    })))

    const client = createKitClient({
      transport: { crypto: cryptoService },
    })

    await client.init()

    // 构造加密响应：使用 client public key 加密
    const originalData = JSON.stringify({ users: ['Alice', 'Bob'] })
    const symKey = cryptoService.symmetric.generateKey()
    const encData = cryptoService.symmetric.encryptWithIV(originalData, symKey)
    const encKey = cryptoService.asymmetric.encrypt(symKey, 'client_pub_1')

    const encryptedPayload = {
      encryptedKey: encKey.data,
      ciphertext: encData.data!.ciphertext,
      iv: encData.data!.iv,
    }

    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(encryptedPayload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Encrypted': 'true',
      },
    }))

    const response = await client.apiFetch('/api/users')

    const body = await response.text()
    expect(body).toBe(originalData)
  })

  it('destroy 重置所有状态', async () => {
    const cryptoService = createMockCryptoService()

    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      serverPublicKey: 'server_pub_key',
      clientId: 'client_001',
    })))

    const client = createKitClient({
      transport: { crypto: cryptoService },
    })

    await client.init()
    expect(client.ready).toBe(true)

    client.destroy()
    expect(client.ready).toBe(false)
  })

  it('lazy init：首次写请求自动触发密钥交换', async () => {
    const cryptoService = createMockCryptoService()

    // 密钥交换
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      serverPublicKey: 'server_pub_key',
      clientId: 'client_001',
    })))

    // 业务响应
    fetchSpy.mockResolvedValueOnce(new Response('OK', { status: 200 }))

    const client = createKitClient({
      transport: { crypto: cryptoService },
    })

    // 未手动 init，直接发请求
    await client.apiFetch('/api/users', {
      method: 'POST',
      body: '{"name":"test"}',
    })

    // 应该先密钥交换再发业务请求
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy.mock.calls[0]![0]).toBe('/api/kit/key-exchange')
    expect(fetchSpy.mock.calls[1]![0]).toBe('/api/users')
  })

  it('并发请求共用同一次密钥交换', async () => {
    const cryptoService = createMockCryptoService()

    // 密钥交换（稍作延迟模拟异步）
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      serverPublicKey: 'server_pub_key',
      clientId: 'client_001',
    })))

    // 两次业务响应
    fetchSpy.mockResolvedValueOnce(new Response('OK1', { status: 200 }))
    fetchSpy.mockResolvedValueOnce(new Response('OK2', { status: 200 }))

    const client = createKitClient({
      transport: { crypto: cryptoService },
    })

    // 并发发两个请求
    await Promise.all([
      client.apiFetch('/api/a', { method: 'POST', body: '{}' }),
      client.apiFetch('/api/b', { method: 'POST', body: '{}' }),
    ])

    // 密钥交换应该只发生 1 次
    const keyExchangeCount = fetchSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === '/api/kit/key-exchange',
    ).length
    expect(keyExchangeCount).toBe(1)
  })
})
