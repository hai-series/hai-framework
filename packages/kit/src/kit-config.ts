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

/** 服务器监听配置（对应 `config/_kit.yml` 的 `server`）。 */
export interface KitServerConfig {
  readonly host: string
  readonly port: number
}

/** `config/_kit.yml` 中的服务器监听输入类型。 */
export type KitServerConfigInput = Partial<KitServerConfig>

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
  readonly server: KitServerConfig
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
  readonly server?: KitServerConfigInput
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

const ServerConfigInputSchema = z.object({
  host: z.string().min(1).default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(3000),
})

/** `config/_kit.yml` 对应的配置 Schema。 */
export const KitConfigSchema = z.object({
  server: ServerConfigInputSchema.optional(),
  transport: KitTransportConfigInputSchema.optional(),
}).transform(({ server, transport }) => ({
  server: resolveKitServerConfig(server ?? {}),
  transport: resolveKitTransportConfig(transport ?? false),
}))

/**
 * 读取 `HOST` / `PORT` 环境变量覆盖（环境变量高于配置文件）。
 *
 * 浏览器端 `process` 不存在时安全回退为空；`PORT` 仅采纳 1-65535 的整数。
 */
function readServerEnvOverride(): KitServerConfigInput {
  // eslint-disable-next-line node/prefer-global/process
  const env = typeof process !== 'undefined' ? process.env : undefined
  const override: { host?: string, port?: number } = {}
  const host = env?.HOST
  if (host)
    override.host = host
  const rawPort = env?.PORT
  if (rawPort) {
    const port = Number(rawPort)
    if (Number.isInteger(port) && port >= 1 && port <= 65535)
      override.port = port
  }
  return override
}

/**
 * 解析服务器监听配置并补齐默认值。
 *
 * 优先级：`HOST` / `PORT` 环境变量 > `config/_kit.yml` 的 `server` > 默认 `127.0.0.1:3000`。
 *
 * @param input - `config/_kit.yml` 中的 server 配置
 * @returns 完整 server 配置
 */
export function resolveKitServerConfig(input: KitServerConfigInput = {}): KitServerConfig {
  return { ...ServerConfigInputSchema.parse(input), ...readServerEnvOverride() }
}

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
