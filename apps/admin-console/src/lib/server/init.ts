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
 * 3. 缓存初始化
 * 4. Reach 触达服务初始化
 * 5. IAM 模块（使用 reach 发送验证码和密码重置通知）
 * 6. 业务表创建
 *
 * 配置文件约定：
 * - `config/_core.yml`  → 使用 CoreConfigSchema
 * - `config/_db.yml`    → 使用 DbConfigSchema
 * - `config/_cache.yml` → 使用 CacheConfigSchema
 * - `config/_iam.yml`   → 使用 IamConfigSchema
 * - `config/_reach.yml` → 使用 ReachConfigSchema
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

import type { CacheConfigInput } from '@h-ai/cache'
import type { IamConfigSettingsInput } from '@h-ai/iam'
import type { ReachConfigInput } from '@h-ai/reach'
import * as m from '$lib/paraglide/messages.js'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { db } from '@h-ai/db'
import { iam } from '@h-ai/iam'
import { reach } from '@h-ai/reach'

type DbConfigInput = Parameters<typeof db.init>[0]

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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
        throw new Error(m.server_init_db_failed({ message: result.error.message }))
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
 * 3. 初始化缓存
 * 4. 初始化 Reach 触达服务
 * 5. 初始化 IAM 模块（使用 reach 发送通知）
 * 6. 创建业务表
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
  const iamConfig = core.config.getOrThrow<IamConfigSettingsInput>('iam')
  const reachConfig = core.config.get<ReachConfigInput>('reach')

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
    throw new Error(m.server_init_db_failed({ message: dbResult.error.message }))
  }

  // 5. 初始化缓存
  const cacheResult = await cache.init(cacheConfig)
  if (!cacheResult.success) {
    throw new Error(m.server_init_cache_failed({ message: cacheResult.error.message }))
  }

  // 6. 初始化 Reach 触达服务（可选，配置不存在时跳过）
  if (reachConfig) {
    const reachResult = await reach.init(reachConfig)
    if (!reachResult.success) {
      core.logger.warn('Reach module initialization failed, notification features will be unavailable', {
        error: reachResult.error.message,
      })
    }
  }

  // 7. 初始化 IAM 模块（使用 reach 发送密码重置和 OTP 通知）
  const iamResult = await iam.init({
    db,
    cache,
    ...iamConfig,
    onPasswordResetRequest: reach.isInitialized
      ? async (user, token, expiresAt) => {
        const result = await reach.send({
          provider: 'email',
          to: user.email ?? '',
          template: 'password_reset',
          vars: { token, expiresAt: expiresAt.toISOString() },
        })
        if (!result.success) {
          core.logger.warn('Failed to send password reset email', { to: user.email, error: result.error.message })
        }
      }
      : undefined,
    onOtpSendEmail: reach.isInitialized
      ? async (email, code) => {
        const result = await reach.send({
          provider: 'email',
          to: email,
          template: 'otp_email',
          vars: { code },
        })
        if (!result.success) {
          core.logger.warn('Failed to send OTP email', { to: email, error: result.error.message })
        }
      }
      : undefined,
    onOtpSendSms: reach.isInitialized
      ? async (phone, code) => {
        const result = await reach.send({
          provider: 'sms',
          to: phone,
          template: 'otp_sms',
          vars: { code },
        })
        if (!result.success) {
          core.logger.warn('Failed to send OTP SMS', { to: phone, error: result.error.message })
        }
      }
      : undefined,
  })
  if (!iamResult.success) {
    const cause = iamResult.error.cause
    const causeMsg = cause instanceof Error ? cause.message : String(cause)
    const baseMessage = m.server_init_iam_failed({ message: iamResult.error.message })
    const fullMessage = cause
      ? m.server_error_with_cause({ message: baseMessage, cause: causeMsg })
      : baseMessage
    throw new Error(fullMessage)
  }

  // 8. 创建业务表
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
    throw new Error(m.server_init_not_initialized())
  }
  return db
}
