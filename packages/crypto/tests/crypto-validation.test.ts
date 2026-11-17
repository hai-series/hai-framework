import type { CipherMode, SymmetricCiphertextEncoding, SymmetricMode } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { createCipheriv, createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { crypto, HaiCryptoError } from '../src/index.js'

beforeAll(async () => {
  expect((await crypto.init()).success).toBe(true)
})
afterAll(() => crypto.close())

describe('asymmetric input and authentication boundaries', () => {
  it.each([
    '0'.repeat(64),
    'fffffffeffffffffffffffffffffffff7203df6b21c6052b53bbf40939d54122',
    'fffffffeffffffffffffffffffffffff7203df6b21c6052b53bbf40939d54123',
    'f'.repeat(64),
    `${'1'.padStart(64, '0')}\n`,
  ])('rejects an invalid private scalar without entering signing: %s', (key) => {
    expect(crypto.asymmetric.isValidPrivateKey(key)).toBe(false)
    // 先检查守卫，避免旧实现对 n-1 签名时进入无限循环。
    if (crypto.asymmetric.isValidPrivateKey(key))
      return
    expect(crypto.asymmetric.sign('message', key)).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.INVALID_KEY.code },
    })
    expect(crypto.asymmetric.decrypt('00', key)).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.INVALID_KEY.code },
    })
  })

  it.each([
    '1'.padStart(64, '0'),
    'fffffffeffffffffffffffffffffffff7203df6b21c6052b53bbf40939d54121',
  ])('accepts a boundary signing scalar: %s', (key) => {
    expect(crypto.asymmetric.isValidPrivateKey(key)).toBe(true)
  })

  it.each([0, 1] as const)('fails closed on wrong keys and modified C3 in cipher mode %s', (cipherMode) => {
    const generated = crypto.asymmetric.generateKeyPair()
    const other = crypto.asymmetric.generateKeyPair()
    expect(generated.success && other.success).toBe(true)
    if (!generated.success || !other.success)
      return
    const encrypted = crypto.asymmetric.encrypt('authenticated text', generated.data.publicKey, { cipherMode })
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return
    const offset = cipherMode === 1
      ? 128
      : encrypted.data.length - 64
    const altered = encrypted.data.slice(0, offset) + (encrypted.data[offset] === '0'
      ? '1'
      : '0') + encrypted.data.slice(offset + 1)
    for (const result of [
      crypto.asymmetric.decrypt(encrypted.data, other.data.privateKey, { cipherMode }),
      crypto.asymmetric.decrypt(altered, generated.data.privateKey, { cipherMode }),
      crypto.asymmetric.decrypt(`${encrypted.data}g0`, generated.data.privateKey, { cipherMode }),
    ]) {
      expect(result).toMatchObject({
        success: false,
        error: { code: HaiCryptoError.DECRYPTION_FAILED.code },
      })
    }
  })

  it('rejects empty SM2 plaintext and invalid cipher modes', () => {
    const generated = crypto.asymmetric.generateKeyPair()
    expect(generated.success).toBe(true)
    if (!generated.success)
      return
    expect(crypto.asymmetric.encrypt('', generated.data.publicKey)).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.INVALID_INPUT.code },
    })
    expect(crypto.asymmetric.encrypt('text', generated.data.publicKey, { cipherMode: 2 as CipherMode })).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.INVALID_INPUT.code },
    })
  })

  it('detects Base64 ciphertext without punctuation or padding', () => {
    // 使用公开测试标量 11 的固定密文，覆盖旧启发式无法识别的纯字母数字 Base64。
    const ciphertext = 'GDXtTsIj5kxxGSYdyMfOfBi3iKXfWibH8LLk4CjD2wRy0nIaKOsJ7ARtSbYls6R2jYTMc30NDPQ6hIZWzY0wXfW7yKJsPc9XrJ7aXfkUYfImibaC5rISZGksU1fC3rKmGqIi'
    expect(crypto.asymmetric.decrypt(ciphertext, (11).toString(16).padStart(64, '0'))).toEqual({ success: true, data: 'abc' })
  })

  it('rejects a noncanonical signature that the dependency would parse numerically', () => {
    const generated = crypto.asymmetric.generateKeyPair()
    expect(generated.success).toBe(true)
    if (!generated.success)
      return
    const signed = crypto.asymmetric.sign('message', generated.data.privateKey)
    expect(signed.success).toBe(true)
    if (!signed.success)
      return
    // 前导零不改变 s 的数值，但不是公开契约中的 128 hex 编码。
    const noncanonical = `${signed.data.slice(0, 64)}00${signed.data.slice(64)}`
    expect(crypto.asymmetric.verify('message', noncanonical, generated.data.publicKey)).toEqual({ success: true, data: false })
  })
})

describe('hash interoperability and encoded inputs', () => {
  it.each([
    'k'.repeat(64),
    'k'.repeat(65),
    '密'.repeat(21),
    '密'.repeat(22),
    '🔐'.repeat(17),
  ])('matches Node HMAC-SM3 for UTF-8 key %s', (key) => {
    const result = crypto.hash.hmac('message / 消息', key)
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toBe(createHmac('sm3', key).update('message / 消息').digest('hex'))
  })

  it.each([
    'f',
    'g1',
    '01gg',
    ' 00',
    '0x00',
    'f\n',
  ])('rejects invalid hex input: %s', (input) => {
    expect(crypto.hash.hash(input, { inputEncoding: 'hex' })).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.INVALID_INPUT.code },
    })
  })

  it('treats valid hex as bytes, including empty input', () => {
    expect(crypto.hash.hash('6869', { inputEncoding: 'hex' })).toEqual(crypto.hash.hash('hi'))
    expect(crypto.hash.hash('', { inputEncoding: 'hex' })).toEqual(crypto.hash.hash(''))
  })
})

describe('symmetric ciphertext boundaries and Base64', () => {
  const key = '00112233445566778899aabbccddeeff'
  const iv = 'ffeeddccbbaa99887766554433221100'

  it.each([
    '',
    'aa',
    '00'.repeat(17),
    'gg'.repeat(16),
  ])('rejects incomplete or invalid ciphertext: %s', (ciphertext) => {
    expect(crypto.symmetric.decrypt({
      mode: 'cbc',
      encoding: 'hex',
      iv,
      ciphertext,
    }, key)).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.DECRYPTION_FAILED.code },
    })
  })

  it('does not silently discard bytes appended to valid ciphertext', () => {
    const encrypted = crypto.symmetric.encrypt('hello', key)
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return
    expect(crypto.symmetric.decrypt({ ...encrypted.data, ciphertext: `${encrypted.data.ciphertext}aa` }, key)).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.DECRYPTION_FAILED.code },
    })
  })

  it('rejects malformed Base64 and invalid UTF-8 after otherwise valid padding', () => {
    expect(crypto.symmetric.decrypt({
      mode: 'cbc',
      encoding: 'base64',
      iv,
      ciphertext: '!!!!',
    }, key)).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.DECRYPTION_FAILED.code },
    })
    const cipher = createCipheriv('sm4-cbc', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'))
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from([0xFF])),
      cipher.final(),
    ]).toString('hex')
    expect(crypto.symmetric.decrypt({
      mode: 'cbc',
      encoding: 'hex',
      iv,
      ciphertext,
    }, key)).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.DECRYPTION_FAILED.code },
    })
  })

  it.each([0, 17])('rejects invalid PKCS#7 padding length %s', (padding) => {
    const cipher = createCipheriv('sm4-cbc', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'))
    cipher.setAutoPadding(false)
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.alloc(32, padding)),
      cipher.final(),
    ]).toString('hex')
    expect(crypto.symmetric.decrypt({
      mode: 'cbc',
      encoding: 'hex',
      iv,
      ciphertext,
    }, key)).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.DECRYPTION_FAILED.code },
    })
  })

  it('rejects unknown modes and encodings instead of selecting defaults', () => {
    expect(crypto.symmetric.encrypt('hello', key, { mode: 'ctr' as SymmetricMode })).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.INVALID_INPUT.code },
    })
    expect(crypto.symmetric.encrypt('hello', key, { outputFormat: 'raw' as SymmetricCiphertextEncoding })).toMatchObject({
      success: false,
      error: { code: HaiCryptoError.INVALID_INPUT.code },
    })
    const encrypted = crypto.symmetric.encrypt('hello', key, { mode: 'ecb' })
    expect(encrypted.success).toBe(true)
    if (!encrypted.success)
      return
    expect(crypto.symmetric.decrypt({ ...encrypted.data, mode: 'ctr' as SymmetricMode }, key).success).toBe(false)
    expect(crypto.symmetric.decrypt({ ...encrypted.data, encoding: 'raw' as SymmetricCiphertextEncoding }, key).success).toBe(false)
  })

  it('round-trips empty plaintext and a 256 KiB Base64 payload', () => {
    for (const text of [
      '',
      '\uFEFFhello',
      '字'.repeat(90_000),
    ]) {
      const encrypted = crypto.symmetric.encrypt(text, key, { outputFormat: 'base64' })
      expect(encrypted.success).toBe(true)
      if (encrypted.success)
        expect(crypto.symmetric.decrypt(encrypted.data, key)).toEqual({ success: true, data: text })
    }
  })

  it('returns HaiResult when automatic IV generation fails', () => {
    const failure = new Error('Random source unavailable')
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => {
      throw failure
    })
    try {
      for (const result of [
        crypto.symmetric.encrypt('hello', key),
        crypto.symmetric.encryptWithIV('hello', key),
      ]) {
        expect(result).toMatchObject({
          success: false,
          error: { code: HaiCryptoError.ENCRYPTION_FAILED.code, cause: failure },
        })
      }
    }
    finally { random.mockRestore() }
  })
})

describe('password record parsing', () => {
  it('keeps generated records valid and rejects altered grammar', () => {
    const generated = crypto.password.hash('password', { iterations: 1, saltLength: 8 })
    expect(generated.success).toBe(true)
    if (!generated.success)
      return
    expect(crypto.password.verify('password', generated.data)).toEqual({ success: true, data: true })
    for (const record of [
      `prefix${generated.data}`,
      `${generated.data}\n`,
      generated.data.replace('$1$', '$1junk$'),
      generated.data.replace('$1$', '$1.5$'),
      generated.data.replace('$1$', '$+1$'),
      generated.data.replace('$1$', '$1000001$'),
      generated.data.replace(generated.data.split('$')[3], 'short'),
      generated.data.replace(generated.data.split('$')[3], 'a'.repeat(129)),
      generated.data.replace(/[a-f0-9]$/, 'z'),
    ]) {
      expect(crypto.password.verify('password', record)).toMatchObject({
        success: false,
        error: { code: HaiCryptoError.INVALID_INPUT.code },
      })
    }
  })
})
