import type { DmlOperations } from '@h-ai/reldb'
import type { LdapConfig } from '../../iam-config.js'
import { err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { z } from 'zod'
import { LdapConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'

const table = 'hai_iam_ldap_identities'
const entryUuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/iu
const objectGuid = /^[a-f\d]{32}$/iu
const manifestSchema = z.strictObject({
  directoryId: LdapConfigSchema.shape.directoryId.unwrap(),
  identityAttribute: LdapConfigSchema.shape.identityAttribute,
  bindings: z.array(z.strictObject({
    entryId: z.string().max(36),
    userId: z.string().min(1).max(255),
  })).min(1).max(10_000),
})

/**
 * 把 OpenLDAP UUID 或 AD 的 16 字节十六进制值规范化为数据库标识，无效格式返回 undefined。
 * @example 模块内部上下文
 * ```ts
 * const entry = ldapEntryId('entryUUID', '550e8400-e29b-41d4-a716-446655440000')
 * ```
 */
export function ldapEntryId(attribute: LdapConfig['identityAttribute'], value: string | undefined) {
  const valid = attribute === 'entryUUID'
    ? entryUuid
    : objectGuid
  return value && valid.test(value)
    ? value.toLowerCase()
    : undefined
}

/**
 * 在用户表已就绪的共享数据库上准备 LDAP 身份约束。重复调用共用数据库的 Schema 准备协调。
 * @example 模块内部上下文
 * ```ts
 * const prepared = await prepareLdapIdentities()
 * if (!prepared.success) throw new Error(prepared.error.message)
 * ```
 */
export function prepareLdapIdentities() {
  return reldb.prepareSchema('hai:iam:ldap-identities:schema', async ({ ddl }) => {
    // MySQL 的 CREATE INDEX 不支持 IF NOT EXISTS。表内声明唯一约束，使多节点准备同一张表保持幂等。
    if (reldb.config?.type === 'mysql') {
      const result = await ddl.raw(`CREATE TABLE IF NOT EXISTS ${table} (
        directory_id VARCHAR(255) NOT NULL,
        entry_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        UNIQUE KEY idx_ldap_identity_entry (directory_id, entry_id),
        UNIQUE KEY idx_ldap_identity_user (directory_id, user_id),
        FOREIGN KEY (user_id) REFERENCES hai_iam_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
      return result.success
        ? ok(undefined)
        : result
    }
    const created = await ddl.createTable(table, {
      directory_id: { type: 'TEXT', notNull: true },
      entry_id: { type: 'TEXT', notNull: true },
      user_id: {
        type: 'TEXT',
        notNull: true,
        references: { table: 'hai_iam_users', column: 'id', onDelete: 'CASCADE' },
      },
    })
    if (!created.success)
      return created
    const entries = await ddl.createIndex(table, 'idx_ldap_identity_entry', {
      columns: ['directory_id', 'entry_id'],
      unique: true,
    })
    if (!entries.success)
      return entries
    const users = await ddl.createIndex(table, 'idx_ldap_identity_user', {
      columns: ['directory_id', 'user_id'],
      unique: true,
    })
    return users.success
      ? ok(undefined)
      : users
  })
}

/**
 * 在指定目录命名空间内读取已绑定的本地用户 ID。找不到绑定时返回 ok(null)。
 * @example 模块内部上下文
 * ```ts
 * const binding = await getLdapUserId('staff', '550e8400-e29b-41d4-a716-446655440000')
 * if (!binding.success) throw new Error(binding.error.message)
 * ```
 */
export async function getLdapUserId(directoryId: string, entryId: string, sql = reldb.sql) {
  const result = await sql.get<{ user_id: string }>(
    `SELECT user_id FROM ${table} WHERE directory_id = ? AND entry_id = ?`,
    [directoryId, entryId],
  )
  return result.success
    ? ok(result.data?.user_id ?? null)
    : err(HaiIamError.REPOSITORY_ERROR, iamM('iam_ldapRepositoryFailed'), result.error)
}

/**
 * 在调用方事务中保存已核验的条目与用户绑定。目录内的唯一约束拦截并发冲突。
 * @example 模块内部上下文
 * ```ts
 * function bind(transaction: DmlOperations, userId: string) {
 *   return insertLdapIdentity('staff', '550e8400-e29b-41d4-a716-446655440000', userId, transaction)
 * }
 * ```
 */
export function insertLdapIdentity(directoryId: string, entryId: string, userId: string, sql: DmlOperations) {
  return sql.execute(`INSERT INTO ${table} (directory_id, entry_id, user_id) VALUES (?, ?, ?)`, [directoryId, entryId, userId])
}

/**
 * 离线导入经过独立核验的身份清单。预检只读，写入时在一个事务内再次检查。
 * @example 模块内部上下文
 * ```ts
 * const preview = await migrateLdapIdentities({
 *   directoryId: 'staff',
 *   identityAttribute: 'entryUUID',
 *   bindings: [{ entryId: '550e8400-e29b-41d4-a716-446655440000', userId: 'verified-user-id' }],
 * }, false)
 * if (!preview.success) throw new Error(preview.error.message)
 * ```
 */
export async function migrateLdapIdentities(input: unknown, apply: boolean) {
  const manifest = manifestSchema.safeParse(input)
  if (!manifest.success)
    return err(HaiIamError.INVALID_ARGUMENT, iamM('iam_ldapManifestInvalid'))
  const { directoryId, identityAttribute, bindings } = manifest.data
  const entries = new Map<string, string>()
  const users = new Set<string>()
  for (const [index, item] of bindings.entries()) {
    const entryId = ldapEntryId(identityAttribute, item.entryId)
    if (!entryId || entries.has(entryId) || users.has(item.userId)) {
      return err(HaiIamError.INVALID_ARGUMENT, iamM('iam_ldapManifestRowInvalid', {
        params: { row: index + 1 },
      }))
    }
    entries.set(entryId, item.userId)
    users.add(item.userId)
  }

  async function inspect(sql: DmlOperations, ready: boolean) {
    const insert = new Map<string, string>()
    let row = 0
    for (const [entryId, userId] of entries) {
      row++
      const user = await sql.get<{ id: string }>('SELECT id FROM hai_iam_users WHERE id = ?', [userId])
      if (!user.success)
        return user
      if (user.data?.id !== userId) {
        return err(HaiIamError.NOT_FOUND, iamM('iam_ldapManifestRowInvalid', {
          params: { row },
        }))
      }
      if (ready) {
        const current = await sql.query<{ entry_id: string, user_id: string }>(
          `SELECT entry_id, user_id FROM ${table} WHERE directory_id = ? AND (entry_id = ? OR user_id = ?)`,
          [directoryId, entryId, userId],
        )
        if (!current.success)
          return current
        if (current.data.length) {
          if (current.data.length !== 1 || current.data[0].entry_id !== entryId || current.data[0].user_id !== userId) {
            return err(HaiIamError.CONFLICT, iamM('iam_ldapManifestRowInvalid', {
              params: { row },
            }))
          }
          continue
        }
      }
      insert.set(entryId, userId)
    }
    return ok(insert)
  }

  if (!apply) {
    const columns = await reldb.schemaColumns(table)
    if (!columns.success)
      return columns
    const preview = await inspect(reldb.sql, columns.data.length > 0)
    return preview.success
      ? ok({ apply, newBindings: preview.data.size, existingBindings: entries.size - preview.data.size })
      : preview
  }

  const ready = await prepareLdapIdentities()
  if (!ready.success)
    return ready
  const started = await reldb.tx.begin()
  if (!started.success)
    return started
  const tx = started.data
  let committed = false
  try {
    const result = await inspect(tx, true)
    if (!result.success)
      return result
    for (const [entryId, userId] of result.data) {
      const written = await insertLdapIdentity(directoryId, entryId, userId, tx)
      if (!written.success)
        return written
    }
    const ended = await tx.commit()
    committed = ended.success
    return ended.success
      ? ok({ apply, newBindings: result.data.size, existingBindings: entries.size - result.data.size })
      : ended
  }
  finally {
    if (!committed)
      await tx.rollback()
  }
}
