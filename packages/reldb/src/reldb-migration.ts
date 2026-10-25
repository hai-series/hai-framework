/** 模块维护自己的迁移；这里只提供跨数据库列检查、版本账本和执行边界。 */
import type { HaiResult } from '@h-ai/core'
import type { DmlOperations, ReldbFunctions } from './reldb-types.js'
import { core, err, HaiCommonError, ok } from '@h-ai/core'

/**
 * 一个可重入的模块升级步骤；只接收代码中固定的 SQL 与表名。
 * @example
 * ```ts
 * import type { SchemaMigration } from '@h-ai/reldb'
 * const steps: SchemaMigration[] = []
 * ```
 */
export interface SchemaMigration {
  version: number
  name: string
  needed: (sql: DmlOperations) => Promise<HaiResult<boolean>>
  apply: (sql: DmlOperations) => Promise<HaiResult<unknown>>
}

/**
 * 只读预检结果；生产升级需先停旧写入并备份数据库与共享缓存。
 * @example
 * ```ts
 * import type { SchemaMigrationPlan } from '@h-ai/reldb'
 * function changes(plan: SchemaMigrationPlan) { return plan.changes }
 * ```
 */
export interface SchemaMigrationPlan {
  module: string
  currentVersion: number
  targetVersion: number
  changes: string[]
  requiresExclusiveAccess: boolean
}

/**
 * 查询真实列名；不创建表，不把查询错误当成新安装。
 * @example
 * ```ts
 * import { reldb, schemaColumns } from '@h-ai/reldb'
 * const columns = await schemaColumns(reldb, 'hai_iam_users')
 * ```
 */
export async function schemaColumns(db: ReldbFunctions, table: string, sql: DmlOperations = db.sql): Promise<HaiResult<string[]>> {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(table))
    return err(HaiCommonError.VALIDATION_ERROR, core.i18n.coreM('core_errorValidation'))
  const type = db.config?.type
  const found = type === 'sqlite'
    ? await sql.query<{ name: string }>(`PRAGMA table_info(${table})`)
    : await sql.query<{ name: string }>(`SELECT column_name AS name FROM information_schema.columns WHERE table_schema=${type === 'mysql' ? 'DATABASE()' : 'current_schema()'} AND table_name=?`, [table])
  return found.success ? ok(found.data.map(row => row.name)) : found
}

/**
 * 预检或执行模块维护的版本迁移。SQLite/PostgreSQL 原子提交；MySQL DDL 隐式提交，步骤须可重入。
 * 失败不记录目标版本；重启重新检查真实结构。新版本账本拒绝旧代码向下迁移。
 * @example
 * ```ts
 * import { reldb, migrateSchema } from '@h-ai/reldb'
 * const plan = await migrateSchema(reldb, 'example', [], { dryRun: true })
 * ```
 */
export async function migrateSchema(db: ReldbFunctions, module: string, steps: readonly SchemaMigration[], options: { dryRun?: boolean } = {}): Promise<HaiResult<SchemaMigrationPlan>> {
  if (!db.isInitialized || !/^[a-z][a-z0-9-]{0,62}$/.test(module) || steps.some((step, index) => step.version !== index + 1))
    return err(HaiCommonError.VALIDATION_ERROR, core.i18n.coreM('core_errorValidation'))
  const table = 'hai_schema_migrations'
  const targetVersion = steps.length
  const failed = () => err({ ...HaiCommonError.INIT_FAILED, message: core.i18n.coreM('core_runtimeStartFailed', { params: { module } }), ext: { module, phase: 'migration' } })
  async function inspect(sql: DmlOperations): Promise<HaiResult<SchemaMigrationPlan>> {
    const columns = await schemaColumns(db, table, sql)
    if (!columns.success)
      return failed()
    const row = columns.data.length ? await sql.get<{ version: number }>(`SELECT version FROM ${table} WHERE module=?`, [module]) : ok(null)
    if (!row.success)
      return failed()
    const currentVersion = Number(row.data?.version ?? 0)
    if (currentVersion > targetVersion)
      return failed()
    const changes: string[] = []
    for (const step of steps) {
      const needed = await step.needed(sql)
      if (!needed.success)
        return failed()
      if (needed.data)
        changes.push(step.name)
    }
    return ok({ module, currentVersion, targetVersion, changes, requiresExclusiveAccess: changes.length > 0 })
  }
  if (options.dryRun)
    return inspect(db.sql)
  const created = await db.sql.execute(`CREATE TABLE IF NOT EXISTS ${table} (module VARCHAR(64) PRIMARY KEY, version INTEGER NOT NULL)`)
  if (!created.success)
    return failed()
  const seeded = await db.sql.execute(db.config?.type === 'mysql'
    ? `INSERT IGNORE INTO ${table}(module,version) VALUES (?,0)`
    : `INSERT INTO ${table}(module,version) VALUES (?,0) ON CONFLICT(module) DO NOTHING`, [module])
  if (!seeded.success)
    return failed()
  const started = await db.tx.begin()
  if (!started.success)
    return failed()
  const tx = started.data
  let mysqlLock = false
  let committed = false
  try {
    // MySQL DDL 会释放事务行锁，使用同一连接的命名锁覆盖整次升级。
    if (db.config?.type === 'mysql') {
      const lock = await tx.get<{ acquired: number }>('SELECT GET_LOCK(?,30) AS acquired', [`hai-schema:${module}`])
      if (!lock.success || Number(lock.data?.acquired) !== 1)
        return failed()
      mysqlLock = true
    }
    const locked = await tx.execute(`UPDATE ${table} SET version=version WHERE module=?`, [module])
    if (!locked.success)
      return failed()
    const plan = await inspect(tx)
    if (!plan.success)
      return plan
    for (const step of steps) {
      const needed = await step.needed(tx)
      if (!needed.success)
        return failed()
      if (needed.data) {
        const applied = await step.apply(tx)
        if (!applied.success)
          return failed()
        const remaining = await step.needed(tx)
        if (!remaining.success || remaining.data)
          return failed()
      }
    }
    const recorded = await tx.execute(`UPDATE ${table} SET version=? WHERE module=?`, [targetVersion, module])
    if (!recorded.success)
      return failed()
    if (mysqlLock) {
      await tx.get('SELECT RELEASE_LOCK(?)', [`hai-schema:${module}`])
      mysqlLock = false
    }
    const result = await tx.commit()
    committed = result.success
    return result.success ? plan : failed()
  }
  catch {
    return failed()
  }
  finally {
    if (mysqlLock)
      await tx.get('SELECT RELEASE_LOCK(?)', [`hai-schema:${module}`])
    // 已提交时 rollback 为无操作；失败时释放事务与连接。
    if (!committed)
      await tx.rollback()
  }
}
