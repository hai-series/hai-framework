import { ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

/** 保留旧识图记录，只补可空所有者列；未知归属不自动分配给任何用户。 */
export async function ensureVisionTable(): Promise<void> {
  const created = await reldb.ddl.createTable('vision_records', {
    id: { type: 'TEXT', primaryKey: true, notNull: true },
    user_id: { type: 'TEXT' },
    storage_key: { type: 'TEXT', notNull: true },
    file_name: { type: 'TEXT', notNull: true },
    mime_type: { type: 'TEXT', notNull: true },
    prompt: { type: 'TEXT' },
    analysis: { type: 'TEXT', notNull: true },
    tags_json: { type: 'TEXT', notNull: true },
    confidence: { type: 'REAL', notNull: true },
    created_at: { type: 'TEXT', notNull: true },
  })
  if (!created.success)
    throw new Error(`Vision table initialization failed: ${created.error.message}`)
  const migrated = await reldb.migrateSchema('h5-vision', [
    {
      version: 1,
      name: 'bind-record-owner',
      needed: async (sql) => {
        const columns = await reldb.schemaColumns('vision_records', sql)
        return columns.success
          ? ok(!columns.data.includes('user_id'))
          : columns
      },
      apply: sql => sql.execute(`ALTER TABLE vision_records ADD COLUMN user_id ${reldb.config?.type === 'mysql'
        ? 'VARCHAR(255)'
        : 'TEXT'}`),
    },
  ])
  if (!migrated.success)
    throw new Error(`Vision ownership migration failed: ${migrated.error.message}`)
  const indexed = await reldb.ddl.createIndex('vision_records', 'idx_vision_records_user_created', {
    columns: ['user_id', 'created_at'],
  })
  if (!indexed.success)
    throw new Error(`Vision ownership index initialization failed: ${indexed.error.message}`)
}
