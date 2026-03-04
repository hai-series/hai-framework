/**
 * @h-ai/payment — alipay-sign（支付宝签名）单元测试
 *
 * 覆盖纯函数：signAlipayParams, verifyAlipayNotify。
 */

import { Buffer } from 'node:buffer'
import { createSign, createVerify, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  signAlipayParams,
  verifyAlipayNotify,
} from '../../src/providers/alipay/alipay-sign'

/** 测试用 RSA 密钥对 */
const { publicKey: alipayPublicKey, privateKey: appPrivateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

describe('signAlipayParams', () => {
  const params: Record<string, string> = {
    app_id: '2021000001',
    method: 'alipay.trade.page.pay',
    charset: 'utf-8',
    timestamp: '2024-01-15 12:00:00',
    biz_content: '{"out_trade_no":"ORD001","total_amount":"0.01"}',
  }

  it('默认 RSA2 签名返回非空 Base64', () => {
    const sig = signAlipayParams(params, appPrivateKey)
    expect(sig).toBeTruthy()
    expect(Buffer.from(sig, 'base64').length).toBeGreaterThan(0)
  })

  it('rSA2 签名可用公钥验证', () => {
    const sig = signAlipayParams(params, appPrivateKey, 'RSA2')

    // 按实现逻辑手动拼接待签名字符串
    const sorted = Object.keys(params)
      .filter(k => params[k] !== undefined && params[k] !== '')
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&')

    const verify = createVerify('RSA-SHA256')
    verify.update(sorted)
    expect(verify.verify(alipayPublicKey, sig, 'base64')).toBe(true)
  })

  it('rSA 签名可用公钥验证', () => {
    const sig = signAlipayParams(params, appPrivateKey, 'RSA')

    const sorted = Object.keys(params)
      .filter(k => params[k] !== undefined && params[k] !== '')
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&')

    const verify = createVerify('RSA-SHA1')
    verify.update(sorted)
    expect(verify.verify(alipayPublicKey, sig, 'base64')).toBe(true)
  })

  it('参数按 key 字典排序', () => {
    const p = { z_param: 'z', a_param: 'a', m_param: 'm' }
    const sig = signAlipayParams(p, appPrivateKey, 'RSA2')

    // 验证签名对应的是排序后的字符串
    const sortedStr = 'a_param=a&m_param=m&z_param=z'
    const verify = createVerify('RSA-SHA256')
    verify.update(sortedStr)
    expect(verify.verify(alipayPublicKey, sig, 'base64')).toBe(true)
  })

  it('空值参数被过滤', () => {
    const p = { a: 'value', b: '', c: 'data' }
    const sig = signAlipayParams(p, appPrivateKey, 'RSA2')

    // b 应被过滤，只签 a 和 c
    const sortedStr = 'a=value&c=data'
    const verify = createVerify('RSA-SHA256')
    verify.update(sortedStr)
    expect(verify.verify(alipayPublicKey, sig, 'base64')).toBe(true)
  })

  it('相同输入产生相同签名', () => {
    const sig1 = signAlipayParams(params, appPrivateKey)
    const sig2 = signAlipayParams(params, appPrivateKey)
    expect(sig1).toBe(sig2)
  })
})

describe('verifyAlipayNotify', () => {
  /** 模拟支付宝回调：用私钥签名参数 */
  function createNotifyParams(data: Record<string, string>, signType: 'RSA2' | 'RSA' = 'RSA2'): Record<string, string> {
    const sorted = Object.keys(data)
      .filter(k => data[k] !== undefined && data[k] !== '')
      .sort()
      .map(k => `${k}=${data[k]}`)
      .join('&')

    const algorithm = signType === 'RSA2' ? 'RSA-SHA256' : 'RSA-SHA1'
    const sign = createSign(algorithm)
    sign.update(sorted)
    const sig = sign.sign(appPrivateKey, 'base64')

    return {
      ...data,
      sign: sig,
      sign_type: signType,
    }
  }

  it('rSA2 有效回调验签通过', () => {
    const notifyParams = createNotifyParams({
      out_trade_no: 'ORD001',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '0.01',
    })

    expect(verifyAlipayNotify(notifyParams, alipayPublicKey)).toBe(true)
  })

  it('rSA 有效回调验签通过', () => {
    const notifyParams = createNotifyParams({
      out_trade_no: 'ORD002',
      trade_status: 'TRADE_FINISHED',
      total_amount: '100.00',
    }, 'RSA')

    expect(verifyAlipayNotify(notifyParams, alipayPublicKey)).toBe(true)
  })

  it('篡改参数验签失败', () => {
    const notifyParams = createNotifyParams({
      out_trade_no: 'ORD001',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '0.01',
    })

    // 篡改金额
    notifyParams.total_amount = '999.99'
    expect(verifyAlipayNotify(notifyParams, alipayPublicKey)).toBe(false)
  })

  it('sign 和 sign_type 不参与验签', () => {
    // 验证实现正确排除了 sign 和 sign_type
    const data = { out_trade_no: 'ORD003', trade_status: 'TRADE_SUCCESS' }
    const notifyParams = createNotifyParams(data)

    // 如果 sign/sign_type 参与签名，结果会不同
    expect(verifyAlipayNotify(notifyParams, alipayPublicKey)).toBe(true)
  })

  it('空 sign 验签失败', () => {
    const result = verifyAlipayNotify({
      out_trade_no: 'ORD001',
      sign: '',
      sign_type: 'RSA2',
    }, alipayPublicKey)

    expect(result).toBe(false)
  })

  it('缺少 sign 字段验签失败', () => {
    const result = verifyAlipayNotify({
      out_trade_no: 'ORD001',
      sign_type: 'RSA2',
    }, alipayPublicKey)

    expect(result).toBe(false)
  })

  it('多个参数排序正确验签', () => {
    const notifyParams = createNotifyParams({
      z_field: 'z',
      a_field: 'a',
      m_field: 'm',
      out_trade_no: 'ORD004',
    })

    expect(verifyAlipayNotify(notifyParams, alipayPublicKey)).toBe(true)
  })
})
