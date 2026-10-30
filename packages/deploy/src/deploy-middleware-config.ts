/** 自建与云开通共用的配置合并；业务选项保留，连接选择器由实际开通结果定稿。 */
import type { MiddlewareRequirement, ServiceType } from './deploy-types.js'

/** 旧地址、认证与连接模式不能覆盖新服务；其余同后端配置继续生效。 */
const connectionFields: Partial<Record<ServiceType, readonly string[]>> = {
  db: ['url', 'host', 'port', 'database', 'user', 'password', 'ssl'],
  cache: ['url', 'host', 'port', 'password', 'cluster', 'sentinel', 'tls'],
  storage: ['endpoint', 'bucket', 'region', 'accessKeyId', 'secretAccessKey', 'forcePathStyle', 'createBucket'],
  vecdb: ['url', 'host', 'port', 'database', 'user', 'password', 'apiKey', 'path', 'serverCommand', 'startupTimeout'],
  ldap: ['url', 'bindDn', 'bindPassword', 'searchBase', 'useTls'],
  email: ['host', 'port', 'secure', 'user', 'pass'],
}

/**
 * 将有效业务配置带入托管连接；切换后端时不迁移旧后端字段。
 * @param requirement - 扫描得到的最终有效中间件配置。
 * @param supplied - 自建或云开通生成的实际连接。
 * @returns 完整配置，可能含凭据，不能直接输出到日志。
 * @example 模块内部上下文
 * ```ts
 * const requirement: MiddlewareRequirement = { service: 'storage', backend: 's3', source: 'storage', configName: 'storage', configPath: [], envPrefix: 'HAI_STORAGE', config: { publicEndpoint: 'https://app.example.com/files' } }
 * const storage = mergeManagedMiddlewareConfig(requirement, { type: 's3', endpoint: 'http://storage:9000', bucket: 'hai' })
 * ```
 */
export function mergeManagedMiddlewareConfig(requirement: MiddlewareRequirement | undefined, supplied: Record<string, unknown>): Record<string, unknown> {
  if (!requirement || (requirement.service !== 'ldap' && requirement.backend !== supplied.type))
    return supplied
  const configured = { ...requirement.config }
  for (const field of connectionFields[requirement.service] ?? [])
    delete configured[field]
  const merged = { ...configured, ...supplied }
  // Redis URL 的数据库编号优先于独立 db 字段；保留选项时必须同步真实连接地址。
  if (requirement.service === 'cache' && typeof configured.db === 'number' && typeof supplied.url === 'string') {
    const url = new URL(supplied.url)
    if (configured.db !== 0 || (url.pathname !== '' && url.pathname !== '/')) {
      url.pathname = String(configured.db)
      merged.url = url.toString()
    }
  }
  return merged
}
