/**
 * =============================================================================
 * H5 App - 应用初始化
 * =============================================================================
 *
 * 初始化顺序：
 * 1. core.init — 加载配置文件
 * 2. reldb.init — 数据库连接
 * 3. cache.init — 缓存初始化
 * 4. iam.init — 身份认证
 * 5. storage.init — 文件存储（可选）
 * 6. vecdb.init → ai.init — 配置 API Key 时启用；失败回滚本次资源
 */

import type { AIConfigInput } from '@h-ai/ai'
import type { CacheConfigInput } from '@h-ai/cache'
import type { HaiResult } from '@h-ai/core'
import type { IamConfigSettingsInput } from '@h-ai/iam'
import { ai } from '@h-ai/ai'
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reach, ReachConfigSchema } from '@h-ai/reach'
import { reldb, ReldbConfigSchema } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { vecdb, VecdbConfigSchema } from '@h-ai/vecdb'

type DbConfigInput = Parameters<typeof reldb.init>[0]
type StorageConfigInput = Parameters<typeof storage.init>[0]

let initialized = false

/**
 * 初始化拍照识别记录表
 */
async function ensureVisionTable(): Promise<void> {
  const createResult = await reldb.ddl.createTable('vision_records', {
    id: { type: 'TEXT', primaryKey: true, notNull: true },
    storage_key: { type: 'TEXT', notNull: true },
    file_name: { type: 'TEXT', notNull: true },
    mime_type: { type: 'TEXT', notNull: true },
    prompt: { type: 'TEXT' },
    analysis: { type: 'TEXT', notNull: true },
    tags_json: { type: 'TEXT', notNull: true },
    confidence: { type: 'REAL', notNull: true },
    created_at: { type: 'TEXT', notNull: true },
  })

  if (!createResult.success) {
    throw new Error(`Vision table initialization failed: ${createResult.error.message}`)
  }

  const indexResult = await reldb.ddl.createIndex('vision_records', 'idx_vision_records_created_at', {
    columns: ['created_at'],
  })
  if (!indexResult.success) {
    core.logger.warn('Vision table index initialization failed', {
      error: indexResult.error.message,
    })
  }
}

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
      logging: { level: 'info' },
    })

    // 1.1 配置校验
    const dbValidation = core.config.validate('db', ReldbConfigSchema)
    if (!dbValidation.success) {
      throw new Error(`DB config invalid: ${dbValidation.error.message}`)
    }

    const cacheValidation = core.config.validate('cache', CacheConfigSchema)
    if (!cacheValidation.success) {
      throw new Error(`Cache config invalid: ${cacheValidation.error.message}`)
    }

    const dbConfig = core.config.getOrThrow<DbConfigInput>('db')
    const cacheConfig = core.config.getOrThrow<CacheConfigInput>('cache')
    const iamConfig = core.config.getOrThrow<IamConfigSettingsInput>('iam')
    const storageConfig = core.config.get<StorageConfigInput>('storage')
    const aiConfig = core.config.get<AIConfigInput>('ai')

    // 2. 仅 SQLite 使用本地文件路径。
    if (dbConfig.type === 'sqlite' && dbConfig.database !== ':memory:') {
      const path = await import('node:path')
      const fs = await import('node:fs')
      const dbDir = path.dirname(dbConfig.database)
      fs.mkdirSync(dbDir, { recursive: true })
    }

    // 3. 初始化数据库
    trackOwned(reldb)
    const dbResult = await reldb.init(dbConfig)
    if (!dbResult.success) {
      throw new Error(`Database initialization failed: ${dbResult.error.message}`)
    }

    // 3.1 初始化拍照识别业务表
    await ensureVisionTable()

    // 4. 初始化缓存
    trackOwned(cache)
    const cacheResult = await cache.init(cacheConfig)
    if (!cacheResult.success) {
      throw new Error(`Cache initialization failed: ${cacheResult.error.message}`)
    }

    // 5. 初始化 IAM
    const reachConfig = core.config.get('reach')
    if (reachConfig) {
      trackOwned(reach)
      const result = await reach.init(ReachConfigSchema.parse(reachConfig))
      if (!result.success)
        throw new Error('Reach initialization failed')
    }
    trackOwned(iam)
    const iamResult = await iam.init({ ...iamConfig, reach })
    if (!iamResult.success) {
      throw new Error(`IAM initialization failed: ${iamResult.error.message}`)
    }

    // 6. 初始化存储（可选）
    if (storageConfig) {
      trackOwned(storage)
      const storageResult = await storage.init(storageConfig)
      if (!storageResult.success) {
        core.logger.warn('Storage initialization failed, file upload unavailable', {
          error: storageResult.error.message,
        })
      }
    }

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

    rollback = []
    initialized = true
    core.logger.info('H5 App initialized.')
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
