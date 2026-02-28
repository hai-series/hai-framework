/**
 * =============================================================================
 * H5 App - 应用初始化
 * =============================================================================
 *
 * 初始化顺序：
 * 1. core.init — 加载配置文件
 * 2. db.init — 数据库连接
 * 3. cache.init — 缓存初始化
 * 4. iam.init — 身份认证
 * 5. storage.init — 文件存储（可选）
 */

import type { CacheConfigInput } from '@h-ai/cache'
import type { IamConfigSettingsInput } from '@h-ai/iam'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { db } from '@h-ai/db'
import { iam } from '@h-ai/iam'
import { storage } from '@h-ai/storage'

type DbConfigInput = Parameters<typeof db.init>[0]
type StorageConfigInput = Parameters<typeof storage.init>[0]

let initialized = false

export async function initApp(): Promise<void> {
  if (initialized)
    return

  // 1. 加载配置
  core.init({
    configDir: './config',
    logging: { level: 'info' },
  })

  const dbConfig = core.config.getOrThrow<DbConfigInput>('db')
  const cacheConfig = core.config.getOrThrow<CacheConfigInput>('cache')
  const iamConfig = core.config.getOrThrow<IamConfigSettingsInput>('iam')
  const storageConfig = core.config.get<StorageConfigInput>('storage')

  // 2. 确保数据目录存在
  const path = await import('node:path')
  const fs = await import('node:fs')
  const dbDir = path.dirname(dbConfig.database)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
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

  // 5. 初始化 IAM
  const iamResult = await iam.init({ db, cache, ...iamConfig })
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

  initialized = true
  core.logger.info('H5 App initialized.')
}
