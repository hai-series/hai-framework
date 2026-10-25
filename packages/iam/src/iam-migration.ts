/** IAM 自己维护持久凭据兼容，不要求业务修改用户表。 */
import type { SchemaMigration } from '@h-ai/reldb'
import { ok } from '@h-ai/core'
import { migrateSchema, reldb, schemaColumns } from '@h-ai/reldb'

const columns = { credential_version: 'VARCHAR(255) NOT NULL DEFAULT \'\'', reset_version: 'VARCHAR(255) NOT NULL DEFAULT \'\'', reset_hash: 'TEXT', reset_expires_at: 'BIGINT', reset_attempts: 'INTEGER NOT NULL DEFAULT 0' }
const steps: SchemaMigration[] = [{
  version: 1,
  name: 'credential-and-reset-versions',
  async needed(sql) {
    const found = await schemaColumns(reldb, 'hai_iam_users', sql)
    return found.success ? ok(found.data.length > 0 && Object.keys(columns).some(name => !found.data.includes(name))) : found
  },
  async apply(sql) {
    const found = await schemaColumns(reldb, 'hai_iam_users', sql)
    if (!found.success)
      return found
    for (const [name, definition] of Object.entries(columns)) {
      if (found.data.includes(name))
        continue
      const added = await sql.execute(`ALTER TABLE hai_iam_users ADD COLUMN ${name} ${definition}`)
      if (!added.success)
        return added
    }
    return ok(undefined)
  },
}]

/**
 * 预检或迁移 IAM 表。升级保留用户和密码；旧版无安全代次的会话需重新登录。
 * @example
 * ```ts
 * import { migrateIam } from '@h-ai/iam'
 * const plan = await migrateIam({ dryRun: true }) // RelDB 已初始化；只读。
 * ```
 */
export function migrateIam(options: { dryRun?: boolean } = {}) {
  return migrateSchema(reldb, 'iam', steps, options)
}
