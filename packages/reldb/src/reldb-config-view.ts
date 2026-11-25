import type { ReldbConfig } from './reldb-config.js'
import { core } from '@h-ai/core'

/**
 * 返回供诊断查看的配置快照，包含数据库专有 TLS 字段的脱敏。
 * @example 模块内部上下文
 * ```ts
 * function configType(config: ReldbConfig) {
 *   return createConfigView(config).type
 * }
 * ```
 */
export function createConfigView(config: ReldbConfig): ReldbConfig {
  const snapshot = core.sanitize.sanitizeSensitiveFields(config)
  // 通用敏感字段匹配不包含普通 key；TLS 客户端私钥必须在配置快照中单独遮蔽。
  if ('ssl' in snapshot && snapshot.ssl && typeof snapshot.ssl === 'object' && 'key' in snapshot.ssl)
    snapshot.ssl.key = core.sanitize.defaultSensitiveReplacement
  return snapshot
}
