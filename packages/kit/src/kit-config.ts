/**
 * @h-ai/kit — transport 配置
 *
 * 为 `config/_kit.yml` 提供统一的 transport 配置结构、默认值与校验逻辑，
 * 方便应用层用一份配置同时驱动 `hooks.server.ts` 与 `kit.client.create()`。
 * @module kit-config
 */

import { TRANSPORT_PLAINTEXT_RANGE } from '@h-ai/crypto'
import { z } from 'zod'

const AbsolutePathSchema = z.custom<`/${string}`>(
  value => typeof value === 'string' && value.startsWith('/'),
  'path must start with /',
)

/**
 * 服务器监听配置（对应 `config/_kit.yml` 的 `server`）。
 * @example
 * ```ts
 * import type { KitServerConfig } from '@h-ai/kit'
 *
 * const value: KitServerConfig = { host: '127.0.0.1', port: 3000 }
 * void value
 * ```
 */
export interface KitServerConfig {
  readonly host: string
  readonly port: number
}

/**
 * `config/_kit.yml` 中的服务器监听输入类型。
 * @example
 * ```ts
 * import type { KitServerConfigInput } from '@h-ai/kit'
 *
 * const value: KitServerConfigInput = { port: 4000 }
 * void value
 * ```
 */
export type KitServerConfigInput = Partial<KitServerConfig>

/**
 * `config/_kit.yml` 中的 transport 配置。
 * @example
 * ```ts
 * import type { KitTransportConfig } from '@h-ai/kit'
 *
 * const value: KitTransportConfig = { keyExchangePath: '/api/_hai/key-exchange', excludePaths: ['/api/health'] }
 * void value
 * ```
 */
export interface KitTransportConfig {
  /** 双向明文 UTF-8 字节上限；省略使用 1 MiB，范围 1 KiB～64 MiB。 */
  readonly maxPlaintextBytes?: number
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
}

/**
 * `config/_kit.yml` 的顶层配置结构。
 * @example
 * ```ts
 * import type { KitConfig } from '@h-ai/kit'
 *
 * const value: KitConfig = { server: { host: '127.0.0.1', port: 3000 }, transport: false }
 * void value
 * ```
 */
export interface KitConfig {
  readonly server: KitServerConfig
  readonly transport: false | KitTransportConfig
}

/**
 * `config/_kit.yml` 中的 transport 输入类型。
 * @example
 * ```ts
 * import type { KitTransportConfigInput } from '@h-ai/kit'
 *
 * const value: KitTransportConfigInput = { excludePaths: ['/api/health'] }
 * void value
 * ```
 */
export type KitTransportConfigInput = Partial<{
  readonly maxPlaintextBytes: number | 'auto'
  readonly keyExchangePath: `/${string}`
  readonly excludePaths: readonly `/${string}`[]
}>

/**
 * `config/_kit.yml` 的顶层输入类型。
 * @example
 * ```ts
 * import type { KitConfigInput } from '@h-ai/kit'
 *
 * const value: KitConfigInput = { transport: false }
 * void value
 * ```
 */
export interface KitConfigInput {
  readonly server?: KitServerConfigInput
  readonly transport?: false | KitTransportConfigInput
}

const KitTransportConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    maxPlaintextBytes: z.union([z.number().int().min(TRANSPORT_PLAINTEXT_RANGE.min).max(TRANSPORT_PLAINTEXT_RANGE.max), z.literal('auto')]).transform(value => value === 'auto' ? undefined : value).optional().describe('双向明文上限；auto 按已启用模块推导，无模块需求时 1 MiB；显式整数不得小于模块需求').meta({ default: 'auto' }),
    keyExchangePath: AbsolutePathSchema.default('/api/_hai/key-exchange'),
    excludePaths: z.array(AbsolutePathSchema).default([]),
  }),
])

const ServerConfigInputSchema = z.object({
  host: z.string().min(1).default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(3000),
})

/**
 * `config/_kit.yml` 对应的配置 Schema。
 * @example
 * ```ts
 * import { KitConfigSchema } from '@h-ai/kit'
 *
 * const config = KitConfigSchema.parse({ server: { port: 3000 }, transport: false })
 * void config
 * ```
 */
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
 * @example 模块内部上下文
 * ```ts
 * const config = resolveKitServerConfig({ port: 4000 })
 * // HOST / PORT 环境变量优先于输入。
 * void config.port
 * ```
 */
export function resolveKitServerConfig(input: KitServerConfigInput = {}): KitServerConfig {
  return { ...ServerConfigInputSchema.parse(input), ...readServerEnvOverride() }
}

/**
 * 解析 transport 配置并补齐默认值。
 *
 * @param input - `config/_kit.yml` 中的 transport 配置
 * @returns 完整 transport 配置；`false` 表示关闭
 * @example
 * ```ts
 * import { resolveKitTransportConfig } from '@h-ai/kit'
 *
 * const transport = resolveKitTransportConfig({ excludePaths: ['/api/health'] })
 * if (transport) void transport.keyExchangePath
 * ```
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
 * @param input - Kit 监听和公开 transport 输入；省略字段按 Schema 补默认值。
 * @returns 已补齐默认值的配置；不合法输入抛出 ZodError。
 * @example
 * ```ts
 * import { resolveKitConfig } from '@h-ai/kit'
 *
 * const config = resolveKitConfig({ transport: false })
 * void config.server.port
 * ```
 */
export function resolveKitConfig(input: KitConfigInput = {}): KitConfig {
  return KitConfigSchema.parse(input)
}
