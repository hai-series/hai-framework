/**
 * @h-ai/kit — SvelteKit 服务配置
 *
 * 为 `config/_kit.yml` 提供监听、传输与请求策略的默认值和校验。
 * 启动代码用监听设置启动服务，请求钩子读取代理和访问规则。生成的应用在
 * 根 `+layout.server.ts` 的 `load` 中只把 `transport` 设置返回给浏览器，
 * 让浏览器找到密钥协商路径并识别需要加密的请求。密钥和共享存储由服务端代码另行提供。
 * @module kit-config
 */

import type { KitConfig, KitConfigInput, KitServerConfig, KitServerConfigInput, KitTransportConfig, KitTransportConfigInput } from './kit-types.js'
import { RequestAccessConfigSchema, TrustedProxiesSchema } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { z } from 'zod'

const AbsolutePathSchema = z.custom<`/${string}`>(
  value => typeof value === 'string' && value.startsWith('/'),
  'path must start with /',
)

const KitTransportConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    maxPlaintextBytes: z.union([
      z.number().int().min(crypto.transport.plaintextRange.min).max(crypto.transport.plaintextRange.max),
      z.literal('auto'),
    ]).transform(value => value === 'auto'
      ? undefined
      : value).optional().describe('普通业务双向明文上限；auto 为 1 MiB；大材料使用 routePlaintextBytes 单独声明').meta({ default: 'auto' }),
    maxFutureSkewSeconds: z.number().int().min(0).max(crypto.transport.timeLimits.maxFutureSkewSeconds).optional().describe('允许客户端请求时间领先服务器的秒数').meta({ default: crypto.transport.protocol.CLOCK_SKEW_MS / 1000 }),
    maxRequestAgeSeconds: z.number().int().min(crypto.transport.timeLimits.minRequestAgeSeconds).max(crypto.transport.timeLimits.maxRequestAgeSeconds).optional().describe('请求从签发起的有效秒数').meta({ default: crypto.transport.protocol.REQUEST_WINDOW_MS / 1000 }),
    routePlaintextBytes: z.record(AbsolutePathSchema, z.number().int().min(crypto.transport.plaintextRange.min).max(crypto.transport.plaintextRange.max)).optional().describe('完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量'),
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
 *```
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
  // eslint-disable-next-line node/prefer-global/process -- 共享配置在浏览器也会加载，不能静态引入 Node 模块。
  const env = globalThis.process?.env
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
 *```
 */
export function resolveKitServerConfig(input: KitServerConfigInput = {}): KitServerConfig {
  return {
    ...ServerConfigInputSchema.parse(input),
    ...readServerEnvOverride(),
  }
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
 *```
 */
export function resolveKitTransportConfig(
  input: false | KitTransportConfigInput = false,
): false | KitTransportConfig {
  return KitTransportConfigInputSchema.parse(input)
}

/**
 * 解析 `config/_kit.yml` 顶层配置并补齐默认值。
 *
 * 在服务端读取并检查整份配置。需要配置浏览器客户端时，只返回客户端协商所需的
 * `transport` 设置，不要把监听地址、代理或访问规则作为页面数据返回。
 * @param input - Kit 监听和公开 transport 输入；省略字段按 Schema 补默认值。
 * @returns 已补齐默认值的配置；不合法输入抛出 ZodError。
 * @example
 * ```ts
 * import { resolveKitConfig } from '@h-ai/kit'
 *
 * const config = resolveKitConfig({ transport: false })
 * void config.server.port
 *```
 */
export function resolveKitConfig(input: KitConfigInput = {}): KitConfig {
  return KitConfigSchema.parse(input)
}
