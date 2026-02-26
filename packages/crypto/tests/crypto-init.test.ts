import { afterEach, describe, expect, it } from 'vitest'
import { crypto, CryptoErrorCode } from '../src/index.js'

describe('crypto.init', () => {
  afterEach(async () => {
    await crypto.close()
  })

  it('should not be initialized by default', () => {
    expect(crypto.isInitialized).toBe(false)
  })

  it('should initialize successfully', async () => {
    const result = await crypto.init()
    expect(result.success).toBe(true)
    expect(crypto.isInitialized).toBe(true)
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
    expect(result.error.code).toBe(CryptoErrorCode.NOT_INITIALIZED)
  })

  it('should return NOT_INITIALIZED when accessing hash before init', () => {
    const result = crypto.hash.hash('hello')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(CryptoErrorCode.NOT_INITIALIZED)
  })

  it('should return NOT_INITIALIZED when accessing symmetric before init', () => {
    const key = '00112233445566778899aabbccddeeff'
    const result = crypto.symmetric.encrypt('hello', key)
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(CryptoErrorCode.NOT_INITIALIZED)
  })

  it('should return NOT_INITIALIZED when accessing password before init', () => {
    const result = crypto.password.hash('password')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(CryptoErrorCode.NOT_INITIALIZED)
  })

  it('should return NOT_INITIALIZED after close', async () => {
    await crypto.init()
    await crypto.close()

    const result = crypto.hash.hash('hello')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(CryptoErrorCode.NOT_INITIALIZED)
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
