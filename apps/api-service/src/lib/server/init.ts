/**
 * =============================================================================
 * API Service - 应用初始化
 * =============================================================================
 *
 * 初始化顺序：
 * 1. core.init — 加载配置文件
 * 2. serv.validate — 决定 HTTP / transport 入口行为
 * 3. crypto.init（可选）— 当 `_serv.yml.transport` 启用时初始化加解密能力
 * 4. reldb.init — 数据库连接
 * 5. cache.init — 缓存初始化
 * 6. vecdb.init — 向量数据库
 * 7. iam.init — 身份与权限
 * 8. storage.init — 对象存储
 * 9. ai.init — AI 模块（含 A2A 配置）
 * 10. ai.a2a.registerExecutor — 注册 A2A 执行器
 *
 * 关闭顺序与初始化反向，保证依赖完整释放。
 */

import type { AIConfigInput } from '@h-ai/ai'
import type { CacheConfigInput } from '@h-ai/cache'
import type { IamConfigInput } from '@h-ai/iam'
import type { ServConfig } from '@h-ai/serv'
import type { StorageConfigInput } from '@h-ai/storage'
import { ai, AIConfigSchema } from '@h-ai/ai'
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { iam, IamConfigSchema } from '@h-ai/iam'
import { reach, ReachConfigSchema } from '@h-ai/reach'
import { reldb, ReldbConfigSchema } from '@h-ai/reldb'
import { ServConfigSchema } from '@h-ai/serv'
import { storage, StorageConfigSchema } from '@h-ai/storage'
import { vecdb, VecdbConfigSchema } from '@h-ai/vecdb'
import { echoExecutor } from './a2a-agent.js'

type DbConfigInput = Parameters<typeof reldb.init>[0]
type VecdbConfigInput = Parameters<typeof vecdb.init>[0]

let initialized = false
// 防止并发 init() 调用导致重复初始化：在途的 Promise 复用同一个结果。
let initPromise: Promise<void> | null = null
/** 记录启动/关闭后未确认释放的资源，使失败清理可以重试。 */
let cleanupPending = false
let closePromise: Promise<void> | null = null
let cryptoInitialized = false

/**
 * 合并并发启动；任一步失败先逆序清理，未释放的资源会在下次启动前重试。
 * @throws Error | AggregateError - 启动失败，或启动与资源清理同时失败。
 * @example
 * await initApp()
 */
export async function initApp(): Promise<void> {
  if (closePromise)
    await closePromise
  if (initialized)
    return
  if (initPromise)
    return initPromise
  if (cleanupPending) {
    await closeApp()
    return await initApp()
  }

  cleanupPending = true
  initPromise = doInit().then(() => {
    initialized = true
    cleanupPending = false
  }).catch(async (error: unknown) => {
    // 私有清理不等待 initPromise，避免启动失败时等待自身。
    try {
      await cleanupModules()
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Application startup and cleanup failed')
    }
    throw error
  }).finally(() => {
    initPromise = null
  })
  return await initPromise
}

async function doInit(): Promise<void> {
  // 1. 加载配置
  core.init({
    configDir: './config',
    configSchemas: { ai: AIConfigSchema, cache: CacheConfigSchema, iam: IamConfigSchema, reach: ReachConfigSchema, db: ReldbConfigSchema, storage: StorageConfigSchema, vecdb: VecdbConfigSchema, serv: ServConfigSchema },
    logging: { level: 'info' },
  })

  const servValidation = core.config.validate('serv', ServConfigSchema)
  if (!servValidation.success) {
    throw new Error(`Serv config invalid: ${servValidation.error.message}`)
  }
  const servConfig = core.config.getOrThrow<ServConfig>('serv')

  // 2. 仅当 `_serv.yml.transport` 启用时初始化 crypto，避免关闭 transport 时做无意义的密钥准备。
  if (servConfig.transport !== false) {
    const cryptoResult = await crypto.init()
    if (!cryptoResult.success) {
      throw new Error(`Crypto initialization failed: ${cryptoResult.error.message}`)
    }
    cryptoInitialized = true
  }

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

  const iamValidation = core.config.validate('iam', IamConfigSchema)
  if (!iamValidation.success) {
    throw new Error(`IAM config invalid: ${iamValidation.error.message}`)
  }

  const storageValidation = core.config.validate('storage', StorageConfigSchema)
  if (!storageValidation.success) {
    throw new Error(`Storage config invalid: ${storageValidation.error.message}`)
  }

  const aiValidation = core.config.validate('ai', AIConfigSchema)
  if (!aiValidation.success) {
    throw new Error(`AI config invalid: ${aiValidation.error.message}`)
  }

  const dbConfig = core.config.getOrThrow<DbConfigInput>('db')
  const cacheConfig = core.config.getOrThrow<CacheConfigInput>('cache')
  const vecdbConfig = core.config.getOrThrow<VecdbConfigInput>('vecdb')
  const iamConfig = core.config.getOrThrow<IamConfigInput>('iam')
  const storageConfig = core.config.getOrThrow<StorageConfigInput>('storage')
  const aiConfig = core.config.getOrThrow<AIConfigInput>('ai')

  // 3. 确保数据目录存在
  if (dbConfig.type === 'sqlite') {
    const path = await import('node:path')
    const fs = await import('node:fs')
    const dbDir = path.dirname(dbConfig.database)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
  }

  // 4. 初始化数据库
  const dbResult = await reldb.init(dbConfig)
  if (!dbResult.success) {
    throw new Error(`Database initialization failed: ${dbResult.error.message}`)
  }

  // 5. 初始化缓存
  const cacheResult = await cache.init(cacheConfig)
  if (!cacheResult.success) {
    throw new Error(`Cache initialization failed: ${cacheResult.error.message}`)
  }

  // 6. 初始化向量数据库
  const vecdbResult = await vecdb.init(vecdbConfig)
  if (!vecdbResult.success) {
    throw new Error(`VecDB initialization failed: ${vecdbResult.error.message}`)
  }

  // 7. 初始化 IAM 模块（依赖 reldb/cache）
  const reachConfig = core.config.get('reach')
  if (reachConfig) {
    const result = await reach.init(ReachConfigSchema.parse(reachConfig))
    if (!result.success)
      throw new Error('Reach initialization failed')
  }
  const iamResult = await iam.init({ ...iamConfig, reach })
  if (!iamResult.success) {
    throw new Error(`IAM initialization failed: ${iamResult.error.message}`)
  }

  // 8. 初始化存储模块
  const storageResult = await storage.init(storageConfig)
  if (!storageResult.success) {
    throw new Error(`Storage initialization failed: ${storageResult.error.message}`)
  }

  // 9. 初始化 AI 模块（读取 _ai.yml 中的 a2a.agentCard 配置）
  const aiResult = await ai.init(aiConfig)
  if (!aiResult.success) {
    throw new Error(`AI initialization failed: ${aiResult.error.message}`)
  }

  // 10. 注册 A2A 执行器（依赖 ai 模块）
  const a2aResult = ai.a2a.registerExecutor(echoExecutor)
  if (!a2aResult.success) {
    core.logger.warn('A2A executor registration failed (a2a config may be missing)', { error: a2aResult.error })
  }

  core.logger.info('API Service initialized.')
}

/**
 * 优雅关闭：按初始化的反向顺序释放各模块资源。
 *
 * - 单个模块关闭失败不会阻断其他模块。
 * - 完成后允许重新 `initApp()`（适合测试场景）。
 * @throws AggregateError - 任一资源未确认释放；再次 closeApp 或 initApp 会先重试清理。
 * @example
 * await closeApp()
 */
export async function closeApp(): Promise<void> {
  closePromise ??= doCloseApp().finally(() => {
    closePromise = null
  })
  return await closePromise
}

/** 等待启动结束后逐一释放；HaiResult 失败与异常都会聚合报告并保留重试入口。 */
async function doCloseApp(): Promise<void> {
  if (!initialized && !initPromise && !cleanupPending)
    return
  // 反向顺序：ai → storage → iam → vecdb → cache → reldb
  if (initPromise)
    await initPromise.catch(() => undefined)
  await cleanupModules()
}

/** 不等待启动屏障，供启动失败与显式关闭共用的逆序清理。 */
async function cleanupModules(): Promise<void> {
  const failures: unknown[] = []
  const closers: Array<readonly [string, () => unknown]> = [
    ['ai', () => ai.close()],
    ['storage', () => storage.close()],
    ['iam', () => iam.close()],
    ['reach', () => reach.close()],
    ['vecdb', () => vecdb.close()],
    ['cache', () => cache.close()],
    ['reldb', () => reldb.close()],
  ]
  if (cryptoInitialized)
    closers.push(['crypto', () => crypto.close()])
  for (const [name, close] of closers) {
    try {
      const result = await close()
      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        failures.push('error' in result ? result.error : new Error('Module close failed'))
        core.logger.warn(`Module close failed: ${name}`)
        continue
      }
      if (name === 'crypto')
        cryptoInitialized = false
    }
    catch (error) {
      failures.push(error)
      core.logger.warn(`Module close failed: ${name}`, { error })
    }
  }
  initialized = false
  cleanupPending = failures.length > 0
  if (cleanupPending)
    throw new AggregateError(failures, 'Application resource cleanup failed; retry closeApp()')
  core.logger.info('API Service closed.')
}
