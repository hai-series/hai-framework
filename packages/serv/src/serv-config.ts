/**
 * @h-ai/serv — HTTP 配置
 *
 * 提供用于控制 API 前缀、OpenAPI、docs、健康检查、内部 RPC 与传输加密策略的配置结构，
 * 并由 zod 负责默认值填充与边界校验。
 * @module serv-config
 */

import process from 'node:process'
import { TRANSPORT_PLAINTEXT_RANGE } from '@h-ai/crypto'
import { z } from 'zod'
import { isTrustedProxyEntry } from './serv-client-ip.js'

const ApiPrefixSchema = z.custom<`/api/${string}`>(
  value => typeof value === 'string' && value.startsWith('/api/'),
  'apiPrefix must start with /api/',
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
 * import type { ServServerConfig } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const config: ServServerConfig = { host: '127.0.0.1', port: 3000 }
 * const bindAddress = config.host
 * ```
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
 * import type { ServServerConfigInput } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const input: ServServerConfigInput = { port: 3000 }
 * // HOST/PORT 的环境覆盖由配置解析完成后传给 listen。
 * ```
 */
export type ServServerConfigInput = Partial<ServServerConfig>

/**
 * OpenAPI JSON endpoint 配置。
 *
 * @example
 * ```ts
 * import type { ServOpenAPIHttpConfig } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const openapi: ServOpenAPIHttpConfig = { path: '/openapi.json' }
 * // 文档仅在 createApp.http 显式启用时挂载。
 * ```
 */
export interface ServOpenAPIHttpConfig {
  readonly path: `/${string}`
}

/**
 * 文档页面 endpoint 配置。
 *
 * @example
 * ```ts
 * import type { ServDocsHttpConfig } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const docs: ServDocsHttpConfig = { path: '/docs', requireAuth: true }
 * ```
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
 * import type { ServHealthHttpConfig } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const health: ServHealthHttpConfig = { path: '/health', readyPath: '/ready' }
 * ```
 */
export interface ServHealthHttpConfig {
  readonly path: `/${string}`
  readonly readyPath?: `/${string}`
}

/**
 * 内部 RPC endpoint 配置。
 *
 * @example
 * ```ts
 * import type { ServRpcHttpConfig } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const rpc: ServRpcHttpConfig = { prefix: '/rpc', access: 'loopback' }
 * // 缺少可信连接信息时拒绝；跨节点来源通过明确网关/网络策略控制。
 * ```
 */
export interface ServRpcHttpConfig {
  readonly prefix: `/${string}`
  readonly access: 'loopback' | 'private-network' | 'gateway-only'
  readonly gatewayHeader?: string
  readonly gatewaySecret?: string
}

/**
 * 传输加密运行时配置（对应 `config/_serv.yml`）。
 *
 * @example
 * ```ts
 * import type { ServTransportRuntimeConfig } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const transport: ServTransportRuntimeConfig = { keyExchangePath: '/_hai/key-exchange', excludePaths: ['/health'] }
 * // 仅路径配置；真正启用还需私有 keyring 与共享 keyStore。
 * ```
 */
export interface ServTransportRuntimeConfig {
  /** 双向明文 UTF-8 字节上限；省略使用 1 MiB，范围 1 KiB～64 MiB。 */
  readonly maxPlaintextBytes?: number
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
}

/**
 * `config/_serv.yml` 中可序列化的跨端 CORS 配置。
 *
 * @example
 * ```ts
 * import type { ServCorsRuntimeConfig } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const cors: ServCorsRuntimeConfig = { origin: 'https://app.example.com', allowedHeaders: ['Authorization', 'Content-Type'], exposedHeaders: [], credentials: true }
 * ```
 */
export interface ServCorsRuntimeConfig {
  readonly origin?: string
  readonly nativeOrigins?: string
  readonly allowedHeaders: readonly string[]
  readonly exposedHeaders: readonly string[]
  readonly credentials: boolean
}

/**
 * ServHttpApp 的 HTTP 挂载配置。
 *
 * @example
 * ```ts
 * import type { ServHttpConfig } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const http: ServHttpConfig = { trustedProxies: [], apiPrefix: '/api/v1', openapi: false, docs: false, health: { path: '/health' }, rpc: false }
 * ```
 */
export interface ServHttpConfig {
  /** 可信任的连接代理 IP/CIDR；默认空数组，不采纳转发头。 */
  readonly trustedProxies: readonly string[]
  readonly apiPrefix: `/api/${string}`
  readonly openapi: false | ServOpenAPIHttpConfig
  readonly docs: false | ServDocsHttpConfig
  readonly health: false | ServHealthHttpConfig
  readonly rpc: false | ServRpcHttpConfig
}

/**
 * `config/_serv.yml` 的顶层配置结构。
 *
 * @example
 * ```ts
 * import type { ServConfig } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * import { ServConfigSchema } from '@h-ai/serv'
 *
 * const config: ServConfig = ServConfigSchema.parse({ server: { host: '127.0.0.1', port: 3000 } })
 * const port = config.server.port
 * ```
 */
export interface ServConfig {
  readonly server: ServServerConfig
  readonly http: ServHttpConfig
  readonly cors: ServCorsRuntimeConfig
  readonly transport: false | ServTransportRuntimeConfig
}

/**
 * `config/_serv.yml` 中的 CORS 输入类型。
 *
 * @example
 * ```ts
 * import type { ServCorsRuntimeConfigInput } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const input: ServCorsRuntimeConfigInput = { origin: 'https://app.example.com', credentials: true }
 * ```
 */
export type ServCorsRuntimeConfigInput = Partial<ServCorsRuntimeConfig>

/**
 * `config/_serv.yml` 中的传输加密输入类型。
 *
 * @example
 * ```ts
 * import type { ServTransportRuntimeConfigInput } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const input: ServTransportRuntimeConfigInput = { keyExchangePath: '/_hai/key-exchange' }
 * // 此输入不包含私钥；私有 Secret 仅在服务端运行时装配。
 * ```
 */
export type ServTransportRuntimeConfigInput = Partial<{
  readonly maxPlaintextBytes: number | 'auto'
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
}>

/**
 * `serv.createApp` 接受的 HTTP 配置入参类型。
 *
 * @example
 * ```ts
 * import type { ServHttpConfigInput } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * const http: ServHttpConfigInput = { apiPrefix: '/api/v2', trustedProxies: ['192.0.2.0/24'], docs: false }
 * ```
 */
export type ServHttpConfigInput = Partial<{
  readonly trustedProxies: readonly string[]
  readonly apiPrefix: `/api/${string}`
  readonly openapi: false | Partial<ServOpenAPIHttpConfig>
  readonly docs: false | Partial<ServDocsHttpConfig>
  readonly health: false | Partial<ServHealthHttpConfig>
  readonly rpc: false | Partial<ServRpcHttpConfig>
}>

/**
 * `config/_serv.yml` 的顶层输入类型。
 *
 * @example
 * ```ts
 * import type { ServConfigInput } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * import { ServConfigSchema } from '@h-ai/serv'
 *
 * const input: ServConfigInput = { http: { apiPrefix: '/api/v2' }, transport: false }
 * const parsed = ServConfigSchema.safeParse(input)
 * if (!parsed.success) throw new Error('Invalid service configuration')
 * ```
 */
export interface ServConfigInput {
  readonly server?: ServServerConfigInput
  readonly http?: ServHttpConfigInput
  readonly cors?: ServCorsRuntimeConfigInput
  readonly transport?: false | ServTransportRuntimeConfigInput
}

const OpenAPIHttpConfigInputSchema = z.union([
  z.literal(false),
  z.object({ path: AbsolutePathSchema.default('/openapi.json') }),
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

const RpcHttpConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    prefix: AbsolutePathSchema.default('/rpc'),
    access: z.enum(['loopback', 'private-network', 'gateway-only']).default('loopback'),
    gatewayHeader: z.string().optional(),
    gatewaySecret: z.string().optional(),
  }),
])

const TransportRuntimeConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    maxPlaintextBytes: z.union([z.number().int().min(TRANSPORT_PLAINTEXT_RANGE.min).max(TRANSPORT_PLAINTEXT_RANGE.max), z.literal('auto')]).transform(value => value === 'auto' ? undefined : value).optional().describe('双向明文上限；auto 按已启用模块推导，无模块需求时 1 MiB；显式整数不得小于模块需求').meta({ default: 'auto' }),
    keyExchangePath: AbsolutePathSchema.default('/_hai/key-exchange'),
    excludePaths: z.array(AbsolutePathSchema).default([]),
  }),
])

const ServerConfigInputSchema = z.object({
  host: z.string().min(1).default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(3000),
})

const CorsRuntimeConfigInputSchema = z.object({
  origin: z.string().optional(),
  nativeOrigins: z.string().optional(),
  allowedHeaders: z.array(z.string()).default(['Authorization', 'Content-Type', 'X-Requested-With', 'X-Hai-Reauthentication']),
  exposedHeaders: z.array(z.string()).default([]),
  credentials: z.boolean().default(false),
})

const ServHttpConfigInputSchema = z.object({
  trustedProxies: z.array(z.string().trim().refine(isTrustedProxyEntry, 'Expected an IP address or CIDR')).default([]),
  apiPrefix: ApiPrefixSchema.default('/api/v1'),
  openapi: OpenAPIHttpConfigInputSchema.default(false),
  docs: DocsHttpConfigInputSchema.default(false),
  health: HealthHttpConfigInputSchema.default({ path: '/health', readyPath: '/ready' }),
  rpc: RpcHttpConfigInputSchema.default(false),
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
 * ```
 */
export const ServConfigSchema = z.object({
  server: ServerConfigInputSchema.optional(),
  http: ServHttpConfigInputSchema.optional(),
  cors: CorsRuntimeConfigInputSchema.optional(),
  transport: TransportRuntimeConfigInputSchema.optional(),
}).transform(({ server, http, cors, transport }) => ({
  server: resolveServServerConfig(server ?? {}),
  http: resolveServHttpConfig(http ?? {}),
  cors: resolveServCorsRuntimeConfig(cors ?? {}),
  transport: resolveServTransportRuntimeConfig(transport ?? false),
}))

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
 * ```
 */
export function resolveServServerConfig(input: ServServerConfigInput = {}): ServServerConfig {
  return { ...ServerConfigInputSchema.parse(input), ...readServerEnvOverride() }
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
 * ```
 */
export function resolveServHttpConfig(input: ServHttpConfigInput = {}): ServHttpConfig {
  return ServHttpConfigInputSchema.parse(input)
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
 * const cors = resolveServCorsRuntimeConfig({ origin: 'https://app.example.com', credentials: true })
 * ```
 */
export function resolveServCorsRuntimeConfig(input: ServCorsRuntimeConfigInput = {}): ServCorsRuntimeConfig {
  return CorsRuntimeConfigInputSchema.parse(input)
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
 * const enabled = resolveServTransportRuntimeConfig({ keyExchangePath: '/_hai/key-exchange' })
 * ```
 */
export function resolveServTransportRuntimeConfig(
  input: false | ServTransportRuntimeConfigInput = false,
): false | ServTransportRuntimeConfig {
  return TransportRuntimeConfigInputSchema.parse(input)
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
 * ```
 */
export function resolveServConfig(input: ServConfigInput = {}): ServConfig {
  return ServConfigSchema.parse(input)
}
