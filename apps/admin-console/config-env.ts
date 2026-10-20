/** 在 Node 构建阶段解析 YAML，仅向客户端传递公开的传输路径与开关。 */
import process from 'node:process'
import { core } from '@h-ai/core'
import { KitConfigSchema } from '@h-ai/kit'

/**
 * 加载分环境配置并验证 kit 字段，浏览器不接收服务端监听配置。
 * @param mode - Vite 的 dev/test/prod 模式
 * @returns 可作为 Vite define 字面量的公开传输配置
 * @throws 环境文件或 kit 配置无效时阻止启动与构建
 * @example define: { __ADMIN_KIT_CONFIG__: adminBuildConfig('test') }
 */
export function adminBuildConfig(mode: string): string {
  const env = core.config.loadEnvFiles({ mode })
  if (!env.success)
    throw new Error(env.error.message)
  Object.assign(process.env, env.data)
  const config = core.config.load('kit', './config/_kit.yml', KitConfigSchema)
  if (!config.success)
    throw new Error(config.error.message)
  return JSON.stringify({ transport: config.data.transport })
}
