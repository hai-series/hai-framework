/**
 * @h-ai/payment — 支付宝签名
 *
 * 支付宝 RSA2/RSA 签名与验签工具。
 * @module payment-alipay-sign
 */

import { createSign, createVerify } from 'node:crypto'

/**
 * 支付宝参数签名
 *
 * @param params - 待签名参数（已排除 sign）
 * @param privateKey - 应用私钥 PEM
 * @param signType - 签名类型（默认 RSA2）
 * @returns Base64 编码的签名
 * @throws 私钥格式或签名参数不受 Node Crypto 支持时抛错，由 Provider 转为 HaiResult 失败。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function signForm(params: Record<string, string>, privateKeyPem: string): string {
 *   // params 尚不包含 sign；私钥由受信商户配置注入，不写入日志或客户端。
 *   return signAlipayParams(params, privateKeyPem, 'RSA2')
 * }
 * ```
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

  const algorithm = signType === 'RSA2'
    ? 'RSA-SHA256'
    : 'RSA-SHA1'
  const sign = createSign(algorithm)
  sign.update(sorted)
  return sign.sign(privateKey, 'base64')
}

function verifyRsaSignature(
  content: string,
  signature: string,
  publicKey: string,
  signType: 'RSA2' | 'RSA',
): boolean {
  const algorithm = signType === 'RSA2'
    ? 'RSA-SHA256'
    : 'RSA-SHA1'
  const verify = createVerify(algorithm)
  verify.update(content)
  return verify.verify(publicKey, signature, 'base64')
}

/** 在已通过 JSON 语法解析的响应中，定位方法对象的原始文本，并拒绝重复的顶层字段。 */
function getAlipayResponsePayload(raw: string, methodKey: string): string | undefined {
  const rootKeys = new Set<string>()
  const tokens = /("(?:[^"\\]|\\.)*")(\s*:)?|[{}[\]]/gs
  let depth = 0
  let currentKey: string | undefined
  let payloadStart: number | undefined
  let payload: string | undefined

  // 字符串整体匹配，因此字符串值中的括号、引号和字段名不会影响对象边界。
  for (const { 0: token, 1: quoted, 2: colon, index } of raw.matchAll(tokens)) {
    if (quoted !== undefined) {
      if (depth === 1 && colon) {
        const key: unknown = JSON.parse(quoted)
        if (typeof key !== 'string' || rootKeys.has(key))
          return undefined

        rootKeys.add(key)
        currentKey = key
      }
      continue
    }

    if (token === '{' || token === '[') {
      if (token === '{' && depth === 1 && currentKey === methodKey)
        payloadStart = index
      depth++
      continue
    }

    depth--
    if (depth === 1 && payloadStart !== undefined) {
      payload = raw.slice(payloadStart, index + 1)
      payloadStart = undefined
    }
  }
  return payload
}

/**
 * 用受信的支付宝公钥，对网关原始 JSON 中对应方法的嵌套对象验签。
 * @param raw - 已确认 JSON 语法有效的原始响应，保留空白和字符串转义
 * @param methodKey - 请求方法对应的响应字段名
 * @param options - 网关验签选项
 * @param options.signature - 渠道返回的 Base64 签名
 * @param options.publicKey - 配置中受信的支付宝公钥
 * @param options.signType - 该请求使用的签名算法
 * @returns 仅在方法对象和签名字段明确且签名有效时返回 true
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function verifyGatewayResponse(raw: string, signature: string, publicKey: string) {
 *   return verifyAlipayResponse(raw, 'alipay_trade_query_response', { signature, publicKey, signType: 'RSA2' })
 * }
 * ```
 */
export function verifyAlipayResponse(
  raw: string,
  methodKey: string,
  options: { signature: string, publicKey: string, signType: 'RSA2' | 'RSA' },
): boolean {
  const payload = getAlipayResponsePayload(raw, methodKey)
  if (payload === undefined)
    return false
  try {
    return verifyRsaSignature(payload, options.signature, options.publicKey, options.signType)
  }
  catch {
    return false
  }
}

/**
 * 验证支付宝回调签名
 *
 * @param params - 回调参数（含 sign 和 sign_type）
 * @param alipayPublicKey - 支付宝公钥 PEM
 * @returns 验签是否通过
 * @throws 受信公钥格式非法或 Crypto 验签异常时抛错，由 Provider 通知边界转为失败。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function verifyForm(rawForm: string, trustedAlipayPublicKey: string): boolean {
 *   const params = Object.fromEntries(new URLSearchParams(rawForm))
 *   return verifyAlipayNotify(params, trustedAlipayPublicKey)
 *   // 该 helper 只验签；商户身份、字段、金额和真实日历校验仍由 Provider 完成。
 * }
 * ```
 */
export function verifyAlipayNotify(
  params: Record<string, string>,
  alipayPublicKey: string,
): boolean {
  const sign = params.sign ?? ''
  const signType = params.sign_type
  if (signType !== 'RSA' && signType !== 'RSA2')
    return false

  // 排除 sign 和 sign_type，按 key 排序拼接
  const sorted = Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== undefined && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')

  return verifyRsaSignature(sorted, sign, alipayPublicKey, signType)
}
