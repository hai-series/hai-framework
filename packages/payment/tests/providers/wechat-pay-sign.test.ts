/**
 * @h-ai/payment — wechat-pay-sign（微信支付签名）单元测试
 *
 * 覆盖纯函数：generateNonce, getTimestamp, signRequest, signJsapi,
 * verifyNotifySignature, decryptResource。
 */

import { Buffer } from 'node:buffer'
import { createCipheriv, createSign, createVerify, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  decryptResource,
  generateNonce,
  getTimestamp,
  signJsapi,
  signRequest,
  verifyNotifySignature,
} from '../../src/providers/wechat/wechat-pay-sign'

/** 测试用 RSA 密钥对（2048 位） */
const { publicKey: platformCert, privateKey: merchantPrivateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

describe('generateNonce', () => {
  it('默认长度为 32', () => {
    const nonce = generateNonce()
    expect(nonce).toHaveLength(32)
  })

  it('指定长度', () => {
    expect(generateNonce(16)).toHaveLength(16)
    expect(generateNonce(64)).toHaveLength(64)
  })

  it('每次生成不同值', () => {
    const a = generateNonce()
    const b = generateNonce()
    expect(a).not.toBe(b)
  })

  it('只包含十六进制字符', () => {
    const nonce = generateNonce()
    expect(nonce).toMatch(/^[0-9a-f]+$/)
  })
})

describe('getTimestamp', () => {
  it('返回数字字符串', () => {
    const ts = getTimestamp()
    expect(ts).toMatch(/^\d+$/)
  })

  it('不含小数点', () => {
    const ts = getTimestamp()
    expect(ts).not.toContain('.')
  })

  it('与当前时间差距不超过 2 秒', () => {
    const ts = Number(getTimestamp())
    const now = Math.floor(Date.now() / 1000)
    expect(Math.abs(ts - now)).toBeLessThanOrEqual(2)
  })
})

describe('signRequest', () => {
  const method = 'POST'
  const url = '/v3/pay/transactions/jsapi'
  const timestamp = '1611037020'
  const nonce = 'af5fca1b8e1c4b5a9c5e63f0d5e4c3b2'
  const body = '{"appid":"wx1234","mchid":"mch001"}'

  it('返回非空 Base64 字符串', () => {
    const sig = signRequest(method, url, timestamp, nonce, body, merchantPrivateKey)
    expect(sig).toBeTruthy()
    // Base64 能正常 decode
    expect(() => Buffer.from(sig, 'base64')).not.toThrow()
  })

  it('相同输入产生相同签名（确定性）', () => {
    const sig1 = signRequest(method, url, timestamp, nonce, body, merchantPrivateKey)
    const sig2 = signRequest(method, url, timestamp, nonce, body, merchantPrivateKey)
    expect(sig1).toBe(sig2)
  })

  it('签名可用平台公钥验证', () => {
    const sig = signRequest(method, url, timestamp, nonce, body, merchantPrivateKey)
    const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`
    const verify = createVerify('RSA-SHA256')
    verify.update(message)
    expect(verify.verify(platformCert, sig, 'base64')).toBe(true)
  })

  it('不同 body 产生不同签名', () => {
    const sig1 = signRequest(method, url, timestamp, nonce, body, merchantPrivateKey)
    const sig2 = signRequest(method, url, timestamp, nonce, '{}', merchantPrivateKey)
    expect(sig1).not.toBe(sig2)
  })

  it('空 body 也能签名', () => {
    const sig = signRequest('GET', url, timestamp, nonce, '', merchantPrivateKey)
    expect(sig).toBeTruthy()
  })
})

describe('signJsapi', () => {
  const appId = 'wx1234567890'
  const timestamp = '1611037020'
  const nonce = 'abc123'
  const prepayId = 'prepay_id_001'

  it('返回非空 Base64 签名', () => {
    const sig = signJsapi(appId, timestamp, nonce, prepayId, merchantPrivateKey)
    expect(sig).toBeTruthy()
    expect(() => Buffer.from(sig, 'base64')).not.toThrow()
  })

  it('签名可用公钥验证', () => {
    const sig = signJsapi(appId, timestamp, nonce, prepayId, merchantPrivateKey)
    const message = `${appId}\n${timestamp}\n${nonce}\nprepay_id=${prepayId}\n`
    const verify = createVerify('RSA-SHA256')
    verify.update(message)
    expect(verify.verify(platformCert, sig, 'base64')).toBe(true)
  })

  it('不同 prepayId 产生不同签名', () => {
    const sig1 = signJsapi(appId, timestamp, nonce, 'prepay_001', merchantPrivateKey)
    const sig2 = signJsapi(appId, timestamp, nonce, 'prepay_002', merchantPrivateKey)
    expect(sig1).not.toBe(sig2)
  })
})

describe('verifyNotifySignature', () => {
  const timestamp = '1611037020'
  const nonce = 'abc123'
  const body = '{"id":"notify-001","event_type":"TRANSACTION.SUCCESS"}'

  /** 用私钥手动签名，模拟微信回调 */
  function signCallback(ts: string, nc: string, bd: string): string {
    const message = `${ts}\n${nc}\n${bd}\n`
    const sign = createSign('RSA-SHA256')
    sign.update(message)
    return sign.sign(merchantPrivateKey, 'base64')
  }

  it('有效签名验证通过', () => {
    const sig = signCallback(timestamp, nonce, body)
    expect(verifyNotifySignature(timestamp, nonce, body, sig, platformCert)).toBe(true)
  })

  it('篡改 body 验证失败', () => {
    const sig = signCallback(timestamp, nonce, body)
    expect(verifyNotifySignature(timestamp, nonce, '{"tampered":true}', sig, platformCert)).toBe(false)
  })

  it('篡改 timestamp 验证失败', () => {
    const sig = signCallback(timestamp, nonce, body)
    expect(verifyNotifySignature('9999999999', nonce, body, sig, platformCert)).toBe(false)
  })

  it('无效签名字符串验证失败', () => {
    expect(verifyNotifySignature(timestamp, nonce, body, 'invalid-base64', platformCert)).toBe(false)
  })
})

describe('decryptResource', () => {
  const apiV3Key = 'abcdef01234567890123456789abcdef' // 32 字节

  /** 使用 AES-256-GCM 加密，模拟微信回调资源加密 */
  function encryptResource(plaintext: string, nonce: string, aad: string): string {
    const cipher = createCipheriv('aes-256-gcm', apiV3Key, nonce)
    cipher.setAAD(Buffer.from(aad))
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([encrypted, tag]).toString('base64')
  }

  it('正常解密成功', () => {
    const plaintext = '{"trade_state":"SUCCESS","transaction_id":"TXN001"}'
    const nonce = 'testNonce12C' // 12 字节
    const aad = 'transaction'
    const ciphertext = encryptResource(plaintext, nonce, aad)

    const result = decryptResource(ciphertext, nonce, aad, apiV3Key)
    expect(result).toBe(plaintext)
  })

  it('解密中文内容成功', () => {
    const plaintext = '{"description":"测试商品订单"}'
    const nonce = 'nonceValue12'
    const aad = 'resource'
    const ciphertext = encryptResource(plaintext, nonce, aad)

    expect(decryptResource(ciphertext, nonce, aad, apiV3Key)).toBe(plaintext)
  })

  it('错误 apiV3Key 解密失败', () => {
    const plaintext = '{"status":"ok"}'
    const nonce = 'testNonce12A'
    const aad = 'data'
    const ciphertext = encryptResource(plaintext, nonce, aad)

    const wrongKey = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    expect(() => decryptResource(ciphertext, nonce, aad, wrongKey)).toThrow()
  })

  it('错误 nonce 解密失败', () => {
    const plaintext = '{"status":"ok"}'
    const nonce = 'testNonce12B'
    const aad = 'data'
    const ciphertext = encryptResource(plaintext, nonce, aad)

    expect(() => decryptResource(ciphertext, 'wrongNonce12', aad, apiV3Key)).toThrow()
  })

  it('错误 AAD 解密失败', () => {
    const plaintext = '{"status":"ok"}'
    const nonce = 'testNonce12D'
    const aad = 'correct-aad'
    const ciphertext = encryptResource(plaintext, nonce, aad)

    expect(() => decryptResource(ciphertext, nonce, 'wrong-aad', apiV3Key)).toThrow()
  })

  it('空字符串也能加密解密', () => {
    const nonce = 'emptyBody12x'
    const aad = 'empty'
    const ciphertext = encryptResource('', nonce, aad)
    expect(decryptResource(ciphertext, nonce, aad, apiV3Key)).toBe('')
  })
})
