/** 桌面端公开传输配置：供 Node 构建与浏览器共用，不读取运行环境。 */
import { crypto } from '@h-ai/crypto'
import { z } from 'zod'

const AbsolutePathSchema = z.custom<`/${string}`>(
  crypto.transport.isKeyExchangePath,
  'keyExchangePath must be a fixed origin-absolute path',
)

/**
 * 桌面端 transport 配置。
 * @example { keyExchangePath: '/api/v1/_hai/key-exchange' }
 */
export interface DesktopCryptoTransportConfig {
  /** 站点绝对路径，必须与服务端约定一致。 */
  readonly keyExchangePath: `/${string}`
}

/**
 * 桌面端 crypto 配置。
 * @example { transport: false }
 */
export interface DesktopCryptoConfig {
  /** false 关闭传输加密；启用时提供路径配置。 */
  readonly transport: false | DesktopCryptoTransportConfig
}

/**
 * 允许省略默认路径的输入配置。
 * @example { transport: {} }
 */
export type DesktopCryptoConfigInput = Partial<{
  /** 省略时关闭；对象中的路径省略时使用默认密钥交换端点。 */
  readonly transport: false | Partial<DesktopCryptoTransportConfig>
}>

const DesktopCryptoTransportConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    keyExchangePath: AbsolutePathSchema.default(crypto.transport.protocol.DEFAULT_KEY_EXCHANGE_PATH),
  }),
])

/**
 * 构建端与浏览器共享的公开配置 Schema，拒绝 true、字符串及非法路径。
 * @example DesktopCryptoConfigSchema.parse({ transport: { keyExchangePath: '/exchange' } })
 */
export const DesktopCryptoConfigSchema = z.object({
  transport: DesktopCryptoTransportConfigInputSchema.optional(),
}).transform(({ transport }) => ({ transport: transport ?? false }))

/**
 * 解析 transport 配置并补齐默认路径。
 * @param input - 关闭标记或路径配置
 * @returns 完整传输配置；false 表示关闭
 * @throws 配置不符合 Schema 时抛出 ZodError
 * @example resolveDesktopCryptoTransportConfig({}) // { keyExchangePath: '/api/v1/_hai/key-exchange' }
 */
export function resolveDesktopCryptoTransportConfig(input: false | Partial<DesktopCryptoTransportConfig> = false): false | DesktopCryptoTransportConfig {
  return DesktopCryptoTransportConfigInputSchema.parse(input)
}

/**
 * 解析完整桌面端 crypto 配置。
 * @param input - YAML 插值结果或公开配置输入
 * @returns 补齐默认值的配置
 * @throws 配置不符合 Schema 时抛出 ZodError
 * @example resolveDesktopCryptoConfig({ transport: false }) // { transport: false }
 */
export function resolveDesktopCryptoConfig(input: DesktopCryptoConfigInput = {}): DesktopCryptoConfig {
  return DesktopCryptoConfigSchema.parse(input)
}
