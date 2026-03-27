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
 */

import type { AIConfigInput } from '@h-ai/ai'
import type { CacheConfigInput } from '@h-ai/cache'
import type { IamConfigSettingsInput } from '@h-ai/iam'
import { ai } from '@h-ai/ai'
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb, ReldbConfigSchema } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'

type DbConfigInput = Parameters<typeof reldb.init>[0]
type StorageConfigInput = Parameters<typeof storage.init>[0]

let initialized = false

interface SqliteTableInfoRow {
  name: string
}

interface ExistsRow {
  exists_value: boolean | number | string | null
}

async function hasVisionUserIdColumn(): Promise<boolean> {
  const dbType = reldb.config?.type ?? 'sqlite'

  if (dbType === 'sqlite') {
    const columnsResult = await reldb.sql.query<SqliteTableInfoRow>(`PRAGMA table_info('vision_records')`)
    if (!columnsResult.success) {
      throw new Error(`Vision table schema inspection failed: ${columnsResult.error.message}`)
    }
    return columnsResult.data.some((column: SqliteTableInfoRow) => column.name === 'user_id')
  }

  if (dbType === 'postgresql') {
    const columnsResult = await reldb.sql.get<ExistsRow>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = ?
           AND column_name = ?
       ) AS exists_value`,
      ['vision_records', 'user_id'],
    )
    if (!columnsResult.success) {
      throw new Error(`Vision table schema inspection failed: ${columnsResult.error.message}`)
    }
    return Boolean(columnsResult.data?.exists_value)
  }

  const columnsResult = await reldb.sql.get<ExistsRow>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = ?
         AND column_name = ?
     ) AS exists_value`,
    ['vision_records', 'user_id'],
  )
  if (!columnsResult.success) {
    throw new Error(`Vision table schema inspection failed: ${columnsResult.error.message}`)
  }
  return Boolean(columnsResult.data?.exists_value)
}

/**
 * 初始化拍照识别记录表
 */
async function ensureVisionTable(): Promise<void> {
  const createResult = await reldb.ddl.createTable('vision_records', {
    id: { type: 'TEXT', primaryKey: true, notNull: true },
    user_id: { type: 'TEXT', notNull: true },
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

  const hasUserId = await hasVisionUserIdColumn()
  if (!hasUserId) {
    const addColumnResult = await reldb.ddl.addColumn('vision_records', 'user_id', { type: 'TEXT' })
    if (!addColumnResult.success) {
      throw new Error(`Vision table owner column initialization failed: ${addColumnResult.error.message}`)
    }
  }

  const ownerIndexResult = await reldb.ddl.createIndex('vision_records', 'idx_vision_records_user_id_created_at', {
    columns: ['user_id', 'created_at'],
  })
  if (!ownerIndexResult.success) {
    core.logger.warn('Vision table owner index initialization failed', {
      error: ownerIndexResult.error.message,
    })
  }
}

export async function initApp(): Promise<void> {
  if (initialized)
    return

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

  // 2. 确保数据目录存在
  const path = await import('node:path')
  const fs = await import('node:fs')
  const dbDir = path.dirname(dbConfig.database)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // 3. 初始化数据库
  const dbResult = await reldb.init(dbConfig)
  if (!dbResult.success) {
    throw new Error(`Database initialization failed: ${dbResult.error.message}`)
  }

  // 3.1 初始化拍照识别业务表
  await ensureVisionTable()

  // 4. 初始化缓存
  const cacheResult = await cache.init(cacheConfig)
  if (!cacheResult.success) {
    throw new Error(`Cache initialization failed: ${cacheResult.error.message}`)
  }

  // 5. 初始化 IAM
  const iamResult = await iam.init(iamConfig)
  if (!iamResult.success) {
    throw new Error(`IAM initialization failed: ${iamResult.error.message}`)
  }

  // 6. 初始化存储（可选）
  if (storageConfig) {
    const storageResult = await storage.init(storageConfig)
    if (!storageResult.success) {
      core.logger.warn('Storage initialization failed, file upload unavailable', {
        error: storageResult.error.message,
      })
    }
  }

  // 7. 初始化 AI（可选）
  const aiResult = await ai.init(aiConfig ?? {})
  if (!aiResult.success) {
    core.logger.warn('AI initialization failed, image recognition unavailable', {
      error: aiResult.error.message,
    })
  }

  initialized = true
  core.logger.info('H5 App initialized.')
}
