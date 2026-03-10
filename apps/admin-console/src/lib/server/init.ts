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
 * 4. 存储初始化（可选）
 * 5. Reach 触达服务初始化
 * 6. IAM 模块（使用 reach 发送验证码和密码重置通知）
 * 7. 业务表创建
 *
 * 配置文件约定：
 * - `config/_core.yml`  → 使用 CoreConfigSchema
 * - `config/_db.yml`    → 使用 ReldbConfigSchema
 * - `config/_cache.yml` → 使用 CacheConfigSchema
 * - `config/_iam.yml`   → 使用 IamConfigSchema
 * - `config/_reach.yml` → 使用 ReachConfigSchema
 * - `config/_storage.yml` → 使用 StorageConfigSchema（可选）
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
import type { StorageConfigInput } from '@h-ai/storage'
import { randomBytes } from 'node:crypto'
import process from 'node:process'
import * as m from '$lib/paraglide/messages.js'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'

type DbConfigInput = Parameters<typeof reldb.init>[0]

// =============================================================================
// 状态
// =============================================================================

let initialized = false

// =============================================================================
// 业务表 Schema
// =============================================================================

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
 * 4. 初始化存储（可选）
 * 5. 初始化 Reach 触达服务
 * 6. 初始化 IAM 模块（使用 reach 发送通知）
 * 7. 创建业务表
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
  const storageConfig = core.config.get<StorageConfigInput>('storage')

  // E2E 模式下将默认角色提升为 admin，便于覆盖完整后台能力；非 E2E 不受影响
  const effectiveIamConfig: IamConfigSettingsInput = process.env.HAI_E2E === '1'
    ? {
        ...iamConfig,
        rbac: {
          ...iamConfig.rbac,
          defaultRole: 'admin',
        },
      }
    : iamConfig

  // 3. 确保数据目录存在
  const path = await import('node:path')
  const fs = await import('node:fs')
  const dbDir = path.dirname(dbConfig.database)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // 4. 初始化数据库连接
  const dbResult = await reldb.init(dbConfig)
  if (!dbResult.success) {
    throw new Error(m.server_init_db_failed({ message: dbResult.error.message }))
  }

  // 5. 初始化缓存
  const cacheResult = await cache.init(cacheConfig)
  if (!cacheResult.success) {
    throw new Error(m.server_init_cache_failed({ message: cacheResult.error.message }))
  }

  // 6. 初始化存储（可选，配置不存在时跳过）
  if (storageConfig) {
    const storageResult = await storage.init(storageConfig)
    if (!storageResult.success) {
      core.logger.warn('Storage module initialization failed, file upload features will be unavailable', {
        error: storageResult.error.message,
      })
    }
  }

  // 7. 初始化 Reach 触达服务（可选，配置不存在时跳过）
  if (reachConfig) {
    const reachResult = await reach.init(reachConfig)
    if (!reachResult.success) {
      core.logger.warn('Reach module initialization failed, notification features will be unavailable', {
        error: reachResult.error.message,
      })
    }
  }

  // 8. 初始化 IAM 模块（使用 reach 发送密码重置和 OTP 通知）
  const iamResult = await iam.init({
    db: reldb,
    cache,
    ...effectiveIamConfig,
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

  // 9. 初始化审计日志模块（IAM 用户表为 iam_users）
  const auditResult = await audit.init({ db: reldb, userTable: 'iam_users' })
  if (!auditResult.success) {
    core.logger.warn('Audit module initialization failed', { error: auditResult.error.message })
  }

  // 10. 如果没有任何用户，自动创建默认管理员
  await ensureDefaultAdmin()

  initialized = true
  core.logger.info('Application initialized.')
}

// =============================================================================
// 默认管理员创建
// =============================================================================

/**
 * 检查用户表是否为空，若为空则创建默认管理员并输出密码到控制台
 *
 * 仅在首次启动（无任何用户）时触发，后续启动跳过。
 */
async function ensureDefaultAdmin(): Promise<void> {
  const usersResult = await iam.user.listUsers({ page: 1, pageSize: 1 })
  if (!usersResult.success) {
    core.logger.warn(m.server_init_default_admin_failed({ message: usersResult.error.message }))
    return
  }

  // 已有用户，跳过
  if (usersResult.data.total > 0) {
    return
  }

  // 生成随机密码（16 字节 → 32 位十六进制字符串）
  const password = randomBytes(16).toString('hex')

  // 注册管理员用户
  const registerResult = await iam.user.register({
    username: 'admin',
    email: 'admin@localhost',
    password,
  })

  if (!registerResult.success) {
    core.logger.warn(m.server_init_default_admin_failed({ message: registerResult.error.message }))
    return
  }

  const adminUser = registerResult.data.user

  // 查找 admin 角色并分配
  const adminRoleResult = await iam.authz.getRoleByCode('admin')
  if (adminRoleResult.success && adminRoleResult.data) {
    await iam.authz.assignRole(adminUser.id, adminRoleResult.data.id)
  }

  // 输出到控制台
  core.logger.info(m.server_init_default_admin_created())
  const separator = '='.repeat(60)
  core.logger.info(separator)
  core.logger.info(`  Default admin account created`)
  core.logger.info(`  Username: admin`)
  core.logger.info(`  Password: ${password}`)
  core.logger.info(`  Please login and change the password immediately.`)
  core.logger.info(separator)
}

/**
 * 检查应用是否已初始化
 */
export function isAppInitialized(): boolean {
  return initialized
}
