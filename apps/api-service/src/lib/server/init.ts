/**
 * =============================================================================
 * API Service - 应用初始化
 * =============================================================================
 *
 * 初始化顺序：
 * 1. core.init — 加载配置文件
 * 2. db.init — 数据库连接
 * 3. cache.init — 缓存初始化
 * 4. 创建业务表
 */

import type { CacheConfigInput } from '@h-ai/cache'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { db } from '@h-ai/db'

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

  const dbConfig = core.config.getOrThrow<DbConfigInput>('db')
  const cacheConfig = core.config.getOrThrow<CacheConfigInput>('cache')

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

  // 5. 创建业务表
  await ensureTables()

  initialized = true
  core.logger.info('API Service initialized.')
}

async function ensureTables(): Promise<void> {
  await db.ddl.createTable('items', {
    id: { type: 'TEXT', primaryKey: true },
    name: { type: 'TEXT', notNull: true },
    description: { type: 'TEXT', defaultValue: '' },
    status: { type: 'TEXT', defaultValue: 'active' },
    created_at: { type: 'TEXT', notNull: true },
    updated_at: { type: 'TEXT', notNull: true },
  })
}
