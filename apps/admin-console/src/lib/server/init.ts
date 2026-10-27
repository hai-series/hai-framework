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
 * 6. 审计模块、IAM 模块（使用 reach 发送验证码和密码重置通知）
 * 7. 可选审计备份任务、业务表创建；关闭时反序排空任务后再关闭审计/存储
 *
 * 配置文件约定：
 * - `config/_core.yml`  → 使用 CoreConfigSchema
 * - `config/_db.yml`    → 使用 ReldbConfigSchema
 * - `config/_cache.yml` → 使用 CacheConfigSchema
 * - `config/_iam.yml`   → 使用 IamConfigSchema
 * - `config/_reach.yml` → 使用 ReachConfigSchema
 * - `config/_storage.yml` → 使用 StorageConfigSchema（可选）
 * - `config/_audit.yml` / `_scheduler.yml` → 审计保留、隐私及可选备份计划
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
import * as m from '$lib/paraglide/messages.js'
import { startAuditJobs } from '$lib/server/audit-jobs.js'
import { initBusinessSettings } from '$lib/server/business-settings.js'
import { seedFeedbackPermissions } from '$lib/server/feedback.js'
import { bootstrapDutyAccount, seedAdminDuties } from '$lib/server/security-roles.js'
import { audit, AuditInitConfigSchema } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { feedback } from '@h-ai/feedback'
import { iam } from '@h-ai/iam'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'
import { storage } from '@h-ai/storage'

type DbConfigInput = Parameters<typeof reldb.init>[0]

/** 依赖顺序由应用声明；并发、回滚和关闭重试由 core 统一处理。 */
let feedbackRetry: ReturnType<typeof setTimeout> | undefined
let feedbackStarting: Promise<void> | undefined
let feedbackClosing = false
let feedbackFailure: string | number | undefined

/** 可选辅助能力独立重试；不能回滚已经就绪的 IAM 与业务模块。 */
function startFeedback(): Promise<void> {
  if (feedbackStarting)
    return feedbackStarting
  feedbackClosing = false
  feedbackStarting = (async () => {
    try {
      const result = await feedback.init({ ...core.config.getOrThrow<FeedbackConfigInput>('feedback'), ...adminBuildMetadata })
      if (!result.success) {
        if (feedbackFailure !== result.error.code)
          core.logger.warn('Optional feedback unavailable; business runtime remains ready', { module: 'feedback', code: result.error.code })
        feedbackFailure = result.error.code
      }
      else {
        feedbackFailure = undefined
        await seedFeedbackPermissions()
      }
    }
    catch {
      if (feedbackFailure !== 'configuration')
        core.logger.warn('Optional feedback configuration unavailable; business runtime remains ready', { module: 'feedback' })
      feedbackFailure = 'configuration'
    }
    if (feedbackFailure && !feedbackClosing) {
      feedbackRetry = setTimeout(() => {
        feedbackRetry = undefined
        void startFeedback()
      }, 30000)
      feedbackRetry.unref()
    }
  })().finally(() => { feedbackStarting = undefined })
  return feedbackStarting
}

async function closeFeedback() {
  feedbackClosing = true
  if (feedbackRetry)
    clearTimeout(feedbackRetry)
  feedbackRetry = undefined
  await feedbackStarting
  return feedback.close()
}

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
  { name: 'audit', start: () => audit.init({ ...AuditInitConfigSchema.parse(core.config.get('audit') ?? {}), storage, reach }), close: () => audit.close() },
  { name: 'iam', start: () => iam.init({ ...core.config.getOrThrow<IamConfigSettingsInput>('iam'), reach }), close: () => iam.close() },
  { name: 'audit-jobs', enabled: () => Boolean(audit.schedulerPlan), start: startAuditJobs, close: () => scheduler.close() },
  { name: 'feedback', enabled: () => Boolean(core.config.get('feedback')), start: startFeedback, close: closeFeedback },
  { name: 'bootstrap', start: async () => {
    const businessSettings = await initBusinessSettings()
    if (!businessSettings.success)
      return businessSettings
    if (feedback.isInitialized)
      await seedFeedbackPermissions()
    const duties = await seedAdminDuties({ admin: m.security_role_system(), audit_admin: m.security_role_audit(), config_admin: m.security_role_config(), business_operator: m.security_role_operator(), user: m.security_role_member() })
    if (!duties.success)
      return duties
    await ensureDefaultAdmin()
    for (const [username, password] of [['audit_admin', process.env.HAI_AUDIT_ADMIN_PASSWORD], ['config_admin', process.env.HAI_CONFIG_ADMIN_PASSWORD], ['business_operator', process.env.HAI_BUSINESS_OPERATOR_PASSWORD]] as const) {
      const created = await bootstrapDutyAccount(username, password)
      if (!created.success)
        return created
    }
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
