import type { ReachConfig } from './reach-config.js'
import { core } from '@h-ai/core'

/**
 * 返回隐藏供应商凭据及自定义请求内容的配置诊断快照。
 * @param config - 当前运行期已解析的配置。
 * @returns 脱敏后的快照，不修改供应商正在使用的配置。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function listProviderNames(config: ReachConfig) {
 *   return reachConfigView(config).providers.map(provider => provider.name)
 * }
 * ```
 */
export function reachConfigView(config: ReachConfig): ReachConfig {
  const safeProviders = config.providers.map((provider) => {
    if (provider.type === 'api' && provider.headers) {
      return {
        ...provider,
        headers: Object.fromEntries(Object.keys(provider.headers).map(name => [name, core.sanitize.defaultSensitiveReplacement])),
      }
    }
    if (provider.type !== 'aliyun-sms' || !provider.gateway)
      return provider
    const { url, allowInsecureHttp } = provider.gateway
    // 自定义请求头和请求体可以使用任意字段名，诊断视图只保留路由配置。
    return {
      ...provider,
      gateway: { url, allowInsecureHttp },
    }
  })
  return core.sanitize.sanitizeSensitiveFields({ ...config, providers: safeProviders })
}
