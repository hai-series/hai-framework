/** 查询和准备各数据库的表结构。 */

import type { HaiResult } from '@h-ai/core'
import type { ReldbProvider } from './providers/reldb-provider-types.js'
import type { DmlOperations, ReldbFunctions } from './reldb-types.js'
import { core, HaiCommonError } from '@h-ai/core'
import { reldbM } from './reldb-i18n.js'
import { HaiReldbError } from './reldb-types.js'

/**
 * 查询真实列名；不创建表，不把查询错误当成新安装。
 * @example
 * ```ts
 * import { reldb } from '@h-ai/reldb'
 * const columns = await reldb.schemaColumns('hai_iam_users')
 * ```
 */
export async function schemaColumns(db: ReldbFunctions, table: string, sql: DmlOperations = db.sql): Promise<HaiResult<string[]>> {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(table))
    return core.err(HaiCommonError.VALIDATION_ERROR, core.i18n.coreM('core_errorValidation'))
  const type = db.config?.type
  const found = type === 'sqlite'
    ? await sql.query<{ name: string }>(`PRAGMA table_info(${table})`)
    : await sql.query<{ name: string }>(`SELECT column_name AS name FROM information_schema.columns WHERE table_schema=${type === 'mysql'
        ? 'DATABASE()'
        : 'current_schema()'} AND table_name=?`, [table])
  return found.success
    ? core.ok(found.data.map(row => row.name))
    : found
}

/**
 * 在支持锁的后端串行准备 Schema，其余后端沿用当前 DDL 和 SQL 操作。
 * @example 模块内部上下文
 * ```ts
 * function prepareItems(provider: ReldbProvider, prepare: Parameters<ReldbFunctions['prepareSchema']>[1]) {
 *   return prepareProviderSchema(provider, 'app:items', prepare)
 * }
 * ```
 */
export async function prepareProviderSchema<T>(
  provider: ReldbProvider,
  key: string,
  prepare: (db: Pick<ReldbFunctions, 'ddl' | 'sql'>) => Promise<HaiResult<T>>,
): Promise<HaiResult<T>> {
  if (provider.prepareSchema)
    return provider.prepareSchema(key, prepare)
  try {
    return await prepare({ ddl: provider.ddl, sql: provider.sql })
  }
  catch (error) {
    return core.err(HaiReldbError.DDL_FAILED, reldbM('reldb_ddlFailed'), error)
  }
}
