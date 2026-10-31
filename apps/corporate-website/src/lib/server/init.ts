/**
 * =============================================================================
 * Corporate Website - 应用初始化
 * =============================================================================
 *
 * 初始化顺序：
 * 1. core.init — 加载配置文件
 * 2. reldb.init — 数据库连接（合作登记）
 * 3. cache.init — 缓存初始化（会话与查询缓存）
 * 4. storage.init — 本地归档（可选）
 * 5. vecdb.init → ai.init — 配置 API Key 时启用；失败回滚本次资源
 * 6. reach.init — 触达服务（可选，用于联系表单邮件）
 */

import type { AIConfigInput } from '@h-ai/ai'
import type { CacheConfigInput } from '@h-ai/cache'
import type { HaiResult } from '@h-ai/core'
import type { StorageConfigInput } from '@h-ai/storage'
import { ai, AIConfigSchema } from '@h-ai/ai'
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb, ReldbConfigSchema } from '@h-ai/reldb'
import { storage, StorageConfigSchema } from '@h-ai/storage'
import { vecdb, VecdbConfigSchema } from '@h-ai/vecdb'
import { ensurePartnerTables, PartnerAdminConfigSchema } from './partner-service.js'

type DbConfigInput = Parameters<typeof reldb.init>[0]

let initialized = false

/** 本次启动创建的资源；关闭失败时保留义务，下次启动先重试。 */
let rollback: Array<() => Promise<HaiResult<void> | void>> = []

/** 只登记本次取得所有权的模块，失败回滚不关闭调用方已有实例。 */
function trackOwned(module: { readonly isInitialized: boolean, close: () => Promise<HaiResult<void> | void> }): void {
  if (!module.isInitialized)
    rollback.push(() => module.close())
}

/** 逆序回滚；继续关闭其他资源，保留所有失败与未完成的关闭义务。 */
async function rollbackStartup(): Promise<void> {
  const failed: typeof rollback = []
  const errors: unknown[] = []
  for (const close of [...rollback].reverse()) {
    try {
      const result = await close()
      if (result && !result.success)
        throw new Error(result.error.message, { cause: result.error })
    }
    catch (error) {
      failed.push(close)
      errors.push(error)
    }
  }
  rollback = failed.reverse()
  if (errors.length > 0)
    throw new AggregateError(errors, 'Application startup cleanup failed; retry is required')
}

/**
 * 按依赖顺序初始化应用；启用 AI 时向量库或 AI 失败均中止启动并逆序回滚。
 * @example `await initApp()`
 */
export async function initApp(): Promise<void> {
  if (initialized)
    return

  await rollbackStartup()
  try {
    // 1. 加载配置
    core.init({
      configDir: './config',
      configSchemas: { ai: AIConfigSchema, cache: CacheConfigSchema, db: ReldbConfigSchema, storage: StorageConfigSchema, vecdb: VecdbConfigSchema },
      logging: { level: 'info' },
    })

    const dbValidation = core.config.validate('db', ReldbConfigSchema)
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
    const aiConfig = core.config.get<AIConfigInput>('ai')

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
    trackOwned(reldb)
    const dbResult = await reldb.init(dbConfig)
    if (!dbResult.success) {
      throw new Error(`Database initialization failed: ${dbResult.error.message}`)
    }

    // 4. 初始化缓存
    trackOwned(cache)
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

      trackOwned(storage)
      const storageResult = await storage.init(storageConfig)
      if (!storageResult.success)
        throw new Error(`Storage initialization failed: ${storageResult.error.message}`)
    }

    // 6. 确保业务表存在
    await ensurePartnerTables()

    // 7. 未配置 Key 时不启用 AI；启用后共享依赖失败不能静默降级。
    const hasKey = (value: string | null | undefined): boolean => typeof value === 'string' && value.trim().length > 0
    const aiEnabled = hasKey(aiConfig?.llm?.apiKey) || aiConfig?.llm?.models?.some(model => hasKey(model.apiKey))
    if (aiConfig && aiEnabled) {
      const vectorConfig = core.config.validate('vecdb', VecdbConfigSchema)
      if (!vectorConfig.success)
        throw new Error(`Vector config invalid: ${vectorConfig.error.message}`)
      trackOwned(vecdb)
      const vectorResult = await vecdb.init(vectorConfig.data)
      if (!vectorResult.success)
        throw new Error(`Vector initialization failed: ${vectorResult.error.message}`)
      trackOwned(ai)
      const aiResult = await ai.init(aiConfig)
      if (!aiResult.success)
        throw new Error(`AI initialization failed: ${aiResult.error.message}`)
    }
    else {
      core.logger.info('AI module skipped: no API key configured')
    }

    // 8. 初始化 Reach（可选）
    const reachConfig = core.config.get('reach')
    if (reachConfig) {
      try {
        const { reach } = await import('@h-ai/reach')
        trackOwned(reach)
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

    rollback = []
    initialized = true
    core.logger.info('Corporate Website initialized.')
  }
  catch (error) {
    try {
      await rollbackStartup()
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Application startup and cleanup failed')
    }
    throw error
  }
}
