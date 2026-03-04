/**
 * @h-ai/payment — 支付宝签名
 *
 * 支付宝 RSA2/RSA 签名与验签工具。
 * @module alipay-sign
 */

import { createSign, createVerify } from 'node:crypto'

/**
 * 支付宝参数签名
 *
 * @param params - 待签名参数（已排除 sign）
 * @param privateKey - 应用私钥 PEM
 * @param signType - 签名类型（默认 RSA2）
 * @returns Base64 编码的签名
 */
export function signAlipayParams(
  params: Record<string, string>,
  privateKey: string,
  signType: 'RSA2' | 'RSA' = 'RSA2',
): string {
  // 按 key 字典排序，拼接为 query string
  const sorted = Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')

  const algorithm = signType === 'RSA2' ? 'RSA-SHA256' : 'RSA-SHA1'
  const sign = createSign(algorithm)
  sign.update(sorted)
  return sign.sign(privateKey, 'base64')
}

/**
 * 验证支付宝回调签名
 *
 * @param params - 回调参数（含 sign 和 sign_type）
 * @param alipayPublicKey - 支付宝公钥 PEM
 * @returns 验签是否通过
 */
export function verifyAlipayNotify(
  params: Record<string, string>,
  alipayPublicKey: string,
): boolean {
  const sign = params.sign ?? ''
  const signType = params.sign_type ?? 'RSA2'

  // 排除 sign 和 sign_type，按 key 排序拼接
  const sorted = Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== undefined && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')

  const algorithm = signType === 'RSA2' ? 'RSA-SHA256' : 'RSA-SHA1'
  const verify = createVerify(algorithm)
  verify.update(sorted)
  return verify.verify(alipayPublicKey, sign, 'base64')
}
