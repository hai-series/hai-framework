/**
 * @file src/lib/crypto-config.ts
 *
 * 读取桌面端 `config/_crypto.yml`，集中管理 transport 加密相关设置。
 * 该配置为构建期静态导入：修改后需重新启动 Vite / Tauri 开发进程。
 */

import { parse } from 'yaml'
import { z } from 'zod'
import rawDesktopCryptoConfig from '../../config/_crypto.yml?raw'

const AbsolutePathSchema = z.custom<`/${string}`>(
  value => typeof value === 'string' && value.startsWith('/'),
  'path must start with /',
)

/** 桌面端 transport 配置。 */
export interface DesktopCryptoTransportConfig {
  readonly keyExchangePath: `/${string}`
}

/** `config/_crypto.yml` 的顶层配置。 */
export interface DesktopCryptoConfig {
  readonly transport: false | DesktopCryptoTransportConfig
}

/** `config/_crypto.yml` 输入类型。 */
export type DesktopCryptoConfigInput = Partial<{
  readonly transport: false | Partial<DesktopCryptoTransportConfig>
}>

const DesktopCryptoTransportConfigInputSchema = z.union([
  z.literal(false),
  z.object({
    keyExchangePath: AbsolutePathSchema.default('/_hai/key-exchange'),
  }),
])

const DesktopCryptoConfigSchema = z.object({
  transport: DesktopCryptoTransportConfigInputSchema.optional(),
}).transform(({ transport }) => ({
  transport: resolveDesktopCryptoTransportConfig(transport ?? false),
}))

/**
 * 解析 transport 配置并补齐默认值。
 *
 * @param input - `config/_crypto.yml` 中的 transport 配置
 * @returns 完整 transport 配置；`false` 表示关闭
 */
export function resolveDesktopCryptoTransportConfig(
  input: false | Partial<DesktopCryptoTransportConfig> = false,
): false | DesktopCryptoTransportConfig {
  return DesktopCryptoTransportConfigInputSchema.parse(input)
}

/**
 * 解析桌面端 crypto 配置并补齐默认值。
 *
 * @param input - 原始配置对象
 * @returns 完整 crypto 配置
 */
export function resolveDesktopCryptoConfig(input: DesktopCryptoConfigInput = {}): DesktopCryptoConfig {
  return DesktopCryptoConfigSchema.parse(input)
}

function loadDesktopCryptoConfig(): DesktopCryptoConfig {
  const parsed = parse(rawDesktopCryptoConfig) as DesktopCryptoConfigInput | null | undefined
  return resolveDesktopCryptoConfig(parsed ?? {})
}

/** 当前桌面端构建使用的 crypto 配置。 */
export const desktopCryptoConfig = loadDesktopCryptoConfig()
