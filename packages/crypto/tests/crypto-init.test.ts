import { afterEach, describe, expect, it } from 'vitest'
import { crypto, CryptoConfigSchema, CryptoErrorCode } from '../src/index.js'

describe('crypto.init', () => {
  afterEach(async () => {
    await crypto.close()
  })

  it('should not be initialized by default', () => {
    expect(crypto.isInitialized).toBe(false)
    expect(crypto.config).toBeNull()
  })

  it('should initialize with valid config', async () => {
    const result = await crypto.init({ defaultAlgorithm: 'sm' })
    expect(result.success).toBe(true)
    expect(crypto.isInitialized).toBe(true)
    expect(crypto.config).toEqual({ defaultAlgorithm: 'sm' })
  })

  it('should initialize with default config', async () => {
    const result = await crypto.init({})
    expect(result.success).toBe(true)
    expect(crypto.isInitialized).toBe(true)
    expect(crypto.config?.defaultAlgorithm).toBe('sm')
  })

  it('should return CONFIG_ERROR for invalid config', async () => {
    // @ts-expect-error 测试无效配置
    const result = await crypto.init({ defaultAlgorithm: 'invalid' })
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(CryptoErrorCode.CONFIG_ERROR)
  })

  it('should close and reset state', async () => {
    await crypto.init({})
    expect(crypto.isInitialized).toBe(true)

    await crypto.close()
    expect(crypto.isInitialized).toBe(false)
    expect(crypto.config).toBeNull()
  })

  it('should re-init after close', async () => {
    await crypto.init({})
    await crypto.close()
    const result = await crypto.init({ defaultAlgorithm: 'sm' })
    expect(result.success).toBe(true)
    expect(crypto.isInitialized).toBe(true)
  })

  it('should export CryptoConfigSchema', () => {
    const parsed = CryptoConfigSchema.parse({})
    expect(parsed.defaultAlgorithm).toBe('sm')
  })

  it('should return NOT_INITIALIZED when accessing sm2 before init', () => {
    const result = crypto.sm2.generateKeyPair()
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(CryptoErrorCode.NOT_INITIALIZED)
  })

  it('should return NOT_INITIALIZED when accessing sm3 before init', () => {
    const result = crypto.sm3.hash('hello')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(CryptoErrorCode.NOT_INITIALIZED)
  })

  it('should return NOT_INITIALIZED when accessing sm4 before init', () => {
    const key = '00112233445566778899aabbccddeeff'
    const result = crypto.sm4.encrypt('hello', key)
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
    await crypto.init({})
    await crypto.close()

    const result = crypto.sm3.hash('hello')
    expect(result.success).toBe(false)
    if (result.success)
      return
    expect(result.error.code).toBe(CryptoErrorCode.NOT_INITIALIZED)
  })

  it('should overwrite previous state on re-init', async () => {
    await crypto.init({})
    const hash1 = crypto.sm3.hash('test')
    expect(hash1.success).toBe(true)

    const result = await crypto.init({ defaultAlgorithm: 'sm' })
    expect(result.success).toBe(true)

    // 重新初始化后功能仍正常
    const hash2 = crypto.sm3.hash('test')
    expect(hash2.success).toBe(true)
    if (!hash1.success || !hash2.success)
      return
    expect(hash1.data).toBe(hash2.data)
  })
})
