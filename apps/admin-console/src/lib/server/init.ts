/**
 * =============================================================================
 * Admin Console - 应用初始化
 * =============================================================================
 *
 * 统一管理所有模块的初始化流程。
 *
 * 初始化顺序：
 * 1. core.init 加载配置文件（约定优于配置）
 * 2. 数据库连接
 * 3. 缓存服务
 * 4. IAM 模块
 * 5. 业务表创建
 *
 * 配置文件约定：
 * - `config/_core.yml`  → 使用 CoreConfigSchema
 * - `config/_db.yml`    → 使用 DbConfigSchema
 * - `config/_cache.yml` → 使用 CacheConfigSchema
 * - `config/_iam.yml`   → 使用 IamConfigSchema
 *
 * @example
 * ```ts
 * import { initApp, isAppInitialized } from '$lib/server/init.js'
 *
 * // 在 hooks.server.ts 中调用
 * await initApp()
 * ```
 * =============================================================================
 */

import type { IamConfig } from '@hai/iam'
import { cache } from '@hai/cache'
import { core } from '@hai/core'
import { db } from '@hai/db'
import { iam } from '@hai/iam'
import messagesEnUS from '../../../messages/en-US.json'
import messagesZhCN from '../../../messages/zh-CN.json'

type DbConfigInput = Parameters<typeof db.init>[0]
type CacheConfigInput = Parameters<typeof cache.init>[0]

const getMessage = core.i18n.createMessageGetter({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})

// =============================================================================
// 状态
// =============================================================================

let initialized = false

// =============================================================================
// 业务表 Schema
// =============================================================================

/**
 * Admin Console 业务表 Schema
 * 只包含本应用特有的业务表，不包含 IAM 相关表
 */
const BUSINESS_SCHEMA = `
-- 操作日志表（admin-console 业务表）
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
`

/**
 * 创建业务表
 */
async function createBusinessTables(): Promise<void> {
  const statements = BUSINESS_SCHEMA.split(';').filter(s => s.trim())
  for (const statement of statements) {
    if (statement.trim()) {
      const result = await db.sql.execute(statement)
      if (!result.success) {
        throw new Error(getMessage('server_init_db_failed', { message: result.error.message }))
      }
    }
  }
}

// =============================================================================
// 初始化函数
// =============================================================================

/**
 * 初始化应用
 *
 * 按顺序初始化所有模块：
 * 1. 使用 core.init 加载配置文件（约定优于配置）
 * 2. 初始化数据库连接
 * 3. 初始化缓存服务
 * 4. 初始化 IAM 模块
 * 5. 创建业务表
 */
export async function initApp(): Promise<void> {
  if (initialized)
    return

  // 1. 使用 core.init 加载配置文件（约定优于配置）
  // 内置模块配置文件以 _ 开头，自动匹配对应的 Schema
  core.init({
    configDir: './config',
    logging: { level: 'info' },
  })

  // 2. 获取配置
  const dbConfig = core.config.getOrThrow<DbConfigInput>('db')
  const cacheConfig = core.config.getOrThrow<CacheConfigInput>('cache')
  const iamConfig = core.config.getOrThrow<IamConfig>('iam')

  // 3. 确保数据目录存在
  const path = await import('node:path')
  const fs = await import('node:fs')
  const dbDir = path.dirname(dbConfig.database)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // 4. 初始化数据库连接
  const dbResult = await db.init(dbConfig)
  if (!dbResult.success) {
    throw new Error(getMessage('server_init_db_failed', { message: dbResult.error.message }))
  }

  // 5. 初始化缓存服务
  const cacheResult = await cache.init(cacheConfig)
  if (!cacheResult.success) {
    throw new Error(getMessage('server_init_cache_failed', { message: cacheResult.error.message }))
  }

  // 6. 初始化 IAM 模块
  const iamResult = await iam.init(db, cache, iamConfig)
  if (!iamResult.success) {
    const cause = iamResult.error.cause
    const causeMsg = cause instanceof Error ? cause.message : String(cause)
    const baseMessage = getMessage('server_init_iam_failed', { message: iamResult.error.message })
    const fullMessage = cause
      ? getMessage('server_error_with_cause', { message: baseMessage, cause: causeMsg })
      : baseMessage
    throw new Error(fullMessage)
  }

  // 7. 创建业务表
  await createBusinessTables()

  initialized = true
  core.logger.info('Application initialized.')
}

/**
 * 检查应用是否已初始化
 */
export function isAppInitialized(): boolean {
  return initialized
}

/**
 * 获取数据库实例（用于业务表操作）
 */
export function getDb() {
  if (!initialized) {
    throw new Error(getMessage('server_init_not_initialized'))
  }
  return db
}
