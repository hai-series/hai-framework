import { core } from '@h-ai/core'
import { ReldbConfigSchema } from '@h-ai/reldb'

// 仅在 Node.js 启动阶段调用。core.init 同步加载配置，不提供 close。
export function loadDatabaseConfig(configDir: string) {
  core.init({ configDir })
  // 加载失败会记录日志；必需配置仍须校验，不能仅凭 init 已返回就继续启动。
  const configured = core.config.validate('db', ReldbConfigSchema)
  if (!configured.success)
    return configured
  core.logger.info('Database configuration validated', { type: configured.data.type })
  return configured
}
