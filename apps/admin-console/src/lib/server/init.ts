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
import type { FeedbackConfigInput } from '@h-ai/feedback'
import type { IamConfigSettingsInput } from '@h-ai/iam'
import type { ReachConfigInput } from '@h-ai/reach'
import type { StorageConfigInput } from '@h-ai/storage'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { adminBuildMetadata } from '$lib/build-metadata.js'
import { seedFeedbackPermissions } from '$lib/server/feedback.js'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { feedback } from '@h-ai/feedback'
import { iam } from '@h-ai/iam'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'

type DbConfigInput = Parameters<typeof reldb.init>[0]

/** 依赖顺序由应用声明；并发、回滚和关闭重试由 core 统一处理。 */
const runtime = core.module.createRuntime([
  { name: 'configuration', start: () => {
    core.init({ configDir: './config' })
  }, close: () => {} },
  { name: 'reldb', start: async () => {
    const config = core.config.getOrThrow<DbConfigInput>('db')
    if (config.type === 'sqlite' && config.database !== ':memory:')
      await mkdir(path.dirname(config.database), { recursive: true })
    return reldb.init(config)
  }, close: () => reldb.close() },
  { name: 'cache', start: () => cache.init(core.config.getOrThrow<CacheConfigInput>('cache')), close: () => cache.close() },
  { name: 'crypto', start: () => crypto.init(), close: () => crypto.close() },
  { name: 'storage', enabled: () => Boolean(core.config.get('storage')), start: () => storage.init(core.config.getOrThrow<StorageConfigInput>('storage')), close: () => storage.close() },
  { name: 'reach', enabled: () => Boolean(core.config.get('reach')), start: () => reach.init(core.config.getOrThrow<ReachConfigInput>('reach')), close: () => reach.close() },
  { name: 'iam', start: () => iam.init({ ...core.config.getOrThrow<IamConfigSettingsInput>('iam'), reach }), close: () => iam.close() },
  { name: 'audit', start: () => audit.init({ userTable: 'hai_iam_users' }), close: () => audit.close() },
  { name: 'feedback', enabled: () => Boolean(core.config.get('feedback')), start: () => feedback.init({ ...core.config.getOrThrow<FeedbackConfigInput>('feedback'), ...adminBuildMetadata }), close: () => feedback.close() },
  { name: 'bootstrap', start: async () => {
    if (feedback.isInitialized)
      await seedFeedbackPermissions()
    await ensureDefaultAdmin()
    core.logger.info('Application initialized.')
  }, close: () => {} },
])

/** 初始化真实依赖；失败只公开模块、配置字段路径及错误码。 */
export async function initApp(): Promise<void> {
  const result = await runtime.start()
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
}

/** 关闭失败保留清理义务，宿主可重试。 */
export async function closeApp(): Promise<void> {
  const result = await runtime.close()
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
}

// =============================================================================
// 默认管理员创建
// =============================================================================

/**
 * 检查用户表是否为空，若为空且提供初始密码则创建默认管理员
 *
 * 仅在首次启动（无任何用户）时触发，后续启动跳过。
 */
async function ensureDefaultAdmin(): Promise<void> {
  const usersResult = await iam.user.listUsers({ page: 1, pageSize: 1 })
  if (!usersResult.success) {
    core.logger.warn('Default administrator lookup failed', { error: usersResult.error })
    return
  }

  // 已有用户，跳过
  if (usersResult.data.total > 0) {
    return
  }

  const password = process.env.HAI_ADMIN_DEFAULT_PASSWORD?.trim()
  if (!password) {
    core.logger.warn('Default admin account was not created because HAI_ADMIN_DEFAULT_PASSWORD is not configured')
    return
  }

  // 注册管理员用户
  const registerResult = await iam.user.createUser({
    username: 'admin',
    email: 'admin@localhost',
    password,
  })

  if (!registerResult.success) {
    core.logger.warn('Default administrator creation failed', { error: registerResult.error })
    return
  }

  const adminUser = registerResult.data.user

  // 查找 admin 角色并分配
  const adminRoleResult = await iam.authz.getRoleByCode('admin')
  if (adminRoleResult.success && adminRoleResult.data) {
    await iam.authz.assignRole(adminUser.id, adminRoleResult.data.id)
  }

  const credentialLogContext = {
    username: 'admin',
    email: 'admin@localhost',
    passwordSource: 'HAI_ADMIN_DEFAULT_PASSWORD',
  }

  core.logger.info('Default administrator created', credentialLogContext)
}

/**
 * 检查应用是否已初始化
 */
export function isAppInitialized(): boolean {
  return runtime.isInitialized
}
