/**
 * @h-ai/serv — HTTP 配置解析
 *
 * 提供用于控制 API 前缀、OpenAPI、docs、健康检查与内部 RPC 访问策略的配置结构。
 * @module app/http-config
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

/** Hono app 的 HTTP 挂载配置。 */
export interface ServHttpConfig {
  readonly apiPrefix: `/api/${string}`
  readonly openapi: false | ServOpenAPIHttpConfig
  readonly docs: false | ServDocsHttpConfig
  readonly health: false | ServHealthHttpConfig
  readonly rpc: false | ServRpcHttpConfig
}

export type ServHttpConfigInput = Partial<{
  readonly apiPrefix: `/api/${string}`
  readonly openapi: false | Partial<ServOpenAPIHttpConfig>
  readonly docs: false | Partial<ServDocsHttpConfig>
  readonly health: false | Partial<ServHealthHttpConfig>
  readonly rpc: false | Partial<ServRpcHttpConfig>
}>

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

const ServHttpConfigInputSchema = z.object({
  apiPrefix: ApiPrefixSchema.default('/api/v1'),
  openapi: OpenAPIHttpConfigInputSchema.default(false),
  docs: DocsHttpConfigInputSchema.default(false),
  health: HealthHttpConfigInputSchema.default({ path: '/health', readyPath: '/ready' }),
  rpc: RpcHttpConfigInputSchema.default(false),
})

/**
 * 解析 HTTP 配置并补齐默认值。
 *
 * @param input - 用户传入的部分 HTTP 配置
 * @returns 完整 HTTP 配置
 */
export function resolveServHttpConfig(input: ServHttpConfigInput = {}): ServHttpConfig {
  return ServHttpConfigInputSchema.parse(input)
}
