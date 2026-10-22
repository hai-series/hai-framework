/**
 * @h-ai/reldb — 数据库服务主入口
 *
 * 本文件提供统一的 `reldb` 对象，聚合所有数据库操作功能。
 * @module reldb-main
 */

import type { HaiResult } from '@h-ai/core'
import type { ReldbConfig, ReldbConfigInput } from './reldb-config.js'
import type {
  CrudManager,
  DdlOperations,
  DmlOperations,
  ReldbFunctions,
  ReldbJsonOps,
  ReldbProvider,
  TxManager,
} from './reldb-types.js'

import process from 'node:process'
import { core, err, ok } from '@h-ai/core'

import { createBaseCrudManager } from './providers/reldb-provider-base.js'
import { createMysqlProvider } from './providers/reldb-provider-mysql.js'
import { createPostgresProvider } from './providers/reldb-provider-postgres.js'
import { createSqliteProvider } from './providers/reldb-provider-sqlite.js'

import { ReldbConfigSchema } from './reldb-config.js'
import { reldbM } from './reldb-i18n.js'
import { createJsonOps } from './reldb-json.js'
import { pagination } from './reldb-pagination.js'
import { HaiReldbError } from './reldb-types.js'

const logger = core.logger.child({ module: 'reldb', scope: 'main' })

// ─── 内部状态 ───

/** 当前活跃的数据库 Provider（未初始化时为 null） */
let currentProvider: ReldbProvider | null = null

/** 当前数据库配置（未初始化时为 null） */
let currentConfig: ReldbConfig | null = null

/** 缓存的 JSON 操作实例（dbType 在 init/close 间不变，无需每次 getter 重建） */
let currentJsonOps: ReldbJsonOps | null = null

/** 初始化进行中标记，防止并发调用导致 Provider 泄漏 */
let initInProgress = false

/** 尚未释放的候选/旧 Provider；绝不用于业务操作，清理成功后才能替换。 */
let pendingProvider: ReldbProvider | null = null
/** 初始化完成屏障，供 close 等待候选资源归属确定。 */
let initCompletion: Promise<void> | null = null
/** 合并并发关闭，避免同一连接重复释放。 */
let closingPromise: Promise<HaiResult<void>> | null = null

/** 停止发布资源并重试清理；失败时保留唯一所有权供下一次 close/init 重试。 */
async function closeOwnedProvider(): Promise<HaiResult<void>> {
  if (currentProvider) {
    pendingProvider = currentProvider
    currentProvider = null
  }
  currentConfig = null
  currentJsonOps = null
  if (!pendingProvider)
    return ok(undefined)
  try {
    const result = await pendingProvider.close()
    if (!result.success)
      return err({ ...result.error, ext: { ...result.error.ext, cleanupPending: true } })
    pendingProvider = null
    return ok(undefined)
  }
  catch (error) {
    logger.error('Provider cleanup failed; retaining resource for retry', { error })
    return err({ ...HaiReldbError.CONNECTION_FAILED, message: reldbM('reldb_closeFailed', {
      params: { error: error instanceof Error ? error.message : String(error) },
    }), cause: error, ext: { cleanupPending: true } })
  }
}

/** 初始化失败后释放候选；保留原始错误，并明确指出清理尚未完成。 */
async function failInitialization(result: HaiResult<void>): Promise<HaiResult<void>> {
  const cleanup = await closeOwnedProvider()
  if (result.success)
    return result
  if (cleanup.success) {
    const ext = { ...result.error.ext }
    delete ext.cleanupPending
    delete ext.cleanupError
    return err({ ...result.error, ext: Object.keys(ext).length > 0 ? ext : undefined })
  }
  return err({ ...result.error, ext: { ...result.error.ext, cleanupPending: true, cleanupError: cleanup.error } })
}

// ─── Provider 工厂 ───

/**
 * 根据配置创建对应的数据库 Provider
 *
 * @param config - 数据库配置（已校验、默认值补齐）
 * @returns Provider 实例
 */
function createProvider(config: ReldbConfig): ReldbProvider {
  switch (config.type) {
    case 'sqlite':
      return createSqliteProvider()
    case 'postgresql':
      return createPostgresProvider()
    case 'mysql':
      return createMysqlProvider()
  }
}

// ─── 未初始化时的占位操作 ───

/** 未初始化工具集 */
const notInitialized = core.module.createNotInitializedKit(
  HaiReldbError.NOT_INITIALIZED,
  () => reldbM('reldb_notInitialized'),
)

/** 未初始化时的 DDL 操作占位对象 */
const notInitializedDdl = notInitialized.proxy<DdlOperations>()

/** 未初始化时的 SQL 操作占位对象 */
const notInitializedSql = notInitialized.proxy<DmlOperations>()

/** 未初始化时的 CRUD 管理器 */
const notInitializedCrud: CrudManager = createBaseCrudManager(notInitializedSql)

/** 未初始化时的 JSON 操作构建器（默认使用 SQLite 格式） */
const notInitializedJson: ReldbJsonOps = createJsonOps('sqlite')

/** 未初始化时的事务管理器占位对象 */
const notInitializedTx: TxManager = {
  begin: async () => notInitialized.result(),
  wrap: async () => notInitialized.result(),
}

// ─── 统一数据库服务对象 ───

/**
 * 数据库服务对象
 *
 * 统一的数据库访问入口，提供以下功能：
 * - `reldb.init()` - 初始化数据库连接
 * - `reldb.close()` - 关闭连接
 * - `reldb.ddl` - DDL 操作（表结构管理）
 * - `reldb.sql` - SQL 操作（数据查询和修改）
 * - `reldb.tx` - 事务管理器（begin / wrap）
 * - `reldb.json` - JSON 路径操作 SQL 构建器（提取、设置、插入、删除、合并）
 * - `reldb.config` - 当前配置
 * - `reldb.isInitialized` - 初始化状态
 *
 * @example
 * ```ts
 * import { reldb } from '@h-ai/reldb'
 *
 * // 初始化
 * await reldb.init({ type: 'sqlite', database: ':memory:' })
 *
 * // DDL 操作
 * await reldb.ddl.createTable('users', {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true }
 * })
 *
 * // SQL 操作
 * await reldb.sql.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
 * const users = await reldb.sql.query('SELECT * FROM users')
 *
 * // 事务操作
 * await reldb.tx.wrap(async (tx) => {
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
 *     return 'done'
 * })
 *
 * // 关闭连接
 * await reldb.close()
 * ```
 */
export const reldb: ReldbFunctions = {
  /**
   * 初始化数据库连接
   *
   * @param config - 数据库配置（允许部分字段，内部会补齐默认值）
   * @returns 初始化结果，失败时包含错误信息
   */
  async init(config: ReldbConfigInput): Promise<HaiResult<void>> {
    if (initInProgress || closingPromise) {
      logger.warn('RelDB module init is already in progress, skipping concurrent call')
      return err(HaiReldbError.CONFIG_ERROR, reldbM('reldb_configError', { params: { error: 'init already in progress' } }))
    }

    initInProgress = true
    let resolveInit!: () => void
    initCompletion = new Promise<void>((resolve) => {
      resolveInit = resolve
    })
    try {
      const cleanup = await closeOwnedProvider()
      if (!cleanup.success)
        return cleanup

      logger.info('Initializing RelDB module')

      const parseResult = ReldbConfigSchema.safeParse(config)
      if (!parseResult.success) {
        logger.error('RelDB config validation failed', { error: parseResult.error.message })
        return err(HaiReldbError.CONFIG_ERROR, reldbM('reldb_configError', { params: { error: parseResult.error.message } }), parseResult.error)
      }
      const parsed = parseResult.data
      if (core.module.requiresSharedState(process.env) && (parsed.type === 'sqlite'))
        return err(HaiReldbError.CONFIG_ERROR, reldbM('reldb_sharedBackendRequired'))

      try {
        const provider = createProvider(parsed)
        pendingProvider = provider
        const connectResult = await provider.connect(parsed)
        if (!connectResult.success) {
          logger.error('RelDB module initialization failed', {
            code: connectResult.error.code,
            message: connectResult.error.message,
          })
          return await failInitialization(connectResult)
        }
        pendingProvider = null
        currentProvider = provider
        currentConfig = parsed
        currentJsonOps = createJsonOps(parsed.type)
        logger.info('RelDB module initialized', { type: parsed.type })
        return ok(undefined)
      }
      catch (error) {
        logger.error('RelDB module initialization failed', { error })
        return await failInitialization(err(HaiReldbError.CONNECTION_FAILED, reldbM('reldb_initFailed', { params: { error: error instanceof Error ? error.message : String(error) } }), error))
      }
    }
    finally {
      initInProgress = false
      initCompletion = null
      resolveInit()
    }
  },

  /**
   * 获取 DDL 操作接口
   *
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get ddl(): DdlOperations {
    return currentProvider?.ddl ?? notInitializedDdl
  },

  /**
   * 获取 SQL 操作接口
   *
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get sql(): DmlOperations {
    return currentProvider?.sql ?? notInitializedSql
  },

  /**
   * 获取 CRUD 管理器
   *
   * 通过 `reldb.crud.table(config)` 获取单表 CRUD 仓库。
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get crud() {
    return currentProvider?.crud ?? notInitializedCrud
  },

  /** 事务管理器 */
  get tx(): TxManager {
    return currentProvider?.tx ?? notInitializedTx
  },

  /** 获取当前脱敏后的配置快照（未初始化时为 null） */
  get config(): ReldbConfig | null {
    if (!currentConfig)
      return null
    const snapshot = core.sanitize.sanitizeSensitiveFields(currentConfig)
    // 通用敏感字段匹配不包含普通 key；TLS 客户端私钥必须在配置快照中单独遮蔽。
    if ('ssl' in snapshot && snapshot.ssl && typeof snapshot.ssl === 'object' && 'key' in snapshot.ssl)
      snapshot.ssl.key = core.sanitize.defaultSensitiveReplacement
    return snapshot
  },

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return currentProvider !== null && currentProvider.isConnected()
  },

  /**
   * 获取分页工具
   *
   * 提供 `reldb.pagination.normalize()` 和 `reldb.pagination.build()` 两个纯函数，
   * 用于自定义分页场景（无需数据库连接）。
   */
  get pagination() {
    return pagination
  },

  /**
   * 获取 JSON 路径操作 SQL 构建器
   *
   * 根据当前数据库类型返回对应的 JSON 操作实现。
   * 未初始化时返回 SQLite 格式的构建器作为默认值。
   *
   * 构建器方法均为纯函数，返回 `{ sql, params }` 可直接嵌入 SQL 查询。
   *
   * @example
   * ```ts
   * // 提取 JSON 字段值
   * const { sql, params } = reldb.json.extract('settings', '$.theme')
   * const rows = await reldb.sql.query(
   *   `SELECT * FROM users WHERE ${sql} = ?`,
   *   [...params, '"dark"'],
   * )
   *
   * // 设置 JSON 字段路径
   * const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
   * await reldb.sql.execute(
   *   `UPDATE users SET settings = ${sql} WHERE id = ?`,
   *   [...params, userId],
   * )
   * ```
   */
  get json(): ReldbJsonOps {
    return currentJsonOps ?? notInitializedJson
  },

  /**
   * 关闭数据库连接
   *
   * 等待初始化和在途事务，停止接收新操作；失败时保留资源供 close/init 重试。
   * @returns 所有资源释放成功才返回成功；并发关闭共享同一清理过程。
   * @example
   * const closed = await reldb.close()
   * if (!closed.success) await reldb.close()
   */
  async close(): Promise<HaiResult<void>> {
    if (!closingPromise) {
      closingPromise = (async () => {
        if (initCompletion)
          await initCompletion
        return await closeOwnedProvider()
      })().finally(() => { closingPromise = null })
    }
    return await closingPromise
  },
}
