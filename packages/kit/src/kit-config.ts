/**
 * @h-ai/kit — 宿主配置
 *
 * 为 `config/_kit.yml` 提供监听、传输与请求策略的默认值和校验。
 * 服务端消费完整配置；浏览器仅接收显式投影的 transport 公共字段。
 * @module kit-config
 */

import type { KitConfig, KitConfigInput, KitServerConfig, KitServerConfigInput, KitTransportConfig, KitTransportConfigInput } from './kit-types.js'
import { RequestAccessConfigSchema, TrustedProxiesSchema } from '@h-ai/core'
import { TRANSPORT_PLAINTEXT_RANGE } from '@h-ai/crypto'
import { z } from 'zod'

const AbsolutePathSchema = z.custom<`/${string}`>(
  value => typeof value === 'string' && value.startsWith('/'),
  'path must start with /',
)

const KitTransportConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    maxPlaintextBytes: z.union([z.number().int().min(TRANSPORT_PLAINTEXT_RANGE.min).max(TRANSPORT_PLAINTEXT_RANGE.max), z.literal('auto')]).transform(value => value === 'auto' ? undefined : value).optional().describe('普通业务双向明文上限；auto 为 1 MiB；大材料使用 routePlaintextBytes 单独声明').meta({ default: 'auto' }),
    routePlaintextBytes: z.record(AbsolutePathSchema, z.number().int().min(TRANSPORT_PLAINTEXT_RANGE.min).max(TRANSPORT_PLAINTEXT_RANGE.max)).optional().describe('完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量'),
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
  trustedProxies: TrustedProxiesSchema.default('auto'),
  access: RequestAccessConfigSchema.default(false),
}).transform(({ server, transport, trustedProxies, access }) => ({
  server: resolveKitServerConfig(server ?? {}),
  transport: resolveKitTransportConfig(transport ?? false),
  trustedProxies,
  access,
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
