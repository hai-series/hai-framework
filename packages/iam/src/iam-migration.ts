/** IAM 自己维护持久凭据兼容，不要求业务修改用户表。 */
import type { SchemaMigration } from '@h-ai/reldb'
import { ok } from '@h-ai/core'
import { migrateSchema, reldb, schemaColumns } from '@h-ai/reldb'

const columns = { credential_version: 'VARCHAR(255) NOT NULL DEFAULT \'\'', reset_version: 'VARCHAR(255) NOT NULL DEFAULT \'\'', reset_hash: 'TEXT', reset_expires_at: 'BIGINT', reset_attempts: 'INTEGER NOT NULL DEFAULT 0' }
const accountColumns = { account_type: 'VARCHAR(16) NOT NULL DEFAULT \'permanent\'', account_status: 'VARCHAR(16) NOT NULL DEFAULT \'active\'', account_expires_at: 'TIMESTAMP', last_login_at: 'TIMESTAMP' }
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
}, {
  version: 2,
  name: 'account-lifecycle',
  async needed(sql) {
    const found = await schemaColumns(reldb, 'hai_iam_users', sql)
    return found.success ? ok(found.data.length > 0 && Object.keys(accountColumns).some(name => !found.data.includes(name))) : found
  },
  async apply(sql) {
    const found = await schemaColumns(reldb, 'hai_iam_users', sql)
    if (!found.success)
      return found
    for (const [name, definition] of Object.entries(accountColumns)) {
      if (found.data.includes(name))
        continue
      const added = await sql.execute(`ALTER TABLE hai_iam_users ADD COLUMN ${name} ${definition}`)
      if (!added.success)
        return added
    }
    return ok(undefined)
  },
}, {
  version: 3,
  name: 'initial-password-state',
  async needed(sql) {
    const found = await schemaColumns(reldb, 'hai_iam_users', sql)
    return found.success ? ok(found.data.length > 0 && !found.data.includes('must_change_password')) : found
  },
  async apply(sql) {
    const added = await sql.execute('ALTER TABLE hai_iam_users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE')
    return added.success ? ok(undefined) : added
  },
}, {
  version: 4,
  name: 'login-failure-window',
  async needed(sql) {
    const found = await schemaColumns(reldb, 'hai_iam_users', sql)
    return found.success ? ok(found.data.length > 0 && !found.data.includes('first_login_failed_at')) : found
  },
  async apply(sql) {
    const added = await sql.execute('ALTER TABLE hai_iam_users ADD COLUMN first_login_failed_at TIMESTAMP')
    return added.success ? ok(undefined) : added
  },
}, {
  version: 5,
  name: 'permission-sensitive-operations',
  async needed(sql) {
    const found = await schemaColumns(reldb, 'hai_iam_permissions', sql)
    return found.success ? ok(found.data.length > 0 && !found.data.includes('sensitive_operations')) : found
  },
  async apply(sql) {
    const added = await sql.execute('ALTER TABLE hai_iam_permissions ADD COLUMN sensitive_operations JSON')
    return added.success ? ok(undefined) : added
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
