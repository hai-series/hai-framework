/** 构建期解析桌面端 YAML，仅将 transport 的公开路径提供给浏览器。 */
import process from 'node:process'
import { core } from '@h-ai/core'
import { DesktopCryptoConfigSchema } from './src/lib/crypto-config-schema.js'

/**
 * 解析公开传输配置；构建省略 mode，仅使用工程 YAML 默认值。
 * @param mode - 开发/测试的 Vite 模式；构建不传入部署环境
 * @returns 供 Vite define 使用的 JSON 字面量
 * @throws YAML 无法加载时抛错，阻止产出错误的客户端包
 * @example define: { __DESKTOP_CRYPTO_CONFIG__: desktopBuildConfig() }
 */
export function desktopBuildConfig(mode?: string): string {
  if (mode) {
    const env = core.config.loadEnvFiles({ mode })
    if (!env.success)
      throw new Error(env.error.message)
    Object.assign(process.env, env.data)
  }
  const result = core.config.load('crypto', './config/_crypto.yml', DesktopCryptoConfigSchema)
  if (!result.success)
    throw new Error(result.error.message)
  const transport = result.data.transport
  return JSON.stringify({ transport: transport ? { keyExchangePath: transport.keyExchangePath } : false })
}
