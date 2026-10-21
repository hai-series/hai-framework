/** Vite 开发与预览的公开运行配置；同一份静态构建可连接不同环境的 API。 */
import type { CoreConfig } from '@h-ai/core'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/** 只允许浏览器可见的地址、开关和品牌字段，禁止传入 process.env 或完整服务配置。 */
export interface PublicRuntimeConfig {
  /** 包含 API 前缀的公开地址，例如 https://example.test/api/v1。 */
  apiBase?: string
  /** 客户端传输开关，与服务端一致。 */
  apiTransport?: string
  /** 公开密钥交换端点。 */
  apiKeyExchangePath?: string
  /** 客户端公开元数据；不含密钥或连接参数。 */
  core?: Pick<CoreConfig, 'name' | 'version' | 'env' | 'defaultLocale'> & { logging?: Pick<NonNullable<CoreConfig['logging']>, 'level' | 'format'> }
}

/**
 * 在加载应用前提供无缓存的公开配置；构建只复制空的占位文件。
 * @example `plugins: [publicRuntimeConfig({ apiBase: process.env.PUBLIC_API_BASE })]`
 */
export function publicRuntimeConfig(config: PublicRuntimeConfig): Plugin {
  const metadata = config.core
  // 明确投影字段，JavaScript 调用方即使误传完整配置也不能公开连接参数或密钥。
  const publicConfig: PublicRuntimeConfig = {
    apiBase: config.apiBase,
    apiTransport: config.apiTransport,
    apiKeyExchangePath: config.apiKeyExchangePath,
    core: metadata
      ? {
          name: metadata.name,
          version: metadata.version,
          env: metadata.env,
          defaultLocale: metadata.defaultLocale,
          logging: metadata.logging ? { level: metadata.logging.level, format: metadata.logging.format } : undefined,
        }
      : undefined,
  }
  const body = `globalThis.__HAI_PUBLIC_CONFIG__ = { ...globalThis.__HAI_PUBLIC_CONFIG__, ...${JSON.stringify(publicConfig)} };\n`
  const respond = (_request: IncomingMessage, response: ServerResponse): void => {
    response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(body)
  }
  return {
    name: 'hai-public-runtime-config',
    configureServer(server) {
      server.middlewares.use('/runtime-config.js', respond)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/runtime-config.js', respond)
    },
  }
}
