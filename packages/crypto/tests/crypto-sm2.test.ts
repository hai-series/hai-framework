import { beforeAll, describe, expect, it } from 'vitest'
import { crypto, HaiCryptoError } from '../src/index.js'

describe('crypto.asymmetric', () => {
  beforeAll(async () => {
    await crypto.init()
  })

  // ─── 密钥对生成 ───

  it('should generate valid key pair', () => {
    const result = crypto.asymmetric.generateKeyPair()
    expect(result.success).toBe(true)
    if (!result.success)
      return

    expect(crypto.asymmetric.isValidPublicKey(result.data.publicKey)).toBe(true)
    expect(crypto.asymmetric.isValidPrivateKey(result.data.privateKey)).toBe(true)
  })

  it('should generate different key pairs each time', () => {
    const pair1 = crypto.asymmetric.generateKeyPair()
    const pair2 = crypto.asymmetric.generateKeyPair()
    expect(pair1.success && pair2.success).toBe(true)
    if (!pair1.success || !pair2.success)
      return

    expect(pair1.data.privateKey).not.toBe(pair2.data.privateKey)
  })

  // ─── 密钥格式校验 ───

  it('should accept public key without 04 prefix', () => {
    const result = crypto.asymmetric.generateKeyPair()
    expect(result.success).toBe(true)
    if (!result.success)
      return

    const publicKey = result.data.publicKey
    const trimmed = publicKey.startsWith('04') ? publicKey.slice(2) : publicKey
    expect(crypto.asymmetric.isValidPublicKey(trimmed)).toBe(true)
  })

  it('should reject empty string as public key', () => {
    expect(crypto.asymmetric.isValidPublicKey('')).toBe(false)
  })

  it('should reject short string as public key', () => {
    expect(crypto.asymmetric.isValidPublicKey('04abcdef')).toBe(false)
  })

  it('should reject non-hex characters in public key', () => {
    const nonHex = `04${'zz'.repeat(64)}`
    expect(crypto.asymmetric.isValidPublicKey(nonHex)).toBe(false)
  })

  it('should reject empty string as private key', () => {
    expect(crypto.asymmetric.isValidPrivateKey('')).toBe(false)
  })

  it('should reject short string as private key', () => {
    expect(crypto.asymmetric.isValidPrivateKey('1234')).toBe(false)
  })

  it('should reject non-hex characters in private key', () => {
    const nonHex = 'zz'.repeat(32)
    expect(crypto.asymmetric.isValidPrivateKey(nonHex)).toBe(false)
  })

  // ─── 加密解密 ───

  it('should encrypt and decrypt roundtrip', () => {
    const keyPair = crypto.asymmetric.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const encrypted = crypto.asymmetric.encrypt('hello', keyPair.data.publicKey)
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    const decrypted = crypto.asymmetric.decrypt(encrypted.data, keyPair.data.privateKey)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should encrypt and decrypt with base64 output', () => {
    const keyPair = crypto.asymmetric.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const encrypted = crypto.asymmetric.encrypt('hello', keyPair.data.publicKey, { outputFormat: 'base64' })
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    // base64 密文应能被自动检测并解密
    const decrypted = crypto.asymmetric.decrypt(encrypted.data, keyPair.data.privateKey)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should encrypt and decrypt with cipherMode=0 (C1C2C3)', () => {
    const keyPair = crypto.asymmetric.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const encrypted = crypto.asymmetric.encrypt('hello', keyPair.data.publicKey, { cipherMode: 0 })
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    const decrypted = crypto.asymmetric.decrypt(encrypted.data, keyPair.data.privateKey, { cipherMode: 0 })
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe('hello')
  })

  it('should encrypt and decrypt Chinese text', () => {
    const keyPair = crypto.asymmetric.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const text = '你好世界'
    const encrypted = crypto.asymmetric.encrypt(text, keyPair.data.publicKey)
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return

    const decrypted = crypto.asymmetric.decrypt(encrypted.data, keyPair.data.privateKey)
    expect(decrypted.success).toBe(true)
    if (!decrypted.success)
      return

    expect(decrypted.data).toBe(text)
  })

  it('should return INVALID_KEY for invalid public key on encrypt', () => {
    const result = crypto.asymmetric.encrypt('data', 'invalid-key')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(HaiCryptoError.INVALID_KEY.code)
  })

  it('should return INVALID_KEY for invalid private key on decrypt', () => {
    const result = crypto.asymmetric.decrypt('abcd', 'invalid-private-key')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(HaiCryptoError.INVALID_KEY.code)
  })

  // ─── 签名验签 ───

  it('should sign and verify', () => {
    const keyPair = crypto.asymmetric.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const signature = crypto.asymmetric.sign('payload', keyPair.data.privateKey)
    expect(signature.success).toBe(true)
    if (!signature.success)
      return

    const verified = crypto.asymmetric.verify('payload', signature.data, keyPair.data.publicKey)
    expect(verified.success).toBe(true)
    if (!verified.success)
      return

    expect(verified.data).toBe(true)
  })

  it('should return false when signature does not match payload', () => {
    const keyPair = crypto.asymmetric.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const signature = crypto.asymmetric.sign('payload', keyPair.data.privateKey)
    expect(signature.success).toBe(true)
    if (!signature.success)
      return

    const verified = crypto.asymmetric.verify('another', signature.data, keyPair.data.publicKey)
    expect(verified.success).toBe(true)
    if (!verified.success)
      return

    expect(verified.data).toBe(false)
  })

  it('should sign with custom userId and verify', () => {
    const keyPair = crypto.asymmetric.generateKeyPair()
    expect(keyPair.success).toBe(true)
    if (!keyPair.success)
      return

    const customOpts = { userId: 'customUser1234567' }
    const signature = crypto.asymmetric.sign('data', keyPair.data.privateKey, customOpts)
    expect(signature.success).toBe(true)
    if (!signature.success)
      return

    // 同一 userId 验签应通过
    const verified = crypto.asymmetric.verify('data', signature.data, keyPair.data.publicKey, customOpts)
    expect(verified.success).toBe(true)
    if (!verified.success)
      return
    expect(verified.data).toBe(true)

    // 不同 userId 验签应失败
    const wrongUser = crypto.asymmetric.verify('data', signature.data, keyPair.data.publicKey, { userId: 'wrongUser12345678' })
    expect(wrongUser.success).toBe(true)
    if (!wrongUser.success)
      return
    expect(wrongUser.data).toBe(false)
  })

  it('should return INVALID_KEY for invalid private key in sign', () => {
    const result = crypto.asymmetric.sign('payload', 'invalid-private-key')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(HaiCryptoError.INVALID_KEY.code)
  })

  it('should return INVALID_KEY for invalid public key in verify', () => {
    const result = crypto.asymmetric.verify('data', 'fakesig', 'invalid-public-key')
    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.code).toBe(HaiCryptoError.INVALID_KEY.code)
  })
})
