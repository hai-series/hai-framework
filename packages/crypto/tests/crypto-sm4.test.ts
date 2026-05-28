import { beforeAll, describe, expect, it } from 'vitest'
import { crypto, HaiCryptoError } from '../src/index.js'

describe('crypto.symmetric', () => {
  beforeAll(async () => {
    await crypto.init()
  })

  // ─── 密钥与 IV 生成 ───

  it('should generate key as 32-char hex', () => {
    const key = crypto.symmetric.generateKey()
    expect(key).toMatch(/^[0-9a-f]{32}$/i)
  })

  it('should generate iv as 32-char hex', () => {
    const iv = crypto.symmetric.generateIV()
    expect(iv).toMatch(/^[0-9a-f]{32}$/i)
  })

  it('should generate different keys each time', () => {
    const key1 = crypto.symmetric.generateKey()
    const key2 = crypto.symmetric.generateKey()
    expect(key1).not.toBe(key2)
  })

  // ─── 格式校验 ───

  it('should validate correct key and iv format', () => {
    expect(crypto.symmetric.isValidKey('00112233445566778899aabbccddeeff')).toBe(true)
    expect(crypto.symmetric.isValidIV('00112233445566778899aabbccddeeff')).toBe(true)
  })

  it('should reject invalid key format', () => {
    expect(crypto.symmetric.isValidKey('bad')).toBe(false)
    expect(crypto.symmetric.isValidKey('00112233445566778899aabbccddeef')).toBe(false) // 31 chars
    expect(crypto.symmetric.isValidKey('00112233445566778899aabbccddeefff')).toBe(false) // 33 chars
    expect(crypto.symmetric.isValidKey('zz112233445566778899aabbccddeeff')).toBe(false) // non-hex
  })

  it('should reject invalid iv format', () => {
    expect(crypto.symmetric.isValidIV('bad')).toBe(false)
    expect(crypto.symmetric.isValidIV('')).toBe(false)
  })

  // ─── 结构化 CBC 默认与 ECB 显式模式 ───

  it('should encrypt and decrypt with default structured cbc payload', () => {
    const key = crypto.symmetric.generateKey()
    const encrypted = crypto.symmetric.encrypt('hello', key)
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return
    expect(encrypted.data.mode).toBe('cbc')
    expect(encrypted.data.iv).toMatch(/^[0-9a-f]{32}$/i)
    expect(encrypted.data.ciphertext).toMatch(/^[0-9a-f]+$/i)
    expect(encrypted.data.encoding).toBe('hex')

    const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should encrypt and decrypt in explicit ecb mode', () => {
    const key = crypto.symmetric.generateKey()
    const encrypted = crypto.symmetric.encrypt('hello', key, { mode: 'ecb' })
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return
    expect(encrypted.data.mode).toBe('ecb')
    expect(encrypted.data.iv).toBeUndefined()
    expect(encrypted.data.ciphertext).toMatch(/^[0-9a-f]+$/i)
    expect(encrypted.data.encoding).toBe('hex')

    const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should encrypt and decrypt with base64 output', () => {
    const key = crypto.symmetric.generateKey()
    const encrypted = crypto.symmetric.encrypt('hello', key, { outputFormat: 'base64' })
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return
    expect(encrypted.data.mode).toBe('cbc')
    expect(encrypted.data.iv).toMatch(/^[0-9a-f]{32}$/i)
    expect(encrypted.data.encoding).toBe('base64')

    const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should produce different ciphertext for different data', () => {
    const key = crypto.symmetric.generateKey()
    const enc1 = crypto.symmetric.encrypt('hello', key)
    const enc2 = crypto.symmetric.encrypt('world', key)
    expect(enc1.success && enc2.success).toBe(true)
    if (!enc1.success || !enc2.success)
      return

    expect(enc1.data.ciphertext).not.toBe(enc2.data.ciphertext)
  })

  it('should encrypt and decrypt Chinese text', () => {
    const key = crypto.symmetric.generateKey()
    const text = '你好世界，这是一段中文'
    const encrypted = crypto.symmetric.encrypt(text, key)
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe(text)
  })

  it('should encrypt and decrypt long text', () => {
    const key = crypto.symmetric.generateKey()
    const text = 'a'.repeat(10000)
    const encrypted = crypto.symmetric.encrypt(text, key)
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe(text)
  })

  // ─── CBC 模式 ───

  it('should encrypt and decrypt in cbc mode with explicit iv', () => {
    const key = crypto.symmetric.generateKey()
    const iv = crypto.symmetric.generateIV()
    const encrypted = crypto.symmetric.encrypt('hello', key, { mode: 'cbc', iv })
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return
    expect(encrypted.data.mode).toBe('cbc')
    expect(encrypted.data.iv).toBe(iv)

    const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should encrypt and decrypt with encryptWithIV/decryptWithIV', () => {
    const key = crypto.symmetric.generateKey()
    const encrypted = crypto.symmetric.encryptWithIV('hello', key)
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    // 返回结构中应包含密文、IV、模式与编码
    expect(encrypted.data.mode).toBe('cbc')
    expect(encrypted.data.ciphertext).toBeDefined()
    expect(encrypted.data.iv).toMatch(/^[0-9a-f]{32}$/i)
    expect(encrypted.data.encoding).toBe('hex')

    const decrypted = crypto.symmetric.decryptWithIV(encrypted.data.ciphertext, key, encrypted.data.iv)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should auto-generate iv when cbc encrypt omits iv', () => {
    const key = crypto.symmetric.generateKey()
    const result = crypto.symmetric.encrypt('data', key, { mode: 'cbc' })
    expect(result.success).toBe(true)
    if (!result.success)
      return

    expect(result.data.mode).toBe('cbc')
    expect(result.data.iv).toMatch(/^[0-9a-f]{32}$/i)
  })

  it('should return INVALID_IV when missing iv in cbc decrypt', () => {
    const key = crypto.symmetric.generateKey()
    const result = crypto.symmetric.decrypt({ mode: 'cbc', ciphertext: 'abcd', encoding: 'hex' }, key)
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(HaiCryptoError.INVALID_IV.code)
  })

  it('should return INVALID_IV when iv format is invalid in cbc encrypt', () => {
    const key = crypto.symmetric.generateKey()
    const result = crypto.symmetric.encrypt('data', key, { mode: 'cbc', iv: 'bad-iv' })
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(HaiCryptoError.INVALID_IV.code)
  })

  // ─── 密钥派生 ───

  it('should derive key from password and salt', () => {
    const key = crypto.symmetric.deriveKey('password', 'salt')
    expect(key).toMatch(/^[0-9a-f]{32}$/i)
  })

  it('should derive same key for same inputs (deterministic)', () => {
    const key1 = crypto.symmetric.deriveKey('password', 'salt')
    const key2 = crypto.symmetric.deriveKey('password', 'salt')
    expect(key1).toBe(key2)
  })

  it('should derive different keys for different password', () => {
    const key1 = crypto.symmetric.deriveKey('password1', 'salt')
    const key2 = crypto.symmetric.deriveKey('password2', 'salt')
    expect(key1).not.toBe(key2)
  })

  it('should derive different keys for different salt', () => {
    const key1 = crypto.symmetric.deriveKey('password', 'salt1')
    const key2 = crypto.symmetric.deriveKey('password', 'salt2')
    expect(key1).not.toBe(key2)
  })

  // ─── 错误处理 ───

  it('should return INVALID_KEY for invalid key on encrypt', () => {
    const result = crypto.symmetric.encrypt('data', 'invalid-key')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(HaiCryptoError.INVALID_KEY.code)
  })

  it('should return INVALID_KEY for invalid key on decrypt', () => {
    const result = crypto.symmetric.decrypt({ mode: 'ecb', ciphertext: 'data', encoding: 'hex' }, 'invalid-key')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(HaiCryptoError.INVALID_KEY.code)
  })
})
