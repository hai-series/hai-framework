/**
 * @h-ai/kit — transport 配置
 *
 * 为 `config/_kit.yml` 提供统一的 transport 配置结构、默认值与校验逻辑，
 * 方便应用层用一份配置同时驱动 `hooks.server.ts` 与 `kit.client.create()`。
 * @module kit-config
 */

import { z } from 'zod'

const AbsolutePathSchema = z.custom<`/${string}`>(
  value => typeof value === 'string' && value.startsWith('/'),
  'path must start with /',
)

/** `config/_kit.yml` 中的 transport 配置。 */
export interface KitTransportConfig {
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
  readonly requireEncryption: boolean
  readonly encryptResponse: boolean
  readonly maxClients: number
}

/** `config/_kit.yml` 的顶层配置结构。 */
export interface KitConfig {
  readonly transport: false | KitTransportConfig
}

/** `config/_kit.yml` 中的 transport 输入类型。 */
export type KitTransportConfigInput = Partial<{
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
  readonly requireEncryption: boolean
  readonly encryptResponse: boolean
  readonly maxClients: number
}>

/** `config/_kit.yml` 的顶层输入类型。 */
export interface KitConfigInput {
  readonly transport?: false | KitTransportConfigInput
}

const KitTransportConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    keyExchangePath: AbsolutePathSchema.default('/api/_hai/key-exchange'),
    excludePaths: z.array(AbsolutePathSchema).default([]),
    requireEncryption: z.boolean().default(true),
    encryptResponse: z.boolean().default(true),
    maxClients: z.number().int().positive().default(10000),
  }),
])

/** `config/_kit.yml` 对应的配置 Schema。 */
export const KitConfigSchema = z.object({
  transport: KitTransportConfigInputSchema.optional(),
}).transform(({ transport }) => ({
  transport: resolveKitTransportConfig(transport ?? false),
}))

/**
 * 解析 transport 配置并补齐默认值。
 *
 * @param input - `config/_kit.yml` 中的 transport 配置
 * @returns 完整 transport 配置；`false` 表示关闭
 */
export function resolveKitTransportConfig(
  input: false | KitTransportConfigInput = false,
): false | KitTransportConfig {
  return KitTransportConfigInputSchema.parse(input)
}

/**
 * 解析 `config/_kit.yml` 顶层配置并补齐默认值。
 *
 * 适合同一份配置同时供 SvelteKit 服务端 hook 与浏览器端 client 读取。
 */
export function resolveKitConfig(input: KitConfigInput = {}): KitConfig {
  return KitConfigSchema.parse(input)
}
