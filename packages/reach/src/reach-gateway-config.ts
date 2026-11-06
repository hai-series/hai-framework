/** 服务端 HTTP 网关配置及自定义函数返回值共用的校验。 */
import { z } from 'zod'
import { reachM } from './reach-i18n.js'

const transportHeader = /^(?:connection|content-length|host|keep-alive|proxy-connection|te|trailer|transfer-encoding|upgrade)$/i
const jsonValue = z.json()
const gatewayFields = {
  /** 网关自定义请求头；连接与消息长度相关的头由 HTTP 客户端管理。 */
  headers: z.record(z.string(), z.string()).refine((headers) => {
    try {
      return [...new Headers(headers).keys()].every(name => !transportHeader.test(name))
    }
    catch {
      return false
    }
  }, reachM('reach_gatewayHeadersInvalid')).optional(),
  /** 网关请求体；对象和数组序列化为 JSON，字符串原样发送。省略时不发请求体。 */
  body: z.union([z.string(), z.array(jsonValue), z.record(z.string(), jsonValue)], reachM('reach_gatewayBodyInvalid')).optional(),
}

/**
 * 动态函数仅能提供网关请求体和请求头，字段与静态配置共用校验。
 * @example 模块内部上下文
 * ```ts
 * const fields = ReachGatewayFieldsSchema.parse({ headers: { 'X-Client': 'delivery' }, body: '{}' })
 * ```
 */
export const ReachGatewayFieldsSchema = z.strictObject(gatewayFields)

/**
 * 完整网关配置；明文 HTTP 必须显式启用，签名查询由 Provider 追加。
 * @example 模块内部上下文
 * ```ts
 * const gateway = ReachGatewayConfigSchema.parse({ url: 'https://gateway.example.com/dx', body: {} })
 * ```
 */
export const ReachGatewayConfigSchema = z.strictObject({
  /** 网关的完整 HTTP(S) URL；包含路径，不允许凭据、查询参数或片段。 */
  url: z.url(reachM('reach_gatewayUrlInvalid')),
  /** 仅在受信内网显式允许明文 HTTP。 */
  allowInsecureHttp: z.boolean().default(false),
  ...gatewayFields,
}).refine(({ url, allowInsecureHttp }) => {
  const target = URL.parse(url)
  return target !== null && /^https?:\/\//i.test(url) && !/[?#]/.test(url)
    && !target.username && !target.password
    && (target.protocol === 'https:' || (target.protocol === 'http:' && allowInsecureHttp))
}, { path: ['url'], message: reachM('reach_gatewayUrlInvalid') })
