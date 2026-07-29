/**
 * @h-ai/serv — HTTP 配置
 *
 * 提供用于控制 API 前缀、OpenAPI、docs、健康检查、内部 RPC 与传输加密策略的配置结构，
 * 并由 zod 负责默认值填充与边界校验。
 * @module serv-config
 */

import { z } from 'zod'

const ApiPrefixSchema = z.custom<`/api/${string}`>(
  value => typeof value === 'string' && value.startsWith('/api/'),
  'apiPrefix must start with /api/',
)

const AbsolutePathSchema = z.custom<`/${string}`>(
  value => typeof value === 'string' && value.startsWith('/'),
  'path must start with /',
)

/** OpenAPI JSON endpoint 配置。 */
export interface ServOpenAPIHttpConfig {
  readonly path: `/${string}`
}

/** 文档页面 endpoint 配置。 */
export interface ServDocsHttpConfig {
  readonly path: `/${string}`
  readonly requireAuth?: boolean
}

/** 健康检查 endpoint 配置。 */
export interface ServHealthHttpConfig {
  readonly path: `/${string}`
  readonly readyPath?: `/${string}`
}

/** 内部 RPC endpoint 配置。 */
export interface ServRpcHttpConfig {
  readonly prefix: `/${string}`
  readonly access: 'loopback' | 'private-network' | 'gateway-only'
  readonly gatewayHeader?: string
  readonly gatewaySecret?: string
}

/** 传输加密运行时配置（对应 `config/_serv.yml`）。 */
export interface ServTransportRuntimeConfig {
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
  readonly maxClients: number
}

/** `config/_serv.yml` 中可序列化的跨端 CORS 配置。 */
export interface ServCorsRuntimeConfig {
  readonly origin?: string
  readonly nativeOrigins?: string
  readonly allowedHeaders: readonly string[]
  readonly exposedHeaders: readonly string[]
  readonly credentials: boolean
}

/** ServHttpApp 的 HTTP 挂载配置。 */
export interface ServHttpConfig {
  readonly apiPrefix: `/api/${string}`
  readonly openapi: false | ServOpenAPIHttpConfig
  readonly docs: false | ServDocsHttpConfig
  readonly health: false | ServHealthHttpConfig
  readonly rpc: false | ServRpcHttpConfig
}

/** `config/_serv.yml` 的顶层配置结构。 */
export interface ServConfig {
  readonly http: ServHttpConfig
  readonly cors: ServCorsRuntimeConfig
  readonly transport: false | ServTransportRuntimeConfig
}

/** `config/_serv.yml` 中的 CORS 输入类型。 */
export type ServCorsRuntimeConfigInput = Partial<ServCorsRuntimeConfig>

/** `config/_serv.yml` 中的传输加密输入类型。 */
export type ServTransportRuntimeConfigInput = Partial<{
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
  readonly maxClients: number
}>

/** `serv.createApp` 接受的 HTTP 配置入参类型。 */
export type ServHttpConfigInput = Partial<{
  readonly apiPrefix: `/api/${string}`
  readonly openapi: false | Partial<ServOpenAPIHttpConfig>
  readonly docs: false | Partial<ServDocsHttpConfig>
  readonly health: false | Partial<ServHealthHttpConfig>
  readonly rpc: false | Partial<ServRpcHttpConfig>
}>

/** `config/_serv.yml` 的顶层输入类型。 */
export interface ServConfigInput {
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
    keyExchangePath: AbsolutePathSchema.default('/_hai/key-exchange'),
    excludePaths: z.array(AbsolutePathSchema).default([]),
    maxClients: z.number().int().positive().default(10000),
  }),
])

const CorsRuntimeConfigInputSchema = z.object({
  origin: z.string().optional(),
  nativeOrigins: z.string().optional(),
  allowedHeaders: z.array(z.string()).default(['Authorization', 'Content-Type', 'X-Requested-With']),
  exposedHeaders: z.array(z.string()).default([]),
  credentials: z.boolean().default(false),
})

const ServHttpConfigInputSchema = z.object({
  apiPrefix: ApiPrefixSchema.default('/api/v1'),
  openapi: OpenAPIHttpConfigInputSchema.default(false),
  docs: DocsHttpConfigInputSchema.default(false),
  health: HealthHttpConfigInputSchema.default({ path: '/health', readyPath: '/ready' }),
  rpc: RpcHttpConfigInputSchema.default(false),
})

/** `config/_serv.yml` 对应的配置 Schema。 */
export const ServConfigSchema = z.object({
  http: ServHttpConfigInputSchema.optional(),
  cors: CorsRuntimeConfigInputSchema.optional(),
  transport: TransportRuntimeConfigInputSchema.optional(),
}).transform(({ http, cors, transport }) => ({
  http: resolveServHttpConfig(http ?? {}),
  cors: resolveServCorsRuntimeConfig(cors ?? {}),
  transport: resolveServTransportRuntimeConfig(transport ?? false),
}))

/**
 * 解析 HTTP 配置并补齐默认值。
 *
 * @param input - 用户传入的部分 HTTP 配置
 * @returns 完整 HTTP 配置
 */
export function resolveServHttpConfig(input: ServHttpConfigInput = {}): ServHttpConfig {
  return ServHttpConfigInputSchema.parse(input)
}

/** 解析配置文件中的跨端 CORS Header 与凭据策略。 */
export function resolveServCorsRuntimeConfig(input: ServCorsRuntimeConfigInput = {}): ServCorsRuntimeConfig {
  return CorsRuntimeConfigInputSchema.parse(input)
}

/**
 * 解析传输加密配置并补齐默认值。
 *
 * @param input - `config/_serv.yml` 中的 transport 配置
 * @returns 完整 transport 配置；`false` 表示关闭
 */
export function resolveServTransportRuntimeConfig(
  input: false | ServTransportRuntimeConfigInput = false,
): false | ServTransportRuntimeConfig {
  return TransportRuntimeConfigInputSchema.parse(input)
}

/**
 * 解析 `config/_serv.yml` 顶层配置并补齐默认值。
 *
 * 典型用法：`core.config.validate('serv', ServConfigSchema)`。
 */
export function resolveServConfig(input: ServConfigInput = {}): ServConfig {
  return ServConfigSchema.parse(input)
}
