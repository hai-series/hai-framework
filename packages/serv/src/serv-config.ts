/**
 * @h-ai/serv — HTTP 配置
 *
 * 提供用于控制 API 前缀、OpenAPI、docs、健康检查与传输加密策略的配置结构，
 * 并由 zod 负责默认值填充与边界校验。
 * @module serv-config
 */

import type { HttpCorsConfig, HttpCorsConfigInput, HttpHostA2AConfig, HttpHostA2AConfigInput, HttpRateLimitConfig, HttpRateLimitConfigInput, RequestAccessConfigInput, TrustedProxies } from '@h-ai/core'
import type { PublicTransportConfig, PublicTransportConfigInput } from '@h-ai/crypto'
import process from 'node:process'
import { apiContract } from '@h-ai/api-contract'
import { HttpAccessConfigSchema, HttpCorsConfigSchema, HttpEndpointPathSchema, HttpHostA2AConfigSchema } from '@h-ai/core'
import { TransportConfigSchema } from '@h-ai/crypto'
import { z } from 'zod'
import { servM } from './serv-i18n.js'

const ApiPrefixSchema = z.custom<`/${string}`>(
  value => typeof value === 'string' && /^\/[\w.-]+(?:\/[\w.-]+)*$/.test(value)
    && !value.split('/').some(segment => segment === '.' || segment === '..'),
  {
    error: () => servM('serv_invalidApiPrefix'),
  },
)

const AbsolutePathSchema = z.custom<`/${string}`>(
  value => typeof value === 'string' && value.startsWith('/'),
  'path must start with /',
)

/**
 * 服务器监听配置（对应 `config/_serv.yml` 的 `server`）。
 *
 * @example
 * ```ts
 *
 * import { type ServServerConfig, serv } from '@h-ai/serv'
 *
 * const config: ServServerConfig = { host: '127.0.0.1', port: 3000 }
 * const bindAddress = config.host
 *```
 */
export interface ServServerConfig {
  readonly host: string
  readonly port: number
}

/**
 * `config/_serv.yml` 中的服务器监听输入类型。
 *
 * @example
 * ```ts
 *
 * import { type ServServerConfigInput, serv } from '@h-ai/serv'
 *
 * const input: ServServerConfigInput = { port: 3000 }
 * // HOST/PORT 的环境覆盖由配置解析完成后传给 listen。
 *```
 */
export type ServServerConfigInput = Partial<ServServerConfig>

/**
 * OpenAPI JSON endpoint 配置。
 *
 * @example
 * ```ts
 *
 * import { type ServOpenAPIHttpConfig, serv } from '@h-ai/serv'
 *
 * const openapi: ServOpenAPIHttpConfig = { path: '/openapi.json' }
 * // 文档仅在 createApp.http 显式启用时挂载。
 *```
 */
export interface ServOpenAPIHttpConfig {
  readonly path: `/${string}`
}

/**
 * 文档页面 endpoint 配置。
 *
 * @example
 * ```ts
 *
 * import { type ServDocsHttpConfig, serv } from '@h-ai/serv'
 *
 * const docs: ServDocsHttpConfig = { path: '/docs', requireAuth: true }
 *```
 */
export interface ServDocsHttpConfig {
  readonly path: `/${string}`
  readonly requireAuth?: boolean
}

/**
 * 健康检查 endpoint 配置。
 *
 * @example
 * ```ts
 *
 * import { type ServHealthHttpConfig, serv } from '@h-ai/serv'
 *
 * const health: ServHealthHttpConfig = { path: '/health', readyPath: '/ready' }
 *```
 */
export interface ServHealthHttpConfig {
  readonly path: `/${string}`
  readonly readyPath?: `/${string}`
}

/**
 * 传输加密运行时配置（对应 `config/_serv.yml`）。
 *
 * @example
 * ```ts
 *
 * import { type ServTransportRuntimeConfig, serv } from '@h-ai/serv'
 *
 * const transport: ServTransportRuntimeConfig = { keyExchangePath: '/api/v1/_hai/key-exchange', excludePaths: ['/health'] }
 * // 仅路径配置；真正启用还需私有 keyring 与共享 keyStore。
 *```
 */
export type ServTransportRuntimeConfig = PublicTransportConfig

/**
 * `config/_serv.yml` 中可序列化的跨端 CORS 配置。
 *
 * @example
 * ```ts
 *
 * import { type ServCorsRuntimeConfig, serv } from '@h-ai/serv'
 *
 * const cors: ServCorsRuntimeConfig = { origin: 'https://app.example.com', methods: ['GET'], allowedHeaders: ['Authorization'], exposedHeaders: [], credentials: true, maxAge: 3600 }
 *```
 */
export type ServCorsRuntimeConfig = Exclude<HttpCorsConfig, false>

/**
 * ServHttpApp 的 HTTP 挂载配置。
 *
 * @example
 * ```ts
 *
 * import { type ServHttpConfig, serv } from '@h-ai/serv'
 *
 * const http: ServHttpConfig = { trustedProxies: 'auto', access: false, rateLimit: false, apiPrefix: '/api/v1', openapi: false, docs: false, health: { path: '/health' } }
 *```
 */
export interface ServHttpConfig {
  /** auto 仅在受管私有容器代理中采用容器网段；空数组显式忽略转发头。 */
  readonly trustedProxies: TrustedProxies
  /** 每次请求的 IP/时间策略；默认 false，内联与独立文件二选一。 */
  readonly access: RequestAccessConfigInput
  /** 请求频率策略。默认关闭，启用时由宿主注入原子计数存储。 */
  readonly rateLimit: HttpRateLimitConfig
  readonly apiPrefix: `/${string}`
  readonly openapi: false | ServOpenAPIHttpConfig
  readonly docs: false | ServDocsHttpConfig
  readonly health: false | ServHealthHttpConfig
}

/**
 * `config/_serv.yml` 的顶层配置结构。
 *
 * @example
 * ```ts
 *
 * import { type ServConfig, ServConfigSchema, serv } from '@h-ai/serv'
 *
 *
 *
 * const config: ServConfig = ServConfigSchema.parse({ server: { host: '127.0.0.1', port: 3000 } })
 * const port = config.server.port
 *```
 */
export interface ServConfig {
  readonly server: ServServerConfig
  readonly http: ServHttpConfig
  readonly cors: HttpCorsConfig
  readonly transport: false | ServTransportRuntimeConfig
  readonly a2a: HttpHostA2AConfig
  readonly audio: false | Readonly<{ path: `/${string}` }>
}

/**
 * `config/_serv.yml` 中的 CORS 输入类型。
 *
 * @example
 * ```ts
 *
 * import { type ServCorsRuntimeConfigInput, serv } from '@h-ai/serv'
 *
 * const input: ServCorsRuntimeConfigInput = { origin: 'https://app.example.com', credentials: true }
 *```
 */
export type ServCorsRuntimeConfigInput = Exclude<HttpCorsConfigInput, false>

/**
 * `config/_serv.yml` 中的传输加密输入类型。
 *
 * @example
 * ```ts
 *
 * import { type ServTransportRuntimeConfigInput, serv } from '@h-ai/serv'
 *
 * const input: ServTransportRuntimeConfigInput = { keyExchangePath: '/api/v1/_hai/key-exchange' }
 * // 此输入不包含私钥；私有 Secret 仅在服务端运行时装配。
 *```
 */
export type ServTransportRuntimeConfigInput = PublicTransportConfigInput

/**
 * `serv.createApp` 接受的 HTTP 配置入参类型。
 *
 * @example
 * ```ts
 *
 * import { type ServHttpConfigInput, serv } from '@h-ai/serv'
 *
 * const http: ServHttpConfigInput = { apiPrefix: '/api/v2', trustedProxies: ['192.0.2.0/24'], docs: false }
 *```
 */
export type ServHttpConfigInput = Partial<{
  readonly trustedProxies: TrustedProxies
  readonly access: RequestAccessConfigInput
  readonly rateLimit: HttpRateLimitConfigInput
  readonly apiPrefix: `/${string}`
  readonly openapi: false | Partial<ServOpenAPIHttpConfig>
  readonly docs: false | Partial<ServDocsHttpConfig>
  readonly health: false | Partial<ServHealthHttpConfig>
}>

/**
 * `config/_serv.yml` 的顶层输入类型。
 *
 * @example
 * ```ts
 *
 * import { type ServConfigInput, ServConfigSchema, serv } from '@h-ai/serv'
 *
 *
 *
 * const input: ServConfigInput = { http: { apiPrefix: '/api/v2' }, transport: false }
 * const parsed = ServConfigSchema.safeParse(input)
 * if (!parsed.success) throw new Error('Invalid service configuration')
 *```
 */
export interface ServConfigInput {
  readonly server?: ServServerConfigInput
  readonly http?: ServHttpConfigInput
  readonly cors?: HttpCorsConfigInput
  readonly transport?: false | ServTransportRuntimeConfigInput
  readonly a2a?: HttpHostA2AConfigInput
  readonly audio?: false | Readonly<{ path?: `/${string}` }>
}

const OpenAPIHttpConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    path: AbsolutePathSchema.default('/openapi.json'),
  }),
])

const DocsHttpConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    path: AbsolutePathSchema.default('/docs'),
    requireAuth: z.boolean().optional(),
  }),
])

const HealthHttpConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    path: AbsolutePathSchema.default('/health'),
    readyPath: AbsolutePathSchema.optional().default('/ready'),
  }),
])

const ServerConfigInputSchema = z.object({
  host: z.string().min(1).default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(3000),
})

const audioConfigSchema = z.union([
  z.literal(false),
  z.strictObject({
    path: HttpEndpointPathSchema.optional().describe('实时音频 WebSocket 的完整站点路径，默认由业务前缀与 /ai/audio 组成'),
  }),
]).default(false).describe('实时语音 WebSocket HTTP 路径；默认关闭')

const ServHttpConfigInputSchema = HttpAccessConfigSchema.extend({
  apiPrefix: ApiPrefixSchema.default('/api/v1'),
  openapi: OpenAPIHttpConfigInputSchema.default(false),
  docs: DocsHttpConfigInputSchema.default(false),
  health: HealthHttpConfigInputSchema.default({ path: '/health', readyPath: '/ready' }),
})

/**
 * `config/_serv.yml` 对应的配置 Schema。
 *
 * @example
 * ```ts
 * import { ServConfigSchema } from '@h-ai/serv'
 *
 * const parsed = ServConfigSchema.safeParse({ http: { apiPrefix: '/api/v1', docs: false } })
 * if (parsed.success) {
 *   const host = parsed.data.server.host
 * }
 *```
 */
export const ServConfigSchema = z.object({
  server: ServerConfigInputSchema.optional(),
  http: ServHttpConfigInputSchema.optional(),
  cors: HttpCorsConfigSchema,
  transport: TransportConfigSchema,
  a2a: HttpHostA2AConfigSchema,
  audio: audioConfigSchema,
}).transform(({ server, http, cors, transport, a2a, audio }): ServConfig => {
  const httpConfig = http ?? resolveServHttpConfig()
  return {
    server: resolveServServerConfig(server ?? {}),
    http: httpConfig,
    cors,
    transport,
    a2a,
    audio: audio === false
      ? false
      : {
          path: apiContract.resolveAudioWebSocketPath(httpConfig.apiPrefix, audio.path),
        },
  }
})

/**
 * 读取 `HOST` / `PORT` 环境变量覆盖（环境变量高于配置文件）。
 *
 * 仅采纳合法值：`PORT` 需为 1-65535 的整数，非法值忽略并回退到配置文件/默认值。
 */
function readServerEnvOverride(): ServServerConfigInput {
  const override: { host?: string, port?: number } = {}
  const host = process.env.HOST
  if (host)
    override.host = host
  const rawPort = process.env.PORT
  if (rawPort) {
    const port = Number(rawPort)
    if (Number.isInteger(port) && port >= 1 && port <= 65535)
      override.port = port
  }
  return override
}

/**
 * 解析并校验配置输入，填充该层默认值。
 *
 * @param input - 对应层的可选配置
 * @returns 完整配置
 * @throws 配置违反 Schema 时抛出 ZodError；由启动边界处理。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const server = resolveServServerConfig({ host: '127.0.0.1', port: 3000 })
 * // 合法 HOST/PORT 环境变量优先；配置非法时 parse 显式抛错。
 *```
 */
export function resolveServServerConfig(input: ServServerConfigInput = {}): ServServerConfig {
  return {
    ...ServerConfigInputSchema.parse(input),
    ...readServerEnvOverride(),
  }
}

/**
 * 解析并校验配置输入，填充该层默认值。
 *
 * @param input - 对应层的可选配置
 * @returns 完整配置
 * @throws 配置违反 Schema 时抛出 ZodError；由启动边界处理。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const http = resolveServHttpConfig({ apiPrefix: '/api/v2', docs: false })
 *```
 */
export function resolveServHttpConfig(input: ServHttpConfigInput = {}): ServHttpConfig {
  return ServHttpConfigInputSchema.parse(input)
}

/**
 * 解析并校验配置输入，填充该层默认值。
 *
 * @param input - 对应层的可选配置
 * @returns 完整配置；transport 关闭时为 false
 * @throws 配置违反 Schema 时抛出 ZodError；由启动边界处理。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const disabled = resolveServTransportRuntimeConfig(false)
 * const enabled = resolveServTransportRuntimeConfig({ keyExchangePath: '/api/v1/_hai/key-exchange' })
 *```
 */
export function resolveServTransportRuntimeConfig(
  input: false | ServTransportRuntimeConfigInput = false,
): false | ServTransportRuntimeConfig {
  return TransportConfigSchema.parse(input)
}

/**
 * 解析并校验配置输入，填充该层默认值。
 *
 * @param input - 对应层的可选配置
 * @returns 完整配置
 * @throws 配置违反 Schema 时抛出 ZodError；由启动边界处理。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const config = resolveServConfig({ server: { port: 3000 }, http: { docs: false } })
 *```
 */
export function resolveServConfig(input: ServConfigInput = {}): ServConfig {
  return ServConfigSchema.parse(input)
}
