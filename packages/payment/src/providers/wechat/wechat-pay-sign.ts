/**
 * @h-ai/payment — 微信支付签名
 *
 * 微信支付 API v3 签名生成与验签工具。
 * @module wechat-pay-sign
 */

import { Buffer } from 'node:buffer'
import { createDecipheriv, createSign, createVerify, randomBytes } from 'node:crypto'

/**
 * 生成随机字符串
 *
 * @param length - 字符串长度（默认 32）
 */
export function generateNonce(length = 32): string {
  return randomBytes(length).toString('hex').slice(0, length)
}

/**
 * 获取当前时间戳（秒）
 */
export function getTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}

/**
 * 微信 API v3 请求签名
 *
 * @param method - HTTP 方法
 * @param url - 请求路径（不含域名）
 * @param timestamp - 时间戳
 * @param nonce - 随机串
 * @param body - 请求体（空则为空字符串）
 * @param privateKey - 商户私钥 PEM
 * @returns SHA256-RSA2048 签名（Base64）
 */
export function signRequest(
  method: string,
  url: string,
  timestamp: string,
  nonce: string,
  body: string,
  privateKey: string,
): string {
  const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`
  const sign = createSign('RSA-SHA256')
  sign.update(message)
  return sign.sign(privateKey, 'base64')
}

/**
 * 微信 JSAPI 支付签名
 *
 * @param appId - 应用 ID
 * @param timestamp - 时间戳
 * @param nonce - 随机串
 * @param prepayId - 预支付 ID
 * @param privateKey - 商户私钥 PEM
 * @returns 签名
 */
export function signJsapi(
  appId: string,
  timestamp: string,
  nonce: string,
  prepayId: string,
  privateKey: string,
): string {
  const message = `${appId}\n${timestamp}\n${nonce}\nprepay_id=${prepayId}\n`
  const sign = createSign('RSA-SHA256')
  sign.update(message)
  return sign.sign(privateKey, 'base64')
}

/**
 * 验证微信支付回调签名
 *
 * @param timestamp - 回调 header 中的时间戳
 * @param nonce - 回调 header 中的随机串
 * @param body - 回调原始 body
 * @param signature - 回调签名
 * @param platformCert - 微信支付平台证书 PEM
 * @returns 是否验签通过
 */
export function verifyNotifySignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  platformCert: string,
): boolean {
  const message = `${timestamp}\n${nonce}\n${body}\n`
  const verify = createVerify('RSA-SHA256')
  verify.update(message)
  return verify.verify(platformCert, signature, 'base64')
}

/**
 * AES-256-GCM 解密（微信支付回调资源解密）
 *
 * @param ciphertext - 密文（Base64）
 * @param nonce - 随机串
 * @param associatedData - 附加数据
 * @param apiV3Key - API v3 密钥
 * @returns 解密后的 JSON 字符串
 */
export function decryptResource(
  ciphertext: string,
  nonce: string,
  associatedData: string,
  apiV3Key: string,
): string {
  const buf = Buffer.from(ciphertext, 'base64')
  const authTag = buf.subarray(buf.length - 16)
  const data = buf.subarray(0, buf.length - 16)

  const decipher = createDecipheriv('aes-256-gcm', apiV3Key, nonce)
  decipher.setAuthTag(authTag)
  decipher.setAAD(Buffer.from(associatedData))

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString('utf-8')
}
