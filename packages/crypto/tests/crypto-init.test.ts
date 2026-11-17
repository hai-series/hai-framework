import { afterEach, describe, expect, it } from 'vitest'
import { crypto, HaiCryptoError } from '../src/index.js'

describe('crypto.init', () => {
  afterEach(async () => {
    await crypto.close()
  })

  it('should not be initialized by default', () => {
    expect(crypto.isInitialized).toBe(false)
  })

  it('公钥输入校验在初始化前和关闭后仍返回可靠的布尔值', async () => {
    for (const value of [undefined, null, {}, 42, 'invalid'])
      expect(crypto.asymmetric.isValidPublicKey(value)).toBe(false)
    expect((await crypto.init()).success).toBe(true)
    const generated = crypto.asymmetric.generateKeyPair()
    expect(generated.success).toBe(true)
    if (!generated.success)
      throw new Error(generated.error.message)
    const input: unknown = generated.data.publicKey
    await crypto.close()
    expect(crypto.asymmetric.isValidPublicKey(input)).toBe(true)
    if (crypto.asymmetric.isValidPublicKey(input))
      expect(input.length).toBe(130)
    expect(crypto.asymmetric.generateKeyPair().success).toBe(false)
  })

  it('传输容量和密钥环输入检查不依赖初始化', async () => {
    const limits = crypto.transport.resolveBodyLimits(2048)
    expect(limits.plaintextBytes).toBe(2048)
    expect(limits.encryptedPayloadBytes).toBe(36864)
    expect(() => crypto.transport.resolveBodyLimits(0)).toThrow(RangeError)
    const invalidRing = crypto.transport.parseServerKeyRing(undefined)
    expect(invalidRing.success).toBe(false)
    const body = new Request('https://example.com', { method: 'POST', body: '你好' }).body
    await expect(crypto.transport.readBody(body, { maxBytes: 6 })).resolves.toBe('你好')
    expect(crypto.isInitialized).toBe(false)
  })

  it('should initialize successfully', async () => {
    const result = await crypto.init()
    expect(result.success).toBe(true)
    expect(crypto.isInitialized).toBe(true)
  })

  it('should reject concurrent initialization', async () => {
    const first = crypto.init()
    const second = crypto.init()
    const results = await Promise.all([first, second])

    expect(results.some(result => result.success)).toBe(true)
    const failed = results.find(result => !result.success)
    expect(failed?.success).toBe(false)
    if (failed?.success === false)
      expect(failed.error.code).toBe(HaiCryptoError.INIT_FAILED.code)
  })

  it.each([false, true])('close cancels pending initialization (reinitializing=%s)', async (reinitializing) => {
    if (reinitializing)
      expect((await crypto.init()).success).toBe(true)
    const pending = crypto.init()
    await crypto.close()
    const result = await pending
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiCryptoError.NOT_INITIALIZED.code)
    expect(crypto.isInitialized).toBe(false)
    expect(crypto.hash.hash('after-close').success).toBe(false)
    expect((await crypto.init()).success).toBe(true)
  })

  it('should close and reset state', async () => {
    await crypto.init()
    expect(crypto.isInitialized).toBe(true)

    await crypto.close()
    expect(crypto.isInitialized).toBe(false)
  })

  it('should re-init after close', async () => {
    await crypto.init()
    await crypto.close()
    const result = await crypto.init()
    expect(result.success).toBe(true)
    expect(crypto.isInitialized).toBe(true)
  })

  it('should return NOT_INITIALIZED when accessing asymmetric before init', () => {
    const result = crypto.asymmetric.generateKeyPair()
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(HaiCryptoError.NOT_INITIALIZED.code)
  })

  it('should return NOT_INITIALIZED when accessing hash before init', () => {
    const result = crypto.hash.hash('hello')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(HaiCryptoError.NOT_INITIALIZED.code)
  })

  it('should return NOT_INITIALIZED when accessing symmetric before init', () => {
    const key = '00112233445566778899aabbccddeeff'
    const result = crypto.symmetric.encrypt('hello', key)
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(HaiCryptoError.NOT_INITIALIZED.code)
  })

  it('should return NOT_INITIALIZED when accessing password before init', () => {
    const result = crypto.password.hash('password')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(HaiCryptoError.NOT_INITIALIZED.code)
  })

  it('should return NOT_INITIALIZED after close', async () => {
    await crypto.init()
    await crypto.close()

    const result = crypto.hash.hash('hello')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(HaiCryptoError.NOT_INITIALIZED.code)
  })

  it('should overwrite previous state on re-init', async () => {
    await crypto.init()
    const hash1 = crypto.hash.hash('test')
    expect(hash1.success).toBe(true)

    const result = await crypto.init()
    expect(result.success).toBe(true)

    const hash2 = crypto.hash.hash('test')
    expect(hash2.success).toBe(true)
    if (!hash1.success || !hash2.success)
      return
    expect(hash1.data).toBe(hash2.data)
  })
})
