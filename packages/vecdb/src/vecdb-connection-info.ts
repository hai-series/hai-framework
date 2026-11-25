import type { VecdbConfig } from './vecdb-config.js'
import type { VecdbConnection } from './vecdb-types.js'

/**
 * 返回同进程集成需要的后端连接信息，保留现有凭据和字段。
 * @example 模块内部上下文
 * ```ts
 * function connectionType(config: VecdbConfig) {
 *   return getConnectionInfo(config).type
 * }
 * ```
 */
export function getConnectionInfo(config: VecdbConfig): VecdbConnection {
  if (config.type === 'qdrant')
    return { type: 'qdrant', url: config.url, apiKey: config.apiKey }
  if (config.type === 'pgvector') {
    return {
      type: 'pgvector',
      connectionString: config.url,
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    }
  }
  if (config.type === 'chroma') {
    return {
      type: 'chroma',
      url: config.url,
      host: config.host,
      port: config.port,
      apiKey: config.apiKey,
      path: config.path,
    }
  }
  return { type: config.type, path: config.path }
}
