/**
 * =============================================================================
 * Corporate Website - 应用初始化
 * =============================================================================
 *
 * 初始化顺序：
 * 1. core.init — 加载配置文件
 * 2. db.init — 数据库连接（合作登记）
 * 3. cache.init — 缓存初始化（会话与查询缓存）
 * 4. storage.init — 本地归档（可选）
 * 5. ai.init — AI 助手（可选，配置不存在或 API Key 为空时跳过）
 * 6. reach.init — 触达服务（可选，用于联系表单邮件）
 */

import type { AIConfigInput } from '@h-ai/ai'
import type { CacheConfigInput } from '@h-ai/cache'
import type { StorageConfigInput } from '@h-ai/storage'
import { ai } from '@h-ai/ai'
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { db, DbConfigSchema } from '@h-ai/db'
import { storage, StorageConfigSchema } from '@h-ai/storage'
import { ensurePartnerTables, PartnerAdminConfigSchema } from './partner-service.js'

type DbConfigInput = Parameters<typeof db.init>[0]

let initialized = false

export async function initApp(): Promise<void> {
  if (initialized)
    return

  // 1. 加载配置
  core.init({
    configDir: './config',
    logging: { level: 'info' },
  })

  const dbValidation = core.config.validate('db', DbConfigSchema)
  if (!dbValidation.success) {
    throw new Error(`DB config invalid: ${dbValidation.error.message}`)
  }

  const cacheValidation = core.config.validate('cache', CacheConfigSchema)
  if (!cacheValidation.success) {
    throw new Error(`Cache config invalid: ${cacheValidation.error.message}`)
  }

  const partnerValidation = core.config.validate('partner', PartnerAdminConfigSchema)
  if (!partnerValidation.success) {
    throw new Error(`Partner config invalid: ${partnerValidation.error.message}`)
  }

  const dbConfig = core.config.getOrThrow<DbConfigInput>('db')
  const cacheConfig = core.config.getOrThrow<CacheConfigInput>('cache')
  const storageConfig = core.config.get<StorageConfigInput>('storage')

  // 2. 确保数据目录存在（SQLite）
  if (dbConfig.type === 'sqlite') {
    const path = await import('node:path')
    const fs = await import('node:fs')
    const dbDir = path.dirname(dbConfig.database)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
  }

  // 3. 初始化数据库
  const dbResult = await db.init(dbConfig)
  if (!dbResult.success) {
    throw new Error(`Database initialization failed: ${dbResult.error.message}`)
  }

  // 4. 初始化缓存
  const cacheResult = await cache.init(cacheConfig)
  if (!cacheResult.success) {
    throw new Error(`Cache initialization failed: ${cacheResult.error.message}`)
  }

  // 5. 初始化存储（可选）
  if (storageConfig) {
    const storageValidation = core.config.validate('storage', StorageConfigSchema)
    if (!storageValidation.success) {
      throw new Error(`Storage config invalid: ${storageValidation.error.message}`)
    }

    const storageResult = await storage.init(storageConfig)
    if (!storageResult.success) {
      core.logger.warn('Storage initialization failed, partner archive unavailable', {
        error: storageResult.error.message,
      })
    }
  }

  // 6. 确保业务表存在
  await ensurePartnerTables()

  // 7. 初始化 AI（可选）
  const aiConfig = core.config.get<AIConfigInput>('ai')
  if (aiConfig?.llm?.apiKey) {
    const aiResult = ai.init(aiConfig)
    if (!aiResult.success) {
      core.logger.warn('AI module initialization failed, assistant features unavailable', {
        error: aiResult.error.message,
      })
    }
  }
  else {
    core.logger.info('AI module skipped: no API key configured')
  }

  // 8. 初始化 Reach（可选）
  const reachConfig = core.config.get('reach')
  if (reachConfig) {
    try {
      const { reach } = await import('@h-ai/reach')
      const reachResult = await reach.init(reachConfig as Parameters<typeof reach.init>[0])
      if (!reachResult.success) {
        core.logger.warn('Reach module initialization failed, contact form email unavailable', {
          error: reachResult.error.message,
        })
      }
    }
    catch (error) {
      core.logger.warn('Reach module unavailable, skip contact delivery initialization', { error })
    }
  }

  initialized = true
  core.logger.info('Corporate Website initialized.')
}
