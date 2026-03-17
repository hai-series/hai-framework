/**
 * =============================================================================
 * API Service - 应用初始化
 * =============================================================================
 *
 * 初始化顺序：
 * 1. core.init — 加载配置文件
 * 2. reldb.init — 数据库连接
 * 3. cache.init — 缓存初始化
 * 4. vecdb.init — 向量数据库
 * 5. ai.init — AI 模块（含 A2A 配置）
 * 6. ai.a2a.registerExecutor — 注册 A2A 执行器
 * 7. 创建业务表
 */

import type { AIConfigInput } from '@h-ai/ai'
import type { CacheConfigInput } from '@h-ai/cache'
import { ai, AIConfigSchema } from '@h-ai/ai'
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb, ReldbConfigSchema } from '@h-ai/reldb'
import { vecdb, VecdbConfigSchema } from '@h-ai/vecdb'
import { echoExecutor } from './a2a-agent.js'

type DbConfigInput = Parameters<typeof reldb.init>[0]
type VecdbConfigInput = Parameters<typeof vecdb.init>[0]

let initialized = false

export async function initApp(): Promise<void> {
  if (initialized)
    return

  // 1. 加载配置
  core.init({
    configDir: './config',
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

  const vecdbValidation = core.config.validate('vecdb', VecdbConfigSchema)
  if (!vecdbValidation.success) {
    throw new Error(`VecDB config invalid: ${vecdbValidation.error.message}`)
  }

  const aiValidation = core.config.validate('ai', AIConfigSchema)
  if (!aiValidation.success) {
    throw new Error(`AI config invalid: ${aiValidation.error.message}`)
  }

  const dbConfig = core.config.getOrThrow<DbConfigInput>('db')
  const cacheConfig = core.config.getOrThrow<CacheConfigInput>('cache')
  const vecdbConfig = core.config.getOrThrow<VecdbConfigInput>('vecdb')
  const aiConfig = core.config.getOrThrow<AIConfigInput>('ai')

  // 2. 确保数据目录存在
  if (dbConfig.type === 'sqlite') {
    const path = await import('node:path')
    const fs = await import('node:fs')
    const dbDir = path.dirname(dbConfig.database)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
  }

  // 3. 初始化数据库
  const dbResult = await reldb.init(dbConfig)
  if (!dbResult.success) {
    throw new Error(`Database initialization failed: ${dbResult.error.message}`)
  }

  // 4. 初始化缓存
  const cacheResult = await cache.init(cacheConfig)
  if (!cacheResult.success) {
    throw new Error(`Cache initialization failed: ${cacheResult.error.message}`)
  }

  // 5. 初始化向量数据库
  const vecdbResult = await vecdb.init(vecdbConfig)
  if (!vecdbResult.success) {
    throw new Error(`VecDB initialization failed: ${vecdbResult.error.message}`)
  }

  // 6. 初始化 AI 模块（读取 _ai.yml 中的 a2a.agentCard 配置）
  const aiResult = await ai.init(aiConfig)
  if (!aiResult.success) {
    throw new Error(`AI initialization failed: ${aiResult.error.message}`)
  }

  // 7. 注册 A2A 执行器
  const a2aResult = ai.a2a.registerExecutor(echoExecutor)
  if (!a2aResult.success) {
    core.logger.warn('A2A executor registration failed (a2a config may be missing)', { error: a2aResult.error })
  }

  // 8. 创建业务表
  await ensureTables()

  initialized = true
  core.logger.info('API Service initialized.')
}

async function ensureTables(): Promise<void> {
  const createResult = await reldb.ddl.createTable('items', {
    id: { type: 'TEXT', primaryKey: true },
    name: { type: 'TEXT', notNull: true },
    description: { type: 'TEXT', defaultValue: '' },
    status: { type: 'TEXT', defaultValue: 'active' },
    created_at: { type: 'TEXT', notNull: true },
    updated_at: { type: 'TEXT', notNull: true },
  })

  if (!createResult.success) {
    throw new Error(`Items table initialization failed: ${createResult.error.message}`)
  }
}
