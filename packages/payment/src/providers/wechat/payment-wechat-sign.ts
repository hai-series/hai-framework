/**
 * @h-ai/payment — 微信支付签名
 *
 * 微信支付 API v3 签名生成与验签工具。
 * @module payment-wechat-sign
 */

import { Buffer } from 'node:buffer'
import { createDecipheriv, createSign, createVerify, randomBytes } from 'node:crypto'

/**
 * 生成随机字符串
 *
 * @param length - 字符串长度（默认 32）
 * @returns 由 Node Crypto 随机字节生成的指定长度十六进制字符串。
 * @throws 随机数源不可用或 length 非法时抛错，由 Provider 操作边界处理。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const nonce = generateNonce(32)
 * const validShape = /^[0-9a-f]{32}$/.test(nonce)
 * ```
 */
export function generateNonce(length = 32): string {
  return randomBytes(length).toString('hex').slice(0, length)
}

/**
 * 获取当前时间戳（秒）
 * @returns 当前 Unix 时间的整秒十进制字符串；验签时间容差在 Provider 处理。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const timestamp = getTimestamp()
 * const unixSeconds = Number(timestamp) // 秒，不是 Date.now() 的毫秒。
 * ```
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
 * @throws 私钥格式不合法或 Crypto 签名失败时抛错，由 Provider 转为 HaiResult。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function signTrustedRequest(privateKeyPem: string, body: string): string {
 *   return signRequest('POST', '/v3/pay/transactions/jsapi', getTimestamp(), generateNonce(), body, privateKeyPem)
 *   // HTTP 必须发送完全相同的路径和原始 body，不能签名后再改变序列化结果。
 * }
 * ```
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
 * @throws 私钥格式不合法或 Crypto 签名失败时抛错，由 Provider 转为 HaiResult。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function signClientInvocation(privateKeyPem: string, appId: string, prepayId: string) {
 *   const timeStamp = getTimestamp()
 *   const nonceStr = generateNonce()
 *   const paySign = signJsapi(appId, timeStamp, nonceStr, prepayId, privateKeyPem)
 *   return { appId, timeStamp, nonceStr, package: 'prepay_id=' + prepayId, signType: 'RSA', paySign }
 * }
 * ```
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
 * @param platformKey - 已按 serial 选择的微信支付平台证书或公钥 PEM
 * @returns 是否验签通过
 * @throws 公钥格式非法或 Crypto 验签异常时抛错，由通知 Provider 边界转为失败。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function verifyRawNotification(timestamp: string, nonce: string, body: string, signature: string, trustedPlatformPem: string) {
 *   return verifyNotifySignature(timestamp, nonce, body, signature, trustedPlatformPem)
 *   // 调用前已按 Wechatpay-Serial 选定受信平台密钥；该 helper 不做时间、身份或业务去重校验。
 * }
 * ```
 */
export function verifyNotifySignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  platformKey: string,
): boolean {
  const message = `${timestamp}\n${nonce}\n${body}\n`
  const verify = createVerify('RSA-SHA256')
  verify.update(message)
  return verify.verify(platformKey, signature, 'base64')
}

/**
 * AES-256-GCM 解密（微信支付回调资源解密）
 *
 * @param ciphertext - 密文（Base64）
 * @param nonce - 随机串
 * @param associatedData - 附加数据
 * @param apiV3Key - API v3 密钥
 * @returns 解密后的 JSON 字符串
 * @throws 密钥、nonce、GCM 标签或密文非法时抛错；认证失败不返回明文，由 Provider 转为失败。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function decryptVerifiedResource(ciphertext: string, nonce: string, associatedData: string, apiV3Key: string): unknown {
 *   // 外层通知签名已通过；密钥来自受信商户配置，后续仍须 Schema/商户身份/金额校验。
 *   const plaintext = decryptResource(ciphertext, nonce, associatedData, apiV3Key)
 *   const resource: unknown = JSON.parse(plaintext)
 *   return resource
 * }
 * ```
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
