/**
 * @h-ai/crypto — Serv 与 Kit 共用的可公开传输配置。
 * @module crypto-transport-config
 */

import { HttpEndpointPathSchema } from '@h-ai/core'
import { z } from 'zod'
import { TRANSPORT_PLAINTEXT_RANGE } from './crypto-transport-body.js'
import { TRANSPORT_PROTOCOL, TRANSPORT_TIME_LIMITS } from './crypto-transport-types.js'

const routePathSchema = z.custom<`/${string}`>(
  value => typeof value === 'string' && value.startsWith('/'),
  'Path must start with /',
)
const plaintextSizeSchema = z.number().int().min(TRANSPORT_PLAINTEXT_RANGE.min).max(TRANSPORT_PLAINTEXT_RANGE.max)

/**
 * 解析可公开的站点路径、请求时限与明文容量，私钥和存储由服务端另行装配。
 * @example
 * ```ts
 * import { TransportConfigSchema } from '@h-ai/crypto'
 * const config = TransportConfigSchema.parse({ keyExchangePath: '/console/api/v1/_hai/key-exchange' })
 * ```
 */
export const TransportConfigSchema = z.union([
  z.literal(false),
  z.object({
    maxPlaintextBytes: z.union([
      plaintextSizeSchema,
      z.literal('auto'),
    ])
      .transform(value => value === 'auto'
        ? undefined
        : value)
      .optional()
      .describe('普通业务双向明文上限；auto 为 1 MiB；大材料使用 routePlaintextBytes 单独声明')
      .meta({ default: 'auto' }),
    maxFutureSkewSeconds: z.number().int().min(0).max(TRANSPORT_TIME_LIMITS.maxFutureSkewSeconds).optional().describe('允许客户端请求时间领先服务器的秒数').meta({ default: TRANSPORT_PROTOCOL.CLOCK_SKEW_MS / 1000 }),
    maxRequestAgeSeconds: z.number().int().min(TRANSPORT_TIME_LIMITS.minRequestAgeSeconds).max(TRANSPORT_TIME_LIMITS.maxRequestAgeSeconds).optional().describe('请求从签发起的有效秒数').meta({ default: TRANSPORT_PROTOCOL.REQUEST_WINDOW_MS / 1000 }),
    routePlaintextBytes: z.record(routePathSchema, plaintextSizeSchema)
      .optional()
      .describe('完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量'),
    keyExchangePath: HttpEndpointPathSchema.default(TRANSPORT_PROTOCOL.DEFAULT_KEY_EXCHANGE_PATH),
    excludePaths: z.array(routePathSchema).default([]),
  }),
]).default(false)

/**
 * 已解析且启用的传输配置，只包含可公开字段。运行时会补齐省略的容量和时间限制。
 * @example
 * ```ts
 * import { type PublicTransportConfig, TransportConfigSchema } from '@h-ai/crypto'
 * const settings = TransportConfigSchema.parse({ excludePaths: ['/health'] })
 * // 只向客户端交付公共配置。协商私钥和共享登记保留在服务端。
 * const publicSettings: PublicTransportConfig | false = settings
 * if (publicSettings) void publicSettings.keyExchangePath
 * ```
 */
export type PublicTransportConfig = Readonly<Omit<Exclude<z.output<typeof TransportConfigSchema>, false>, 'excludePaths'>> & {
  readonly excludePaths: readonly `/${string}`[]
}

/**
 * 待解析的公开传输配置对象；对象显式启用传输。明文限制以字节为单位，
 * `"auto"` 表示由宿主使用协商时的默认限制。
 * @example
 * ```ts
 * import { type PublicTransportConfigInput, TransportConfigSchema } from '@h-ai/crypto'
 * const input: PublicTransportConfigInput = {
 *   keyExchangePath: '/console/api/v1/_hai/key-exchange',
 *   maxPlaintextBytes: 'auto',
 * }
 * const settings = TransportConfigSchema.parse(input)
 * ```
 */
export type PublicTransportConfigInput = Readonly<Partial<Omit<PublicTransportConfig, 'maxPlaintextBytes'>> & {
  maxPlaintextBytes?: number | 'auto'
}>
