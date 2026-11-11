/** 读取各数据库实际表结构。 */
import type { HaiResult } from '@h-ai/core'
import type { DmlOperations, ReldbFunctions } from './reldb-types.js'
import { core, err, HaiCommonError, ok } from '@h-ai/core'

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
    return err(HaiCommonError.VALIDATION_ERROR, core.i18n.coreM('core_errorValidation'))
  const type = db.config?.type
  const found = type === 'sqlite'
    ? await sql.query<{ name: string }>(`PRAGMA table_info(${table})`)
    : await sql.query<{ name: string }>(`SELECT column_name AS name FROM information_schema.columns WHERE table_schema=${type === 'mysql'
        ? 'DATABASE()'
        : 'current_schema()'} AND table_name=?`, [table])
  return found.success
    ? ok(found.data.map(row => row.name))
    : found
}
